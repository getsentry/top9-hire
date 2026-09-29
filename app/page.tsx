"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { TextMorph } from "torph/react";
import {
  roastLibrary,
  extractFromTweetUrl,
  type RoastResult,
  type ExtractActionResult,
} from "./actions";
import { DISCLAIMER, type HireCard } from "@/lib/hire";
import {
  MAX_IMAGE_LABEL,
  interpretExtractResponse,
  rejectImageFile,
  titlesChanged,
} from "@/lib/image-limit";
import {
  MY9GAMES_URL,
  TOP9_EXAMPLES,
  arrangeExamples,
  engagement,
  exampleTitles,
  formatCount,
  type Top9Example,
} from "@/lib/examples";
import { VerdictField } from "./verdict-field";

const EMPTY_TITLES: string[] = Array(9).fill("");
const LEVELS = [1, 2, 3, 4] as const;

function Badge({ card }: { card: HireCard }) {
  if (card.badge.kind === "chaos") {
    return (
      <p className="badge chaos">
        <span className="badge-dot" aria-hidden />
        unclassifiable chaos
      </p>
    );
  }
  if (card.badge.kind === "soft") {
    return (
      <p className="badge soft">
        <span className="badge-dot" aria-hidden />
        {card.badge.label}
        <span className="badge-note">split vibes</span>
        {card.badge.runnerUp ? (
          <span className="badge-note">runner-up {card.badge.runnerUp}</span>
        ) : null}
      </p>
    );
  }
  return (
    <p className="badge primary">
      <span className="badge-dot" aria-hidden />
      {card.badge.label}
    </p>
  );
}

function CardView({
  card,
  kicker,
  slot,
  jobTitle,
}: {
  card: HireCard;
  kicker?: string;
  slot?: string;
  jobTitle?: string;
}) {
  return (
    <article className="card" data-slot={slot}>
      {kicker ? <p className="card-kicker">{kicker}</p> : null}
      {jobTitle ? <p className="job-title">{jobTitle}</p> : null}
      <Badge card={card} />
      <p className="roast">{card.roast}</p>
      <ul className="scores">
        {card.scores.map((score) => (
          <li key={score.id}>
            <div className="axis">
              <span className={score.level <= 2 ? "pole lit" : "pole"}>{score.left}</span>
              <span className={score.level >= 3 ? "pole lit" : "pole"}>{score.right}</span>
            </div>
            <div className={score.fuzzy ? "track fuzzy" : "track"} aria-hidden>
              {LEVELS.map((level) => (
                <span key={level} className={level === score.level ? "seg on" : "seg"} />
              ))}
            </div>
            <p className="criterion">
              {score.criterion}
              {score.fuzzy ? <span className="fuzzy-tag">fuzzy</span> : null}
            </p>
          </li>
        ))}
      </ul>
      <p className="disclaimer">{card.disclaimer}</p>
    </article>
  );
}

function EmptyVerdict({ busy }: { busy: boolean }) {
  return (
    <article className={busy ? "field-card busy" : "field-card"} aria-live="polite">
      <VerdictField active={busy} />
      <div className="field-copy">
        <p className="card-kicker">
          <TextMorph>{busy ? "Reading" : "Verdict"}</TextMorph>
        </p>
        <p className="ghost-title">
          <TextMorph>{busy ? "Reading the pile" : "The card lands here"}</TextMorph>
        </p>
        <p className="ghost-copy">
          {busy
            ? "One structured judgment. The roast is written from the archetype."
            : "One archetype, four axes, one roast. The nine titles appear once a card is loaded."}
        </p>
      </div>
    </article>
  );
}

function ExampleChip({
  example,
  active,
  disabled,
  onPick,
}: {
  example: Top9Example;
  active: boolean;
  disabled: boolean;
  onPick: (example: Top9Example) => void;
}) {
  const total = engagement(example);
  return (
    <button
      type="button"
      className={active ? "chip active" : "chip"}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onPick(example)}
      title={`Load @${example.handle}'s nine titles`}
    >
      <span className="chip-handle">@{example.handle}</span>
      {total > 0 ? <span className="chip-meta">{formatCount(total)}</span> : null}
    </button>
  );
}

export default function HomePage() {
  const [titles, setTitles] = useState<string[]>(EMPTY_TITLES);
  const [handle, setHandle] = useState("");
  const [tweetUrl, setTweetUrl] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [isClassifying, startClassifyTransition] = useTransition();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titlesRef = useRef(titles);
  const extractBusy = useRef(false);
  const extractGen = useRef(0);
  titlesRef.current = titles;

  const { primary, more } = useMemo(() => arrangeExamples(TOP9_EXAMPLES), []);
  const activeExample = useMemo(
    () => TOP9_EXAMPLES.find((example) => !titlesChanged(titles, example.games)),
    [titles],
  );

  const filledCount = titles.filter((t) => t.trim().length > 0).length;
  const busy = isClassifying || isExtracting;

  function replaceTitles(next: string[]) {
    if (titlesChanged(titlesRef.current, next)) setResult(null);
    setTitles(next);
  }

  function updateTitle(index: number, value: string) {
    const next = [...titles];
    next[index] = value;
    setTitles(next);
  }

  function pasteIntoSlot(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const lines = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const next = [...titles];
    lines.slice(0, 9 - index).forEach((line, offset) => {
      next[index + offset] = line;
    });
    replaceTitles(next);
  }

  function pickExample(example: Top9Example) {
    if (busy) return;
    setExtractError(null);
    replaceTitles(exampleTitles(example));
    setHandle(example.handle);
    if (example.jobUrl) setJobUrl(example.jobUrl);
    setTitlesOpen(true);
  }

  function typeTitles() {
    if (busy) return;
    setTitlesOpen(true);
  }

  function clearAll() {
    replaceTitles(EMPTY_TITLES);
    setHandle("");
    setExtractError(null);
    setTitlesOpen(false);
  }

  async function runExtract(task: () => Promise<ExtractActionResult>) {
    if (extractBusy.current) return;
    extractBusy.current = true;
    const gen = ++extractGen.current;
    setExtractError(null);
    setIsExtracting(true);
    try {
      const res = await task();
      if (gen !== extractGen.current) return;
      if (res.ok) {
        replaceTitles(res.games);
        setTitlesOpen(true);
      } else {
        setExtractError(res.message);
      }
    } catch (err) {
      if (gen !== extractGen.current) return;
      setExtractError(err instanceof Error ? err.message : "Failed to extract titles.");
    } finally {
      if (gen === extractGen.current) {
        extractBusy.current = false;
        setIsExtracting(false);
      }
    }
  }

  async function postCardImage(file: File): Promise<ExtractActionResult> {
    const rejected = rejectImageFile(file);
    if (rejected) return rejected;
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/extract", { method: "POST", body: formData });
    const body = await response.json().catch(() => null);
    return interpretExtractResponse(response.status, body);
  }

  function handleImageFile(file: File) {
    if (!file || extractBusy.current) return;
    void runExtract(() => postCardImage(file));
  }

  function handleTweetExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!tweetUrl.trim() || extractBusy.current) return;
    const url = tweetUrl.trim();
    void runExtract(() => extractFromTweetUrl(url));
  }

  function onClassifySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const paste = titles.map((t) => t.trim()).join("\n");
    setResult(null);
    const trimmedJobUrl = jobUrl.trim();
    startClassifyTransition(async () => {
      setResult(await roastLibrary({ paste, handle, jobUrl: trimmedJobUrl }));
    });
  }

  const paired = Boolean(result?.ok && (result.role || result.jobError));
  const showTitles = titlesOpen && !isExtracting;

  return (
    <main className="shell">
      <header className="masthead">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden>
            9
          </span>
          <span className="brand-name">Top9 Hire</span>
        </a>
        <a className="masthead-link" href={MY9GAMES_URL} target="_blank" rel="noreferrer">
          Make your card at my9games.com
          <span aria-hidden> ↗</span>
        </a>
      </header>

      <section className="hero">
        <h1>Nine games. One verdict.</h1>
        <p className="lede">
          Load a Top9 card and get the taste roasted into a hire archetype. Add a job link to see
          how the pile lines up against the role.
        </p>
      </section>

      <div className="workspace">
        <div className="pane pane-input">
          <section className="panel" data-slot="examples" aria-labelledby="examples-heading">
            <div className="panel-head">
              <div>
                <h2 id="examples-heading">Start from a posted card</h2>
                <p className="panel-hint">
                  Nine titles saved from public x.com posts. Loads instantly, nothing is fetched.
                </p>
              </div>
            </div>
            <div className="chip-row">
              {primary.map((example) => (
                <ExampleChip
                  key={example.handle}
                  example={example}
                  active={activeExample?.handle === example.handle}
                  disabled={busy}
                  onPick={pickExample}
                />
              ))}
              {more.length ? (
                <button
                  type="button"
                  className="chip chip-toggle"
                  aria-expanded={showMore}
                  aria-controls="more-examples"
                  onClick={() => setShowMore((open) => !open)}
                >
                  <TextMorph>{showMore ? "Fewer" : `+${more.length} more`}</TextMorph>
                </button>
              ) : null}
            </div>
            {showMore && more.length ? (
              <div className="chip-row" id="more-examples">
                {more.map((example) => (
                  <ExampleChip
                    key={example.handle}
                    example={example}
                    active={activeExample?.handle === example.handle}
                    disabled={busy}
                    onPick={pickExample}
                  />
                ))}
              </div>
            ) : null}
            <p className="example-source" role="status">
              <TextMorph>
                {activeExample ? `Loaded @${activeExample.handle}` : "No card loaded"}
              </TextMorph>
              {activeExample ? (
                <>
                  {" "}
                  <a href={activeExample.tweetUrl} target="_blank" rel="noreferrer">
                    View the post
                    <span aria-hidden> ↗</span>
                  </a>
                </>
              ) : null}
            </p>
          </section>

          <section className="panel" aria-labelledby="own-heading">
            <div className="panel-head">
              <div>
                <h2 id="own-heading">Or bring your own</h2>
                <p className="panel-hint">Drop the 3×3 card image or paste the post link.</p>
              </div>
            </div>
            <div
              className={`drop-zone ${isDragging ? "dragging" : ""} ${isExtracting ? "loading" : ""}`}
              aria-disabled={isExtracting}
              aria-busy={isExtracting}
              onDragOver={(e) => {
                e.preventDefault();
                if (extractBusy.current) return;
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (extractBusy.current) return;
                const file = e.dataTransfer.files?.[0];
                if (file) handleImageFile(file);
              }}
              onClick={() => {
                if (extractBusy.current) return;
                fileInputRef.current?.click();
              }}
              role="button"
              tabIndex={isExtracting ? -1 : 0}
              onKeyDown={(e) => {
                if (extractBusy.current) return;
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                disabled={isExtracting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleImageFile(file);
                }}
              />
              <p className="drop-status" role="status">
                <TextMorph>{isExtracting ? "Extracting titles" : "Drop a card"}</TextMorph>
              </p>
              <p className="drop-label">
                Drop a My9Games card here, or <u>browse</u>
              </p>
              <span className="drop-hint">PNG, JPEG, WebP up to {MAX_IMAGE_LABEL}</span>
            </div>

            <form className="tweet-form" onSubmit={handleTweetExtract}>
              <input
                type="url"
                aria-label="Post URL"
                placeholder="https://x.com/…/status/…"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                disabled={isExtracting}
              />
              <button
                type="submit"
                className="secondary"
                disabled={isExtracting || !tweetUrl.trim()}
              >
                <TextMorph>{isExtracting ? "Extracting" : "Extract from post"}</TextMorph>
              </button>
            </form>

            {extractError ? (
              <p className="error" role="alert">
                {extractError}
              </p>
            ) : null}

            {!titlesOpen && !isExtracting ? (
              <button type="button" className="text-button" onClick={typeTitles}>
                Type nine titles instead
              </button>
            ) : null}
          </section>

          {showTitles ? (
          <form onSubmit={onClassifySubmit} className="panel classify-form">
            <div className="panel-head titles-header">
              <div>
                <h2>Nine titles</h2>
                <p className="panel-hint">Paste a whole list into any slot and it fills forward.</p>
              </div>
              <div className="titles-tools">
                <span className={filledCount === 9 ? "count ready" : "count"}>
                  <TextMorph className="count-num">{String(filledCount)}</TextMorph> / 9
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={clearAll}
                  disabled={busy || (filledCount === 0 && !handle)}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="titles-grid">
              {titles.map((title, idx) => (
                <div key={idx} className={title.trim() ? "title-slot filled" : "title-slot"}>
                  <span className="slot-num">{idx + 1}</span>
                  <input
                    type="text"
                    value={title}
                    aria-label={`Game ${idx + 1}`}
                    placeholder={`Game ${idx + 1}`}
                    onChange={(e) => updateTitle(idx, e.target.value)}
                    onPaste={(e) => pasteIntoSlot(idx, e)}
                    required
                  />
                </div>
              ))}
            </div>

            <div className="details-grid">
              <label>
                <span className="label-text">Handle</span>
                <input
                  name="handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  autoComplete="nickname"
                  placeholder="optional"
                />
              </label>

              <label className="job-url-slot" data-slot="job-url">
                <span className="label-text">
                  Job URL <span className="label-opt">optional</span>
                </span>
                <input
                  name="jobUrl"
                  type="text"
                  inputMode="url"
                  spellCheck={false}
                  autoCapitalize="off"
                  value={jobUrl}
                  onChange={(event) => setJobUrl(event.target.value.trim())}
                  placeholder="jobs.ashbyhq.com/… or boards.greenhouse.io/…"
                />
                <span className="field-hint">
                  Public Greenhouse or Ashby posting. A bad link shows an error and does not invent
                  a description.
                </span>
              </label>
            </div>

            <div className="submit-row">
              <button
                type="submit"
                className="primary"
                aria-busy={isClassifying}
                disabled={isClassifying || isExtracting || filledCount !== 9}
              >
                <TextMorph>{isClassifying ? "Reading" : "Read the pile"}</TextMorph>
              </button>
              <span className="submit-hint" role="status">
                <TextMorph>
                  {filledCount === 9 ? "Ready to read" : `${9 - filledCount} more to go`}
                </TextMorph>
              </span>
            </div>

            {result && !result.ok ? (
              <p className="error" role="alert">
                {result.message}
              </p>
            ) : null}
          </form>
          ) : null}
        </div>

        <div className="pane pane-result">
          {result?.ok && !paired ? (
            <CardView card={result.card} slot="hire-card" />
          ) : result?.ok && paired ? (
            <div className="verdict" data-slot="verdict">
              <div className="verdict-cards">
                <CardView card={result.card} kicker="Hire" slot="hire-card" />
                {result.role ? (
                  <CardView
                    card={result.role}
                    kicker="Role"
                    slot="role-card"
                    jobTitle={result.job?.title}
                  />
                ) : (
                  <article className="card" data-slot="role-card">
                    <p className="card-kicker">Role</p>
                    <p className="error" role="alert">
                      {result.jobError}
                    </p>
                  </article>
                )}
              </div>
              {result.match ? (
                <section className="match-slot" data-slot="hire-job-match">
                  <p className="card-kicker">Match</p>
                  <p className={`badge match-badge ${result.match.choice}`}>
                    <span className="badge-dot" aria-hidden />
                    {result.match.choice}
                  </p>
                  <p className="why">{result.match.why}</p>
                  <p className="disclaimer">{DISCLAIMER}</p>
                </section>
              ) : result.role && result.jobError ? (
                <section className="match-slot" data-slot="hire-job-match">
                  <p className="card-kicker">Match</p>
                  <p className="error" role="alert">
                    {result.jobError}
                  </p>
                </section>
              ) : (
                <section className="match-slot" data-slot="hire-job-match">
                  <p className="card-kicker">Match</p>
                  <p className="field-hint">Match was not judged.</p>
                </section>
              )}
            </div>
          ) : (
            <EmptyVerdict busy={isClassifying} />
          )}
        </div>
      </div>

      <footer className="foot">
        <p>{DISCLAIMER}</p>
      </footer>
    </main>
  );
}
