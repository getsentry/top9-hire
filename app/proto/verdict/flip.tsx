"use client";

import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { Confetti, DECISION, Evidence, Spinner, TONE, VERDICT_COLOR, jobName, useCountUp, useShare } from "./shared";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, usePickSample } from "./samples";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./flip.css";

type Picker = ReturnType<typeof usePickSample>;

/** Counts how often `value` changed, so a keyed element can replay its pick animation. */
function useBump(value: string) {
  const [state, setState] = useState({ value, n: 0 });
  if (state.value !== value) setState({ value, n: state.n + 1 });
  return state.n;
}

export function Flip() {
  const intake = useIntake();
  const picker = usePickSample(intake);
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
    document.getElementById("fp-verdict-head")?.focus({ preventScroll: true });
    const el = resultRef.current;
    if (!el || el.getBoundingClientRect().top < innerHeight * 0.75) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 900);
    return () => clearTimeout(id);
  }, [verdict]);

  const choice = verdict?.match?.choice;

  return (
    <main className="fp">
      <header className="fp-head">
        <p className="fp-mark">top9.wtf</p>
        <h1 className="fp-title">Is it a match?</h1>
        <p className="fp-lede">Your nine games on one side. The job on the other. The panel decides if they belong together.</p>
      </header>

      <div className="fp-stage" data-phase={phase} data-choice={choice}>
        <YouCard intake={intake} picker={picker} flipped={phase !== "setup"} verdict={verdict} />
        <JobCard intake={intake} flipped={phase !== "setup"} verdict={verdict} />
        {phase === "result" ? null : (
          <>
            <YouChips intake={intake} picker={picker} locked={phase === "busy"} />
            <JobChips intake={intake} locked={phase === "busy"} />
          </>
        )}
        {verdict?.match ? <VerdictCard verdict={verdict} /> : null}
      </div>

      {choice && choice !== "mismatch" ? (
        <Confetti colors={[VERDICT_COLOR[choice], "#1a1a1a", "#f3efe6"]} count={choice === "stretch" ? 18 : 48} origin={[50, 55]} />
      ) : null}
      {phase === "setup" ? <Go intake={intake} /> : null}
      {verdict ? <Result intake={intake} verdict={verdict} ref={resultRef} /> : null}
    </main>
  );
}

function YouCard({ intake, picker, flipped, verdict }: { intake: Intake; picker: Picker; flipped: boolean; verdict: Verdict | null }) {
  const { card, titles } = intake;
  const [drag, setDrag] = useState(false);
  const bump = useBump(card ? (card.preview ?? (card.kind === "tweet" ? card.url : "")) : "");

  return (
    <div className="fp-card fp-you" data-flipped={flipped || undefined}>
      <div className="fp-inner">
        <section
          className="fp-face fp-front"
          aria-label="Your Top 9"
          inert={flipped}
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
            if (file) {
              picker.clearPicked();
              intake.addFile(file);
            }
          }}
        >
          <div className="fp-in" key={bump} data-bump={bump > 0 || undefined}>
            <p className="fp-tag">You</p>
            {card ? (
              <>
                {card.preview ? (
                  <img className="fp-art" src={card.preview} alt="Your Top 9 card" />
                ) : (
                  <div className="fp-art fp-art-empty">
                    <span className="fp-handle">@{card.kind === "tweet" ? card.handle : ""}</span>
                  </div>
                )}
                {titles.status === "busy" ? <span className="fp-scan" aria-hidden="true" /> : null}
                <div className="fp-foot">
                  <span className="fp-foot-text" role={titles.status === "error" ? "alert" : undefined}>
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
                  <button
                    type="button"
                    className="fp-mini"
                    onClick={() => {
                      picker.clearPicked();
                      intake.clearCard();
                    }}
                  >
                    Replace
                  </button>
                </div>
              </>
            ) : (
              <div className="fp-empty">
                <span className="fp-plus" aria-hidden="true">
                  +
                </span>
                <span className="fp-drop-title">Your Top 9 card</span>
                <span className="fp-drop-sub">Pick one below, or drop an image here</span>
              </div>
            )}
          </div>
        </section>

        <div className="fp-face fp-back" inert={!flipped}>
          {verdict ? (
            <div className="fp-read">
              <p className="fp-kicker">The panel reads you as</p>
              <p className="fp-read-label">{verdict.card.label}</p>
              <p className="fp-read-signal">{verdict.card.signal}</p>
            </div>
          ) : (
            <p className="fp-busy" role="status">
              <Spinner label="" /> Reading you…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function JobCard({ intake, flipped, verdict }: { intake: Intake; flipped: boolean; verdict: Verdict | null }) {
  const has = Boolean(intake.jobUrl) && !intake.jobError;
  const bump = useBump(has ? intake.jobUrl : "");
  const sample = sampleJobFor(intake.jobUrl);
  const [org, board] = jobLabel(intake.jobUrl).split(" · ");

  return (
    <div className="fp-card fp-job" data-flipped={flipped || undefined}>
      <div className="fp-inner">
        <section className="fp-face fp-front" aria-label="The job" inert={flipped} data-state={has ? "ok" : "empty"}>
          <div className="fp-in" key={bump} data-bump={bump > 0 || undefined}>
            <p className="fp-tag">The job</p>
            {has ? (
              <div className="fp-job-body">
                <span className="fp-job-org">{sample?.org ?? org}</span>
                <span className="fp-job-title">{sample?.title ?? `${board} posting`}</span>
              </div>
            ) : (
              <div className="fp-job-empty">
                <BagGlyph />
                <span className="fp-drop-title">Pick or paste a job</span>
                <span className="fp-drop-sub">Greenhouse or Ashby</span>
              </div>
            )}
          </div>
        </section>

        <div className="fp-face fp-back" inert={!flipped}>
          {verdict ? (
            <div className="fp-read">
              <p className="fp-kicker">{jobName(verdict)} reads as</p>
              <p className="fp-read-label">{verdict.role?.label}</p>
            </div>
          ) : (
            <p className="fp-busy" role="status">
              <Spinner label="" /> Reading the job…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function YouChips({ intake, picker, locked }: { intake: Intake; picker: Picker; locked: boolean }) {
  const [link, setLink] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const { titles, card } = intake;
  const error = hint ?? (titles.status === "error" && !card ? titles.message : null);

  function submit() {
    const kind = sniff(link);
    if (kind === "tweet") {
      picker.clearPicked();
      intake.addTweet(link);
      setLink("");
      setHint(null);
    } else if (link.trim()) {
      setHint("Use a post link like x.com/name/status/123.");
    }
  }

  return (
    <div className="fp-group" data-locked={locked || undefined}>
      <div className="fp-chips" role="group" aria-label="Pick a Top 9 card">
        <label className="fp-chip fp-chip-upload" style={{ "--i": 0 } as CSSProperties}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="fp-file"
            disabled={locked}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                picker.clearPicked();
                intake.setHandle("");
                intake.addFile(file);
              }
              e.target.value = "";
            }}
          />
          <PlusIcon />
          Upload yours
        </label>
        {SAMPLE_CARDS.map((sample, i) => (
          <button
            key={sample.handle}
            type="button"
            className="fp-chip"
            style={{ "--i": i + 1 } as CSSProperties}
            aria-pressed={picker.picked === sample.handle}
            disabled={locked}
            onClick={() => void picker.pick(sample)}
          >
            <img className="fp-avatar" src={sample.src} alt="" />@{sample.handle}
          </button>
        ))}
      </div>
      <div className="fp-paste">
        <label htmlFor="fp-post" className="fp-or-label">
          or paste your post link
        </label>
        <input
          id="fp-post"
          className="fp-field"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="x.com/…"
          disabled={locked}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          onBlur={submit}
        />
        {error ? (
          <p className="fp-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function JobChips({ intake, locked }: { intake: Intake; locked: boolean }) {
  const [value, setValue] = useState("");

  function commit() {
    const url = value.trim();
    if (url && url !== intake.jobUrl) intake.setJobUrl(url);
  }

  return (
    <div className="fp-group" data-locked={locked || undefined}>
      <div className="fp-chips" role="group" aria-label="Pick a job">
        {SAMPLE_JOBS.map((sample, i) => (
          <button
            key={sample.url}
            type="button"
            className="fp-chip"
            style={{ "--i": i } as CSSProperties}
            aria-pressed={intake.jobUrl === sample.url}
            disabled={locked}
            onClick={() => {
              setValue("");
              intake.setJobUrl(sample.url);
            }}
          >
            <span className="fp-chip-text">
              <b>{sample.org}</b> {sample.title}
            </span>
          </button>
        ))}
      </div>
      <div className="fp-paste">
        <label htmlFor="fp-job" className="fp-or-label">
          or paste a Greenhouse or Ashby link
        </label>
        <input
          id="fp-job"
          className="fp-field"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Job link"
          disabled={locked}
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
          onKeyDown={(e) => e.key === "Enter" && commit()}
          onBlur={commit}
        />
        {intake.jobError ? (
          <p className="fp-error" role="alert">
            Only Greenhouse or Ashby links work
          </p>
        ) : null}
      </div>
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
    <div className="fp-go">
      <button type="button" className="fp-primary" disabled={!intake.ready} onClick={() => void intake.run()}>
        Match them
      </button>
      <p className="fp-need" aria-live="polite">
        {intake.verdict.status === "error" ? <span role="alert">{intake.verdict.message}</span> : need}
      </p>
    </div>
  );
}

function VerdictCard({ verdict }: { verdict: Verdict }) {
  const match = verdict.match!;
  const percent = useCountUp(match.alignment.percent, 1100);
  return (
    <section className="fp-verdict" aria-labelledby="fp-verdict-head" style={{ "--vc": VERDICT_COLOR[match.choice] } as CSSProperties}>
      <p className="fp-percent">
        <span className="fp-percent-n">{percent}</span>
        <span className="fp-percent-unit">% aligned</span>
      </p>
      <h2 className="fp-verdict-head" id="fp-verdict-head" tabIndex={-1}>
        {DECISION[match.choice]}
      </h2>
      <p className="fp-tone">{TONE[match.choice]}</p>
    </section>
  );
}

function Result({ intake, verdict, ref }: { intake: Intake; verdict: Verdict; ref: Ref<HTMLElement> }) {
  const match = verdict.match!;
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const { share, copied, xHref } = useShare(verdict, titles, intake.handle);

  return (
    <section className="fp-result" ref={ref} aria-label="Why">
      <blockquote className="fp-why">{match.why}</blockquote>
      <Evidence fit={match.fit} />
      <div className="fp-actions">
        <button type="button" className="fp-primary" onClick={() => void share()}>
          {copied ? "Copied" : "Share the match"}
        </button>
        <a className="fp-secondary" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
        <button type="button" className="fp-text" onClick={() => intake.setJobUrl("")}>
          Try another job
        </button>
      </div>
    </section>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
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
