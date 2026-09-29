"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { DECISION, Confetti, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./swipe.css";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const CONFETTI_COLORS = ["#1f7a4d", "#f3efe6", "#1a1a1a", "#b3650c"];

export function Swipe() {
  const intake = useIntake();
  const { addFile, addText } = intake;
  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;
  const phase = verdict ? "result" : intake.verdict.status === "busy" ? "busy" : "setup";
  const resultRef = useRef<HTMLElement>(null);
  const jobRef = useRef<HTMLDivElement>(null);
  const hasJob = Boolean(intake.jobUrl) && !intake.jobError;

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      const file = imageFrom(e.clipboardData);
      if (file) {
        e.preventDefault();
        addFile(file);
        return;
      }
      if (target.tagName === "INPUT") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (sniff(text) !== "other") addText(text);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFile, addText]);

  useEffect(() => {
    if (!verdict) return;
    document.getElementById("sw-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  const armed = phase === "setup" && intake.ready;

  return (
    <main className="sw">
      <header className="sw-head">
        <p className="sw-mark">top9.wtf</p>
        <h1 className="sw-title">Is it a match?</h1>
        <p className="sw-lede">Swipe to pick a Top 9 and a job. Then drag them together.</p>
      </header>

      {phase !== "result" ? (
        <>
          <div className="sw-stage" data-phase={phase}>
            <YouColumn intake={intake} jobRef={jobRef} armed={armed} />
            <JobColumn intake={intake} jobRef={jobRef} />
            {phase === "busy" ? (
              <p className="sw-deciding" role="status">
                <Spinner label="" /> Deciding
              </p>
            ) : null}
          </div>

          {phase === "setup" ? (
            <div className="sw-go">
              {armed ? (
                <p className="sw-hint">
                  Drag your card onto the job <span className="sw-arrow-nudge" aria-hidden="true">→</span>
                </p>
              ) : null}
              <button type="button" className="sw-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
                Match them
              </button>
              <p className="sw-need" aria-live="polite">
                {intake.verdict.status === "error" ? (
                  <span role="alert">{intake.verdict.message}</span>
                ) : !intake.card ? (
                  "Pick your Top 9 to start"
                ) : intake.titles.status === "busy" ? (
                  "Reading your card…"
                ) : !hasJob ? (
                  "Now pick the job"
                ) : (
                  ""
                )}
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} /> : null}
    </main>
  );
}

/** A looping deck: drag or use the buttons to move through `items`. The top tile is the current item. */
function Deck<T>({
  items,
  noun,
  useLabel,
  describe,
  onUse,
  renderTile,
  dark,
}: {
  items: readonly T[];
  noun: string;
  useLabel: string;
  describe: (item: T) => string;
  onUse: (item: T) => void;
  renderTile: (item: T) => ReactNode;
  dark?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const flying = useRef(false);
  const enterFromLeft = useRef(false);
  const gesture = useRef<{ id: number; x0: number; x: number; t: number; v: number; active: boolean } | null>(null);
  const n = items.length;
  const depth = Math.min(3, n);

  useLayoutEffect(() => {
    if (!enterFromLeft.current) return;
    enterFromLeft.current = false;
    topRef.current?.animate([{ transform: "translateX(-140%) rotate(-24deg)" }, { transform: "translateX(0)" }], {
      duration: 320,
      easing: "cubic-bezier(0.2, 0.9, 0.25, 1.12)",
    });
  }, [index]);

  function fly(dir: 1 | -1) {
    const el = topRef.current;
    if (!el || flying.current) return;
    const advance = () => setIndex((i) => (i + 1) % n);
    if (reduced()) {
      advance();
      return;
    }
    flying.current = true;
    const from = getComputedStyle(el).transform;
    el.animate([{ transform: from }, { transform: `translateX(${dir * 140}%) rotate(${dir * 24}deg)` }], {
      duration: 240,
      easing: "ease-out",
      fill: "forwards",
    }).finished.then(
      () => {
        flying.current = false;
        advance();
      },
      () => {
        flying.current = false;
      },
    );
  }

  function back() {
    if (flying.current) return;
    enterFromLeft.current = !reduced();
    setIndex((i) => (i - 1 + n) % n);
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flying.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, x0: e.clientX, x: e.clientX, t: e.timeStamp, v: 0, active: false };
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    if (!g.active && Math.abs(dx) < 6) return;
    g.active = true;
    const dt = Math.max(1, e.timeStamp - g.t);
    g.v = 0.6 * ((e.clientX - g.x) / dt) + 0.4 * g.v;
    g.x = e.clientX;
    g.t = e.timeStamp;
    const el = e.currentTarget;
    el.style.transition = "none";
    el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
  }

  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.active) return;
    const el = e.currentTarget;
    const dx = e.clientX - g.x0;
    if (e.type === "pointerup" && (Math.abs(dx) > 80 || Math.abs(g.v) > 0.5)) {
      fly(dx === 0 ? (g.v > 0 ? 1 : -1) : dx > 0 ? 1 : -1);
    } else {
      el.style.transition = "";
      el.style.transform = "";
    }
  }

  return (
    <>
      <div className="sw-stack" data-dark={dark || undefined}>
        {Array.from({ length: depth }, (_, d) => {
          const i = (index + d) % n;
          const top = d === 0;
          return (
            <div
              key={i}
              ref={top ? topRef : undefined}
              className="sw-tile"
              data-top={top || undefined}
              inert={!top}
              style={{ "--d": d, "--s": i % 2 ? 1 : -1, zIndex: depth - d } as CSSProperties}
              onPointerDown={top ? onDown : undefined}
              onPointerMove={top ? onMove : undefined}
              onPointerUp={top ? onUp : undefined}
              onPointerCancel={top ? onUp : undefined}
            >
              {renderTile(items[i])}
            </div>
          );
        })}
      </div>
      <p className="sw-sr" aria-live="polite">
        {`${describe(items[index])}, ${index + 1} of ${n}`}
      </p>
      <div className="sw-nav">
        <button type="button" className="sw-round" aria-label={`Previous ${noun}`} onClick={back}>
          ‹
        </button>
        <button type="button" className="sw-round" aria-label={`Next ${noun}`} onClick={() => fly(1)}>
          ›
        </button>
        <button type="button" className="sw-pill sw-pill-solid" onClick={() => onUse(items[index])}>
          {useLabel}
        </button>
      </div>
    </>
  );
}

function LinkField({
  label,
  placeholder,
  onCommit,
}: {
  label: string;
  placeholder: string;
  onCommit: (value: string) => "clear" | string | void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function commit() {
    if (!value.trim()) return;
    const result = onCommit(value.trim());
    if (result === "clear") {
      setValue("");
      setHint(null);
    } else if (typeof result === "string") {
      setHint(result);
    }
  }

  return (
    <div className="sw-or">
      <label htmlFor={id} className="sw-or-label">
        {label}
      </label>
      <input
        id={id}
        className="sw-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        onBlur={commit}
      />
      {hint ? (
        <p className="sw-error" role="alert">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CheckBadge() {
  return (
    <span className="sw-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function CardArt({ card }: { card: NonNullable<Intake["card"]> }) {
  return card.preview ? (
    <img className="sw-art" src={card.preview} alt="Your Top 9 card" draggable={false} />
  ) : (
    <div className="sw-art sw-art-empty">
      <span className="sw-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
    </div>
  );
}

function YouColumn({ intake, jobRef, armed }: { intake: Intake; jobRef: RefObject<HTMLDivElement | null>; armed: boolean }) {
  const { card, titles } = intake;
  const sampler = usePickSample(intake);
  const [over, setOver] = useState(false);
  const locked = intake.verdict.status === "busy";

  return (
    <section
      className="sw-col sw-you"
      aria-label="Your Top 9"
      data-drop={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = imageFrom(e.dataTransfer);
        if (file) {
          intake.setHandle("");
          intake.addFile(file);
        }
      }}
    >
      {card ? (
        <>
          <div className="sw-stack">
            <ChosenYou intake={intake} jobRef={jobRef} armed={armed} />
          </div>
          <div className="sw-status" data-state={titles.status}>
            <span className="sw-status-text" role={titles.status === "error" ? "alert" : undefined}>
              {titles.status === "busy" ? (
                <>
                  <Spinner label="Reading titles" /> Reading your nine…
                </>
              ) : titles.status === "ok" ? (
                `${titles.value.length} titles read`
              ) : titles.status === "error" ? (
                titles.message
              ) : null}
            </span>
            {!locked ? (
              <button type="button" className="sw-pill" onClick={intake.clearCard}>
                Change
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <Deck<SampleCard>
            items={SAMPLE_CARDS}
            noun="card"
            useLabel="Use this card"
            describe={(s) => `@${s.handle}`}
            onUse={(s) => void sampler.pick(s)}
            renderTile={(s) => (
              <>
                <img className="sw-art" src={s.src} alt="" draggable={false} />
                <span className="sw-tile-handle">@{s.handle}</span>
              </>
            )}
          />
          <label className="sw-pill sw-upload">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sw-sr"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  intake.setHandle("");
                  intake.addFile(file);
                }
                e.target.value = "";
              }}
            />
            Upload yours
          </label>
          <LinkField
            label="or paste your post link"
            placeholder="x.com/…"
            onCommit={(value) => {
              if (sniff(value) !== "tweet") return "Use a post link like x.com/name/status/123.";
              intake.addTweet(value);
              return "clear";
            }}
          />
          {titles.status === "error" ? (
            <p className="sw-error" role="alert">
              {titles.message}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** The chosen card. When a job is set it can be dragged in 2D and dropped onto the job card. */
function ChosenYou({ intake, jobRef, armed }: { intake: Intake; jobRef: RefObject<HTMLDivElement | null>; armed: boolean }) {
  const card = intake.card!;
  const gesture = useRef<{ id: number; x0: number; y0: number; active: boolean } | null>(null);

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!armed || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false };
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.active && Math.hypot(dx, dy) < 6) return;
    g.active = true;
    const el = e.currentTarget;
    el.dataset.dragging = "";
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 30}deg)`;
  }

  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.active) return;
    const el = e.currentTarget;
    const a = el.getBoundingClientRect();
    const b = jobRef.current?.getBoundingClientRect();
    const shared = b
      ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      : 0;
    const hit = e.type === "pointerup" && shared > 0.25 * a.width * a.height;
    delete el.dataset.dragging;
    el.style.transition = "";
    el.style.transform = "";
    if (hit) void intake.run();
  }

  return (
    <div
      className="sw-chosen sw-you-card"
      data-armed={armed || undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <CardArt card={card} />
      {intake.titles.status === "busy" ? <span className="sw-scan" aria-hidden="true" /> : null}
      <CheckBadge />
    </div>
  );
}

function JobColumn({ intake, jobRef }: { intake: Intake; jobRef: RefObject<HTMLDivElement | null> }) {
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const locked = intake.verdict.status === "busy";
  const sample = sampleJobFor(intake.jobUrl);
  const [labelOrg, board] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <section className="sw-col sw-job" aria-label="The job">
      {has ? (
        <>
          <div className="sw-stack">
            <div className="sw-chosen sw-job-card sw-dark" ref={jobRef}>
              <JobFace org={sample?.org ?? labelOrg} title={sample?.title ?? `${board} posting`} board={board} />
              <CheckBadge />
            </div>
          </div>
          <div className="sw-status">
            <span className="sw-status-text">Job set</span>
            {!locked ? (
              <button type="button" className="sw-pill" onClick={() => intake.setJobUrl("")}>
                Change
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <Deck<SampleJob>
            items={SAMPLE_JOBS}
            noun="job"
            useLabel="Use this job"
            describe={(s) => `${s.org}, ${s.title}`}
            onUse={(s) => intake.setJobUrl(s.url)}
            dark
            renderTile={(s) => <JobFace org={s.org} title={s.title} board={jobLabel(s.url).split(" · ")[1] ?? ""} />}
          />
          <LinkField
            label="or paste a Greenhouse or Ashby link"
            placeholder="Job link"
            onCommit={(value) => {
              if (sniff(value) !== "job") return "Only Greenhouse or Ashby links work.";
              intake.setJobUrl(value);
              return "clear";
            }}
          />
        </>
      )}
    </section>
  );
}

function JobFace({ org, title, board }: { org: string; title: string; board: string }) {
  return (
    <div className="sw-job-face">
      <span className="sw-job-org">{org}</span>
      <span className="sw-job-title">{title}</span>
      <span className="sw-job-board">{board}</span>
    </div>
  );
}

function Result({ intake, verdict, ref }: { intake: Intake; verdict: Verdict; ref: RefObject<HTMLElement | null> }) {
  const match = verdict.match!;
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const { share, copied, xHref } = useShare(verdict, titles, intake.handle);
  const percent = useCountUp(match.alignment.percent, 1100);
  const [org] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <section className="sw-result" data-choice={match.choice} ref={ref} aria-labelledby="sw-verdict">
      <div className="sw-moment sw-dark">
        {match.choice === "match" ? <Confetti colors={CONFETTI_COLORS} /> : null}
        {match.choice === "stretch" ? <Confetti colors={CONFETTI_COLORS} count={18} /> : null}
        <div className="sw-pair">
          <div className="sw-mcard sw-mcard-you">{intake.card ? <CardArt card={intake.card} /> : null}</div>
          <div className="sw-mcard sw-mcard-job">
            <JobFace org={org} title={jobName(verdict)} board="" />
          </div>
          <p className="sw-badge" style={{ "--ring": VERDICT_COLOR[match.choice] } as CSSProperties}>
            <span className="sw-badge-n">{percent}%</span>
          </p>
        </div>
        <h2 className="sw-verdict" id="sw-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="sw-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="sw-why">{match.why}</blockquote>
      <p className="sw-reads">
        <span>
          You read as <strong>{verdict.card.label}</strong>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="sw-actions">
        <button type="button" className="sw-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="sw-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="sw-text" onClick={() => intake.setJobUrl("")}>
          Try another job
        </button>
      </div>
    </section>
  );
}
