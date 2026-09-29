// Eval 4: whole pipelines per (library, job) pair against the jury gold. Reuses the breakdowns eval 2 and 3 wrote, one per run.
import { choiceFor, type FitChoice } from "../../lib/fit.ts";
import { vectorFit, type SkillLevels } from "../../lib/jev-breakdown.ts";
import {
  VERDICTS, fit, addSpend, gated, gatewayCost, mean, meanDefined, pairKey, readData, readOut, spearman, weightedKappa, writeOut,
  type Gold, type Job, type Library, type Verdict,
} from "./common.ts";
import { toGameBreakdown, type GameBreakdown, type JobBreakdown } from "./writer.ts";

const RUNS = 2;
const P0_MODEL = "openai/gpt-5.4-mini";
const libraries = readData<Library[]>("libraries");
const jobs = readData<Job[]>("jobs");
const gold = readData<Gold>("gold");
type GamesOut = { summary: { candidate: string; top3Overlap: number; costPerLibrary: number }[]; writerRuns: Record<string, { games?: GameBreakdown[]; info?: Info }[][]>; jevRuns: Record<string, Record<string, { levels?: SkillLevels; ms: number; cost: number }>[]> };
type JobsOut = { writerRuns: Record<string, { job?: JobBreakdown; info?: Info }[][]>; jevRuns: { needs?: SkillLevels; info?: Info }[][] };
type Info = { ms: number; cost: number };
const games = readOut<GamesOut>("games");
const jobsOut = readOut<JobsOut>("jobs");

const BEST = games.summary
  .filter((s) => s.candidate.includes("/"))
  .sort((a, b) => b.top3Overlap - a.top3Overlap || a.costPerLibrary - b.costPerLibrary)[0]!.candidate;

type Cell = { percent: number; choice?: FitChoice; ms: number; cost: number; error?: string };
const PIPELINES = ["P0", "P1", "P2", "P3"] as const;
const label: Record<(typeof PIPELINES)[number], string> = {
  P0: `P0 current: ${P0_MODEL} writer + Jev fit`,
  P1: `P1 best writer (${BEST}) + Jev fit`,
  P2: `P2 jev-wiki games + ${P0_MODEL} job + Jev fit`,
  P3: "P3 all-Jev: jev-wiki games + jev job needs + vectorFit",
};
// cells[pipeline][run][libIdx][jobIdx]
const cells: Record<string, Cell[][][]> = Object.fromEntries(
  PIPELINES.map((p) => [p, Array.from({ length: RUNS }, () => libraries.map(() => [] as Cell[]))]),
);
const libGames = (model: string, run: number, li: number) => games.writerRuns[model]![run]![li]!;
const jevLib = (run: number, li: number) => {
  const byTitle = games.jevRuns["jev-wiki"]![run]!;
  const lib = libraries[li] as Library;
  const per = lib.titles.map((t) => byTitle[t]);
  return per.every((p) => p?.levels)
    ? { levels: per.map((p) => p!.levels!), ms: Math.max(...per.map((p) => p!.ms)), cost: per.reduce((n, p) => n + p!.cost, 0) }
    : undefined;
};

const tasks: Promise<void>[] = [];
for (let run = 0; run < RUNS; run++)
  libraries.forEach((lib, li) =>
    jobs.forEach((_, ji) => {
      const writerPipeline = (p: "P0" | "P1", model: string) =>
        tasks.push(
          (async () => {
            const g = libGames(model, run, li);
            const j = jobsOut.writerRuns[model]![run]![ji]!;
            if (!g.games || !j.job || !g.info || !j.info) return void (cells[p]![run]![li]![ji] = { percent: NaN, ms: 0, cost: 0, error: "upstream step failed" });
            const out = await gated(() => fit(g.games as GameBreakdown[], j.job as JobBreakdown));
            cells[p]![run]![li]![ji] = out.ok
              ? { percent: out.value.percent, choice: out.value.choice, ms: Math.max(g.info.ms, j.info.ms) + out.value.ms, cost: g.info.cost + j.info.cost + out.value.cost }
              : { percent: NaN, ms: 0, cost: 0, error: out.error };
          })(),
        );
      writerPipeline("P0", P0_MODEL);
      writerPipeline("P1", BEST);
      tasks.push(
        (async () => {
          const jl = jevLib(run, li);
          const j = jobsOut.writerRuns[P0_MODEL]![run]![ji]!;
          if (!jl || !j.job || !j.info) return void (cells.P2![run]![li]![ji] = { percent: NaN, ms: 0, cost: 0, error: "upstream step failed" });
          const gs = jl.levels.map((l, k) => toGameBreakdown((lib.titles[k] as string), l));
          const out = await gated(() => fit(gs, j.job as JobBreakdown));
          cells.P2![run]![li]![ji] = out.ok
            ? { percent: out.value.percent, choice: out.value.choice, ms: Math.max(jl.ms, j.info.ms) + out.value.ms, cost: jl.cost + j.info.cost + out.value.cost }
            : { percent: NaN, ms: 0, cost: 0, error: out.error };
        })(),
      );
      const jl = jevLib(run, li);
      const jn = jobsOut.jevRuns[run]![ji]!;
      cells.P3![run]![li]![ji] =
        jl && jn.needs && jn.info
          ? { percent: vectorFit(jl.levels, jn.needs), ms: Math.max(jl.ms, jn.info.ms), cost: jl.cost + jn.info.cost }
          : { percent: NaN, ms: 0, cost: 0, error: "upstream step failed" };
    }),
  );
await Promise.all(tasks);

const goldOf = (li: number, ji: number) => gold.pairs[pairKey((libraries[li] as Library).id, (jobs[ji] as Job).url)];
const allPairs = libraries.flatMap((_, li) => jobs.map((__, ji) => ({ li, ji }))).filter(({ li, ji }) => goldOf(li, ji));

/** Best (matchAt, stretchAt) by accuracy on the given pairs; ties go to the lowest thresholds. */
function fitThresholds(rows: { percent: number; gold: Verdict }[]) {
  let best = { matchAt: 100, stretchAt: 0, acc: -1 };
  for (let stretchAt = 0; stretchAt <= 100; stretchAt++)
    for (let matchAt = stretchAt; matchAt <= 101; matchAt++) {
      const acc = mean(rows.map((r) => ((r.percent >= matchAt ? "match" : r.percent >= stretchAt ? "stretch" : "mismatch") === r.gold ? 1 : 0)));
      if (acc > best.acc) best = { matchAt, stretchAt, acc };
    }
  return best;
}
const verdictAt = (percent: number, t: { matchAt: number; stretchAt: number }): Verdict =>
  choiceFor(percent, false, t.matchAt, t.stretchAt);

// P3 verdicts: 2-fold cross-validation split by job (even and odd job index), test half only.
const thresholds: Record<string, { matchAt: number; stretchAt: number }[]> = { P3: [] };
for (let run = 0; run < RUNS; run++) {
  const fold = (ji: number) => ji % 2;
  const t = [0, 1].map((f) =>
    fitThresholds(allPairs.filter(({ ji }) => fold(ji) === f).flatMap(({ li, ji }) => {
      const c = cells.P3![run]![li]![ji]!;
      return c.error ? [] : [{ percent: c.percent, gold: (goldOf(li, ji) as Gold["pairs"][string]).verdict }];
    })),
  );
  thresholds.P3!.push(...t);
  for (const { li, ji } of allPairs) {
    const c = cells.P3![run]![li]![ji]!;
    if (!c.error) c.choice = verdictAt(c.percent, t[1 - fold(ji)]!);
  }
}

const count = (v: Verdict) => allPairs.filter(({ li, ji }) => goldOf(li, ji)!.verdict === v).length;
const majority = VERDICTS.map((v) => ({ v, n: count(v) })).sort((a, b) => b.n - a.n)[0]!;

const summary = PIPELINES.map((p) => {
  const perRun = Array.from({ length: RUNS }, (_, run) => {
    const ok = allPairs.filter(({ li, ji }) => !cells[p]![run]![li]![ji]!.error);
    const cell = ({ li, ji }: { li: number; ji: number }) => cells[p]![run]![li]![ji]!;
    const pred = ok.map((x) => cell(x).choice as Verdict);
    const truth = ok.map((x) => goldOf(x.li, x.ji)!.verdict);
    return {
      n: ok.length,
      accuracy: mean(pred.map((v, i) => (v === truth[i] ? 1 : 0))),
      kappa: weightedKappa(pred, truth),
      maeFit: mean(ok.map((x) => Math.abs(cell(x).percent - goldOf(x.li, x.ji)!.fit))),
      spearmanFit: spearman(ok.map((x) => cell(x).percent), ok.map((x) => goldOf(x.li, x.ji)!.fit)),
      ms: mean(ok.map((x) => cell(x).ms)),
      cost: mean(ok.map((x) => cell(x).cost)),
    };
  });
  const both = allPairs.filter(({ li, ji }) => RUNS === 2 && !cells[p]![0]![li]![ji]!.error && !cells[p]![1]![li]![ji]!.error);
  return {
    pipeline: label[p],
    pairs: perRun[0]!.n,
    accuracy: mean(perRun.map((r) => r.accuracy)),
    kappa: meanDefined(perRun.map((r) => r.kappa)),
    maeFit: mean(perRun.map((r) => r.maeFit)),
    spearmanFit: meanDefined(perRun.map((r) => r.spearmanFit)),
    flipRate: mean(both.map(({ li, ji }) => (cells[p]![0]![li]![ji]!.choice !== cells[p]![1]![li]![ji]!.choice ? 1 : 0))),
    coldMsPerPair: mean(perRun.map((r) => r.ms)),
    costPerColdPair: mean(perRun.map((r) => r.cost)),
    errors: cells[p]!.flat(2).filter((c) => c.error).length,
  };
});

const proof = libraries.filter((l) => l.intended).map((lib) => {
  const li = libraries.indexOf(lib);
  const ji = jobs.findIndex((j) => j.url.split("/").pop() === (lib.jobUrl as string).split("/").pop());
  const truth = goldOf(li, ji)?.verdict;
  return {
    case: lib.id,
    intended: lib.intended,
    gold: truth,
    results: Object.fromEntries(
      PIPELINES.map((p) => [
        p,
        Array.from({ length: RUNS }, (_, run) => {
          const c = cells[p]![run]![li]![ji]!;
          const ok = c.choice && (lib.intended === "match" ? c.choice === "match" : c.choice !== "match");
          return c.error ? "error" : `${c.choice} (${c.percent}%) ${ok ? "ok" : "MISS"}`;
        }),
      ]),
    ),
  };
});

writeOut("e2e", { summary, proof, best: BEST, majorityBaseline: { verdict: majority.v, accuracy: majority.n / allPairs.length }, goldCounts: Object.fromEntries(VERDICTS.map((v) => [v, count(v)])), p3Thresholds: thresholds.P3, cells });
console.table(summary);
console.log(JSON.stringify(proof, null, 1));
