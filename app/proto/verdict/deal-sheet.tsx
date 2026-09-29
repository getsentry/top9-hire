"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./deal-sheet.css";

type Tab = "cards" | "jobs";
const TABS: { id: Tab; label: string }[] = [
  { id: "cards", label: "Top 9 cards" },
  { id: "jobs", label: "Jobs" },
];
// Tile stagger (30ms apart) plus the 280ms sheet enter, with headroom.
const FRESH_MS = 900;

export function DealSheet() {
  const intake = useIntake();
  const { addFile, addText } = intake;
  const sample = usePickSample(intake);
  const { clearPicked } = sample;
  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;
  const phase = verdict ? "result" : intake.verdict.status === "busy" ? "busy" : "setup";
  const stageRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [tab, setTab] = useState<Tab>("cards");

  const hasCard = Boolean(intake.card);
  const hasJob = Boolean(intake.jobUrl) && !intake.jobError;

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
    document.getElementById("ds-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  useEffect(() => () => clearTimeout(freshTimer.current), []);

  function openSheet() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setTab(hasCard && !hasJob ? "jobs" : "cards");
    dialog.dataset.fresh = "";
    clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => delete dialog.dataset.fresh, FRESH_MS);
    dialog.showModal();
  }

  function closeSheet() {
    dialogRef.current?.close();
  }

  function pickCard(card: SampleCard) {
    sample.pick(card).catch(() => {});
    if (hasJob) closeSheet();
    else setTab("jobs");
  }

  function pickJob(job: SampleJob) {
    intake.setJobUrl(job.url);
    if (hasCard) closeSheet();
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
  const titlesError = intake.titles.status === "error" ? intake.titles.message : null;

  return (
    <main className="ds">
      <header className="ds-head">
        <p className="ds-mark">top9.wtf</p>
        <h1 className="ds-title">Is it a match?</h1>
        <p className="ds-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div
        className="ds-stage"
        ref={stageRef}
        data-phase={phase}
        data-choice={verdict?.match?.choice}
        style={stage}
      >
        <YouSlot
          intake={intake}
          error={titlesError}
          onAdd={clearPicked}
          onDropFile={(file) => {
            clearPicked();
            addFile(file);
          }}
        />
        <JobSlot intake={intake} verdict={verdict} />
        {phase === "busy" ? (
          <p className="ds-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="ds-stamp" aria-hidden="true" style={{ color: VERDICT_COLOR[verdict.match.choice] }}>
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} onTryAnother={tryAnother} /> : null}

      {phase === "setup" ? <Go intake={intake} triggerRef={triggerRef} onBrowse={openSheet} /> : null}

      <SamplesSheet
        ref={dialogRef}
        tab={tab}
        onTab={setTab}
        onClose={() => triggerRef.current?.focus()}
        onDismiss={closeSheet}
        pickedCard={hasCard ? sample.picked : null}
        jobUrl={intake.jobUrl}
        onPickCard={pickCard}
        onPickJob={pickJob}
      />
    </main>
  );
}

function SamplesSheet({
  ref,
  tab,
  onTab,
  onClose,
  onDismiss,
  pickedCard,
  jobUrl,
  onPickCard,
  onPickJob,
}: {
  ref: Ref<HTMLDialogElement>;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onClose: () => void;
  onDismiss: () => void;
  pickedCard: string | null;
  jobUrl: string;
  onPickCard: (card: SampleCard) => void;
  onPickJob: (job: SampleJob) => void;
}) {
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ cards: null, jobs: null });

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const at = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? (at + 1) % TABS.length
      : e.key === "ArrowLeft" ? (at + TABS.length - 1) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  return (
    <dialog
      ref={ref}
      className="ds-sheet"
      aria-label="Browse samples"
      onClose={onClose}
      onClick={(e) => {
        // The body fills the dialog, so a click that lands on the dialog itself hit the backdrop.
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="ds-sheet-body">
        <span className="ds-grab" aria-hidden="true" />
        <div className="ds-sheet-bar">
          <div className="ds-tabs" role="tablist" aria-label="Samples" onKeyDown={onKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`ds-tab-${t.id}`}
                className="ds-tab"
                aria-selected={tab === t.id}
                aria-controls={`ds-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="ds-close" aria-label="Close" onClick={onDismiss}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="ds-panel" role="tabpanel" id="ds-panel-cards" aria-labelledby="ds-tab-cards" hidden={tab !== "cards"}>
          <div className="ds-grid">
            {SAMPLE_CARDS.map((card, i) => (
              <button
                key={card.handle}
                type="button"
                className="ds-tile"
                style={{ "--i": i } as CSSProperties}
                aria-label={`Use @${card.handle}'s Top 9`}
                aria-pressed={pickedCard === card.handle}
                onClick={() => onPickCard(card)}
              >
                <img src={card.src} alt="" draggable={false} />
                <span className="ds-tile-handle">@{card.handle}</span>
                <Check />
              </button>
            ))}
          </div>
        </div>

        <div className="ds-panel" role="tabpanel" id="ds-panel-jobs" aria-labelledby="ds-tab-jobs" hidden={tab !== "jobs"}>
          <ul className="ds-list">
            {SAMPLE_JOBS.map((job, i) => (
              <li key={job.url} style={{ "--i": i } as CSSProperties} className="ds-row-item">
                <button type="button" className="ds-row" aria-pressed={jobUrl === job.url} onClick={() => onPickJob(job)}>
                  <span className="ds-row-org">{job.org}</span>
                  <span className="ds-row-title">{job.title}</span>
                  <Check />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </dialog>
  );
}

function Check() {
  return (
    <span className="ds-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function YouSlot({
  intake,
  error,
  onAdd,
  onDropFile,
}: {
  intake: Intake;
  error: string | null;
  onAdd: () => void;
  onDropFile: (file: File) => void;
}) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);

  return (
    <section
      className="ds-card ds-you"
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
      <p className="ds-tag">You</p>
      {card ? (
        <>
          {card.preview ? (
            <img className="ds-art" src={card.preview} alt="Your Top 9 card" />
          ) : (
            <div className="ds-art ds-art-empty">
              <span className="ds-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
            </div>
          )}
          {titles.status === "busy" ? <span className="ds-scan" aria-hidden="true" /> : null}
          <div className="ds-foot">
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
        <div className="ds-slot-empty ds-you-empty">
          <label className="ds-drop" data-drag={drag || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="ds-file"
              aria-label="Choose your Top 9 card image"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onAdd();
                  intake.setHandle("");
                  intake.addFile(file);
                }
                e.target.value = "";
              }}
            />
            <span className="ds-plus" aria-hidden="true">
              +
            </span>
            <span className="ds-slot-title">Your Top 9</span>
            <span className="ds-slot-sub">Drop or choose an image</span>
          </label>
          <PostField intake={intake} onAdd={onAdd} error={error} />
        </div>
      )}
    </section>
  );
}

function JobSlot({ intake, verdict }: { intake: Intake; verdict: Verdict | null }) {
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const known = sampleJobFor(intake.jobUrl);
  const [org, board] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <section className="ds-card ds-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      <p className="ds-tag">The job</p>
      {has ? (
        <div className="ds-job-body">
          <span className="ds-job-org">{known?.org ?? org}</span>
          <span className="ds-job-title">{known?.title ?? (verdict ? jobName(verdict) : `${board} posting`)}</span>
          {verdict?.role ? <span className="ds-job-reads">Reads as {verdict.role.label}</span> : null}
        </div>
      ) : (
        <div className="ds-slot-empty">
          <BagGlyph />
          <JobField intake={intake} />
        </div>
      )}
    </section>
  );
}

function PostField({ intake, onAdd, error }: { intake: Intake; onAdd: () => void; error: string | null }) {
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
    <div className="ds-or">
      <label htmlFor="ds-post" className="ds-or-label">
        or a post link
      </label>
      <input
        id="ds-post"
        className="ds-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="x.com/…"
        value={link}
        aria-describedby={message ? "ds-post-error" : undefined}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
      {message ? (
        <p className="ds-error" id="ds-post-error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function JobField({ intake }: { intake: Intake }) {
  const [value, setValue] = useState("");

  function commit() {
    if (value.trim()) intake.setJobUrl(value.trim());
  }

  return (
    <div className="ds-or">
      <label htmlFor="ds-job" className="ds-or-label ds-or-label-lg">
        Paste the job link
      </label>
      <input
        id="ds-job"
        className="ds-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Job link"
        value={value}
        aria-describedby={intake.jobError ? "ds-job-hint ds-job-error" : "ds-job-hint"}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").trim();
          if (sniff(text) === "job") {
            e.preventDefault();
            setValue(text);
            intake.setJobUrl(text);
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        onBlur={commit}
      />
      <p className="ds-hint" id="ds-job-hint">
        Greenhouse or Ashby
      </p>
      {intake.jobError ? (
        <p className="ds-error" id="ds-job-error" role="alert">
          Only Greenhouse or Ashby links work
        </p>
      ) : null}
    </div>
  );
}

function Go({ intake, triggerRef, onBrowse }: { intake: Intake; triggerRef: Ref<HTMLButtonElement>; onBrowse: () => void }) {
  const need = !intake.card
    ? "Add your Top 9 to start"
    : intake.titles.status === "busy"
      ? "Reading your card…"
      : !intake.jobUrl || intake.jobError
        ? "Now add the job"
        : "";
  return (
    <div className="ds-go">
      <div className="ds-go-row">
        <button type="button" className="ds-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
          Match them
        </button>
        <button type="button" className="ds-secondary" ref={triggerRef} aria-haspopup="dialog" onClick={onBrowse}>
          Browse samples
        </button>
      </div>
      <p className="ds-need" aria-live="polite">
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
    <section className="ds-result" data-choice={match.choice} ref={ref} aria-labelledby="ds-verdict">
      {boom && match.choice === "match" ? (
        <Confetti colors={[VERDICT_COLOR.match, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      {boom && match.choice === "stretch" ? (
        <Confetti count={18} colors={[VERDICT_COLOR.stretch, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      <div className="ds-score">
        <p className="ds-percent">
          <span className="ds-percent-n">{percent}</span>
          <span className="ds-percent-unit">% aligned</span>
        </p>
        <h2 className="ds-verdict" id="ds-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="ds-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="ds-why">{match.why}</blockquote>
      <p className="ds-reads">
        <span>
          You read as <strong>{verdict.card.label}</strong>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="ds-actions">
        <button type="button" className="ds-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="ds-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="ds-text" onClick={onTryAnother}>
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
