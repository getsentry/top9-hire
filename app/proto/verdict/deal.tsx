"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./deal.css";

const FLIGHT_MS = 560;
const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.12)";

/**
 * FLIP with a ghost: a fixed-position copy sits at the slot's layout box and is
 * transformed back onto the hand card, then animated to identity.
 */
function fly(from: HTMLElement, to: HTMLElement | null, src?: string) {
  if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const m = new DOMMatrixReadOnly(getComputedStyle(from).transform);
  const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const w = to.offsetWidth;
  const h = to.offsetHeight;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const sx = from.offsetWidth / w;
  const sy = from.offsetHeight / h;

  const ghost = document.createElement(src ? "img" : "div");
  ghost.className = src ? "dl-ghost" : "dl-ghost dl-ghost-job";
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
      { transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(${sx}, ${sy})` },
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

export function Deal() {
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
  const [jobDeal, setJobDeal] = useState(0);

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
    document.getElementById("dl-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  function pickCard(card: SampleCard, from: HTMLElement) {
    fly(from, youRef.current, card.src);
    sample.pick(card).catch(() => {});
  }

  function uploadOwn(file: File, from: HTMLElement) {
    const url = URL.createObjectURL(file);
    fly(from, youRef.current, url);
    setTimeout(() => URL.revokeObjectURL(url), FLIGHT_MS + 400);
    clearPicked();
    intake.setHandle("");
    addFile(file);
  }

  function pickJob(job: SampleJob, from: HTMLElement) {
    fly(from, jobRef.current);
    intake.setJobUrl(job.url);
  }

  function tryAnother() {
    intake.setJobUrl("");
    setJobDeal((n) => n + 1);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    stageRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }

  const percent = verdict?.match?.alignment.percent ?? 0;
  const stage = {
    "--overlap": phase === "result" ? (0.12 + (percent / 100) * 0.3).toFixed(3) : phase === "busy" ? "0.04" : "0",
  } as CSSProperties;
  const hasCard = Boolean(intake.card);
  const titlesError = intake.titles.status === "error" ? intake.titles.message : null;

  return (
    <main className="dl">
      <header className="dl-head">
        <p className="dl-mark">top9.wtf</p>
        <h1 className="dl-title">Is it a match?</h1>
        <p className="dl-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div
        className="dl-stage"
        ref={stageRef}
        data-phase={phase}
        data-choice={verdict?.match?.choice}
        style={stage}
      >
        <YouSlot intake={intake} ref={youRef} onDropFile={(file) => { clearPicked(); addFile(file); }} />
        <JobSlot intake={intake} verdict={verdict} ref={jobRef} />
        {phase === "busy" ? (
          <p className="dl-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="dl-stamp" aria-hidden="true" style={{ color: VERDICT_COLOR[verdict.match.choice] }}>
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} onTryAnother={tryAnother} /> : null}

      <section className="dl-deck" aria-labelledby="dl-hand-h" data-locked={locked || undefined}>
        <h2 className="dl-label" id="dl-hand-h">
          Your hand
        </h2>
        <div className="dl-hand" style={{ "--n": SAMPLE_CARDS.length + 1, "--spread": "16deg" } as CSSProperties}>
          <label className="dl-c dl-upload" style={{ "--i": 0 } as CSSProperties} data-disabled={locked || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="dl-file"
              disabled={locked}
              aria-label="Upload your Top 9 card"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadOwn(file, e.target.closest("label") as HTMLElement);
                e.target.value = "";
              }}
            />
            <span className="dl-plus" aria-hidden="true">
              +
            </span>
            <span className="dl-upload-text">Upload yours</span>
          </label>
          {SAMPLE_CARDS.map((card, i) => (
            <button
              key={card.handle}
              type="button"
              className="dl-c dl-pick"
              style={{ "--i": i + 1 } as CSSProperties}
              disabled={locked}
              aria-label={`Use @${card.handle}'s Top 9`}
              aria-pressed={hasCard && sample.picked === card.handle}
              onClick={(e) => pickCard(card, e.currentTarget)}
            >
              <img src={card.src} alt="" draggable={false} />
              <span className="dl-pick-handle">@{card.handle}</span>
            </button>
          ))}
        </div>
        <PostField intake={intake} locked={locked} onAdd={clearPicked} error={titlesError} />
      </section>

      <section className="dl-deck dl-deck-jobs" aria-labelledby="dl-jobs-h" data-locked={locked || undefined}>
        <h2 className="dl-label" id="dl-jobs-h">
          Pick a job
        </h2>
        <div
          className="dl-hand dl-hand-jobs"
          key={jobDeal}
          style={{ "--n": SAMPLE_JOBS.length, "--spread": "9deg" } as CSSProperties}
        >
          {SAMPLE_JOBS.map((job, i) => (
            <button
              key={job.url}
              type="button"
              className="dl-c dl-job-pick"
              style={{ "--i": i } as CSSProperties}
              disabled={locked}
              aria-pressed={intake.jobUrl === job.url}
              onClick={(e) => pickJob(job, e.currentTarget)}
            >
              <span className="dl-job-pick-org">{job.org}</span>
              <span className="dl-job-pick-title">{job.title}</span>
            </button>
          ))}
        </div>
        <JobField intake={intake} locked={locked} />
      </section>

      {phase === "setup" ? <Go intake={intake} /> : null}
    </main>
  );
}

function YouSlot({ intake, ref, onDropFile }: { intake: Intake; ref: Ref<HTMLElement>; onDropFile: (file: File) => void }) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);

  return (
    <section
      ref={ref}
      className="dl-card dl-you"
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
      <p className="dl-tag">You</p>
      {card ? (
        <>
          {card.preview ? (
            <img className="dl-art" src={card.preview} alt="Your Top 9 card" />
          ) : (
            <div className="dl-art dl-art-empty">
              <span className="dl-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
            </div>
          )}
          {titles.status === "busy" ? <span className="dl-scan" aria-hidden="true" /> : null}
          <div className="dl-foot">
            {titles.status === "busy" ? (
              <>
                <Spinner label="Reading titles" /> Reading your nine…
              </>
            ) : titles.status === "ok" ? (
              `${titles.value.length} titles read`
            ) : null}
          </div>
        </>
      ) : (
        <div className="dl-slot-empty">
          <span className="dl-slot-title">Your Top 9</span>
          <span className="dl-slot-sub">Pick a card from your hand, or drop an image here</span>
        </div>
      )}
    </section>
  );
}

function JobSlot({ intake, verdict, ref }: { intake: Intake; verdict: Verdict | null; ref: Ref<HTMLElement> }) {
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const known = sampleJobFor(intake.jobUrl);
  const [org, board] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <section ref={ref} className="dl-card dl-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      <p className="dl-tag">The job</p>
      {has ? (
        <div className="dl-job-body">
          <span className="dl-job-org">{known?.org ?? org}</span>
          <span className="dl-job-title">{known?.title ?? (verdict ? jobName(verdict) : `${board} posting`)}</span>
          {verdict?.role ? <span className="dl-job-reads">Reads as {verdict.role.label}</span> : null}
        </div>
      ) : (
        <div className="dl-slot-empty">
          <BagGlyph />
          <span className="dl-slot-title">The job</span>
          <span className="dl-slot-sub">Pick a job below, or paste a link</span>
        </div>
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
    <div className="dl-or">
      <label htmlFor="dl-post" className="dl-or-label">
        or paste your post link
      </label>
      <input
        id="dl-post"
        className="dl-field"
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
      {message ? (
        <p className="dl-error" role="alert">
          {message}
        </p>
      ) : null}
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
    <div className="dl-or">
      <label htmlFor="dl-job" className="dl-or-label">
        or paste a Greenhouse or Ashby link
      </label>
      <input
        id="dl-job"
        className="dl-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Job link"
        value={value}
        disabled={locked}
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
        <p className="dl-error" role="alert">
          Only Greenhouse or Ashby links work
        </p>
      ) : null}
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
    <div className="dl-go">
      <button type="button" className="dl-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
        Match them
      </button>
      <p className="dl-need" aria-live="polite">
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

  // Confetti waits for the stamp to land.
  useEffect(() => {
    if (match.choice === "mismatch") return;
    const id = setTimeout(() => setBoom(true), 700);
    return () => clearTimeout(id);
  }, [match.choice]);

  return (
    <section className="dl-result" data-choice={match.choice} ref={ref} aria-labelledby="dl-verdict">
      {boom && match.choice === "match" ? (
        <Confetti colors={[VERDICT_COLOR.match, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      {boom && match.choice === "stretch" ? (
        <Confetti count={18} colors={[VERDICT_COLOR.stretch, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      <div className="dl-score">
        <p className="dl-percent">
          <span className="dl-percent-n">{percent}</span>
          <span className="dl-percent-unit">% aligned</span>
        </p>
        <h2 className="dl-verdict" id="dl-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="dl-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="dl-why">{match.why}</blockquote>
      <p className="dl-reads">
        <span>
          You read as <strong>{verdict.card.label}</strong>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="dl-actions">
        <button type="button" className="dl-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="dl-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="dl-text" onClick={onTryAnother}>
          Try another job
        </button>
      </div>
    </section>
  );
}

function BagGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  );
}
