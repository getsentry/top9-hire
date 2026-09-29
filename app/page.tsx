"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  extractFromTweetUrl,
  readSignal,
  type ExtractActionResult,
  type SignalResult,
} from "./actions";
import { READ_UNREACHABLE } from "@/lib/hire";
import { JUDGE_MODEL } from "@/lib/models";
import {
  JOB_PACK,
  TOP9_EXAMPLES,
  findJob,
  shareBlurb,
  type Top9Example,
} from "@/lib/pack";
import {
  interpretExtractResponse,
  postImageUrl,
  rejectImageFile,
  titlesChanged,
} from "@/lib/image-limit";
import { FixtureStrip } from "./crit/fixture-strip";
import { DropCard, PostForm } from "./crit/intake";
import { JobRail, type RailResult } from "./crit/job-rail";
import { Crit } from "./crit/crit";
import { Plate, type PlateSource } from "./crit/plate";
import { PlateArt, fixtureSource } from "./crit/plate-art";

const EMPTY = Array<string>(9).fill("");

type Reading = {
  titles: string[];
  handle?: string;
  job?: { title?: string; url: string; company?: string };
  readAt?: string;
};

function jobLabel(job: { title?: string; company?: string; url: string }) {
  const title = job.title ?? job.url.replace(/^https?:\/\//, "");
  return job.company ? `${job.company} · ${title}` : title;
}

/**
 * A rejected server action inside startTransition reaches the nearest error
 * boundary and takes down the whole desk. Keep transport failures (fetch
 * errors, timeouts, a protected preview answering with its login page) on the
 * plate as an ordinary failed read instead.
 */
function unreachableRead(error: unknown): SignalResult {
  Sentry.captureException(error);
  return { ok: false, error: "request_failed", message: READ_UNREACHABLE };
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToId(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight / 2) return;
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  });
}

export default function CritSheet() {
  const [titles, setTitles] = useState<string[]>(EMPTY);
  const [handle, setHandle] = useState("");
  const [source, setSource] = useState<PlateSource | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [result, setResult] = useState<SignalResult | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [editing, setEditing] = useState(false);
  const [isReading, startReading] = useTransition();
  const titlesRef = useRef(titles);
  const extractGen = useRef(0);
  titlesRef.current = titles;

  const jobUrl = customUrl || selectedUrl;
  const packJob = findJob(jobUrl);
  const roleLabel = packJob
    ? `${packJob.company} · ${packJob.title}`
    : customUrl
      ? customUrl.replace(/^https?:\/\//, "")
      : null;
  const filled = titles.filter((t) => t.trim()).length;

  function loadTitles(next: string[], nextSource: PlateSource, nextHandle?: string) {
    if (titlesChanged(titlesRef.current, next)) {
      setResult(null);
      setReading(null);
    }
    setEditing(false);
    setTitles(next);
    setSource(nextSource);
    if (nextHandle !== undefined) setHandle(nextHandle);
    scrollToId("plate");
  }

  function pickFixture(example: Top9Example) {
    extractGen.current += 1;
    setExtracting(false);
    setExtractError(null);
    setPreview(null);
    loadTitles([...example.games], fixtureSource(example), example.handle);
  }

  async function runExtract(
    task: () => Promise<ExtractActionResult>,
    onDone: (games: string[], imageUrl?: string) => void,
  ) {
    const gen = ++extractGen.current;
    setExtractError(null);
    setExtracting(true);
    try {
      const res = await task();
      if (gen !== extractGen.current) return;
      if (res.ok) onDone(res.games, res.imageUrl);
      else {
        setPreview(null);
        setExtractError(res.message);
      }
    } catch (err) {
      if (gen !== extractGen.current) return;
      setPreview(null);
      setExtractError(err instanceof Error ? err.message : "The card could not be read.");
    } finally {
      if (gen === extractGen.current) setExtracting(false);
    }
  }

  function onFile(file: File) {
    const rejected = rejectImageFile(file);
    if (rejected) {
      setExtractError(rejected.message);
      return;
    }
    setPreview(file);
    void runExtract(
      async () => {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/extract", { method: "POST", body });
        return interpretExtractResponse(response.status, await response.json().catch(() => null));
      },
      (games) => {
        setPreview(null);
        loadTitles(games, { kind: "upload", file }, "");
      },
    );
  }

  function onTweet(url: string) {
    setPreview(null);
    void runExtract(
      () => extractFromTweetUrl(url),
      (games, imageUrl) => {
        const handleFromUrl = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status/i)?.[1] ?? "";
        loadTitles(games, { kind: "post", src: postImageUrl(imageUrl) }, handleFromUrl);
      },
    );
  }

  function onTypeInstead() {
    setSource({ kind: "typed" });
    if (source?.kind !== "typed") {
      setTitles(EMPTY);
      setHandle("");
      setResult(null);
      setReading(null);
    }
    scrollToId("plate");
  }

  function updateTitle(index: number, value: string) {
    setTitles((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function submit() {
    const request: Reading = {
      titles: titles.map((t) => t.trim()),
      handle: handle.trim() || undefined,
      job: jobUrl
        ? { url: jobUrl, title: packJob?.title, company: packJob?.company }
        : undefined,
    };
    const paste = titles.map((t) => t.trim()).join("\n");
    setResult(null);
    setReading(request);
    setEditing(false);
    scrollToId("plate");
    startReading(async () => {
      const next = await readSignal({ paste, handle, jobUrl }).catch(unreachableRead);
      const readAt = new Date().toISOString();
      setReading((prev) => (prev === request ? { ...request, readAt } : prev));
      setResult(next);
    });
  }

  const ok = result?.ok ? result : null;
  const showCrit = Boolean(source && reading && (isReading || ok) && !editing);
  const canReturn =
    editing && ok && reading ? !titlesChanged(reading.titles, titles.map((t) => t.trim())) : false;

  useEffect(() => {
    if (ok) scrollToId("plate");
  }, [ok]);
  const rail: RailResult | null = ok
    ? {
        hire: ok.card,
        role: ok.role,
        match: ok.match,
        jobError: ok.jobError,
        job: ok.job
          ? { ...ok.job, company: reading?.job?.company }
          : reading?.job
            ? { url: reading.job.url, title: reading.job.title ?? "Pasted role", company: reading.job.company }
            : undefined,
      }
    : null;
  const blurb =
    ok && reading
      ? shareBlurb({
          handle: reading.handle,
          card: ok.card,
          match:
            ok.match && rail?.job
              ? {
                  choice: ok.match.choice,
                  percent: ok.match.alignment.percent,
                  jobTitle: rail.job.title,
                  company: rail.job.company,
                }
              : undefined,
        })
      : "";

  return (
    <>
      <header className="masthead">
        <span className="wordmark">top9.wtf</span>
      </header>
      <main className="sheet">
        <section className="intake" aria-label="Intake">
          <div className="intake-add">
            <PostForm
              extracting={extracting}
              error={extractError}
              onTweet={onTweet}
              onTypeInstead={onTypeInstead}
            />
            <DropCard extracting={extracting} preview={preview} onFile={onFile} />
          </div>
          <FixtureStrip
            examples={TOP9_EXAMPLES}
            activeId={source?.kind === "fixture" ? source.id : null}
            onPick={pickFixture}
          />
        </section>

        <div className="desk">
          <div className="desk-main">
            {source && reading && showCrit ? (
              <Crit
                source={source}
                titles={reading.titles}
                handle={reading.handle}
                roleLabel={rail?.job ? jobLabel(rail.job) : reading.job ? jobLabel(reading.job) : null}
                card={ok && !isReading ? ok.card : null}
                blurb={blurb}
                readAt={reading.readAt}
                onEdit={() => {
                  setEditing(true);
                  scrollToId("plate");
                }}
              />
            ) : source ? (
              <Plate
                source={source}
                titles={titles}
                handle={handle}
                onTitle={updateTitle}
                onHandle={setHandle}
                onSubmit={submit}
                onBack={canReturn ? () => setEditing(false) : undefined}
                reading={isReading}
                disabled={isReading || extracting || filled !== 9}
                roleLabel={roleLabel}
                error={result && !result.ok ? result.message : null}
              />
            ) : (
              <section className="plate plate-empty" id="plate">
                <header className="section-head">
                  <p className="eyebrow">Plate</p>
                </header>
                <div className="plate-body">
                  <div className="plate-art">
                    <PlateArt source={{ kind: "typed" }} titles={EMPTY} />
                  </div>
                  <p className="plate-empty-copy">Pick a fixture, paste a post, or drop a card.</p>
                </div>
              </section>
            )}
          </div>

          <JobRail
            jobs={JOB_PACK}
            selectedUrl={selectedUrl}
            customUrl={customUrl}
            onSelect={(url) => {
              setSelectedUrl(url);
              setCustomUrl("");
            }}
            onCustom={(url) => {
              setCustomUrl(url);
              if (url) setSelectedUrl("");
            }}
            result={isReading ? null : rail}
            locked={isReading}
            suggestHandle={source?.kind === "fixture" ? handle.trim() || null : null}
          />
        </div>

        <footer className="colophon mono">
          {JUDGE_MODEL} via Vercel AI Gateway · traced as gen_ai.evaluate
        </footer>
      </main>
    </>
  );
}
