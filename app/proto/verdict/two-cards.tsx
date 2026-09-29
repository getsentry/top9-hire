"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { DECISION, Evidence, Spinner, TONE, jobName, useCountUp, useShare } from "./shared";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./two-cards.css";

export function TwoCards() {
  const intake = useIntake();
  const { addFile, addText } = intake;
  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;
  const phase = verdict ? "result" : intake.verdict.status === "busy" ? "busy" : "setup";
  const resultRef = useRef<HTMLElement>(null);

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
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  const percent = verdict?.match?.alignment.percent ?? 0;
  const stage = {
    "--overlap": phase === "result" ? (0.12 + (percent / 100) * 0.3).toFixed(3) : phase === "busy" ? "0.04" : "0",
  } as CSSProperties;

  return (
    <main className="tc">
      <header className="tc-head">
        <p className="tc-mark">top9.wtf</p>
        <h1 className="tc-title">Is it a match?</h1>
        <p className="tc-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div className="tc-stage" data-phase={phase} data-choice={verdict?.match?.choice} style={stage}>
        <YouCard intake={intake} />
        <JobCard intake={intake} verdict={verdict} />
        {phase === "busy" ? (
          <p className="tc-deciding" role="status">
            <Spinner label="" /> Deciding
          </p>
        ) : null}
        {verdict?.match ? (
          <p className="tc-stamp" aria-hidden="true">
            {DECISION[verdict.match.choice]}
          </p>
        ) : null}
      </div>

      {phase === "setup" ? <Go intake={intake} /> : null}
      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} /> : null}
    </main>
  );
}

function YouCard({ intake }: { intake: Intake }) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);
  const [link, setLink] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const locked = intake.verdict.status !== "idle" && intake.verdict.status !== "error";

  function submit() {
    const kind = sniff(link);
    if (kind === "tweet") {
      intake.addTweet(link);
      setLink("");
      setHint(null);
    } else if (link.trim()) {
      setHint("Use a post link like x.com/name/status/123.");
    }
  }

  return (
    <section
      className="tc-card tc-you"
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
        if (file) intake.addFile(file);
      }}
    >
      <p className="tc-tag">You</p>
      {card ? (
        <>
          {card.preview ? (
            <img className="tc-art" src={card.preview} alt="Your Top 9 card" />
          ) : (
            <div className="tc-art tc-art-empty">
              <span className="tc-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
            </div>
          )}
          {titles.status === "busy" ? <span className="tc-scan" aria-hidden="true" /> : null}
          <div className="tc-foot">
            <span className="tc-foot-text" role={titles.status === "error" ? "alert" : undefined}>
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
              <button type="button" className="tc-mini" onClick={intake.clearCard}>
                Replace
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="tc-empty">
          <label className="tc-drop">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="tc-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) intake.addFile(file);
                e.target.value = "";
              }}
            />
            <span className="tc-plus" aria-hidden="true">
              +
            </span>
            <span className="tc-drop-title">Add your Top 9 card</span>
            <span className="tc-drop-sub">Drop, paste, or choose an image</span>
          </label>
          <div className="tc-or">
            <label htmlFor="tc-post" className="tc-or-label">
              or a post link
            </label>
            <input
              id="tc-post"
              className="tc-field"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="x.com/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              onBlur={submit}
            />
            {hint || titles.status === "error" ? (
              <p className="tc-error" role="alert">
                {hint ?? (titles.status === "error" ? titles.message : "")}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function JobCard({ intake, verdict }: { intake: Intake; verdict: Verdict | null }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const locked = intake.verdict.status === "busy" || Boolean(verdict);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
  }

  function commit() {
    if (value.trim()) intake.setJobUrl(value.trim());
  }

  const [org, board] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <section className="tc-card tc-job" aria-label="The job" data-state={has ? "ok" : "empty"}>
      <p className="tc-tag">The job</p>
      {has ? (
        <div className="tc-job-body">
          <span className="tc-job-org">{org}</span>
          <span className="tc-job-title">{verdict ? jobName(verdict) : `${board} posting`}</span>
          {verdict?.role ? <span className="tc-job-reads">Reads as {verdict.role.label}</span> : null}
          {!locked ? (
            <button
              type="button"
              className="tc-mini tc-mini-dark"
              onClick={() => {
                setValue(intake.jobUrl);
                intake.setJobUrl("");
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              Change
            </button>
          ) : null}
        </div>
      ) : (
        <div className="tc-job-empty">
          <BagGlyph />
          <label htmlFor="tc-job" className="tc-drop-title">
            Paste the job link
          </label>
          <input
            id="tc-job"
            ref={inputRef}
            className="tc-field tc-field-dark"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="Job link"
            value={value}
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
          <span className="tc-drop-sub">{intake.jobError ? "Only Greenhouse or Ashby links work" : "Greenhouse or Ashby"}</span>
        </div>
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
  return (
    <div className="tc-go">
      <button type="button" className="tc-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
        Match them
      </button>
      <p className="tc-need" aria-live="polite">
        {intake.verdict.status === "error" ? <span role="alert">{intake.verdict.message}</span> : need}
      </p>
    </div>
  );
}

function Result({ intake, verdict, ref }: { intake: Intake; verdict: Verdict; ref: Ref<HTMLElement> }) {
  const match = verdict.match!;
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const { share, copied, xHref } = useShare(verdict, titles, intake.handle);
  const percent = useCountUp(match.alignment.percent, 1100);

  return (
    <section className="tc-result" data-choice={match.choice} ref={ref} aria-labelledby="tc-verdict">
      <div className="tc-score">
        <p className="tc-percent">
          <span className="tc-percent-n">{percent}</span>
          <span className="tc-percent-unit">% aligned</span>
        </p>
        <h2 className="tc-verdict" id="tc-verdict">
          {DECISION[match.choice]}
        </h2>
        <p className="tc-tone">{TONE[match.choice]}</p>
      </div>
      <blockquote className="tc-why">{match.why}</blockquote>
      <p className="tc-reads">
        <span>
          You read as <strong>{verdict.card.label}</strong>
        </span>
        <span>
          The job reads as <strong>{verdict.role?.label}</strong>
        </span>
      </p>
      <Evidence fit={match.fit} />
      <div className="tc-actions">
        <button type="button" className="tc-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="tc-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="tc-text" onClick={() => intake.setJobUrl("")}>
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
