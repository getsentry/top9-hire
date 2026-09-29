// Builds data/gold.json: three model jurors score games, jobs, and pairs independently; gold is their mean or majority.
import { generateText, Output } from "ai";
import { z } from "zod";
import { GAME_SKILLS, chunk, normalizeTitle, type GameSkill } from "../../lib/breakdown.ts";
import { ARCHETYPES } from "../../lib/hire.ts";
import {
  JURY, VERDICTS, addSpend, gated, gatewayCost, mean, meanDefined, pairKey, readData, spearman, vec, weightedKappa, writeData,
  type Gold, type Job, type Library, type Verdict,
} from "./common.ts";

const libraries = readData<Library[]>("libraries");
const jobs = readData<Job[]>("jobs");
const titles = [...new Map(libraries.flatMap((l) => l.titles).map((t) => [normalizeTitle(t), t])).values()];

const RUBRIC = `Levels: 0 none, 1 a little, 2 clearly, 3 core.
Skills:
planning: planning ahead, sequencing moves, resources, long-term plans
reflexes: fast, precise reactions under time pressure
teamwork: cooperating with, supporting, or leading other players
optimizing: min-maxing, theorycrafting, tuning numbers or builds
building: constructing, crafting, creating things
exploring: exploring, experimenting, discovering the unknown
storytelling: following or making stories, lore, characters
persistence: grinding, retrying, seeing hard or long goals through`;

const levels = z.object(Object.fromEntries(GAME_SKILLS.map((s) => [s, z.number()])) as Record<GameSkill, z.ZodNumber>);
const clamp = (n: number) => Math.min(3, Math.max(0, n));
const clampLevels = (l: Record<GameSkill, number>) =>
  Object.fromEntries(GAME_SKILLS.map((s) => [s, clamp(l[s])])) as Record<GameSkill, number>;

async function ask<S extends z.ZodType>(label: string, model: string, system: string, prompt: string, schema: S) {
  const out = await gated(async () => {
    const result = await generateText({ model, system, prompt, output: Output.object({ schema }) });
    addSpend(label, gatewayCost(result));
    if (!result.output) throw new Error("no output");
    return result.output as z.infer<S>;
  });
  if (!out.ok) console.error(label, model, out.error);
  return out.ok ? out.value : null;
}

const gameSchema = z.object({ games: z.array(levels.extend({ title: z.string() })) });
const jobSchema = z.object({
  needs: levels,
  wants: z.enum(Object.keys(ARCHETYPES) as [string, ...string[]]),
});
const pairSchema = z.object({
  pairs: z.array(z.object({ id: z.string(), verdict: z.enum(["match", "stretch", "mismatch"]), fit: z.number() })),
});

const jurorGames: Record<string, Record<string, Record<GameSkill, number>>> = {};
const jurorJobs: Record<string, Record<string, { needs: Record<GameSkill, number>; wants: string }>> = {};
const jurorPairs: Record<string, Record<string, { verdict: Verdict; fit: number }>> = {};

await Promise.all(
  JURY.map(async (model) => {
    jurorGames[model] = {};
    jurorJobs[model] = {};
    jurorPairs[model] = {};
    const tasks: Promise<void>[] = [];
    for (const group of chunk(titles, 13)) {
      tasks.push(
        ask(
          "gold.games",
          model,
          `You rate video games for a hiring research study. ${RUBRIC}\nFor each game title, give a level 0-3 for each of the 8 skills: how much playing it trains or rewards that skill. Return one entry per title, title copied exactly.`,
          JSON.stringify(group),
          gameSchema,
        ).then((out) => {
          for (const g of out?.games ?? []) {
            const title = group.find((t) => normalizeTitle(t) === normalizeTitle(g.title));
            if (title) jurorGames[model]![title] = clampLevels(g);
          }
        }),
      );
    }
    for (const job of jobs) {
      const text = JSON.stringify({ title: job.title, description: job.description });
      tasks.push(
        ask(
          "gold.jobs",
          model,
          `You read job postings as a play-style analogy for a hiring research study. ${RUBRIC}\nFor the posting, give a level 0-3 for each skill: how much the day-to-day work needs that skill, read as a play style. Then pick the one library archetype who would love this job most:\n${Object.entries(ARCHETYPES).map(([id, a]) => `${id}: ${a.criterion}`).join("\n")}`,
          text,
          jobSchema,
        ).then((out) => {
          if (out) jurorJobs[model]![job.url] = { needs: clampLevels(out.needs), wants: out.wants };
        }),
      );
      tasks.push(
        ask(
          "gold.pairs",
          model,
          `You judge hiring fit for a research study. Each library is one person's nine favorite games. For every library, answer: judging only by how this person plays, how well does their play style fit the work this job does day to day? Give verdict match, stretch, or mismatch, and fit 0-100. Judge each library on its own. Return one entry per library id.`,
          JSON.stringify({ job: { title: job.title, description: job.description }, libraries: libraries.map((l) => ({ id: l.id, games: l.titles })) }),
          pairSchema,
        ).then((out) => {
          for (const p of out?.pairs ?? []) {
            if (libraries.some((l) => l.id === p.id)) {
              jurorPairs[model]![pairKey(p.id, job.url)] = { verdict: p.verdict, fit: Math.min(100, Math.max(0, p.fit)) };
            }
          }
        }),
      );
    }
    await Promise.all(tasks);
  }),
);

const top3 = (l: Record<GameSkill, number>) =>
  GAME_SKILLS.map((s, order) => ({ s, order, v: l[s] })).sort((a, b) => b.v - a.v || a.order - b.order).slice(0, 3).map((x) => x.s);
const avgLevels = (all: Record<GameSkill, number>[]) =>
  Object.fromEntries(GAME_SKILLS.map((s) => [s, mean(all.map((l) => l[s]))])) as Record<GameSkill, number>;
const pairwise = <T>(xs: T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

const gold: Gold & { raw: unknown } = { games: {}, jobs: {}, pairs: {}, agreement: {}, raw: { jurorGames, jurorJobs, jurorPairs } };
for (const title of titles) {
  const all = JURY.map((m) => jurorGames[m]![title]).filter((x): x is Record<GameSkill, number> => Boolean(x));
  if (all.length === 0) continue;
  const levelsMean = avgLevels(all);
  gold.games[title] = { levels: levelsMean, top3: top3(levelsMean) };
}
for (const job of jobs) {
  const all = JURY.map((m) => jurorJobs[m]![job.url]).filter(Boolean) as { needs: Record<GameSkill, number>; wants: string }[];
  if (all.length === 0) continue;
  const needs = avgLevels(all.map((a) => a.needs));
  const counts = new Map<string, number>();
  for (const a of all) counts.set(a.wants, (counts.get(a.wants) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  gold.jobs[job.url] = { needs, top3: top3(needs), wants: best[0] && best[0][1] >= 2 ? best[0][0] : null };
}
for (const lib of libraries)
  for (const job of jobs) {
    const key = pairKey(lib.id, job.url);
    const votes = JURY.map((m) => jurorPairs[m]![key]).filter(Boolean) as { verdict: Verdict; fit: number }[];
    if (votes.length === 0) continue;
    const tally = VERDICTS.map((v) => ({ v, n: votes.filter((x) => x.verdict === v).length })).sort((a, b) => b.n - a.n);
    const verdict = tally[0]!.n >= 2 ? tally[0]!.v : "stretch";
    gold.pairs[key] = { verdict, fit: mean(votes.map((x) => x.fit)), votes: votes.map((x) => x.verdict) };
  }

// Agreement between jurors is the ceiling a candidate can reasonably reach.
const gameRho: number[] = [];
for (const title of titles)
  for (const [a, b] of pairwise(JURY)) {
    const x = jurorGames[a]![title];
    const y = jurorGames[b]![title];
    if (x && y) gameRho.push(spearman(vec(x), vec(y)));
  }
const jobRho: number[] = [];
let wantsAgree = 0;
let wantsTotal = 0;
for (const job of jobs)
  for (const [a, b] of pairwise(JURY)) {
    const x = jurorJobs[a]![job.url];
    const y = jurorJobs[b]![job.url];
    if (x && y) {
      jobRho.push(spearman(vec(x.needs), vec(y.needs)));
      wantsTotal++;
      if (x.wants === y.wants) wantsAgree++;
    }
  }
const keys = Object.keys(gold.pairs);
const verdictAgree: number[] = [];
const kappas: number[] = [];
const fitRho: number[] = [];
for (const [a, b] of pairwise(JURY)) {
  const both = keys.filter((k) => jurorPairs[a]![k] && jurorPairs[b]![k]);
  if (both.length === 0) continue;
  const va = both.map((k) => jurorPairs[a]![k]!.verdict);
  const vb = both.map((k) => jurorPairs[b]![k]!.verdict);
  verdictAgree.push(mean(va.map((v, i) => (v === vb[i] ? 1 : 0))));
  kappas.push(weightedKappa(va, vb));
  fitRho.push(spearman(both.map((k) => jurorPairs[a]![k]!.fit), both.map((k) => jurorPairs[b]![k]!.fit)));
}
gold.agreement = {
  gameSpearman: meanDefined(gameRho),
  jobSpearman: meanDefined(jobRho),
  jobArchetypeAgree: wantsAgree / Math.max(wantsTotal, 1),
  pairVerdictAgree: mean(verdictAgree),
  pairWeightedKappa: mean(kappas),
  pairFitSpearman: mean(fitRho),
  gamesScored: Object.keys(gold.games).length,
  jobsScored: Object.keys(gold.jobs).length,
  pairsScored: keys.length,
};
writeData("gold", gold);
console.log(gold.agreement);
