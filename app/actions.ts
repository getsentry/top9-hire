"use server";

import * as Sentry from "@sentry/nextjs";
import { classify, evaluateHire, MissingGatewayKey } from "@/lib/classify";
import {
  extractGamesFromImage,
  fetchImageBytesFromUrl,
  resolveTweetMedia,
} from "@/lib/extract";
import { GATEWAY_MISSING, parsePaste, toCard, type HireCard } from "@/lib/hire";
import {
  JOB_URL_REJECTED,
  JobFetchError,
  fetchJobPosting,
  parseJobUrl,
  type JobPosting,
} from "@/lib/job";
import { evaluateMatch, evaluateRole, type HireJobMatch } from "@/lib/role";

export type SignalResult =
  | {
      ok: true;
      card: HireCard;
      role?: HireCard;
      match?: HireJobMatch;
      job?: { title: string; url: string };
      jobError?: string;
    }
  | { ok: false; error: "need_nine" | "missing_key" | "model_failed"; message: string };

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

  const jobUrl = input.jobUrl?.trim() ?? "";
  let posting: JobPosting | undefined;
  let jobError: string | undefined;
  if (jobUrl) {
    const locked = parseJobUrl(jobUrl);
    if (!locked) {
      jobError = JOB_URL_REJECTED;
    } else {
      try {
        posting = await fetchJobPosting(locked);
      } catch (error) {
        jobError =
          error instanceof JobFetchError
            ? error.message
            : "That job page could not be read. No description was invented.";
        if (!(error instanceof JobFetchError)) Sentry.captureException(error);
      }
    }
  }

  try {
    if (!posting) {
      const card = await classify(parsed.top9);
      return jobError ? { ok: true, card, jobError } : { ok: true, card };
    }
    const hire = await evaluateHire(parsed.top9);
    const card = toCard(hire);
    const job = { title: posting.title, url: posting.pageUrl };
    try {
      const role = await evaluateRole(posting);
      try {
        const match = await evaluateMatch(hire, role, job);
        return { ok: true, card, role: toCard(role), match, job };
      } catch (error) {
        if (error instanceof MissingGatewayKey) throw error;
        Sentry.captureException(error);
        await Sentry.flush(2000);
        return {
          ok: true,
          card,
          role: toCard(role),
          job,
          jobError: "The match judgment failed. Nothing was invented in its place.",
        };
      }
    } catch (error) {
      if (error instanceof MissingGatewayKey) throw error;
      Sentry.captureException(error);
      await Sentry.flush(2000);
      return {
        ok: true,
        card,
        jobError: "The role judgment failed. Nothing was invented in its place.",
      };
    }
  } catch (error) {
    if (error instanceof MissingGatewayKey) {
      // A hire span may already be queued. classify flushes only after it returns.
      await Sentry.flush(2000);
      return {
        ok: false,
        error: "missing_key",
        message: GATEWAY_MISSING,
      };
    }
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return {
      ok: false,
      error: "model_failed",
      message: "The model call failed. Nothing was invented in its place.",
    };
  }
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
    const result = await extractGamesFromImage(imageInput);
    return { ok: true, games: result.games, imageUrl: resolved.mediaUrl };
  } catch (error) {
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

