// Eval 2: which model ranks the skills a game trains, against the jury gold. Writers take one library of 9 per call.
import { GAME_SKILLS, normalizeTitle, type CallInfo, type GameSkill } from "../../lib/breakdown.ts";
import { jevGameSkills, topSkills, type SkillLevels } from "../../lib/jev-breakdown.ts";
import {
  WRITERS, addSpend, gated, mean, meanDefined, providerOptionsFor, readData, sameSet, spearman, vec, writeOut,
  type Gold, type Library, type Wiki,
} from "./common.ts";
import { breakdownGames, type GameBreakdown } from "./writer.ts";

const RUNS = 2;
const libraries = readData<Library[]>("libraries");
const wiki = new Map(readData<Wiki[]>("wiki").map((w) => [w.title, w.summary]));
const gold = readData<Gold>("gold");
const titles = [...new Map(libraries.flatMap((l) => l.titles).map((t) => [normalizeTitle(t), t])).values()];

type WriterRun = { games?: GameBreakdown[]; info?: CallInfo; error?: string };
type JevRun = { levels?: SkillLevels; ms: number; cost: number; error?: string };
export const writerRuns: Record<string, WriterRun[][]> = {}; // model -> run -> library index
export const jevRuns: Record<string, Record<string, JevRun>[]> = {}; // variant -> run -> title

const tasks: Promise<void>[] = [];
for (const model of WRITERS) {
  writerRuns[model] = Array.from({ length: RUNS }, () => libraries.map(() => ({})));
  for (let run = 0; run < RUNS; run++)
    libraries.forEach((lib, i) => {
      tasks.push(
        (async () => {
          let info: CallInfo | undefined;
          const out = await gated(
            () => breakdownGames(lib.titles, { model, providerOptions: providerOptionsFor(model), onCall: (c) => (info = c) }),
            3,
          );
          if (info) addSpend("games", info.cost);
          (writerRuns[model] as WriterRun[][])[run]![i] = out.ok ? { games: out.value, info } : { error: out.error, info };
        })(),
      );
    });
}
for (const variant of ["jev-title", "jev-wiki"]) {
  jevRuns[variant] = Array.from({ length: RUNS }, () => ({}));
  for (let run = 0; run < RUNS; run++)
    for (const title of titles)
      tasks.push(
        (async () => {
          const out = await gated(() => jevGameSkills(title, variant === "jev-wiki" ? (wiki.get(title) ?? undefined) : undefined));
          if (out.ok) addSpend("games", out.value.info.cost);
          (jevRuns[variant] as Record<string, JevRun>[])[run]![title] = out.ok
            ? { levels: out.value.levels, ms: out.value.info.ms, cost: out.value.info.cost }
            : { ms: NaN, cost: 0, error: out.error };
        })(),
      );
}
await Promise.all(tasks);

type Instance = { pred: GameSkill[]; levels?: SkillLevels; gold: Gold["games"][string] };
const rankVector = (pred: GameSkill[]) => GAME_SKILLS.map((s) => [3, 2, 1][pred.indexOf(s)] ?? 0);

function score(instances: Instance[][]) {
  // instances[run][k] describes the same game in each run; a missing entry means that call errored.
  const flat = instances.flat().filter((x) => x);
  const goldTop = (x: Instance) => topSkills(x.gold.levels, 1)[0];
  return {
    n: flat.length,
    top3Overlap: mean(flat.map((x) => x.pred.filter((s) => x.gold.top3.includes(s)).length / 3)),
    top1Exact: mean(flat.map((x) => (x.pred[0] === goldTop(x) ? 1 : 0))),
    top1InGold3: mean(flat.map((x) => (x.pred[0] && x.gold.top3.includes(x.pred[0]) ? 1 : 0))),
    spearman: meanDefined(flat.map((x) => spearman(x.levels ? vec(x.levels) : rankVector(x.pred), vec(x.gold.levels)))),
  };
}
const stable = (a: (Instance | undefined)[], b: (Instance | undefined)[]) =>
  mean(a.flatMap((x, i) => (x && b[i] ? [sameSet(x.pred, b[i]!.pred) ? 1 : 0] : [])));

const summary: Record<string, unknown>[] = [];
for (const model of WRITERS) {
  const runs = writerRuns[model] as WriterRun[][];
  const perRun = runs.map((libs) =>
    libs.flatMap((lib, i) =>
      (lib.games ?? []).map((g, k) => ({ pred: g.skills as GameSkill[], gold: gold.games[(libraries[i] as Library).titles[k] as string] as Gold["games"][string] })),
    ),
  );
  const all = runs.flat();
  summary.push({
    candidate: model,
    ...score(perRun),
    stableTop3: stable(perRun[0] as Instance[], perRun[1] as Instance[]),
    msPerLibrary: mean(all.filter((l) => l.games && l.info).map((l) => (l.info as CallInfo).ms)),
    costPerLibrary: mean(all.filter((l) => l.info).map((l) => (l.info as CallInfo).cost)),
    errors: all.filter((l) => l.error).length,
  });
}
for (const variant of ["jev-title", "jev-wiki"]) {
  const runs = jevRuns[variant] as Record<string, JevRun>[];
  const perRun = runs.map((byTitle) =>
    libraries.flatMap((lib) =>
      lib.titles.flatMap((t) => {
        const r = byTitle[t];
        return r?.levels ? [{ pred: topSkills(r.levels), levels: r.levels, gold: gold.games[t] as Gold["games"][string] }] : [];
      }),
    ),
  );
  const libStats = runs.flatMap((byTitle) =>
    libraries.map((lib) => ({
      ms: Math.max(...lib.titles.map((t) => byTitle[t]?.ms ?? NaN)),
      cost: lib.titles.reduce((n, t) => n + (byTitle[t]?.cost ?? 0), 0),
    })),
  );
  summary.push({
    candidate: variant,
    ...score(perRun),
    stableTop3: stable(perRun[0] as Instance[], perRun[1] as Instance[]),
    msPerLibrary: mean(libStats.map((l) => l.ms).filter((x) => !Number.isNaN(x))),
    costPerLibrary: mean(libStats.map((l) => l.cost)),
    errors: runs.flatMap((r) => Object.values(r)).filter((r) => r.error).length,
  });
}
writeOut("games", { summary, writerRuns, jevRuns });
console.table(summary);
