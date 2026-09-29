// Eval 3: Jev job needs against the jury gold; writer job breakdowns for run-to-run stability, time and cost.
import type { CallInfo, GameSkill } from "../../lib/breakdown.ts";
import { jevJobNeeds, topSkills, type SkillLevels } from "../../lib/jev-breakdown.ts";
import { WRITERS, addSpend, gated, jaccard, mean, meanDefined, providerOptionsFor, readData, sameSet, spearman, vec, writeOut, type Gold, type Job } from "./common.ts";
import { breakdownJob, type JobBreakdown } from "./writer.ts";

const RUNS = 2;
const jobs = readData<Job[]>("jobs");
const gold = readData<Gold>("gold");

type JevRun = { needs?: SkillLevels; wants?: string; info?: CallInfo; error?: string };
type WriterRun = { job?: JobBreakdown; info?: CallInfo; error?: string };
export const jevRuns: JevRun[][] = Array.from({ length: RUNS }, () => jobs.map(() => ({})));
export const writerRuns: Record<string, WriterRun[][]> = {}; // model -> run -> job index

const tasks: Promise<void>[] = [];
for (let run = 0; run < RUNS; run++)
  jobs.forEach((job, i) =>
    tasks.push(
      (async () => {
        const out = await gated(() => jevJobNeeds(job));
        if (out.ok) addSpend("jobs", out.value.info.cost);
        (jevRuns[run] as JevRun[])[i] = out.ok ? out.value : { error: out.error };
      })(),
    ),
  );
for (const model of WRITERS) {
  writerRuns[model] = Array.from({ length: RUNS }, () => jobs.map(() => ({})));
  for (let run = 0; run < RUNS; run++)
    jobs.forEach((job, i) =>
      tasks.push(
        (async () => {
          let info: CallInfo | undefined;
          const out = await gated(() =>
            breakdownJob({ url: job.url, title: job.title, description: job.description }, { model, providerOptions: providerOptionsFor(model), onCall: (c) => (info = c) }),
          );
          if (info) addSpend("jobs", info.cost);
          (writerRuns[model] as WriterRun[][])[run]![i] = out.ok ? { job: out.value, info } : { error: out.error, info };
        })(),
      ),
    );
}
await Promise.all(tasks);

const summary: Record<string, unknown>[] = [];
{
  const ok = jevRuns.flat().filter((r) => r.needs);
  const g = (i: number) => gold.jobs[(jobs[i] as Job).url] as Gold["jobs"][string];
  const each = jevRuns.flatMap((run) => run.map((r, i) => ({ r, gold: g(i) })).filter((x) => x.r.needs));
  const identical = jobs.map((_, i): number | undefined => {
    const a = jevRuns[0]![i]!;
    const b = jevRuns[1]![i]!;
    return a.needs && b.needs ? (sameSet(topSkills(a.needs), topSkills(b.needs)) ? 1 : 0) : undefined;
  }).filter((x): x is number => x !== undefined);
  const wants = each.filter((x) => x.gold.wants);
  summary.push({
    candidate: "jev-needs",
    spearman: meanDefined(each.map((x) => spearman(vec(x.r.needs as SkillLevels), vec(x.gold.needs)))),
    top3Overlap: mean(each.map((x) => topSkills(x.r.needs as SkillLevels).filter((s: GameSkill) => x.gold.top3.includes(s)).length / 3)),
    archetypeAgree: mean(wants.map((x) => (x.r.wants === x.gold.wants ? 1 : 0))),
    archetypeN: wants.length,
    identicalTop3: mean(identical),
    ms: mean(ok.map((r) => (r.info as CallInfo).ms)),
    cost: mean(ok.map((r) => (r.info as CallInfo).cost)),
    errors: jevRuns.flat().filter((r) => r.error).length,
  });
}
for (const model of WRITERS) {
  const runs = writerRuns[model] as WriterRun[][];
  const pairs = jobs.map((_, i) => [runs[0]![i]!, runs[1]![i]!] as const).filter(([a, b]) => a.job && b.job);
  const ids = (j: JobBreakdown) => j.requirements.map((r) => r.id);
  const musts = (j: JobBreakdown) => j.requirements.filter((r) => r.kind === "must").map((r) => r.id);
  const all = runs.flat();
  const wants = runs.flatMap((run) => run.map((r, i) => ({ r, gold: gold.jobs[(jobs[i] as Job).url]?.wants })).filter((x) => x.r.job && x.gold));
  summary.push({
    candidate: model,
    jaccardIds: mean(pairs.map(([a, b]) => jaccard(ids(a.job as JobBreakdown), ids(b.job as JobBreakdown)))),
    jaccardMust: mean(pairs.map(([a, b]) => jaccard(musts(a.job as JobBreakdown), musts(b.job as JobBreakdown)))),
    archetypeAgree: mean(wants.map((x) => ((x.r.job as JobBreakdown).wants === x.gold ? 1 : 0))),
    ms: mean(all.filter((r) => r.job && r.info).map((r) => (r.info as CallInfo).ms)),
    cost: mean(all.filter((r) => r.info).map((r) => (r.info as CallInfo).cost)),
    errors: all.filter((r) => r.error).length,
  });
}
writeOut("jobs", { summary, jevRuns, writerRuns });
console.table(summary);
