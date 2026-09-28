"use client";

import { useState, useTransition, useRef } from "react";
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

function Badge({ card }: { card: HireCard }) {
  if (card.badge.kind === "chaos") {
    return <p className="badge chaos">unclassifiable chaos</p>;
  }
  if (card.badge.kind === "soft") {
    return (
      <p className="badge soft">
        {card.badge.label}
        <span>split vibes</span>
        {card.badge.runnerUp ? <span>runner-up {card.badge.runnerUp}</span> : null}
      </p>
    );
  }
  return <p className="badge primary">{card.badge.label}</p>;
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
              <span>{score.left}</span>
              <span>{score.right}</span>
            </div>
            <div className={score.fuzzy ? "track fuzzy" : "track"}>
              <span
                className="mark"
                style={{ left: `${((score.level - 1) / 3) * 100}%` }}
              />
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

export default function HomePage() {
  const [titles, setTitles] = useState<string[]>(Array(9).fill(""));
  const [handle, setHandle] = useState("");
  const [tweetUrl, setTweetUrl] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [isClassifying, startClassifyTransition] = useTransition();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titlesRef = useRef(titles);
  const extractBusy = useRef(false);
  const extractGen = useRef(0);
  titlesRef.current = titles;

  const filledCount = titles.filter((t) => t.trim().length > 0).length;

  function updateTitle(index: number, value: string) {
    const next = [...titles];
    next[index] = value;
    setTitles(next);
  }

  function handleTitlesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const lines = e.target.value.split("\n");
    const next = Array(9)
      .fill("")
      .map((_, i) => lines[i] || "");
    setTitles(next);
  }

  function applyExtractedGames(games: string[]) {
    if (titlesChanged(titlesRef.current, games)) setResult(null);
    setTitles(games);
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
        applyExtractedGames(res.games);
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

  return (
    <main>
      <div className="form-column">
      <h1>Top9 Hire</h1>
      <p className="lede">Drop a 3×3 card, paste a tweet, or enter 9 titles. Get roasted.</p>

      <section className="extract-section">
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
          <p className="drop-label">
            {isExtracting ? (
              <span>Extracting titles with Gemini...</span>
            ) : (
              <span>Drop My9Games card image here, or <u>browse</u></span>
            )}
          </p>
          <span className="drop-hint">PNG, JPEG, WebP up to {MAX_IMAGE_LABEL}</span>
        </div>

        <form className="tweet-form" onSubmit={handleTweetExtract}>
          <input
            type="url"
            placeholder="or paste x.com / twitter.com status URL"
            value={tweetUrl}
            onChange={(e) => setTweetUrl(e.target.value)}
            disabled={isExtracting}
          />
          <button type="submit" disabled={isExtracting || !tweetUrl.trim()}>
            {isExtracting ? "Extracting..." : "Extract from post"}
          </button>
        </form>

        {extractError ? (
          <p className="error" role="alert">
            {extractError}
          </p>
        ) : null}
      </section>

      <form onSubmit={onClassifySubmit} className="classify-form">
        <label>
          Handle
          <input
            name="handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            autoComplete="nickname"
            placeholder="optional"
          />
        </label>

        <div className="titles-group">
          <div className="titles-header">
            <span className="titles-label">Nine titles</span>
            <span className={filledCount === 9 ? "count ready" : "count"}>
              {filledCount} of 9
            </span>
          </div>

          <div className="titles-grid">
            {titles.map((title, idx) => (
              <div key={idx} className="title-slot">
                <span className="slot-num">{idx + 1}</span>
                <input
                  type="text"
                  value={title}
                  placeholder={`Game ${idx + 1}`}
                  onChange={(e) => updateTitle(idx, e.target.value)}
                  required
                />
              </div>
            ))}
          </div>
        </div>

        <label className="job-url-slot" data-slot="job-url">
          Job URL
          <input
            name="jobUrl"
            type="text"
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            value={jobUrl}
            onChange={(event) => setJobUrl(event.target.value.trim())}
            placeholder="https://jobs.ashbyhq.com/… or boards.greenhouse.io/…"
          />
          <span className="drop-hint">
            Optional. Public Greenhouse or Ashby posting. A bad link shows an error and does not invent a description.
          </span>
        </label>

        <button type="submit" disabled={isClassifying || isExtracting || filledCount !== 9}>
          {isClassifying ? "Reading" : "Read the pile"}
        </button>
      </form>

      {result && !result.ok ? (
        <p className="error" role="alert">
          {result.message}
        </p>
      ) : null}
      {result?.ok && !paired ? <CardView card={result.card} slot="hire-card" /> : null}
      </div>
      {result?.ok && paired ? (
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
              <p className={`badge ${result.match.choice}`}>{result.match.choice}</p>
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
              <p className="drop-hint">Match was not judged.</p>
            </section>
          )}
        </div>
      ) : null}
    </main>
  );
}

