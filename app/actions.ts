"use server";

import * as Sentry from "@sentry/nextjs";
import { breakdownGames, breakdownJob, lastSource, libraryCard, type JobBreakdown } from "@/lib/breakdown";
import { MissingGatewayKey } from "@/lib/classify";
import {
  extractGamesFromImage,
  fetchImageBytesFromUrl,
  resolveTweetMedia,
} from "@/lib/extract";
import { judgeFit, toMatch, type FitGame, type FitJob, type HireJobMatch } from "@/lib/fit";
import { LIMITED_COPY, Limited, limitedFromGateway, modelGate } from "@/lib/guard";
import { GATEWAY_MISSING, parsePaste, roleCard, type HireCard, type RoleCard } from "@/lib/hire";
import {
  JOB_URL_REJECTED,
  JobFetchError,
  fetchJobPosting,
  parseJobUrl,
  type JobPosting,
} from "@/lib/job";

export type SignalResult =
  | {
      ok: true;
      card: HireCard;
      role?: RoleCard;
      match?: HireJobMatch;
      job?: { title: string; url: string };
      jobError?: string;
      limited?: Limited["reason"];
    }
  | {
      ok: false;
      error: "need_nine" | "missing_key" | "model_failed" | "request_failed";
      message: string;
      limited?: Limited["reason"];
    };

export type ExtractActionResult =
  | { ok: true; games: string[]; imageUrl?: string }
  | {
      ok: false;
      error:
        | "missing_key"
        | "invalid_input"
        | "file_too_large"
        | "unsupported_media_type"
        | "extract_failed";
      message: string;
      limited?: Limited["reason"];
    };

export async function readSignal(input: {
  paste: string;
  handle: string;
  jobUrl?: string;
}): Promise<SignalResult> {
  const parsed = parsePaste(input.paste, input.handle);
  if (!parsed.ok) {
    return {
      ok: false,
      error: "need_nine",
      message: `Need exactly 9 titles. Found ${parsed.count}.`,
    };
  }

  const titles = parsed.top9.titles.map((game) => game.title);
  const jobUrl = input.jobUrl?.trim() ?? "";
  const locked = jobUrl ? parseJobUrl(jobUrl) : null;
  const org = locked ? (locked.source === "greenhouse" ? locked.board : locked.org) : undefined;
  const name = `match ${titles.length} games${org ? ` × ${org}` : ""}`;
  const result = await Sentry.startSpan(
    { op: "top9.match", name, attributes: { "top9.games.count": titles.length } },
    async (span) => {
      const outcome = await readMatch(titles, jobUrl);
      if (locked) {
        span.setAttributes({ "top9.job.host": new URL(locked.pageUrl).host, "top9.job.org": org });
      }
      if (outcome.title) {
        span.setAttribute("top9.job.title", outcome.title);
        span.updateName(`${name} · ${outcome.title}`);
      }
      if (outcome.result.ok && outcome.result.match) {
        span.setAttributes({
          "top9.verdict": outcome.result.match.choice,
          "top9.percent": outcome.result.match.alignment.percent,
          "top9.why": outcome.result.match.why,
        });
      }
      if (!outcome.result.ok) span.setStatus({ code: 2, message: outcome.result.error });
      return outcome.result;
    },
  );
  // Streamed spans wait on an unref'd timer, and the match span only ends above. Flush before Vercel freezes the function.
  await Sentry.flush(2000);
  return result;
}

/** Why the gate or the gateway refused this call, else null. Notes it on the active span; a log line, not an event, so an attack cannot flood Sentry. */
function refusal(error: unknown): Limited["reason"] | null {
  const limited = error instanceof Limited ? error : limitedFromGateway(error);
  if (!limited) return null;
  Sentry.getActiveSpan()?.setAttribute("top9.limited", limited.reason);
  Sentry.logger.warn("model call refused", { "top9.limited": limited.reason });
  return limited.reason;
}

async function readMatch(
  titles: string[],
  jobUrl: string,
): Promise<{ result: SignalResult; title?: string }> {
  const beforeModel = modelGate();
  // The fit judge starts once both inputs are known, in parallel with the game and job Jev calls.
  const summaries = deferred<(FitGame & { complete: boolean })[]>();
  const posting = deferred<FitJob & { pageUrl: string }>();
  // The job branch never rejects, so a card failure cannot leave it unhandled.
  const jobStep = readJob(jobUrl, beforeModel, posting.resolve);
  const gamesStep = breakdownGames(titles, { onSummaries: summaries.resolve, beforeModel });
  gamesStep.catch((error) => summaries.reject(error));
  // A step that ends without its hook must not leave the fit waiting.
  void jobStep.then((job) => {
    if (!job.posting) posting.reject(new Error("No job posting"));
  });
  const rawStep = jobUrl
    ? Promise.all([summaries.promise, posting.promise]).then(([games, found]) =>
        judgeFit(found.pageUrl, games, found, { store: games.every((game) => game.complete), beforeModel }),
      )
    : undefined;
  rawStep?.catch(() => {});

  try {
    const games = await gamesStep;
    const card = libraryCard(games);
    const job = await jobStep;
    if (!job.posting || !job.breakdown) {
      return {
        result: job.jobError
          ? { ok: true, card, jobError: job.jobError, ...(job.limited && { limited: job.limited }) }
          : { ok: true, card },
      };
    }
    const { posting, breakdown } = job;
    try {
      const match = toMatch(await (rawStep as Promise<number>), games, breakdown);
      return {
        title: posting.title,
        result: {
          ok: true,
          card,
          role: roleCard(breakdown.wants),
          match,
          job: { title: posting.title, url: posting.pageUrl },
        },
      };
    } catch (error) {
      return { title: posting.title, result: { ok: true, card, ...matchFailure(error) } };
    }
  } catch (error) {
    if (error instanceof MissingGatewayKey) {
      return { result: { ok: false, error: "missing_key", message: GATEWAY_MISSING } };
    }
    const limited = refusal(error);
    if (limited) {
      return { result: { ok: false, error: "model_failed", message: LIMITED_COPY[limited], limited } };
    }
    Sentry.captureException(error);
    return {
      result: {
        ok: false,
        error: "model_failed",
        message: "The model call failed. Nothing was invented in its place.",
      },
    };
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A games-only request never awaits the fit inputs; without this their rejection is unhandled.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function matchFailure(error: unknown): { jobError: string; limited?: Limited["reason"] } {
  if (error instanceof MissingGatewayKey) return { jobError: "Job matching is not configured." };
  const limited = refusal(error);
  if (limited) return { jobError: LIMITED_COPY[limited], limited };
  Sentry.captureException(error);
  return { jobError: "The match judgment failed. Nothing was invented in its place." };
}

/** Fetches and breaks down the job posting. Failures come back as `jobError`; this never rejects. */
async function readJob(
  jobUrl: string,
  beforeModel: () => Promise<void>,
  onPosting?: (posting: FitJob & { pageUrl: string }) => void,
): Promise<{ posting?: JobPosting; breakdown?: JobBreakdown; jobError?: string; limited?: Limited["reason"] }> {
  if (!jobUrl) return {};
  const locked = parseJobUrl(jobUrl);
  if (!locked) return { jobError: JOB_URL_REJECTED };
  return Sentry.startSpan({ op: "top9.job", name: "read job" }, async (span) => {
    let posting: JobPosting;
    try {
      posting = await fetchJobPosting(locked);
    } catch (error) {
      if (error instanceof JobFetchError) return { jobError: error.message };
      Sentry.captureException(error);
      return { jobError: "That job page could not be read. No description was invented." };
    }
    onPosting?.({ pageUrl: posting.pageUrl, title: posting.title, description: posting.text });
    try {
      const breakdown = await breakdownJob({ url: posting.pageUrl, title: posting.title, description: posting.text }, { beforeModel });
      const source = lastSource.job;
      span.updateName(`read job · ${source}`);
      span.setAttributes({
        "top9.source": source,
        "top9.job.archetype": breakdown.wants,
        "top9.job.requirements.count": breakdown.requirements.length,
      });
      return { posting, breakdown };
    } catch (error) {
      return matchFailure(error);
    }
  });
}

export async function extractFromTweetUrl(tweetUrl: string): Promise<ExtractActionResult> {
  if (!tweetUrl || typeof tweetUrl !== "string" || !tweetUrl.trim()) {
    return {
      ok: false,
      error: "invalid_input",
      message: "Please enter a valid tweet URL.",
    };
  }

  try {
    const resolved = await resolveTweetMedia(tweetUrl.trim());
    const imageInput = await fetchImageBytesFromUrl(resolved.mediaUrl);
    const result = await extractGamesFromImage(imageInput, undefined, { beforeModel: modelGate() });
    return { ok: true, games: result.games, imageUrl: resolved.mediaUrl };
  } catch (error) {
    const limited = refusal(error);
    if (limited) {
      await Sentry.flush(2000);
      return { ok: false, error: "extract_failed", message: LIMITED_COPY[limited], limited };
    }
    if (error instanceof MissingGatewayKey) {
      await Sentry.flush(2000);
      return {
        ok: false,
        error: "missing_key",
        message: GATEWAY_MISSING,
      };
    }
    const message = error instanceof Error ? error.message : "Failed to extract games from tweet";
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return {
      ok: false,
      error: "extract_failed",
      message,
    };
  }
}

