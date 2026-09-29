"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DECISION, Evidence, Spinner, TONE, jobName, useCountUp, useShare, useTicker } from "./shared";
import { imageFrom, jobLabel, sniff, useIntake, type Intake, type Verdict } from "./use-intake";
import "./story.css";

const SLIDES = ["nine", "you", "job", "axes", "verdict"] as const;
const LAST = SLIDES.length - 1;

export function Story() {
  const intake = useIntake();
  const { addFile, addText } = intake;
  const verdict = intake.verdict.status === "ok" ? intake.verdict.value : null;

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = imageFrom(e.clipboardData);
      if (file) {
        e.preventDefault();
        addFile(file);
        return;
      }
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (sniff(text) !== "other") addText(text);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFile, addText]);

  return (
    <main className="st">
      <div className="st-frame" data-choice={verdict?.match?.choice}>
        {verdict ? (
          <Play intake={intake} verdict={verdict} />
        ) : intake.verdict.status === "busy" ? (
          <Loading intake={intake} />
        ) : (
          <Setup intake={intake} />
        )}
      </div>
    </main>
  );
}

function Setup({ intake }: { intake: Intake }) {
  const [post, setPost] = useState("");
  const [job, setJob] = useState(intake.jobUrl);
  const [hint, setHint] = useState<string | null>(null);
  const { card, titles } = intake;

  function takePost() {
    if (!post.trim()) return;
    if (sniff(post) === "tweet") {
      intake.addTweet(post);
      setPost("");
      setHint(null);
    } else setHint("Use a post link like x.com/name/status/123.");
  }

  const cardStatus =
    titles.status === "busy" ? (
      <>
        <Spinner label="Reading titles" /> Reading your nine…
      </>
    ) : titles.status === "ok" ? (
      `${titles.value.length} titles read`
    ) : titles.status === "error" ? (
      titles.message
    ) : (
      "Tap to choose, or paste or drop an image"
    );

  return (
    <div
      className="st-setup"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = imageFrom(e.dataTransfer);
        if (file) intake.addFile(file);
      }}
    >
      <Bars count={SLIDES.length} current={-1} />
      <header className="st-setup-head">
        <p className="st-kicker">top9.wtf</p>
        <h1 className="st-h1">Your hire story</h1>
        <p className="st-sub">Give the panel your nine games and one job. It plays back what it decided.</p>
      </header>

      <div className="st-steps">
        <div className="st-step" data-done={titles.status === "ok" || undefined} data-error={titles.status === "error" || undefined}>
          <label className="st-pick">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="st-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) intake.addFile(file);
                e.target.value = "";
              }}
            />
            <span className="st-thumb">{card?.preview ? <img src={card.preview} alt="" /> : <span aria-hidden="true">1</span>}</span>
            <span className="st-step-text">
              <span className="st-step-title">{card ? (card.kind === "tweet" ? `@${card.handle}'s Top 9` : "Your Top 9") : "Add your Top 9 card"}</span>
              <span className="st-step-sub" role={titles.status === "error" ? "alert" : undefined}>
                {cardStatus}
              </span>
            </span>
          </label>
          {!card ? (
            <>
              <label htmlFor="st-post" className="st-sr">
                Or paste your Top 9 post link
              </label>
              <input
                id="st-post"
                className="st-field"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="or paste x.com/you/status/…"
                value={post}
                onChange={(e) => setPost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && takePost()}
                onBlur={takePost}
              />
              {hint ? (
                <p className="st-error" role="alert">
                  {hint}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="st-step" data-done={(intake.jobUrl && !intake.jobError) || undefined}>
          <div className="st-pick st-pick-static">
            <span className="st-thumb" aria-hidden="true">
              2
            </span>
            <span className="st-step-text">
              <label htmlFor="st-job" className="st-step-title">
                {intake.jobUrl && !intake.jobError ? jobLabel(intake.jobUrl) : "Paste the job link"}
              </label>
              <span className="st-step-sub">{intake.jobError ? "Only Greenhouse or Ashby links work" : "Greenhouse or Ashby"}</span>
            </span>
          </div>
          <input
            id="st-job"
            className="st-field"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="jobs.ashbyhq.com/…"
            value={job}
            onChange={(e) => {
              setJob(e.target.value);
              intake.setJobUrl(e.target.value.trim());
            }}
          />
        </div>
      </div>

      <div className="st-setup-foot">
        {intake.verdict.status === "error" ? (
          <p className="st-error" role="alert">
            {intake.verdict.message}
          </p>
        ) : null}
        <button type="button" className="st-play" disabled={!intake.ready} onClick={() => void intake.run()}>
          <PlayGlyph /> Play my story
        </button>
      </div>
    </div>
  );
}

function Loading({ intake }: { intake: Intake }) {
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const current = useTicker(titles, 900);
  return (
    <div className="st-loading" role="status">
      {intake.card?.preview ? <img className="st-loading-art" src={intake.card.preview} alt="" /> : null}
      <Bars count={SLIDES.length} current={-1} />
      <div className="st-loading-copy">
        <p className="st-kicker">The panel is reading {jobLabel(intake.jobUrl).split(" · ")[0]}</p>
        <p className="st-loading-title" key={current}>
          {current ?? "Your nine"}
        </p>
      </div>
    </div>
  );
}

function Play({ intake, verdict }: { intake: Intake; verdict: Verdict }) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const next = () => setSlide((s) => Math.min(LAST, s + 1));
  const prev = () => setSlide((s) => Math.max(0, s - 1));
  const titles = intake.titles.status === "ok" ? intake.titles.value : [];
  const match = verdict.match!;

  let body: ReactNode;
  switch (SLIDES[slide]) {
    case "nine":
      body = (
        <Slide kicker="Exhibit A" title="Your nine">
          <ol className="st-grid">
            {titles.map((title, i) => (
              <li key={`${i}-${title}`} style={{ "--i": i } as CSSProperties}>
                <span className="st-grid-n">{i + 1}</span>
                <span className="st-grid-t">{title}</span>
              </li>
            ))}
          </ol>
        </Slide>
      );
      break;
    case "you":
      body = (
        <Slide kicker="The panel reads you as">
          <p className="st-huge">{verdict.card.label}</p>
          <p className="st-body">{verdict.card.signal}</p>
        </Slide>
      );
      break;
    case "job":
      body = (
        <Slide kicker={`${jobName(verdict)} reads as`}>
          <p className="st-huge">{verdict.role?.label}</p>
          <p className="st-body">{jobLabel(verdict.job?.url ?? intake.jobUrl)}</p>
        </Slide>
      );
      break;
    case "axes":
      body = (
        <Slide kicker="Where you line up" title={`${match.fit.rows.filter((row) => row.level >= 3).length} of ${match.fit.rows.length} clear`}>
          <Evidence fit={match.fit} />
        </Slide>
      );
      break;
    default:
      body = <Final intake={intake} verdict={verdict} titles={titles} />;
  }

  return (
    <div className="st-play-root" data-slide={SLIDES[slide]} data-paused={paused || undefined}>
      <Bars count={SLIDES.length} current={slide} paused={paused} onDone={next} />
      <div className="st-top">
        <p className="st-who">
          {intake.card?.preview ? <img src={intake.card.preview} alt="" /> : null}
          {intake.handle ? `@${intake.handle.replace(/^@/, "")}` : "Your Top 9"} × {jobLabel(verdict.job?.url ?? intake.jobUrl).split(" · ")[0]}
        </p>
        {slide < LAST ? (
          <button type="button" className="st-icon" aria-label={paused ? "Resume" : "Pause"} onClick={() => setPaused((p) => !p)}>
            {paused ? <PlayGlyph /> : <PauseGlyph />}
          </button>
        ) : null}
      </div>
      <div className="st-slide" key={slide}>
        {body}
      </div>
      {slide < LAST ? (
        <>
          <button type="button" className="st-tap st-tap-prev" aria-label="Previous slide" onClick={prev} disabled={slide === 0} />
          <button type="button" className="st-tap st-tap-next" aria-label="Next slide" onClick={next} />
        </>
      ) : null}
    </div>
  );
}

function Final({ intake, verdict, titles }: { intake: Intake; verdict: Verdict; titles: readonly string[] }) {
  const match = verdict.match!;
  const { share, copied, xHref } = useShare(verdict, titles, intake.handle);
  const percent = useCountUp(match.alignment.percent, 1200);
  return (
    <div className="st-final">
      <p className="st-kicker">The verdict</p>
      <h2 className="st-stamp">{DECISION[match.choice]}</h2>
      <p className="st-percent">
        <span className="st-percent-n">{percent}%</span> aligned · {TONE[match.choice]}
      </p>
      <blockquote className="st-why">{match.why}</blockquote>
      <div className="st-actions">
        <button type="button" className="st-share" onClick={() => void share()}>
          <ShareGlyph /> {copied ? "Copied" : "Share"}
        </button>
        <a className="st-ghost" href={xHref} target="_blank" rel="noreferrer">
          Post on X
        </a>
      </div>
      <button type="button" className="st-again" onClick={() => intake.setJobUrl("")}>
        Try another job
      </button>
    </div>
  );
}

function Slide({ kicker, title, children }: { kicker: string; title?: string; children: ReactNode }) {
  return (
    <div className="st-slide-inner">
      <p className="st-kicker">{kicker}</p>
      {title ? <h2 className="st-h2">{title}</h2> : null}
      {children}
    </div>
  );
}

/** The live segment's fill is a CSS animation; its end advances the story, so pausing is just animation-play-state. */
function Bars({ count, current, paused, onDone }: { count: number; current: number; paused?: boolean; onDone?: () => void }) {
  return (
    <div className="st-bars" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="st-bar" data-state={i < current ? "done" : i === current ? (i === count - 1 ? "done" : "live") : "todo"}>
          <span
            key={i === current ? `live-${current}` : i}
            className="st-bar-fill"
            data-paused={paused || undefined}
            onAnimationEnd={i === current ? onDone : undefined}
          />
        </span>
      ))}
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
