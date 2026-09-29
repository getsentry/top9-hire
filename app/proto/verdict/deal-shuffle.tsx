"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./deal-shuffle.css";

const RIFFLE_FRAMES = 4;
const RIFFLE_FRAME_MS = 88;
const FLIP_MS = 420;

type Stage = "riffle" | "flip";
type Reveal<T> = { item: T | null; stage: Stage };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function randomOther<T>(list: readonly T[], key: (item: T) => string, last: string | null): T {
  const pool = list.length > 1 ? list.filter((item) => key(item) !== last) : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function riffleFrames<T>(list: readonly T[]): T[] {
  const frames: T[] = [];
  for (let i = 0; i < RIFFLE_FRAMES; i++) {
    let next: T;
    do next = list[Math.floor(Math.random() * list.length)];
    while (list.length > 1 && next === frames[i - 1]);
    frames.push(next);
  }
  return frames;
}

/**
 * A short riffle through `frames`, then `commit` runs and the slot flips over to
 * the real content. Every step is one timeout, so nothing keeps running after the flip.
 */
function useReveal<T>() {
  const [state, setState] = useState<Reveal<T> | null>(null);
  const timers = useRef<number[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const play = useCallback(
    (frames: T[], commit: () => void) => {
      clear();
      if (reduced()) {
        setState(null);
        commit();
        return;
      }
      const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
      const land = frames.length * RIFFLE_FRAME_MS;
      frames.forEach((item, i) => later(() => setState({ item, stage: "riffle" }), i * RIFFLE_FRAME_MS));
      later(() => {
        commit();
        setState((s) => ({ item: s?.item ?? null, stage: "flip" }));
      }, land);
      later(() => setState(null), land + FLIP_MS);
    },
    [clear],
  );

  return { state, play };
}

export function DealShuffle() {
  const intake = useIntake();
  const { addFile, addText } = intake;
  const sample = usePickSample(intake);
  const { clearPicked } = sample;
  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;
  const phase = verdict ? "result" : intake.verdict.status === "busy" ? "busy" : "setup";
  const locked = phase !== "setup";
  const stageRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dialogKind, setDialogKind] = useState<"cards" | "jobs">("cards");
  const youReveal = useReveal<SampleCard>();
  const jobReveal = useReveal<SampleJob>();
  const lastCard = useRef<string | null>(null);
  const lastJob = useRef<string | null>(null);

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
    document.getElementById("dx-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  function dealCard(card: SampleCard, frames: SampleCard[]) {
    lastCard.current = card.handle;
    youReveal.play(frames, () => sample.pick(card).then(() => focusAfterDeal("you", frames.length > 0), () => {}));
  }

  function dealJob(job: SampleJob, frames: SampleJob[]) {
    lastJob.current = job.url;
    jobReveal.play(frames, () => {
      intake.setJobUrl(job.url);
      focusAfterDeal("job", frames.length > 0);
    });
  }

  function shuffleCard() {
    if (youReveal.state) return;
    dealCard(randomOther(SAMPLE_CARDS, (c) => c.handle, lastCard.current), riffleFrames(SAMPLE_CARDS));
  }

  function shuffleJob() {
    if (jobReveal.state) return;
    dealJob(randomOther(SAMPLE_JOBS, (j) => j.url, lastJob.current), riffleFrames(SAMPLE_JOBS));
  }

  function seeAll(kind: "cards" | "jobs") {
    setDialogKind(kind);
    dialogRef.current?.showModal();
  }

  function pickCard(card: SampleCard) {
    dialogRef.current?.close();
    dealCard(card, []);
  }

  function pickJob(job: SampleJob) {
    dialogRef.current?.close();
    dealJob(job, []);
  }

  function uploadOwn(file: File) {
    clearPicked();
    intake.setHandle("");
    addFile(file);
  }

  function tryAnother() {
    intake.setJobUrl("");
    stageRef.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  }

  const percent = verdict?.match?.alignment.percent ?? 0;
  const stage = {
    "--overlap": phase === "result" ? (0.12 + (percent / 100) * 0.3).toFixed(3) : phase === "busy" ? "0.04" : "0",
  } as CSSProperties;
  const titlesError = intake.titles.status === "error" ? intake.titles.message : null;

  return (
    <main className="dx">
      <header className="dx-head">
        <p className="dx-mark">top9.wtf</p>
        <h1 className="dx-title">Is it a match?</h1>
        <p className="dx-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div
        className="dx-stage"
        ref={stageRef}
        data-phase={phase}
        data-choice={verdict?.match?.choice}
        style={stage}
      >
        <YouSlot
          intake={intake}
          locked={locked}
          reveal={youReveal.state}
          error={titlesError}
          onDropFile={(file) => {
            clearPicked();
            addFile(file);
          }}
          onUpload={uploadOwn}
          onAddLink={clearPicked}
          onShuffle={shuffleCard}
          onSeeAll={() => seeAll("cards")}
        />
        <JobSlot
          intake={intake}
          verdict={verdict}
          locked={locked}
          reveal={jobReveal.state}
          onShuffle={shuffleJob}
          onSeeAll={() => seeAll("jobs")}
        />
        {phase === "busy" ? (
          <p className="dx-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="dx-stamp" aria-hidden="true" style={{ color: VERDICT_COLOR[verdict.match.choice] }}>
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {phase === "setup" ? <Go intake={intake} /> : null}

      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} onTryAnother={tryAnother} /> : null}

      <SamplesDialog
        ref={dialogRef}
        kind={dialogKind}
        pickedCard={intake.card ? sample.picked : null}
        jobUrl={intake.jobUrl}
        onPickCard={pickCard}
        onPickJob={pickJob}
      />
    </main>
  );
}

function SamplesDialog({
  ref,
  kind,
  pickedCard,
  jobUrl,
  onPickCard,
  onPickJob,
}: {
  ref: Ref<HTMLDialogElement>;
  kind: "cards" | "jobs";
  pickedCard: string | null;
  jobUrl: string;
  onPickCard: (card: SampleCard) => void;
  onPickJob: (job: SampleJob) => void;
}) {
  const innerRef = useRef<HTMLDialogElement | null>(null);

  return (
    <dialog
      className="dx-dialog"
      aria-labelledby="dx-dialog-h"
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) innerRef.current?.close();
      }}
    >
      <div className="dx-dialog-box">
        <h2 className="dx-dialog-title" id="dx-dialog-h">
          {kind === "cards" ? "Pick a Top 9" : "Pick a job"}
        </h2>
        <button type="button" className="dx-close" aria-label="Close" onClick={() => innerRef.current?.close()}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {kind === "cards" ? (
          <div className="dx-grid">
            {SAMPLE_CARDS.map((card) => (
              <button
                key={card.handle}
                type="button"
                className="dx-tile"
                aria-label={`Use @${card.handle}'s Top 9`}
                aria-pressed={pickedCard === card.handle}
                onClick={() => onPickCard(card)}
              >
                <img src={card.src} alt="" draggable={false} />
                <span className="dx-tile-handle">@{card.handle}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="dx-rows">
            {SAMPLE_JOBS.map((job) => (
              <li key={job.url}>
                <button type="button" className="dx-row" aria-pressed={jobUrl === job.url} onClick={() => onPickJob(job)}>
                  <span className="dx-row-org">{job.org}</span>
                  <span className="dx-row-title">{job.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

/** Two faces inside the slot: `front` is the riffle tile, `children` the real content that the flip reveals. */
function Flip({ reveal, front, children }: { reveal: Reveal<unknown> | null; front: ReactNode; children: ReactNode }) {
  return (
    <div className="dx-flip" data-stage={reveal?.stage}>
      {reveal ? <div className="dx-face dx-front">{front}</div> : null}
      <div className="dx-face dx-back">{children}</div>
    </div>
  );
}

function DieGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * The deal unmounts the button that started it. After a shuffle, focus stays in that card on "Shuffle again";
 * after a pick from the dialog it moves on to the next step.
 */
function focusAfterDeal(slot: "you" | "job", shuffled: boolean) {
  requestAnimationFrame(() => {
    const next = shuffled
      ? document.querySelector<HTMLElement>(`.dx-${slot} .dx-again`)
      : (document.querySelector<HTMLElement>(".dx-primary:enabled") ?? document.querySelector<HTMLElement>(".dx-shuffle:enabled"));
    next?.focus({ preventScroll: true });
  });
}

function Actions({ onShuffle, onSeeAll, disabled }: { onShuffle: () => void; onSeeAll: () => void; disabled: boolean }) {
  return (
    <div className="dx-actions-row">
      <button type="button" className="dx-shuffle" disabled={disabled} onClick={onShuffle}>
        <DieGlyph />
        Shuffle
      </button>
      <button type="button" className="dx-seeall" disabled={disabled} onClick={onSeeAll}>
        See all
      </button>
    </div>
  );
}

function ShuffleAgain({ onShuffle }: { onShuffle: () => void }) {
  return (
    <button type="button" className="dx-again" onClick={onShuffle}>
      <DieGlyph />
      Shuffle again
    </button>
  );
}

function YouSlot({
  intake,
  locked,
  reveal,
  error,
  onDropFile,
  onUpload,
  onAddLink,
  onShuffle,
  onSeeAll,
  ref,
}: {
  intake: Intake;
  locked: boolean;
  reveal: Reveal<SampleCard> | null;
  error: string | null;
  onDropFile: (file: File) => void;
  onUpload: (file: File) => void;
  onAddLink: () => void;
  onShuffle: () => void;
  onSeeAll: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);
  const front = reveal?.item ? (
    <>
      <img className="dx-art" src={reveal.item.src} alt="" draggable={false} />
      <span className="dx-frame-name">@{reveal.item.handle}</span>
    </>
  ) : (
    <DieGlyph />
  );

  return (
    <section
      ref={ref}
      className="dx-card dx-you"
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
      <p className="dx-tag">You</p>
      <Flip reveal={reveal} front={front}>
        {card ? (
          <>
            {card.preview ? (
              <img className="dx-art" src={card.preview} alt="Your Top 9 card" />
            ) : (
              <div className="dx-art dx-art-empty">
                <span className="dx-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
              </div>
            )}
            {titles.status === "busy" ? <span className="dx-scan" aria-hidden="true" /> : null}
            <div className="dx-foot">
              {titles.status === "busy" ? (
                <>
                  <Spinner label="Reading titles" /> Reading your nine…
                </>
              ) : titles.status === "ok" ? (
                `${titles.value.length} titles read`
              ) : null}
            </div>
            {locked ? null : <ShuffleAgain onShuffle={onShuffle} />}
          </>
        ) : (
          <div className="dx-slot-empty">
            <label className="dx-drop" data-disabled={locked || undefined}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="dx-file"
                disabled={locked}
                aria-label="Choose your Top 9 card image"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file);
                  e.target.value = "";
                }}
              />
              <span className="dx-plus" aria-hidden="true">
                +
              </span>
              <span className="dx-drop-text">Drop or choose an image</span>
            </label>
            <PostField intake={intake} locked={locked} onAdd={onAddLink} error={error} />
            <Actions onShuffle={onShuffle} onSeeAll={onSeeAll} disabled={locked} />
          </div>
        )}
      </Flip>
    </section>
  );
}

function JobSlot({
  intake,
  verdict,
  locked,
  reveal,
  onShuffle,
  onSeeAll,
  ref,
}: {
  intake: Intake;
  verdict: Verdict | null;
  locked: boolean;
  reveal: Reveal<SampleJob> | null;
  onShuffle: () => void;
  onSeeAll: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const known = sampleJobFor(intake.jobUrl);
  const [org, board] = jobLabel(intake.jobUrl).split(" · ");
  const front = reveal?.item ? (
    <div className="dx-job-body">
      <span className="dx-job-org">{reveal.item.org}</span>
      <span className="dx-job-title">{reveal.item.title}</span>
    </div>
  ) : (
    <DieGlyph />
  );

  return (
    <section ref={ref} className="dx-card dx-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      <p className="dx-tag">The job</p>
      <Flip reveal={reveal} front={front}>
        {has ? (
          <div className="dx-job-body">
            <span className="dx-job-org">{known?.org ?? org}</span>
            <span className="dx-job-title">{known?.title ?? (verdict ? jobName(verdict) : `${board} posting`)}</span>
            {verdict?.role ? <span className="dx-job-reads">Reads as {verdict.role.label}</span> : null}
            {locked ? null : <ShuffleAgain onShuffle={onShuffle} />}
          </div>
        ) : (
          <div className="dx-slot-empty">
            <div className="dx-hero">
              <BagGlyph />
            </div>
            <JobField intake={intake} locked={locked} />
            <Actions onShuffle={onShuffle} onSeeAll={onSeeAll} disabled={locked} />
          </div>
        )}
      </Flip>
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
    <div className="dx-or">
      <label htmlFor="dx-post" className="dx-or-label">
        or a post link
      </label>
      <input
        id="dx-post"
        className="dx-field"
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
        <p className="dx-error" role="alert">
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
    <div className="dx-or">
      <label htmlFor="dx-job" className="dx-or-label">
        Paste the job link
      </label>
      <input
        id="dx-job"
        className="dx-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Job link"
        aria-describedby="dx-job-hint"
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
      <p className="dx-hint" id="dx-job-hint">
        Greenhouse or Ashby
      </p>
      {intake.jobError ? (
        <p className="dx-error" role="alert">
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
    <div className="dx-go">
      <button type="button" className="dx-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
        Match them
      </button>
      <p className="dx-need" aria-live="polite">
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
    <section className="dx-result" data-choice={match.choice} ref={ref} aria-labelledby="dx-verdict">
      {boom && match.choice === "match" ? (
        <Confetti colors={[VERDICT_COLOR.match, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      {boom && match.choice === "stretch" ? (
        <Confetti count={18} colors={[VERDICT_COLOR.stretch, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      <div className="dx-score">
        <p className="dx-percent">
          <span className="dx-percent-n">{percent}</span>
          <span className="dx-percent-unit">% aligned</span>
        </p>
        <h2 className="dx-verdict" id="dx-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="dx-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="dx-why">{match.why}</blockquote>
      <p className="dx-reads">
        <span>
          You read as <strong>{verdict.card.label}</strong>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="dx-actions">
        <button type="button" className="dx-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="dx-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="dx-text" onClick={onTryAnother}>
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
