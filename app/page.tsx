"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  extractFromTweetUrl,
  readSignal,
  type ExtractActionResult,
  type SignalResult,
} from "./actions";
import {
  JOB_PACK,
  TOP9_EXAMPLES,
  findJob,
  plateId,
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
import { Intake } from "./crit/intake";
import { JobRail, type RailResult } from "./crit/job-rail";
import { Plate, type PlateSource } from "./crit/plate";
import { Verdict, VerdictPending } from "./crit/verdict";

const EMPTY = Array<string>(9).fill("");

type Reading = {
  plate: string;
  handle?: string;
  job?: { title?: string; url: string; company?: string };
};

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToId(id: string) {
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "start",
    });
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
  const [isReading, startReading] = useTransition();
  const titlesRef = useRef(titles);
  const extractGen = useRef(0);
  titlesRef.current = titles;

  const plate = useMemo(() => {
    if (source?.kind === "fixture") return source.id;
    return titles.some((t) => t.trim()) ? plateId(titles) : "T9-····";
  }, [source, titles]);

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
    loadTitles(
      [...example.games],
      { kind: "fixture", id: example.id, tweetUrl: example.tweetUrl, image: example.image },
      example.handle,
    );
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
      plate,
      handle: handle.trim() || undefined,
      job: jobUrl
        ? { url: jobUrl, title: packJob?.title, company: packJob?.company }
        : undefined,
    };
    const paste = titles.map((t) => t.trim()).join("\n");
    setResult(null);
    setReading(request);
    startReading(async () => {
      const next = await readSignal({ paste, handle, jobUrl });
      setResult(next);
    });
  }

  const ok = result?.ok ? result : null;

  useEffect(() => {
    if (isReading || ok) scrollToId("verdict");
  }, [isReading, ok]);
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
          plate: reading.plate,
          card: ok.card,
          match:
            ok.match && rail?.job
              ? { choice: ok.match.choice, jobTitle: rail.job.title, company: rail.job.company }
              : undefined,
        })
      : "";

  return (
    <div className="sheet">
      <header className="masthead">
        <p className="wordmark">
          Top9 Hire <span className="mono">Crit sheet</span>
        </p>
        <p className="mono masthead-no">
          No. <span className="ink">{plate}</span>
        </p>
      </header>

      <section className="intake" aria-labelledby="thesis">
        <div className="thesis">
          <p className="eyebrow">
            <span>01</span> Intake
          </p>
          <h1 id="thesis">
            Nine games are a <em>hire signal.</em>
          </h1>
          <p className="thesis-lede">
            The games that shaped someone say how they like to work: systems or product, solo or
            team, deep or broad, building or tuning. Drop a Top9 card and read the signal.
          </p>
          <p className="thesis-note mono">After Dillon Mulroy&rsquo;s Top9 hiring thesis</p>
        </div>
        <Intake
          extracting={extracting}
          preview={preview}
          error={extractError}
          onFile={onFile}
          onTweet={onTweet}
          onTypeInstead={onTypeInstead}
        />
      </section>

      <FixtureStrip
        examples={TOP9_EXAMPLES}
        activeId={source?.kind === "fixture" ? source.id : null}
        onPick={pickFixture}
      />

      <div className="desk">
        <div className="desk-main">
          {source ? (
            <Plate
              source={source}
              plate={plate}
              titles={titles}
              handle={handle}
              onTitle={updateTitle}
              onHandle={setHandle}
              onSubmit={submit}
              reading={isReading}
              disabled={isReading || extracting || filled !== 9}
              roleLabel={roleLabel}
              error={result && !result.ok ? result.message : null}
            />
          ) : (
            <section className="plate plate-empty" id="plate">
              <header className="section-head">
                <p className="eyebrow">
                  <span>03</span> Plate
                </p>
              </header>
              <p className="plate-empty-copy">
                No plate on the sheet yet. Drop a card, paste a post, or pull a fixture from the strip.
              </p>
              <dl className="sheet-index">
                <div>
                  <dt className="mono">03 Plate</dt>
                  <dd>The card, the candidate, and nine titles you can correct.</dd>
                </div>
                <div>
                  <dt className="mono">04 Signal</dt>
                  <dd>A seal, the archetype, one hire-signal line, and a blurb to share.</dd>
                </div>
                <div>
                  <dt className="mono">05 Role match</dt>
                  <dd>Optional. The same signal read against a real role from the pack.</dd>
                </div>
              </dl>
            </section>
          )}

          {isReading && reading ? <VerdictPending plate={reading.plate} /> : null}
          {ok && reading && !isReading ? (
            <Verdict card={ok.card} plate={reading.plate} handle={reading.handle} blurb={blurb} />
          ) : null}
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
        />
      </div>

      <footer className="colophon mono">
        <span>Top9 Hire · a hire signal, not a hiring decision</span>
        <span>Judged by openai/gpt-5.4-mini through Vercel AI Gateway · traced as gen_ai.evaluate in Sentry</span>
      </footer>
    </div>
  );
}
