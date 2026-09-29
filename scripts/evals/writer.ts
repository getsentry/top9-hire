// The writer-model pipeline the app used before Jev did every judgment (gpt-5.4-mini writes breakdowns, Jev scores each requirement).
// Kept for the eval scripts only: nothing under app/ or lib/ imports it, and it has no cache.
import {
  generateText,
  Output,
  type Experimental_EvaluationQuestion as EvaluationQuestion,
} from "ai";
import { z } from "zod";
import { GAME_SKILLS, chunk, normalizeTitle, type CallInfo, type GameSkill } from "../../lib/breakdown.ts";
import { MissingGatewayKey, requestOidcToken, type EvaluationAnswers } from "../../lib/classify.ts";
import { choiceFor, type FitChoice } from "../../lib/fit.ts";
import { ARCHETYPES, gatewayReady, type ArchetypeId } from "../../lib/hire.ts";
import type { SkillLevels } from "../../lib/jev-breakdown.ts";
import { clip } from "../../lib/text.ts";

export const WRITE_MODEL = "openai/gpt-5.4-mini";

const gameSchema = z.object({
  title: z.string().trim().min(1),
  genre: z.string().trim().min(1),
  modes: z.array(z.enum(["solo", "co_op", "competitive"])).min(1),
  pace: z.enum(["slow", "medium", "fast"]),
  skills: z.array(z.enum(GAME_SKILLS)).min(1).max(3),
  traits: z.array(z.string().trim().min(1)).min(2).max(3),
  summary: z.string().trim().min(1),
});

export type GameBreakdown = z.infer<typeof gameSchema>;

const jobSchema = z.object({
  title: z.string().trim().min(1),
  level: z.enum(["junior", "mid", "senior", "staff"]),
  work: z.string().trim().min(1),
  team: z.enum(["solo", "small_team", "cross_functional"]),
  wants: z.enum(Object.keys(ARCHETYPES) as [ArchetypeId, ...ArchetypeId[]]),
  requirements: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        text: z.string().trim().min(1),
        kind: z.enum(["must", "nice"]),
        evidence: z.string().trim().min(1),
      }),
    )
    .min(5)
    .max(6),
  dropped: z.array(z.string().trim().min(1)).max(6),
});

export type JobBreakdown = z.infer<typeof jobSchema>;
export type Requirement = JobBreakdown["requirements"][number];

export type WriterOptions = {
  /** Gateway model id that replaces WRITE_MODEL for this call. */
  model?: string;
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
  onCall?: (info: CallInfo) => void;
};

function callInfo(started: number, result: { usage: { inputTokens?: number; outputTokens?: number }; providerMetadata?: unknown }): CallInfo {
  const gateway = (result.providerMetadata as { gateway?: { cost?: string | number } } | undefined)?.gateway;
  return {
    ms: Date.now() - started,
    input: result.usage.inputTokens ?? 0,
    output: result.usage.outputTokens ?? 0,
    cost: Number(gateway?.cost ?? 0) || 0,
  };
}

async function requireGateway(): Promise<void> {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) throw new MissingGatewayKey();
}

const GAMES_SYSTEM = [
  "You break video games down for a hiring tool. You get a JSON array of game titles.",
  "Return one entry per title, in the same order, with the title copied exactly.",
  "genre is a short plain genre. modes lists how it is usually played. pace is how fast play feels.",
  `skills is the top three of: ${GAME_SKILLS.join(", ")}, strongest first. Be discriminating: pick only what playing it trains most.`,
  "traits is two or three short phrases for what the game rewards, like 'reading opponents' or 'long-term base planning'.",
  "summary is at most 140 characters, plain words: what playing it trains.",
  "If you do not know a title, give your best guess from the name. Do not refuse.",
].join("\n");

const GAME_LIMITS = { genre: 60, trait: 40, summary: 140 };
const JOB_LIMITS = { work: 160, id: 40, text: 80, evidence: 160, dropped: 40 };

function clipGame(game: GameBreakdown): GameBreakdown {
  return {
    ...game,
    genre: clip(game.genre, GAME_LIMITS.genre),
    traits: game.traits.map((trait) => clip(trait, GAME_LIMITS.trait)),
    summary: clip(game.summary, GAME_LIMITS.summary),
  };
}

/** Pairs each requested title with its returned game: by normalized title first, then by position only when the counts agree and that game is unclaimed. */
export function matchGames(missing: string[], games: GameBreakdown[]): GameBreakdown[] {
  const byTitle = missing.map((title) =>
    games.findIndex((g) => normalizeTitle(g.title) === normalizeTitle(title)),
  );
  const claimed = new Set(byTitle.filter((index) => index >= 0));
  const unmatched: string[] = [];
  const result = missing.map((title, i) => {
    let index = byTitle[i] as number;
    if (index < 0 && games.length === missing.length && !claimed.has(i)) index = i;
    const game = games[index];
    if (!game) unmatched.push(title);
    return game as GameBreakdown;
  });
  if (unmatched.length > 0) {
    throw new Error(`Model returned no breakdown for: ${unmatched.join(", ")}`);
  }
  return result;
}

const GAME_CHUNK = 3;

async function writeGames(titles: string[], opts: WriterOptions, calls: CallInfo[]): Promise<GameBreakdown[]> {
  const started = Date.now();
  const result = await generateText({
    model: opts.model ?? WRITE_MODEL,
    providerOptions: opts.providerOptions,
    system: GAMES_SYSTEM,
    prompt: JSON.stringify(titles),
    output: Output.object({
      schema: z.object({ games: z.array(gameSchema) }),
      name: "game_breakdowns",
      description: "One breakdown per game title, in input order.",
    }),
  });
  calls.push(callInfo(started, result));
  if (!result.output) throw new Error("Model returned no game breakdowns");
  const games = z.object({ games: z.array(gameSchema) }).parse(result.output).games;
  return matchGames(titles, games);
}

export async function breakdownGames(titles: string[], opts: WriterOptions = {}): Promise<GameBreakdown[]> {
  const started = Date.now();
  const calls: CallInfo[] = [];
  const unique = [...new Map(titles.map((title) => [normalizeTitle(title), title])).values()];
  await requireGateway();
  const fresh = new Map<string, GameBreakdown>();
  await Promise.all(
    chunk(unique, GAME_CHUNK).map(async (group) => {
      const matched = await writeGames(group, opts, calls);
      group.forEach((title, i) => fresh.set(normalizeTitle(title), { ...clipGame(matched[i] as GameBreakdown), title }));
    }),
  );
  opts.onCall?.({
    ms: Date.now() - started,
    input: calls.reduce((n, c) => n + c.input, 0),
    output: calls.reduce((n, c) => n + c.output, 0),
    cost: calls.reduce((n, c) => n + c.cost, 0),
  });
  return titles.map((title) => {
    const game = fresh.get(normalizeTitle(title));
    if (!game) throw new Error(`No breakdown for ${title}`);
    return game;
  });
}

const JOB_SYSTEM = [
  "You break a job posting down for a hiring tool that checks it against someone's favorite games. Use only the posting.",
  "work is at most 160 characters: what the person does day to day.",
  `wants is the one library archetype this job would love most. Pick from:\n${Object.entries(ARCHETYPES)
    .map(([id, a]) => `${id}: ${a.label}, ${a.criterion}`)
    .join("\n")}`,
  "requirements has 5 or 6 items, exactly 3 of them kind must and the rest nice.",
  "Each requirement is a trait a hobby can signal, written as a play-style trait that keeps the work meaning.",
  "Examples: 'debug unfamiliar systems' becomes 'figures out unfamiliar systems by poking at them'. 'lead cross-team projects' becomes 'coordinates a group toward one goal'. 'ship features end to end' becomes 'sees long projects through to the end'.",
  "Skip tools, languages, credentials, years of experience, and domain knowledge. Examples to skip: React, cloud, source control, Roblox, advocacy experience.",
  "id is a unique snake_case slug. text is at most 80 characters, plain words.",
  "evidence is a short verbatim quote from the posting that the trait came from, at most 160 characters.",
  "dropped lists at most 6 (empty if none) short names of what you skipped as untestable, like 'React' or 'cloud'.",
].join("\n");

/** Keeps the first 3 musts: extra musts become nice, and a shortfall promotes the first nice rows in order. */
export function normalizeKinds(requirements: Requirement[]): Requirement[] {
  let musts = 0;
  const demoted = requirements.map((r) => {
    if (r.kind !== "must") return r;
    return ++musts <= 3 ? r : { ...r, kind: "nice" as const };
  });
  let needed = 3 - Math.min(musts, 3);
  return demoted.map((r) => {
    if (r.kind === "nice" && needed > 0) {
      needed--;
      return { ...r, kind: "must" as const };
    }
    return r;
  });
}

function clipJob(job: JobBreakdown): JobBreakdown {
  return {
    ...job,
    work: clip(job.work, JOB_LIMITS.work),
    requirements: job.requirements.map((r) => ({
      ...r,
      id: clip(r.id, JOB_LIMITS.id),
      text: clip(r.text, JOB_LIMITS.text),
      evidence: clip(r.evidence, JOB_LIMITS.evidence),
    })),
    dropped: job.dropped.map((d) => clip(d, JOB_LIMITS.dropped)),
  };
}

function uniqueIds(requirements: Requirement[]): Requirement[] {
  const used = new Set<string>();
  return requirements.map((requirement) => {
    const base =
      requirement.id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "requirement";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return { ...requirement, id };
  });
}

export async function breakdownJob(
  job: { url: string; title: string; description: string },
  opts: WriterOptions = {},
): Promise<JobBreakdown> {
  await requireGateway();
  const started = Date.now();
  const result = await generateText({
    model: opts.model ?? WRITE_MODEL,
    providerOptions: opts.providerOptions,
    system: JOB_SYSTEM,
    prompt: JSON.stringify({ title: job.title, description: job.description }),
    output: Output.object({
      schema: jobSchema,
      name: "job_breakdown",
      description: "The level, work, team, and abilities a job posting asks for.",
    }),
  });
  opts.onCall?.(callInfo(started, result));
  if (!result.output) throw new Error("Model returned no job breakdown");
  const clipped = clipJob(jobSchema.parse(result.output));
  return { ...clipped, requirements: uniqueIds(normalizeKinds(clipped.requirements)) };
}

/** A GameBreakdown shell so a Jev result can flow through the writer-era fit step; only the skills carry data. */
export function toGameBreakdown(title: string, levels: SkillLevels): GameBreakdown {
  const skills = GAME_SKILLS.map((skill, order) => ({ skill, order, level: levels[skill] }))
    .sort((a, b) => b.level - a.level || a.order - b.order)
    .slice(0, 3)
    .map((entry) => entry.skill as GameSkill);
  return { title, genre: "unknown", modes: ["solo"], pace: "medium", skills, traits: [], summary: "" };
}

export type FitLevel = 1 | 2 | 3 | 4;
export type FitRow = Requirement & { level: FitLevel; expected: number; confidence: number };

const FIT_CRITERIA = [
  "Nothing in the library points to this",
  "A hint in one or two games",
  "Clear in several games",
  "A running theme across the library",
];

export function fitQuestions(job: JobBreakdown): Record<string, EvaluationQuestion> {
  const questions: Record<string, EvaluationQuestion> = {};
  for (const requirement of job.requirements) {
    questions[requirement.id] = {
      type: "score",
      instructions: `How well does this game library train: "${requirement.text}"? The job says: "${requirement.evidence}"`,
      criteria: [...FIT_CRITERIA],
    };
  }
  return questions;
}

export function rowsFromAnswers(answers: EvaluationAnswers, job: JobBreakdown): FitRow[] {
  return job.requirements.map((requirement) => {
    const answer = answers[requirement.id];
    if (!answer || answer.type !== "score") {
      throw new Error(`Evaluation returned no score answer for ${requirement.id}`);
    }
    const level = Math.min(4, Math.max(1, Math.round(answer.score) + 1)) as FitLevel;
    const probabilities = Object.entries(answer.probabilities ?? {});
    const total = probabilities.reduce((sum, [, p]) => sum + p, 0);
    const expected =
      total > 0
        ? probabilities.reduce((sum, [index, p]) => sum + p * (Number(index) + 1), 0) / total
        : level;
    return {
      ...requirement,
      level,
      expected,
      confidence:
        answer.probabilities?.[String(level - 1)] ?? 1 - Math.abs(answer.score - Math.round(answer.score)),
    };
  });
}

/** Level 3 ("clear in several games") earns full marks; level 4 cannot make up for a weak row. */
const FULL_LEVEL = 3;
const weight = (row: FitRow) => (row.kind === "must" ? 2 : 1);

/** Writer-era scoring: weighted mean of the rows' expected levels; a must row at level 1 caps the choice at stretch. */
export function scoreFit(rows: FitRow[]): { percent: number; choice: FitChoice } {
  if (rows.length === 0) throw new Error("scoreFit needs at least one row");
  const earned = rows.reduce((sum, row) => sum + weight(row) * (Math.min(row.expected, FULL_LEVEL) - 1), 0);
  const possible = rows.reduce((sum, row) => sum + weight(row) * (FULL_LEVEL - 1), 0);
  const percent = Math.round((100 * earned) / possible);
  const blocked = rows.some((row) => row.kind === "must" && row.level === 1);
  return { percent, choice: choiceFor(percent, blocked) };
}
