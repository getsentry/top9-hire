"use server";

import * as Sentry from "@sentry/nextjs";
import { readSignal, type SignalResult } from "@/app/actions";
import { breakdownGames, cachedJobBreakdowns, libraryCard } from "@/lib/breakdown";
import { MissingGatewayKey } from "@/lib/classify";
import type { HireJobMatch } from "@/lib/fit";
import { GATEWAY_MISSING, parsePaste, roleCard } from "@/lib/hire";
import { parseJobUrl } from "@/lib/job-url";
import { signShare } from "@/lib/share";
import reads from "./sample-reads.json";

const cards = Object.entries(reads.cards) as [string, { titles: string[] }][];
const jobs = reads.jobs as Record<string, { title: string; pageUrl: string }>;
const fits = reads.fits as unknown as Record<string, HireJobMatch>;

/** A sample card against a sample job needs no model call: breakdowns and fits ship with the app. Anything else runs live. */
export async function matchSignal(input: {
  paste: string;
  handle: string;
  jobUrl?: string;
}): Promise<SignalResult> {
  const result = await readMatch(input);
  if (!result.ok || !result.match) return result;
  // Signed here from the server's own read; the client never supplies a payload.
  const parsed = parsePaste(input.paste, input.handle);
  if (!parsed.ok) return result;
  const share = signShare({
    v: 1,
    h: parsed.top9.handle?.replace(/^@/, ""),
    g: parsed.top9.titles.map((game) => game.title),
    a: result.card.label,
    j: result.job?.title ?? result.role?.label ?? "this role",
    m: result.match.choice,
    p: result.match.alignment.percent,
  });
  return share ? { ...result, share } : result;
}

async function readMatch(input: {
  paste: string;
  handle: string;
  jobUrl?: string;
}): Promise<SignalResult> {
  const parsed = parsePaste(input.paste, input.handle);
  const jobUrl = input.jobUrl?.trim() ?? "";
  if (!parsed.ok || !jobUrl) return readSignal(input);

  const titles = parsed.top9.titles.map((game) => game.title);
  const known = cards.find(
    ([, entry]) => entry.titles.length === titles.length && entry.titles.every((title, i) => title === titles[i]),
  );
  const key = parseJobUrl(jobUrl)?.pageUrl ?? jobUrl;
  const match = known ? fits[`${known[0]}|${key}`] : undefined;
  const posting = jobs[key];
  const breakdown = cachedJobBreakdowns()[key];
  if (!match || !posting || !breakdown) return readSignal(input);

  try {
    const card = libraryCard(await breakdownGames(titles));
    return {
      ok: true,
      card,
      role: roleCard(breakdown.wants),
      match,
      job: { title: posting.title, url: posting.pageUrl },
    };
  } catch (error) {
    if (error instanceof MissingGatewayKey) {
      await Sentry.flush(2000);
      return { ok: false, error: "missing_key", message: GATEWAY_MISSING };
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
