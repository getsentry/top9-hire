"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./dialog-badge.css";

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
  ghost.className = src ? "bd-ghost" : "bd-ghost bd-ghost-job";
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

export function DialogBadge() {
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
    document.getElementById("bd-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  function pickCard(card: SampleCard, from: HTMLElement) {
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

  function pickJob(job: SampleJob, from: HTMLElement) {
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
    <main className="bd">
      <header className="bd-head">
        <p className="bd-mark">top9.wtf</p>
        <h1 className="bd-title">Is it a match?</h1>
        <p className="bd-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div
        className="bd-stage"
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
          onReplace={() => {
            clearPicked();
            intake.clearCard();
            intake.setHandle("");
          }}
          onOpenSamples={() => youDialogRef.current?.showModal()}
        />
        <JobSlot intake={intake} verdict={verdict} ref={jobRef} locked={locked} onOpenSamples={() => jobDialogRef.current?.showModal()} />
        {phase === "busy" ? (
          <p className="bd-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="bd-stamp" aria-hidden="true" style={{ color: VERDICT_COLOR[verdict.match.choice] }}>
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} onTryAnother={tryAnother} /> : null}

      <PickerDialog ref={youDialogRef} title="Pick a Top 9">
        <div className="bd-fan" style={{ "--n": SAMPLE_CARDS.length, "--spread": "16deg" } as CSSProperties}>
          {SAMPLE_CARDS.map((card, i) => (
            <button
              key={card.handle}
              type="button"
              className="bd-c bd-pick"
              style={{ "--i": i } as CSSProperties}
              aria-label={`Use @${card.handle}'s Top 9`}
              onClick={(e) => pickCard(card, e.currentTarget)}
            >
              <span className="bd-pick-art">
                <img src={card.src} alt="" draggable={false} />
              </span>
              <img className="bd-avatar" src={card.avatar} alt="" draggable={false} />
              <span className="bd-pick-label">
                <span className="bd-pick-handle">@{card.handle}</span>
                {card.name ? <span className="bd-pick-name">{card.name}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </PickerDialog>

      <PickerDialog ref={jobDialogRef} title="Pick a job">
        <div className="bd-fan bd-fan-jobs" style={{ "--n": SAMPLE_JOBS.length, "--spread": "9deg" } as CSSProperties}>
          {SAMPLE_JOBS.map((job, i) => (
            <button
              key={job.url}
              type="button"
              className="bd-c bd-job-pick"
              style={{ "--i": i } as CSSProperties}
              onClick={(e) => pickJob(job, e.currentTarget)}
            >
              <span className="bd-job-pick-org">{job.org}</span>
              <span className="bd-job-pick-title">{job.title}</span>
            </button>
          ))}
        </div>
      </PickerDialog>

      {phase === "setup" ? <Go intake={intake} /> : null}
    </main>
  );
}

function PickerDialog({ ref, title, children }: { ref: Ref<HTMLDialogElement>; title: string; children: ReactNode }) {
  const titleId = `bd-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <dialog
      ref={ref}
      className="bd-dialog"
      aria-labelledby={titleId}
      onClick={(e) => {
        // Only a click on the backdrop lands on the dialog itself; the panel fills the rest.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="bd-panel">
        <div className="bd-dialog-head">
          <h2 className="bd-dialog-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="bd-close" aria-label="Close" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
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

/** A pick unmounts the button that opened the dialog, so focus moves to the next step instead of the body. */
function focusNextStep() {
  requestAnimationFrame(() => {
    const next =
      document.querySelector<HTMLElement>(".bd-primary:enabled") ??
      document.querySelector<HTMLElement>('.bd-card[data-state="empty"] .bd-sample:enabled');
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
  onDropFile: (file: File) => void;
  onUpload: (file: File, from: HTMLElement) => void;
  onClearPicked: () => void;
  onReplace: () => void;
  onOpenSamples: () => void;
}) {
  const { card, titles } = intake;
  const owner = SAMPLE_CARDS.find((c) => c.handle === intake.handle);
  const ownerHandle = intake.handle || (card?.kind === "tweet" ? card.handle : "");
  const [drag, setDrag] = useState(false);
  const titlesError = titles.status === "error" ? titles.message : null;

  return (
    <section
      ref={ref}
      className="bd-card bd-you"
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
      {card ? (
        <>
          <div className="bd-owner">
            {owner ? (
              <img className="bd-owner-avatar" src={owner.avatar} alt="" />
            ) : (
              <span className="bd-owner-avatar bd-owner-blank" aria-hidden="true" />
            )}
            <span className="bd-owner-text">
              <strong className="bd-owner-handle">{ownerHandle ? `@${ownerHandle}` : "Your card"}</strong>
              {owner?.name ? <span className="bd-owner-name">{owner.name}</span> : null}
            </span>
          </div>
          {card.preview ? (
            <img className="bd-art" src={card.preview} alt="Your Top 9 card" />
          ) : (
            <div className="bd-art bd-art-empty">
              <span className="bd-handle">{ownerHandle ? `@${ownerHandle}` : "Top 9"}</span>
            </div>
          )}
          {titles.status === "busy" ? <span className="bd-scan" aria-hidden="true" /> : null}
          <div className="bd-foot">
            <span className="bd-foot-text">
              {titles.status === "busy" ? (
                <>
                  <Spinner label="Reading titles" /> Reading your nine…
                </>
              ) : titles.status === "ok" ? (
                `${titles.value.length} titles read`
              ) : null}
            </span>
            <button type="button" className="bd-replace" disabled={locked} onClick={onReplace}>
              Replace
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="bd-tag">You</p>
          <label className="bd-drop" data-disabled={locked || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="bd-file"
              disabled={locked}
              aria-label="Upload your Top 9 card"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file, e.target.closest("label") as HTMLElement);
                e.target.value = "";
              }}
            />
            <span className="bd-plus" aria-hidden="true">
              +
            </span>
            <span className="bd-drop-text">Drop or choose image</span>
          </label>
          <PostField intake={intake} locked={locked} onAdd={onClearPicked} error={titlesError} />
          <button type="button" className="bd-sample" disabled={locked} onClick={onOpenSamples}>
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
    <section ref={ref} className="bd-card bd-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      <p className="bd-tag">The job</p>
      {has ? (
        <div className="bd-job-body">
          <span className="bd-job-org">{known?.org ?? org}</span>
          <span className="bd-job-title">{known?.title ?? (verdict ? jobName(verdict) : `${board} posting`)}</span>
          {verdict?.role ? <span className="bd-job-reads">Reads as {verdict.role.label}</span> : null}
        </div>
      ) : (
        <>
          <div className="bd-job-empty">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
              <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" />
            </svg>
            <span className="bd-job-prompt">Add the role</span>
          </div>
          <JobField intake={intake} locked={locked} />
          <button type="button" className="bd-sample" disabled={locked} onClick={onOpenSamples}>
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
    <div className="bd-or">
      <label htmlFor="bd-post" className="bd-or-label">
        or a post link
      </label>
      <input
        id="bd-post"
        className="bd-field"
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
        <p className="bd-error bd-note" role="alert">
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
    <div className="bd-or">
      <label htmlFor="bd-job" className="bd-or-label">
        Paste the job link
      </label>
      <input
        id="bd-job"
        className="bd-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Job link"
        value={value}
        disabled={locked}
        aria-describedby="bd-job-note"
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
        <p className="bd-error bd-note" id="bd-job-note" role="alert">
          Only Greenhouse or Ashby links work
        </p>
      ) : (
        <p className="bd-hint bd-note" id="bd-job-note">
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
    <div className="bd-go">
      <button type="button" className="bd-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
        Match them
      </button>
      <p className="bd-need" aria-live="polite">
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
    <section className="bd-result" data-choice={match.choice} ref={ref} aria-labelledby="bd-verdict">
      {boom && match.choice === "match" ? (
        <Confetti colors={[VERDICT_COLOR.match, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      {boom && match.choice === "stretch" ? (
        <Confetti count={18} colors={[VERDICT_COLOR.stretch, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      <div className="bd-score">
        <p className="bd-percent">
          <span className="bd-percent-n">{percent}</span>
          <span className="bd-percent-unit">% aligned</span>
        </p>
        <h2 className="bd-verdict" id="bd-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="bd-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="bd-why">{match.why}</blockquote>
      <p className="bd-reads">
        <span className="bd-reads-you">
          {reader ? <img className="bd-reads-avatar" src={reader.avatar} alt="" /> : null}
          <span>
            You read as <strong>{verdict.card.label}</strong>
          </span>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="bd-actions">
        <button type="button" className="bd-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="bd-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="bd-text" onClick={onTryAnother}>
          Try another job
        </button>
      </div>
    </section>
  );
}
