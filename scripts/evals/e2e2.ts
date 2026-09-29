// Eval 4, round 2: every pipeline rescored with cross-validated thresholds, plus four new fit designs (F1 to F4).
// Reuses the saved breakdowns from evals 2 and 3, and the P0 to P3 percents from e2e.ts. Only F2 to F4 call Jev.
import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion as Question } from "ai";
import type { EvaluationAnswers } from "../../lib/classify.ts";
import { GAME_SKILLS, type GameSkill } from "../../lib/breakdown.ts";
import { JEV_STATE_CHARS, expectedLevel, libraryProfile, profileFit, topSkills, type SkillLevels } from "../../lib/jev-breakdown.ts";
import { EVALUATE_MODEL } from "../../lib/models.ts";
import { clip } from "../../lib/text.ts";
import { toGameBreakdown, type JobBreakdown } from "./writer.ts";
import {
  addSpend, at, fit, fitThresholds, gated, gatewayCost, macroF1, mean, meanDefined, pairKey, readData, readOut, spearman, weightedKappa, writeOut,
  type Gold, type Job, type Library, type Verdict, type Wiki,
} from "./common.ts";

const RUNS = 2;
const libraries = readData<Library[]>("libraries");
const jobs = readData<Job[]>("jobs");
const gold = readData<Gold>("gold");
const wiki = new Map(readData<Wiki[]>("wiki").map((w) => [w.title, w.summary ?? ""]));
type Info = { ms: number; cost: number };
type Lv = { levels?: SkillLevels; ms: number; cost: number };
const gamesOut = readOut<{ jevRuns: Record<string, Record<string, Lv>[]> }>("games");
const jobsOut = readOut<{ jevRuns: { needs?: SkillLevels; info?: Info }[][] }>("jobs");
type Cell = { percent: number; choice?: Verdict; ms: number; cost: number; error?: string };
const old = readOut<{ cells: Record<string, Cell[][][]> }>("e2e").cells;

const jevLib = (run: number, li: number) => {
  const byTitle = gamesOut.jevRuns["jev-wiki"]![run]!;
  const per = (libraries[li] as Library).titles.map((t) => byTitle[t]);
  return per.every((p) => p?.levels)
    ? { levels: per.map((p) => p!.levels!), ms: Math.max(...per.map((p) => p!.ms)), cost: per.reduce((n, p) => n + p!.cost, 0) }
    : undefined;
};

const SKILL_SENTENCE: Record<GameSkill, string> = {
  planning: "Plans ahead and sequences work over the long term",
  reflexes: "Reacts fast and precisely under time pressure",
  teamwork: "Works with, supports, and leads other people",
  optimizing: "Tunes numbers and builds to get the most out of a system",
  building: "Builds and creates new things",
  exploring: "Explores the unknown and experiments",
  storytelling: "Follows and tells stories, with attention to lore and detail",
  persistence: "Keeps going on hard or long goals until they are done",
};
/** F2: the top 3 needs are must, and up to 2 more with need of 1.5 or more are nice. */
function jobFromNeeds(job: Job, needs: SkillLevels): JobBreakdown {
  const order = topSkills(needs, 5);
  const picked = order.filter((skill, i) => i < 3 || needs[skill] >= 1.5);
  return {
    title: job.title, level: "mid", team: "small_team", wants: "systems_necromancer", dropped: [],
    work: picked.map((s) => SKILL_SENTENCE[s]).join("; ").slice(0, 160),
    requirements: picked.map((skill, i) => ({ id: skill, text: SKILL_SENTENCE[skill], kind: i < 3 ? ("must" as const) : ("nice" as const), evidence: SKILL_SENTENCE[skill] })),
  };
}

const FIT_LEVELS = [
  "This person's play style does not fit the day-to-day work",
  "The play style fits a little",
  "The play style fits well",
  "The play style fits very well",
];
const judgeQuestions: Record<string, Question> = {
  fit: {
    type: "score",
    instructions: "Judging only by how this person plays, how well does their play style fit the work this job does day to day?",
    criteria: FIT_LEVELS,
  },
  verdict: {
    type: "choice",
    instructions: "Judging only by how this person plays, how well does their play style fit the work this job does day to day?",
    criteria: {
      match: "Their play style clearly fits the day-to-day work",
      stretch: "Their play style partly fits the work, with real gaps",
      mismatch: "Their play style does not fit the day-to-day work",
    },
  },
};
async function judge(state: Record<string, unknown>) {
  const started = Date.now();
  const result = await evaluate({ model: EVALUATE_MODEL, state: state as never, questions: judgeQuestions });
  const cost = gatewayCost(result);
  addSpend("e2e2.judge", cost);
  const answers = result.answers as EvaluationAnswers;
  const verdict = answers.verdict;
  if (!verdict || verdict.type !== "choice") throw new Error("no choice answer");
  return { percent: Math.round((100 * expectedLevel(answers.fit)) / 3), choice: verdict.choice as Verdict, ms: Date.now() - started, cost };
}
const round = (l: SkillLevels) => Object.fromEntries(GAME_SKILLS.map((s) => [s, Math.round(l[s] * 100) / 100]));

// cells[pipeline][run][li][ji]
const NEW = ["F1", "F2", "F3", "F4"];
const cells: Record<string, Cell[][][]> = {
  ...old,
  ...Object.fromEntries(NEW.map((p) => [p, Array.from({ length: RUNS }, () => libraries.map(() => [] as Cell[]))])),
};
const bad = (error: string): Cell => ({ percent: NaN, ms: 0, cost: 0, error });
const tasks: Promise<void>[] = [];
for (let run = 0; run < RUNS; run++) {
  const libs = libraries.map((_, li) => jevLib(run, li));
  const profiles = libs.map((l) => (l ? libraryProfile(l.levels) : undefined));
  const valid = profiles.filter((p): p is number[] => Boolean(p));
  const meanProfile = GAME_SKILLS.map((_, i) => mean(valid.map((p) => p[i] as number)));
  libraries.forEach((lib, li) =>
    jobs.forEach((job, ji) => {
      const jl = libs[li];
      const jn = jobsOut.jevRuns[run]![ji]!;
      if (!jl || !jn.needs || !jn.info) {
        for (const p of NEW) cells[p]![run]![li]![ji] = bad("upstream step failed");
        return;
      }
      const needs = jn.needs;
      const upstreamMs = Math.max(jl.ms, jn.info.ms);
      const upstreamCost = jl.cost + jn.info.cost;
      cells.F1![run]![li]![ji] = { percent: profileFit(profiles[li] as number[], meanProfile, needs), ms: upstreamMs, cost: upstreamCost };
      tasks.push(
        (async () => {
          const gs = jl.levels.map((l, k) => toGameBreakdown(lib.titles[k] as string, l));
          const out = await gated(() => fit(gs, jobFromNeeds(job, needs)));
          cells.F2![run]![li]![ji] = out.ok ? { percent: out.value.percent, ms: upstreamMs + out.value.ms, cost: upstreamCost + out.value.cost } : bad(out.error);
        })(),
        (async () => {
          const state = { games: lib.titles.map((title) => ({ title, summary: wiki.get(title) ?? "" })), job: { title: job.title, description: clip(job.description, JEV_STATE_CHARS) } };
          const out = await gated(() => judge(state));
          // F3 reads only wiki text and the posting, so no upstream step runs before it.
          cells.F3![run]![li]![ji] = out.ok ? { percent: out.value.percent, choice: out.value.choice, ms: out.value.ms, cost: out.value.cost } : bad(out.error);
        })(),
        (async () => {
          const state = {
            games: lib.titles.map((title, k) => ({ title, summary: wiki.get(title) ?? "", skills: round(jl.levels[k] as SkillLevels) })),
            job: { title: job.title, description: clip(job.description, JEV_STATE_CHARS), needs: round(needs) },
          };
          const out = await gated(() => judge(state));
          cells.F4![run]![li]![ji] = out.ok ? { percent: out.value.percent, choice: out.value.choice, ms: upstreamMs + out.value.ms, cost: upstreamCost + out.value.cost } : bad(out.error);
        })(),
      );
    }),
  );
}
await Promise.all(tasks);

const goldOf = (li: number, ji: number) => gold.pairs[pairKey((libraries[li] as Library).id, (jobs[ji] as Job).url)];
const allPairs = libraries.flatMap((_, li) => jobs.map((__, ji) => ({ li, ji }))).filter(({ li, ji }) => goldOf(li, ji));
const fold = (ji: number) => ji % 2;

type Row = Record<string, number | string>;
const summary: Row[] = [];
const verdicts: Record<string, (Verdict | undefined)[][][]> = {};
const rowFor = (name: string, key: string, native: boolean) => {
  const perRun = Array.from({ length: RUNS }, (_, run) => {
    const cell = ({ li, ji }: { li: number; ji: number }) => cells[key]![run]![li]![ji]!;
    const ok = allPairs.filter((x) => !cell(x).error);
    let pred: (Verdict | undefined)[] = ok.map((x) => cell(x).choice);
    if (!native) {
      const t = [0, 1].map((f) => fitThresholds(ok.filter((x) => fold(x.ji) === f).map((x) => ({ percent: cell(x).percent, gold: goldOf(x.li, x.ji)!.verdict }))));
      pred = ok.map((x) => at(cell(x).percent, t[1 - fold(x.ji)]!));
    }
    const truth = ok.map((x) => goldOf(x.li, x.ji)!.verdict);
    verdicts[name] = verdicts[name] ?? [];
    return {
      ok, pred,
      accuracy: mean(pred.map((v, i) => (v === truth[i] ? 1 : 0))),
      f1: macroF1(pred as Verdict[], truth),
      kappa: weightedKappa(pred as Verdict[], truth),
      mae: mean(ok.map((x) => Math.abs(cell(x).percent - goldOf(x.li, x.ji)!.fit))),
      rho: spearman(ok.map((x) => cell(x).percent), ok.map((x) => goldOf(x.li, x.ji)!.fit)),
      ms: mean(ok.map((x) => cell(x).ms)),
      cost: mean(ok.map((x) => cell(x).cost)),
    };
  });
  const flips = allPairs.flatMap((x, i) => {
    const a = perRun[0]!.ok.indexOf(x);
    const b = perRun[1]!.ok.indexOf(x);
    return a >= 0 && b >= 0 ? [perRun[0]!.pred[a] !== perRun[1]!.pred[b] ? 1 : 0] : (void i, []);
  });
  summary.push({
    pipeline: name, pairs: perRun[0]!.ok.length,
    accuracy: mean(perRun.map((r) => r.accuracy)), macroF1: mean(perRun.map((r) => r.f1)), kappa: meanDefined(perRun.map((r) => r.kappa)),
    spearmanFit: meanDefined(perRun.map((r) => r.rho)), maeFit: mean(perRun.map((r) => r.mae)), flipRate: mean(flips),
    coldMsPerPair: mean(perRun.map((r) => r.ms)), costPerColdPair: mean(perRun.map((r) => r.cost)),
    errors: cells[key]!.flat(2).filter((c) => c.error).length,
  });
};
const names: Record<string, string> = {
  P0: "P0 gpt-5.4-mini writer + Jev fit", P1: "P1 sonnet-5.5 writer + Jev fit", P2: "P2 jev-wiki games + gpt-5.4-mini job + Jev fit",
  P3: "P3 all-Jev + vectorFit", F1: "F1 profileFit (deterministic)", F2: "F2 Jev job needs -> requirements -> Jev fit",
  F3: "F3 Jev direct judge (score, CV thresholds)", F4: "F4 Jev direct judge + skill vectors (score, CV thresholds)",
};
for (const key of Object.keys(names)) rowFor(names[key] as string, key, false);
rowFor("F3 Jev direct judge (native choice)", "F3", true);
rowFor("F4 Jev direct judge + vectors (native choice)", "F4", true);

// Baselines: always "stretch", and a constant fit (the gold median), which has no rank signal.
const truthAll = allPairs.map((x) => goldOf(x.li, x.ji)!.verdict);
const fits = allPairs.map((x) => goldOf(x.li, x.ji)!.fit).sort((a, b) => a - b);
const constant = fits[Math.floor(fits.length / 2)] as number;
const stretch = truthAll.map(() => "stretch" as Verdict);
summary.push({
  pipeline: "Baseline: always stretch, constant fit", pairs: allPairs.length,
  accuracy: mean(truthAll.map((v) => (v === "stretch" ? 1 : 0))), macroF1: macroF1(stretch, truthAll), kappa: weightedKappa(stretch, truthAll),
  spearmanFit: NaN, maeFit: mean(fits.map((f) => Math.abs(f - constant))), flipRate: 0, coldMsPerPair: 0, costPerColdPair: 0, errors: 0,
});

// Proof cases use the CV thresholds of the fold that does not contain the pair's job, like every other verdict.
const proof = libraries.filter((l) => l.intended).map((lib) => {
  const li = libraries.indexOf(lib);
  const ji = jobs.findIndex((j) => j.url.split("/").pop() === (lib.jobUrl as string).split("/").pop());
  const results: Record<string, string[]> = {};
  for (const key of Object.keys(names)) {
    results[key] = Array.from({ length: RUNS }, (_, run) => {
      const ok = allPairs.filter((x) => !cells[key]![run]![x.li]![x.ji]!.error);
      const t = fitThresholds(ok.filter((x) => fold(x.ji) !== fold(ji)).map((x) => ({ percent: cells[key]![run]![x.li]![x.ji]!.percent, gold: goldOf(x.li, x.ji)!.verdict })));
      const c = cells[key]![run]![li]![ji]!;
      if (c.error) return "error";
      const v = at(c.percent, t);
      return `${v} (${c.percent}) ${(lib.intended === "match" ? v === "match" : v !== "match") ? "ok" : "MISS"}`;
    });
  }
  return { case: lib.id, intended: lib.intended, gold: goldOf(li, ji)?.verdict, results };
});
writeOut("e2e2", { summary, proof, names, cells: Object.fromEntries(NEW.map((p) => [p, cells[p]])) });
console.table(summary);
