"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./verdict-parts";
import { JOB_REQUEST_URL, SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample, type SampleCard, type SampleJob } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import { FLIGHT_MS, fly, sourceOf } from "./card-flight";
import { JobField, PostField } from "./link-fields";
import "./dialog-posts.css";
import "./brand.css";

const REPO_URL = "https://github.com/getsentry/top9-hire";
const ORIGIN_POST_URL = "https://x.com/dillon_mulroy/status/2104334305346634142";
const MAKER_URL = "https://my9games.net/en";

export function DialogPosts() {
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
  const owner = SAMPLE_CARDS.find((c) => c.handle === intake.handle);
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
    document.getElementById("dp-verdict")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  function pickCard(card: SampleCard, tile: HTMLElement) {
    // The dialog sits in the top layer, so the ghost can only start once it has closed.
    const source = sourceOf(tile.querySelector<HTMLElement>(".dp-tile-art") ?? tile);
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
    <main id="top9" className="dp" data-ready={(phase === "setup" && intake.ready) || undefined}>
      <header className="dp-head">
        <p className="dp-mark">top9.wtf</p>
        <h1 className="dp-title">Is it a match?</h1>
        <p className="dp-lede">
          <strong>Forget LeetCode.</strong> Jev decides whether you are a good fit for the role.
        </p>
        <a className="dp-origin" href={ORIGIN_POST_URL} target="_blank" rel="noreferrer">
          Why does this exist? ↗
        </a>
      </header>
      <a className="dp-repo" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="top9.wtf source on GitHub">
        <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
        <span className="dp-repo-text">GitHub</span>
      </a>

      <div
        className="dp-stage"
        ref={stageRef}
        data-phase={phase}
        data-choice={verdict?.match?.choice}
        style={stage}
      >
        <YouSlot
          intake={intake}
          owner={owner}
          ref={youRef}
          locked={locked}
          onDropFile={(file) => { clearPicked(); addFile(file); }}
          onUpload={uploadOwn}
          onClearPicked={clearPicked}
          onOpenSamples={() => youDialogRef.current?.showModal()}
        />
        <JobSlot intake={intake} verdict={verdict} ref={jobRef} locked={locked} onOpenSamples={() => jobDialogRef.current?.showModal()} />
        {phase === "busy" ? (
          <p className="dp-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="dp-stamp" aria-hidden="true" style={{ color: VERDICT_COLOR[verdict.match.choice] }}>
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {verdict ? <Result intake={intake} owner={owner} verdict={verdict} ref={resultRef} onTryAnother={tryAnother} /> : null}

      <PickerDialog ref={youDialogRef} title="Pick a Top 9">
        <div className="dp-grid">
          {SAMPLE_CARDS.map((card, i) => (
            <button
              key={card.handle}
              type="button"
              className="dp-tile"
              style={{ "--i": i } as CSSProperties}
              aria-label={`Use @${card.handle}'s Top 9`}
              onClick={(e) => pickCard(card, e.currentTarget)}
            >
              <span className="dp-tile-head">
                <img className="dp-avatar dp-avatar-36" src={card.avatar} alt="" width={36} height={36} draggable={false} />
                <span className="dp-tile-who">
                  {card.name ? <span className="dp-tile-name">{card.name}</span> : null}
                  <span className={card.name ? "dp-tile-handle" : "dp-tile-name"}>@{card.handle}</span>
                </span>
              </span>
              <img className="dp-tile-art" src={card.src} alt="" draggable={false} />
            </button>
          ))}
          <a
            className="dp-tile dp-ask dp-ask-card"
            style={{ "--i": SAMPLE_CARDS.length } as CSSProperties}
            href={MAKER_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="dp-plus" aria-hidden="true">
              +
            </span>
            <span className="dp-ask-title">Make your own Top 9</span>
            <span className="dp-ask-hint">my9games.net ↗</span>
          </a>
        </div>
      </PickerDialog>

      <PickerDialog ref={jobDialogRef} title="Pick a job">
        <div className="dp-grid dp-grid-jobs">
          {SAMPLE_JOBS.map((job, i) => (
            <button
              key={job.url}
              type="button"
              className="dp-tile dp-job-pick"
              style={{ "--i": i } as CSSProperties}
              onClick={(e) => pickJob(job, e.currentTarget)}
            >
              <span className="dp-job-pick-org">{job.org}</span>
              <span className="dp-job-pick-title">{job.title}</span>
            </button>
          ))}
          <a
            className="dp-tile dp-job-pick dp-ask"
            style={{ "--i": SAMPLE_JOBS.length } as CSSProperties}
            href={JOB_REQUEST_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="dp-job-pick-org">Want to see yours?</span>
            <span className="dp-job-pick-title">Send us the posting on GitHub ↗</span>
          </a>
        </div>
      </PickerDialog>

      {phase === "setup" ? <Go intake={intake} /> : null}
    </main>
  );
}

function PickerDialog({ ref, title, children }: { ref: Ref<HTMLDialogElement>; title: string; children: ReactNode }) {
  const titleId = `dp-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <dialog
      ref={ref}
      className="dp-dialog"
      aria-labelledby={titleId}
      onClick={(e) => {
        // Only a click on the backdrop lands on the dialog itself; the panel fills the rest.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="dp-panel">
        <div className="dp-dialog-head">
          <h2 className="dp-dialog-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="dp-close" aria-label="Close" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
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
      document.querySelector<HTMLElement>('.dp-primary:not([aria-disabled="true"]):not(dialog *)') ??
      document.querySelector<HTMLElement>('.dp-card[data-state="empty"] .dp-sample:enabled');
    next?.focus({ preventScroll: true });
  });
}

function YouSlot({
  intake,
  owner,
  ref,
  locked,
  onDropFile,
  onUpload,
  onClearPicked,
  onOpenSamples,
}: {
  intake: Intake;
  owner: SampleCard | undefined;
  ref: Ref<HTMLElement>;
  locked: boolean;
  onDropFile: (file: File) => void;
  onUpload: (file: File, from: HTMLElement) => void;
  onClearPicked: () => void;
  onOpenSamples: () => void;
}) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);

  return (
    <section
      ref={ref}
      className="dp-card dp-you"
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
          <OwnerRow owner={owner} handle={intake.handle} />
          {card.preview ? (
            <img className="dp-art" src={card.preview} alt="Your Top 9 card" />
          ) : (
            <div className="dp-art dp-art-empty">
              <span className="dp-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
            </div>
          )}
          {titles.status === "busy" ? <span className="dp-scan" aria-hidden="true" /> : null}
          <div className="dp-foot">
            <span className="dp-foot-text">
              {titles.status === "busy" ? (
                <>
                  <Spinner label="Reading titles" /> Reading your nine…
                </>
              ) : titles.status === "ok" ? (
                `${titles.value.length} titles read`
              ) : null}
            </span>
            <button
              type="button"
              className="dp-replace"
              disabled={locked}
              onClick={() => {
                onClearPicked();
                intake.setHandle("");
                intake.clearCard();
              }}
            >
              Replace
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="dp-drop" data-disabled={locked || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="dp-file"
              disabled={locked}
              aria-label="Upload your Top 9 card"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file, e.target.closest("label") as HTMLElement);
                e.target.value = "";
              }}
            />
            <span className="dp-plus" aria-hidden="true">
              +
            </span>
            <span className="dp-drop-text">Add your Top 9</span>
            <span className="dp-drop-hint">Drop or choose the image</span>
          </label>
          <PostField intake={intake} locked={locked} onAdd={onClearPicked} />
          <button type="button" className="dp-sample" disabled={locked} onClick={onOpenSamples}>
            Pick a sample
          </button>
        </>
      )}
    </section>
  );
}

function OwnerRow({ owner, handle }: { owner: SampleCard | undefined; handle: string }) {
  return (
    <div className="dp-owner">
      {owner ? (
        <img className="dp-avatar dp-avatar-28" src={owner.avatar} alt="" width={28} height={28} />
      ) : (
        <span className="dp-avatar dp-avatar-28 dp-avatar-blank" aria-hidden="true" />
      )}
      <span className="dp-owner-handle">{handle ? `@${handle}` : "Your card"}</span>
      {owner?.name ? <span className="dp-owner-name">{owner.name}</span> : null}
    </div>
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
  const org = jobLabel(intake.jobUrl);

  return (
    <section ref={ref} className="dp-card dp-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      {has ? (
        <div className="dp-job-body">
          <span className="dp-job-org">{known?.org ?? org}</span>
          <span className="dp-job-title">{known?.title ?? (verdict ? jobName(verdict) : "Job posting")}</span>
          {verdict?.role ? <span className="dp-job-reads">Reads as {verdict.role.label}</span> : null}
          <div className="dp-job-foot">
            {/^https:\/\//.test(intake.jobUrl) ? (
              <a className="dp-job-link" href={intake.jobUrl} target="_blank" rel="noreferrer">
                View posting ↗
              </a>
            ) : null}
            <button
              type="button"
              className="dp-replace"
              disabled={locked}
              onClick={() => {
                intake.setJobUrl("");
                // The field replaces this button, so focus would drop to the page. On touch, focusing would open the keyboard
                if (matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => document.getElementById("dp-job")?.focus());
              }}
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="dp-job-hero">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="7" width="18" height="13" rx="2.5" />
              <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" />
            </svg>
            <span className="dp-drop-text">Add the role</span>
            <span className="dp-drop-hint">Paste its posting link</span>
          </div>
          <JobField intake={intake} locked={locked} />
          <button type="button" className="dp-sample" disabled={locked} onClick={onOpenSamples}>
            Pick a sample job
          </button>
        </>
      )}
    </section>
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
  const blocked = !intake.ready;
  // Card-read failures can run long, so they wrap here instead of in the one-line field row.
  const problem =
    intake.verdict.status === "error"
      ? intake.verdict.message
      : intake.titles.status === "error"
        ? intake.titles.message
        : null;
  // Touch has no hover, so a tap on the blocked button shows the tip for a moment.
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (!nudge) return;
    const id = setTimeout(() => setNudge(false), 2400);
    return () => clearTimeout(id);
  }, [nudge]);

  return (
    <div className="dp-go" data-nudge={nudge || undefined}>
      <button
        type="button"
        className="dp-primary"
        aria-disabled={blocked || undefined}
        aria-describedby={need ? "dp-go-tip" : undefined}
        onClick={() => (blocked ? setNudge(true) : void intake.run())}
      >
        Match them
      </button>
      {need ? (
        <span className="dp-tip" id="dp-go-tip" role="tooltip">
          {need}
        </span>
      ) : null}
      {problem ? (
        <p className="dp-need" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function Result({
  intake,
  owner,
  verdict,
  ref,
  onTryAnother,
}: {
  intake: Intake;
  owner: SampleCard | undefined;
  verdict: Verdict;
  ref: Ref<HTMLElement>;
  onTryAnother: () => void;
}) {
  const match = verdict.match!;
  const { share, copied, xHref } = useShare(verdict, intake.handle);
  const percent = useCountUp(match.alignment.percent, 1100);
  const [boom, setBoom] = useState(false);

  // Confetti waits for the stamp to land.
  useEffect(() => {
    if (match.choice === "mismatch") return;
    const id = setTimeout(() => setBoom(true), 700);
    return () => clearTimeout(id);
  }, [match.choice]);

  return (
    <section className="dp-result" data-choice={match.choice} ref={ref} aria-labelledby="dp-verdict">
      {boom && match.choice === "match" ? (
        <Confetti colors={[VERDICT_COLOR.match, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      {boom && match.choice === "stretch" ? (
        <Confetti count={18} colors={[VERDICT_COLOR.stretch, "var(--stamp)", "var(--ink)", "#e9e2d3", "#f2c14e"]} />
      ) : null}
      <div className="dp-score">
        <p className="dp-percent">
          <span className="dp-percent-n">{percent}</span>
          <span className="dp-percent-unit">% aligned</span>
        </p>
        <h2 className="dp-verdict" id="dp-verdict" tabIndex={-1}>
          {DECISION[match.choice]}
        </h2>
        <p className="dp-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="dp-why">{match.why}</blockquote>
      <p className="dp-reads">
        <span className="dp-reads-you">
          {owner ? <img className="dp-avatar dp-avatar-24" src={owner.avatar} alt="" width={24} height={24} /> : null}
          <span>
            You read as <strong>{verdict.card.label}</strong>
          </span>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="dp-actions">
        <button type="button" className="dp-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="dp-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="dp-text" onClick={onTryAnother}>
          Try another job
        </button>
      </div>
    </section>
  );
}
