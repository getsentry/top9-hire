"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./dialog-faces.css";

const FLIGHT_MS = 560;
const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.12)";

/** Where a flight starts. Captured before the source unmounts or its dialog closes. */
type FlySource = { rect: DOMRect; angle: number; width: number; height: number };

function sourceOf(el: HTMLElement): FlySource {
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return {
    rect: el.getBoundingClientRect(),
    angle: (Math.atan2(m.b, m.a) * 180) / Math.PI,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

/**
 * FLIP with a ghost: a fixed-position copy sits at the slot's layout box and is
 * transformed back onto the source rect, then animated to identity.
 */
function fly(from: FlySource, to: HTMLElement | null, src?: string) {
  if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = from.rect;
  const b = to.getBoundingClientRect();
  const w = to.offsetWidth;
  const h = to.offsetHeight;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const sx = from.width / w;
  const sy = from.height / h;

  const ghost = document.createElement(src ? "img" : "div");
  ghost.className = src ? "df-ghost" : "df-ghost df-ghost-job";
  if (ghost instanceof HTMLImageElement && src) {
    ghost.src = src;
    ghost.alt = "";
  }
  Object.assign(ghost.style, {
    left: `${b.left + b.width / 2 - w / 2}px`,
    top: `${b.top + b.height / 2 - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
  });
  document.body.append(ghost);

  const flight = ghost.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(${from.angle}deg) scale(${sx}, ${sy})` },
      { transform: "translate(0, 0) rotate(0deg) scale(1, 1)" },
    ],
    { duration: FLIGHT_MS, easing: SPRING, fill: "forwards" },
  );
  // The slot fills in underneath once the image is read, so the ghost fades instead of vanishing.
  flight.finished
    .then(() => ghost.animate({ opacity: [1, 0] }, { duration: 240, fill: "forwards" }).finished)
    .catch(() => {})
    .finally(() => ghost.remove());
}

export function DialogFaces() {
  const intake = useIntake();
  const { addFile, addText } = intake;
  const sample = usePickSample(intake);
  const { clearPicked } = sample;
  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;
  const phase = verdict ? "result" : intake.verdict.status === "busy" ? "busy" : "setup";
  const locked = phase !== "setup";
  const stageRef = useRef<HTMLDivElement>(null);
  const youRef = useRef<HTMLElement>(null);
  const jobRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const youDialogRef = useRef<HTMLDialogElement>(null);
  const jobDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      const file = imageFrom(e.clipboardData);
      if (file) {
        e.preventDefault();
        clearPicked();
        addFile(file);
        return;
      }
      if (target.tagName === "INPUT") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (sniff(text) !== "other") {
        clearPicked();
        addText(text);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFile, addText, clearPicked]);

  useEffect(() => {
    if (!verdict) return;
    document.getElementById("df-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  function pickCard(card: SampleCard, from: HTMLElement | null) {
    if (!from) return;
    // The dialog sits in the top layer, so the ghost can only start once it has closed.
    const source = sourceOf(from);
    youDialogRef.current?.close();
    fly(source, youRef.current, card.src);
    sample.pick(card).then(focusNextStep, () => {});
  }

  function uploadOwn(file: File, from: HTMLElement) {
    const url = URL.createObjectURL(file);
    fly(sourceOf(from), youRef.current, url);
    setTimeout(() => URL.revokeObjectURL(url), FLIGHT_MS + 400);
    clearPicked();
    intake.setHandle("");
    addFile(file);
  }

  function pickJob(job: SampleJob, from: HTMLElement | null) {
    if (!from) return;
    const source = sourceOf(from);
    jobDialogRef.current?.close();
    fly(source, jobRef.current);
    intake.setJobUrl(job.url);
    focusNextStep();
  }

  function tryAnother() {
    intake.setJobUrl("");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    stageRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }

  const percent = verdict?.match?.alignment.percent ?? 0;
  const stage = {
    "--overlap": phase === "result" ? (0.12 + (percent / 100) * 0.3).toFixed(3) : phase === "busy" ? "0.04" : "0",
  } as CSSProperties;

  return (
    <main className="df">
      <header className="df-head">
        <p className="df-mark">top9.wtf</p>
        <h1 className="df-title">Is it a match?</h1>
        <p className="df-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div
        className="df-stage"
        ref={stageRef}
        data-phase={phase}
        data-choice={verdict?.match?.choice}
        style={stage}
      >
        <YouSlot
          intake={intake}
          ref={youRef}
          locked={locked}
          onDropFile={(file) => { clearPicked(); addFile(file); }}
          onUpload={uploadOwn}
          onClearPicked={clearPicked}
          onReplace={() => { clearPicked(); intake.setHandle(""); intake.clearCard(); }}
          onOpenSamples={() => youDialogRef.current?.showModal()}
        />
        <JobSlot intake={intake} verdict={verdict} ref={jobRef} locked={locked} onOpenSamples={() => jobDialogRef.current?.showModal()} />
        {phase === "busy" ? (
          <p className="df-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="df-stamp" aria-hidden="true" style={{ color: VERDICT_COLOR[verdict.match.choice] }}>
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} onTryAnother={tryAnother} /> : null}

      <PickerDialog ref={youDialogRef} title="Pick a Top 9">
        <CardChooser onUse={pickCard} />
      </PickerDialog>

      <PickerDialog ref={jobDialogRef} title="Pick a job">
        <JobChooser onUse={pickJob} />
      </PickerDialog>

      {phase === "setup" ? <Go intake={intake} /> : null}
    </main>
  );
}

function PickerDialog({ ref, title, children }: { ref: Ref<HTMLDialogElement>; title: string; children: ReactNode }) {
  const titleId = `df-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <dialog
      ref={ref}
      className="df-dialog"
      aria-labelledby={titleId}
      onClick={(e) => {
        // Only a click on the backdrop lands on the dialog itself; the panel fills the rest.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="df-panel">
        <div className="df-dialog-head">
          <h2 className="df-dialog-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="df-close" aria-label="Close" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Radio group with a roving tabindex. Arrow keys move the selection and focus together. */
function useRadios(count: number) {
  const [sel, setSel] = useState(0);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? count - 1 : (sel + (forward ? 1 : -1) + count) % count;
    setSel(next);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }

  function radio(i: number) {
    return { role: "radio", "aria-checked": i === sel, tabIndex: i === sel ? 0 : -1, onClick: () => setSel(i) } as const;
  }

  return { sel, onKeyDown, radio };
}

function CardChooser({ onUse }: { onUse: (card: SampleCard, from: HTMLElement | null) => void }) {
  const { sel, onKeyDown, radio } = useRadios(SAMPLE_CARDS.length);
  const shotRef = useRef<HTMLDivElement>(null);
  const card = SAMPLE_CARDS[sel];
  const use = () => onUse(card, shotRef.current?.querySelector<HTMLElement>("img[data-active]") ?? null);

  return (
    <div className="df-split">
      <div className="df-people" role="radiogroup" aria-label="People" onKeyDown={onKeyDown}>
        {SAMPLE_CARDS.map((c, i) => (
          <button key={c.handle} type="button" className="df-face" {...radio(i)} aria-label={`@${c.handle}`} onDoubleClick={use}>
            <img className="df-avatar" src={c.avatar} alt="" draggable={false} />
            <span className="df-face-handle">@{c.handle}</span>
            {c.name ? <span className="df-face-name">{c.name}</span> : null}
          </button>
        ))}
      </div>
      <div className="df-preview">
        <div className="df-shot" ref={shotRef}>
          {SAMPLE_CARDS.map((c, i) => (
            <img
              key={c.handle}
              src={c.src}
              alt={i === sel ? `@${c.handle}'s Top 9` : ""}
              aria-hidden={i === sel ? undefined : true}
              data-active={i === sel || undefined}
              draggable={false}
            />
          ))}
        </div>
        <div className="df-caption">
          <img className="df-avatar df-avatar-sm" src={card.avatar} alt="" />
          <span className="df-caption-who">
            <strong>@{card.handle}</strong>
            {card.name ? <span>{card.name}</span> : null}
          </span>
        </div>
        <button type="button" className="df-primary df-use" aria-label={`Use @${card.handle}'s Top 9`} onClick={use}>
          Use @{card.handle}&rsquo;s nine
        </button>
      </div>
    </div>
  );
}

const LOGO_COLORS = ["#c2410c", "#1d4ed8", "#0f766e", "#7e22ce", "#be123c", "#4d7c0f"];

function orgColor(org: string) {
  let h = 0;
  for (const ch of org) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

function orgInitials(org: string) {
  return org.length > 2 && /^[A-Z][a-z]/.test(org) ? org.slice(0, 1) : org.slice(0, 2);
}

function JobChooser({ onUse }: { onUse: (job: SampleJob, from: HTMLElement | null) => void }) {
  const { sel, onKeyDown, radio } = useRadios(SAMPLE_JOBS.length);
  const logoRef = useRef<HTMLDivElement>(null);
  const job = SAMPLE_JOBS[sel];
  const use = () => onUse(job, logoRef.current);

  return (
    <div className="df-split">
      <div className="df-people df-people-jobs" role="radiogroup" aria-label="Jobs" onKeyDown={onKeyDown}>
        {SAMPLE_JOBS.map((j, i) => (
          <button key={j.url} type="button" className="df-face" {...radio(i)} aria-label={`${j.org}, ${j.title}`} onDoubleClick={use}>
            <span className="df-logo" style={{ "--logo": orgColor(j.org) } as CSSProperties} aria-hidden="true">
              {orgInitials(j.org)}
            </span>
            <span className="df-face-handle">{j.org}</span>
            <span className="df-face-name">{j.title}</span>
          </button>
        ))}
      </div>
      <div className="df-preview">
        <div className="df-shot df-shot-job" ref={logoRef} style={{ "--logo": orgColor(job.org) } as CSSProperties}>
          <span className="df-logo df-logo-lg" aria-hidden="true">
            {orgInitials(job.org)}
          </span>
          <span className="df-job-pick-org">{job.org}</span>
          <span className="df-job-pick-title">{job.title}</span>
        </div>
        <div className="df-caption">
          <span className="df-caption-who">
            <strong>{job.org}</strong>
            <span>{job.title}</span>
          </span>
        </div>
        <button type="button" className="df-primary df-use" onClick={use}>
          Use this job
        </button>
      </div>
    </div>
  );
}

/** A pick unmounts the button that opened the dialog, so focus moves to the next step instead of the body. */
function focusNextStep() {
  requestAnimationFrame(() => {
    const next =
      document.querySelector<HTMLElement>(".df-primary:enabled:not(dialog *)") ??
      document.querySelector<HTMLElement>(".df-card[data-state=\"empty\"] .df-sample:enabled");
    next?.focus({ preventScroll: true });
  });
}

function YouSlot({
  intake,
  ref,
  locked,
  onDropFile,
  onUpload,
  onClearPicked,
  onReplace,
  onOpenSamples,
}: {
  intake: Intake;
  ref: Ref<HTMLElement>;
  locked: boolean;
  onReplace: () => void;
  onDropFile: (file: File) => void;
  onUpload: (file: File, from: HTMLElement) => void;
  onClearPicked: () => void;
  onOpenSamples: () => void;
}) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);
  const titlesError = titles.status === "error" ? titles.message : null;
  const owner = SAMPLE_CARDS.find((c) => c.handle === intake.handle);
  const ownerHandle = intake.handle || (card?.kind === "tweet" ? card.handle : "");

  return (
    <section
      ref={ref}
      className="df-card df-you"
      aria-label="Your Top 9"
      data-state={card ? titles.status : "empty"}
      data-drag={drag || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const file = imageFrom(e.dataTransfer);
        if (file) onDropFile(file);
      }}
    >
      <p className="df-tag">You</p>
      {card ? (
        <>
          <div className="df-owner">
            {owner ? (
              <img className="df-avatar df-avatar-xs" src={owner.avatar} alt="" />
            ) : (
              <span className="df-avatar df-avatar-xs df-avatar-blank" aria-hidden="true" />
            )}
            <span className="df-owner-text">
              <strong>{ownerHandle ? `@${ownerHandle}` : "Your card"}</strong>
              {owner?.name ? <span>{owner.name}</span> : null}
            </span>
          </div>
          {card.preview ? (
            <img className="df-art" src={card.preview} alt="Your Top 9 card" />
          ) : (
            <div className="df-art df-art-empty">
              <span className="df-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
            </div>
          )}
          {titles.status === "busy" ? <span className="df-scan" aria-hidden="true" /> : null}
          <div className="df-foot">
            {titles.status === "busy" ? (
              <span className="df-foot-text">
                <Spinner label="Reading titles" /> Reading your nine…
              </span>
            ) : titles.status === "ok" ? (
              <span className="df-foot-text">{titles.value.length} titles read</span>
            ) : (
              <span className="df-foot-text" />
            )}
            <button type="button" className="df-replace" disabled={locked} onClick={onReplace}>
              Replace
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="df-drop" data-disabled={locked || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="df-file"
              disabled={locked}
              aria-label="Upload your Top 9 card"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file, e.target.closest("label") as HTMLElement);
                e.target.value = "";
              }}
            />
            <span className="df-plus" aria-hidden="true">
              +
            </span>
            <span className="df-drop-text">Drop or choose image</span>
          </label>
          <PostField intake={intake} locked={locked} onAdd={onClearPicked} error={titlesError} />
          <button type="button" className="df-sample" disabled={locked} onClick={onOpenSamples}>
            Pick a sample
          </button>
        </>
      )}
    </section>
  );
}

function JobSlot({
  intake,
  verdict,
  ref,
  locked,
  onOpenSamples,
}: {
  intake: Intake;
  verdict: Verdict | null;
  ref: Ref<HTMLElement>;
  locked: boolean;
  onOpenSamples: () => void;
}) {
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const known = sampleJobFor(intake.jobUrl);
  const [org, board] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <section ref={ref} className="df-card df-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      <p className="df-tag">The job</p>
      {has ? (
        <div className="df-job-body">
          <span className="df-job-org">{known?.org ?? org}</span>
          <span className="df-job-title">{known?.title ?? (verdict ? jobName(verdict) : `${board} posting`)}</span>
          {verdict?.role ? <span className="df-job-reads">Reads as {verdict.role.label}</span> : null}
        </div>
      ) : (
        <>
          <div className="df-job-empty">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="8" width="18" height="12" rx="2.5" />
              <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M3 13.5h18" />
            </svg>
            <span className="df-drop-text">Add the job</span>
          </div>
          <JobField intake={intake} locked={locked} />
          <button type="button" className="df-sample" disabled={locked} onClick={onOpenSamples}>
            Pick a sample job
          </button>
        </>
      )}
    </section>
  );
}

function PostField({ intake, locked, onAdd, error }: { intake: Intake; locked: boolean; onAdd: () => void; error: string | null }) {
  const [link, setLink] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function submit() {
    if (sniff(link) === "tweet") {
      onAdd();
      intake.addTweet(link);
      setLink("");
      setHint(null);
    } else if (link.trim()) {
      setHint("Use a post link like x.com/name/status/123.");
    }
  }

  const message = hint ?? error;

  return (
    <div className="df-or">
      <label htmlFor="df-post" className="df-or-label">
        or a post link
      </label>
      <input
        id="df-post"
        className="df-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="x.com/…"
        value={link}
        disabled={locked}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
      <p className="df-error" role="alert" title={message ?? undefined}>
        {message}
      </p>
    </div>
  );
}

function JobField({ intake, locked }: { intake: Intake; locked: boolean }) {
  const [value, setValue] = useState("");

  function commit() {
    if (value.trim()) intake.setJobUrl(value.trim());
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
  }

  return (
    <div className="df-or">
      <label htmlFor="df-job" className="df-or-label">
        Paste the job link
      </label>
      <input
        id="df-job"
        className="df-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Job link"
        value={value}
        disabled={locked}
        aria-describedby="df-job-note"
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").trim();
          if (sniff(text) === "job") {
            e.preventDefault();
            setValue(text);
            intake.setJobUrl(text);
          }
        }}
        onKeyDown={onKey}
        onBlur={commit}
      />
      {intake.jobError ? (
        <p className="df-error" id="df-job-note" role="alert">
          Greenhouse or Ashby only
        </p>
      ) : (
        <p className="df-hint" id="df-job-note">
          Greenhouse or Ashby
        </p>
      )}
    </div>
  );
}

function Go({ intake }: { intake: Intake }) {
  const need = !intake.card
    ? "Add your Top 9 to start"
    : intake.titles.status === "busy"
      ? "Reading your card…"
      : !intake.jobUrl || intake.jobError
        ? "Now add the job"
        : "";
  return (
    <div className="df-go">
      <button type="button" className="df-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
        Match them
      </button>
      <p className="df-need" aria-live="polite">
        {intake.verdict.status === "error" ? <span role="alert">{intake.verdict.message}</span> : need}
      </p>
    </div>
  );
}

function Result({
  intake,
  verdict,
  ref,
  onTryAnother,
}: {
  intake: Intake;
  verdict: Verdict;
  ref: Ref<HTMLElement>;
  onTryAnother: () => void;
}) {
  const match = verdict.match!;
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const { share, copied, xHref } = useShare(verdict, titles, intake.handle);
  const percent = useCountUp(match.alignment.percent, 1100);
  const [boom, setBoom] = useState(false);
  const reader = SAMPLE_CARDS.find((c) => c.handle === intake.handle);

  // Confetti waits for the stamp to land.
  useEffect(() => {
    if (match.choice === "mismatch") return;
    const id = setTimeout(() => setBoom(true), 700);
    return () => clearTimeout(id);
  }, [match.choice]);

  return (
    <section className="df-result" data-choice={match.choice} ref={ref} aria-labelledby="df-verdict">
      {boom && match.choice === "match" ? (
        <Confetti colors={[VERDICT_COLOR.match, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      {boom && match.choice === "stretch" ? (
        <Confetti count={18} colors={[VERDICT_COLOR.stretch, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      <div className="df-score">
        <p className="df-percent">
          <span className="df-percent-n">{percent}</span>
          <span className="df-percent-unit">% aligned</span>
        </p>
        <h2 className="df-verdict" id="df-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="df-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="df-why">{match.why}</blockquote>
      <p className="df-reads">
        <span>
          {reader ? <img className="df-avatar df-avatar-xs" src={reader.avatar} alt="" /> : null}
          You read as <strong>{verdict.card.label}</strong>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="df-actions">
        <button type="button" className="df-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="df-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="df-text" onClick={onTryAnother}>
          Try another job
        </button>
      </div>
    </section>
  );
}
