"use server";

import * as Sentry from "@sentry/nextjs";
import { inActionSpan } from "@/lib/action-span";
import { readSignal, type SignalResult } from "@/app/actions";
import { breakdownGames, cachedJobBreakdowns, libraryCard } from "@/lib/breakdown";
import { MissingGatewayKey } from "@/lib/classify";
import type { HireJobMatch } from "@/lib/fit";
import { GATEWAY_MISSING, parsePaste, roleCard } from "@/lib/hire";
import { parseJobUrl } from "@/lib/job-url";
import { signShare } from "@/lib/share";
import { parseTweetUrl } from "@/lib/tweet-media";
import reads from "./sample-reads.json";

const cards = Object.entries(reads.cards) as [string, { titles: string[] }][];
const jobs = reads.jobs as Record<string, { title: string; pageUrl: string }>;
const fits = reads.fits as unknown as Record<string, HireJobMatch>;

type MatchInput = { paste: string; handle: string; jobUrl?: string; postUrl?: string };

/** A sample card against a sample job needs no model call: breakdowns and fits ship with the app. Anything else runs live. */
export async function matchSignal(input: MatchInput): Promise<SignalResult> {
  return inActionSpan("Match a Top 9 to a job", () => runMatchSignal(input));
}

async function runMatchSignal(input: MatchInput): Promise<SignalResult> {
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
    c: result.job?.company ?? orgSlug(input.jobUrl),
    t: parseTweetUrl(input.postUrl ?? "")?.statusId,
  });
  return share ? { ...result, share } : result;
}

/** The ATS org segment of a job link, as written; `undefined` for links that carry none. */
function orgSlug(jobUrl: string | undefined): string | undefined {
  const parsed = parseJobUrl(jobUrl ?? "");
  return parsed && "org" in parsed ? parsed.org : undefined;
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
      return { ok: false, error: "missing_key", message: GATEWAY_MISSING };
    }
    Sentry.captureException(error);
    return {
      ok: false,
      error: "model_failed",
      message: "The model call failed. Nothing was invented in its place.",
    };
  }
}
