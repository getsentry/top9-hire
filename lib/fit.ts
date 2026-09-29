import { type Experimental_EvaluationQuestion as EvaluationQuestion } from "ai";
import * as Sentry from "@sentry/nextjs";
import type { Span } from "@sentry/nextjs";
import type { GameBreakdown, GameSkill, JobBreakdown, Requirement } from "./breakdown.ts";
import { jobFingerprint } from "./breakdown.ts";
import { JEV_STATE_CHARS, askJev, expectedLevel, libraryStrength, type AskJev } from "./jev-breakdown.ts";
import { cacheKey, readJson, writeJson } from "./store.ts";
import { clip, normalizeTitle } from "./text.ts";

export type FitLevel = 1 | 2 | 3 | 4;
/** `level` is the library's coverage of the need in four steps; `expected` is the library's strength at the skill, 0 to 3. */
export type FitRow = Requirement & { level: FitLevel; expected: number; confidence: number };
export type FitChoice = "match" | "stretch" | "mismatch";

const FIT_LEVELS = [
  "This person's play style does not fit the day-to-day work",
  "The play style fits a little",
  "The play style fits well",
  "The play style fits very well",
];
const JUDGE_INSTRUCTIONS =
  "Judging only by how this person plays, how well does their play style fit the work this job does day to day?";
const judgeQuestions: Record<string, EvaluationQuestion> = {
  fit: { type: "score", instructions: JUDGE_INSTRUCTIONS, criteria: FIT_LEVELS },
};

export const MATCH_AT = 62;
export const STRETCH_AT = 50;

// Cut points on Jev's raw 0-100 fit score, from scripts/evals/thresholds.ts over 320 pairs (F3, both runs of e2e2).
export const JEV_STRETCH_RAW = 9;
export const JEV_MATCH_RAW = 21;

/** Piecewise linear map that puts the raw cut points on STRETCH_AT and MATCH_AT: the number and the word always agree. */
export function calibrate(raw: number, stretchRaw = JEV_STRETCH_RAW, matchRaw = JEV_MATCH_RAW): number {
  const x = Math.min(100, Math.max(0, raw));
  const line = (a: number, b: number, ya: number, yb: number) => (b === a ? yb : ya + ((yb - ya) * (x - a)) / (b - a));
  const value =
    x < stretchRaw
      ? line(0, stretchRaw, 0, STRETCH_AT)
      : x < matchRaw
        ? line(stretchRaw, matchRaw, STRETCH_AT, MATCH_AT)
        : line(matchRaw, 100, MATCH_AT, 100);
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function choiceFor(percent: number, capped: boolean, matchAt = MATCH_AT, stretchAt = STRETCH_AT): FitChoice {
  if (percent >= matchAt && !capped) return "match";
  return percent >= stretchAt ? "stretch" : "mismatch";
}

/** One row per job requirement, without a model: how well the library's three best games cover that need. */
export function fitRows(games: GameBreakdown[], job: JobBreakdown): FitRow[] {
  return job.requirements.map((requirement) => {
    const skill = requirement.id as GameSkill;
    const strength = libraryStrength(games.map((game) => game.levels), skill);
    const coverage = Math.min(strength / Math.max(job.needs[skill], 1e-9), 1);
    const best = games.reduce((top, game) => (game.levels[skill] > top.levels[skill] ? game : top), games[0] as GameBreakdown);
    return {
      ...requirement,
      level: (1 + Math.round(coverage * 3)) as FitLevel,
      expected: Math.round(strength * 100) / 100,
      confidence: 1,
      evidence: clip(`Best here: ${best?.title ?? ""}`, 90),
    };
  });
}

/** Must before nice, then the higher strength. */
function pickExtremes(rows: FitRow[]): { strongest: FitRow; weakest: FitRow } {
  const weight = (row: FitRow) => (row.kind === "must" ? 2 : 1);
  const byStrength = [...rows].sort((a, b) => b.level - a.level || weight(b) - weight(a) || b.expected - a.expected);
  const byWeakness = [...rows].sort((a, b) => a.level - b.level || weight(b) - weight(a) || a.expected - b.expected);
  return { strongest: byStrength[0] as FitRow, weakest: byWeakness[0] as FitRow };
}

const MAX_WHY = 160;

export function fitWhy(rows: FitRow[]): string {
  if (rows.length === 0) return "No single skill stands out in this posting.";
  const { strongest, weakest } = pickExtremes(rows);
  if (strongest.level === weakest.level) {
    const text = strongest.text;
    return clip(
      strongest.level <= 2
        ? `Thin across the board, even on “${text}”.`
        : `Solid across the board, including “${text}”.`,
      MAX_WHY,
    );
  }
  // Each quote gets a fixed share so both sentences survive the cap.
  const quote = (text: string) => clip(text, 60);
  return clip(`Strong on “${quote(strongest.text)}”. Thin on “${quote(weakest.text)}”.`, MAX_WHY);
}

export type MatchChoice = FitChoice;

/** What the UI reads: the choice, one line why, the percent, and the rows behind it. */
export type HireJobMatch = {
  choice: FitChoice;
  why: string;
  alignment: { percent: number };
  fit: { rows: FitRow[]; dropped: string[] };
};

/** Builds the match from Jev's raw fit score; rows and why need no model. */
export function toMatch(raw: number, games: GameBreakdown[], job: JobBreakdown): HireJobMatch {
  const percent = calibrate(raw);
  const rows = fitRows(games, job);
  return {
    choice: choiceFor(percent, false),
    why: fitWhy(rows),
    alignment: { percent },
    fit: { rows, dropped: job.dropped },
  };
}

export type FitGame = { title: string; summary: string };
export type FitJob = { title: string; description: string };

/** Returns Jev's raw 0-100 fit score. Model, messages and usage live on the SDK's own gen_ai.evaluate child span; copying them onto the step would double-count tokens in Sentry's AI views. */
export async function evaluateFit(games: FitGame[], job: FitJob, ask: AskJev = askJev): Promise<number> {
  const state = {
    games: games.map(({ title, summary }) => ({ title, summary })),
    job: { title: job.title, description: clip(job.description, JEV_STATE_CHARS) },
  };
  const { answers } = await ask(state, judgeQuestions, "top9.fit");
  return Math.round((100 * expectedLevel(answers.fit)) / 3);
}

function setScore(span: Span, raw: number): void {
  const percent = calibrate(raw);
  span.setAttribute("gen_ai.evaluation.name", "top9.fit");
  span.setAttribute("gen_ai.evaluation.score.value", percent);
  span.setAttribute("gen_ai.evaluation.score.label", choiceFor(percent, false));
}

const rawCache = new Map<string, number>();

/** Where the last judgeFit result came from, for the smoke script. */
export const lastFitSource = { value: "" };

/** Test-only: forget in-memory results so the next call reads the blob again. */
export function clearFitCache(): void {
  rawCache.clear();
}

export type FitOptions = {
  ask?: AskJev;
  /** false skips the memory and blob writes; reads stay on. For a library judged on incomplete game data. */
  store?: boolean;
  /** Awaited after the cache lookups miss, right before the Jev call. Throws to refuse the call. */
  beforeModel?: () => Promise<void>;
};

/** One Jev call per job posting and library; a repeat of the same pair is served from memory, then the blob store. Returns the raw 0-100 score. */
export async function judgeFit(url: string, games: FitGame[], job: FitJob, opts: FitOptions = {}): Promise<number> {
  return Sentry.startSpan({ op: "top9.fit", name: "judge fit with Jev" }, async (span) => {
    const titles = games.map((game) => normalizeTitle(game.title));
    const jobHash = jobFingerprint(job.title, job.description);
    const key = `${url}|${jobHash}|${titles.join("|")}`;
    const store = opts.store !== false;
    if (!store) span.setAttribute("top9.fit.stored", false);
    const finish = (source: "memory" | "blob" | "model", raw: number) => {
      lastFitSource.value = source;
      span.setAttribute("top9.source", source);
      span.updateName(`judge fit with Jev · ${source}`);
      setScore(span, raw);
      return raw;
    };
    const cached = rawCache.get(key);
    if (cached !== undefined) return finish("memory", cached);
    const path = cacheKey("fits", { pageUrl: url, titles, jobHash });
    const stored = await readJson<{ raw: number }>(path);
    if (stored) {
      rawCache.set(key, stored.raw);
      return finish("blob", stored.raw);
    }
    await opts.beforeModel?.();
    const raw = await evaluateFit(games, job, opts.ask);
    if (store) {
      await writeJson(path, { raw });
      rawCache.set(key, raw);
    }
    return finish("model", raw);
  });
}

/** judgeFit, then the match built from its raw score. */
export async function fitMatch(
  url: string,
  games: GameBreakdown[],
  job: JobBreakdown,
  opts: FitOptions = {},
): Promise<HireJobMatch> {
  return toMatch(await judgeFit(url, games, job, opts), games, job);
}
