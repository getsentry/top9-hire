"use client";

import { useEffect, useRef, useState, type CSSProperties, type ClipboardEvent, type KeyboardEvent } from "react";
import { DECISION, Evidence, Spinner, TONE, jobName, morph, useCountUp, useShare, useTicker } from "./shared";
import { imageFrom, jobLabel, useIntake, type Intake, type Verdict } from "./use-intake";
import "./drop-box.css";

type View = "compose" | "busy" | "result";

export function DropBox() {
  const intake = useIntake();
  const view: View = intake.verdict.status === "ok" ? "result" : intake.verdict.status === "busy" ? "busy" : "compose";
  const [shown, setShown] = useState<View>(view);

  useEffect(() => {
    if (view !== shown) morph(() => setShown(view));
  }, [view, shown]);

  const { addFile } = intake;
  useEffect(() => {
    function onPaste(e: globalThis.ClipboardEvent) {
      const file = imageFrom(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      addFile(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFile]);

  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;

  return (
    <main className="db">
      <header className="db-head">
        <p className="db-mark">top9.wtf</p>
        <h1 className="db-title">Would this job hire your Top&nbsp;9?</h1>
        <p className="db-lede">Drop your #My9Games card and paste a job link. A panel of models decides.</p>
      </header>

      <section className="db-box" data-view={shown} aria-live="polite">
        {shown === "result" && verdict ? (
          <Result intake={intake} verdict={verdict} />
        ) : shown === "busy" ? (
          <Busy intake={intake} />
        ) : (
          <Compose intake={intake} />
        )}
      </section>

      {shown === "compose" && intake.titles.status === "ok" ? (
        <section className="db-titles" aria-label="Titles read from your card">
          <p className="db-titles-head">The panel will read</p>
          <ol>
            {intake.titles.value.map((title, i) => (
              <li key={`${i}-${title}`} style={{ "--i": i } as CSSProperties}>
                <span className="db-num">{i + 1}</span>
                {title}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

function Compose({ intake }: { intake: Intake }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { card, titles, jobUrl, jobError, ready } = intake;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function take(value: string): boolean {
    const clean = value.trim();
    if (!clean) return false;
    const kind = intake.addText(clean);
    if (kind === "other") {
      setHint("That link is not a post or a job. Use an x.com post link, or a Greenhouse or Ashby job link.");
      return false;
    }
    setHint(null);
    setText("");
    return true;
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    if (imageFrom(e.clipboardData)) return;
    const pasted = e.clipboardData.getData("text");
    if (/^\s*https?:\/\//.test(pasted) && take(pasted)) e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (text.trim()) take(text);
    else if (ready) void intake.run();
  }

  const placeholder = !card
    ? "Paste your Top 9 post link"
    : !jobUrl
      ? "Now paste the job link"
      : ready
        ? "Ready. Press Enter"
        : "Waiting for your titles…";

  const need = !card ? "Needs your Top 9" : !jobUrl ? "Needs a job link" : titles.status === "busy" ? "Reading your card…" : ready ? "Ready" : "";

  return (
    <div
      className="db-compose"
      data-drag={dragging || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = imageFrom(e.dataTransfer);
        if (file) intake.addFile(file);
        else take(e.dataTransfer.getData("text"));
      }}
    >
      {card || jobUrl ? (
        <ul className="db-chips">
          {card ? (
            <li className="db-chip" data-state={titles.status}>
              <span className="db-thumb">
                {card.preview ? <img src={card.preview} alt="" /> : <GridGlyph />}
              </span>
              <span className="db-chip-text">
                <span className="db-chip-name">{card.kind === "tweet" ? `@${card.handle}'s Top 9` : card.name}</span>
                <span className="db-chip-sub">
                  {titles.status === "busy" ? (
                    <>
                      <Spinner label="Reading titles" /> Reading 9 titles…
                    </>
                  ) : titles.status === "ok" ? (
                    `${titles.value.length} titles read`
                  ) : titles.status === "error" ? (
                    titles.message
                  ) : null}
                </span>
              </span>
              <button type="button" className="db-x" aria-label="Remove your Top 9" onClick={intake.clearCard}>
                <XGlyph />
              </button>
            </li>
          ) : null}
          {jobUrl ? (
            <li className="db-chip" data-state={jobError ? "error" : "ok"}>
              <span className="db-thumb db-thumb-job">
                <BagGlyph />
              </span>
              <span className="db-chip-text">
                <span className="db-chip-name">{jobLabel(jobUrl)}</span>
                <span className="db-chip-sub">{jobError ? "Only Greenhouse or Ashby job links work" : "Job post"}</span>
              </span>
              <button type="button" className="db-x" aria-label="Remove the job link" onClick={() => intake.setJobUrl("")}>
                <XGlyph />
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {!card && titles.status === "error" ? (
        <p className="db-hint" role="alert">
          {titles.message}
        </p>
      ) : null}

      <label className="db-sr" htmlFor="db-input">
        Post link, job link, or image
      </label>
      <input
        id="db-input"
        ref={inputRef}
        className="db-input"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setHint(null);
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
      />
      {hint ? (
        <p className="db-hint" role="alert">
          {hint}
        </p>
      ) : null}

      <div className="db-bar">
        <button type="button" className="db-attach" onClick={() => fileRef.current?.click()}>
          <ImageGlyph /> Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) intake.addFile(file);
            e.target.value = "";
          }}
        />
        <span className="db-need">{need}</span>
        <button type="button" className="db-go" aria-label="Get the verdict" disabled={!ready} onClick={() => void intake.run()}>
          <ArrowGlyph />
        </button>
      </div>

      {intake.verdict.status === "error" ? (
        <p className="db-hint" role="alert">
          {intake.verdict.message}
        </p>
      ) : null}

      <div className="db-veil" aria-hidden="true">
        Drop your Top 9 card
      </div>
    </div>
  );
}

function Busy({ intake }: { intake: Intake }) {
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const current = useTicker(titles);
  return (
    <div className="db-busy">
      <div className="db-busy-pair" aria-hidden="true">
        <span className="db-thumb db-thumb-lg">
          {intake.card?.preview ? <img src={intake.card.preview} alt="" /> : <GridGlyph />}
        </span>
        <span className="db-busy-link" />
        <span className="db-thumb db-thumb-lg db-thumb-job">
          <BagGlyph />
        </span>
      </div>
      <p className="db-busy-line">The panel is reading {jobLabel(intake.jobUrl).split(" · ")[0]}&rsquo;s job post</p>
      <p className="db-busy-ticker" key={current}>
        Weighing <strong>{current}</strong>
      </p>
      <span className="db-busy-bar" />
    </div>
  );
}

function Result({ intake, verdict }: { intake: Intake; verdict: Verdict }) {
  const match = verdict.match!;
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const { share, copied, xHref } = useShare(verdict, titles, intake.handle);
  const percent = useCountUp(match.alignment.percent);
  const [open, setOpen] = useState(false);

  return (
    <article className="db-result" data-choice={match.choice}>
      <div className="db-result-top">
        <span className="db-thumb db-thumb-lg">
          {intake.card?.preview ? <img src={intake.card.preview} alt="Your Top 9 card" /> : <GridGlyph />}
        </span>
        <p className="db-eyebrow">
          {intake.handle ? `@${intake.handle.replace(/^@/, "")}` : "Your Top 9"} for{" "}
          {verdict.job ? (
            <a href={verdict.job.url} target="_blank" rel="noreferrer">
              {jobName(verdict)}
            </a>
          ) : (
            jobName(verdict)
          )}
        </p>
      </div>

      <h2 className="db-stamp">{DECISION[match.choice]}</h2>
      <p className="db-tone">{TONE[match.choice]}</p>

      <div className="db-meter">
        <span className="db-meter-fill" style={{ "--p": match.alignment.percent / 100 } as CSSProperties} />
      </div>
      <p className="db-percent">
        <span className="db-percent-n">{percent}%</span> aligned
      </p>

      <blockquote className="db-why">{match.why}</blockquote>

      <p className="db-reads">
        You read as <strong>{verdict.card.label}</strong>. The job reads as <strong>{verdict.role?.label}</strong>.
      </p>

      <button type="button" className="db-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the evidence" : "See the evidence"}
      </button>
      {open ? <Evidence fit={match.fit} /> : null}

      <div className="db-actions">
        <button type="button" className="db-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the verdict"}
        </button>
        <a className="db-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="db-link" onClick={() => intake.setJobUrl("")}>
          Try another job
        </button>
      </div>
    </article>
  );
}

function GridGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={3 + c * 6.5} y={3 + r * 6.5} width="5" height="5" rx="1" fill="currentColor" />),
      )}
    </svg>
  );
}

function BagGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  );
}

function ImageGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
