// Full-data cut points for the F3 judge: every F3 percent in out/e2e2.json (both runs) against its gold verdict.
// Prints the two raw cut points that lib/fit.ts stores as JEV_STRETCH_RAW and JEV_MATCH_RAW. No gateway calls.
import { at, fitThresholds, macroF1, mean, pairKey, readData, readOut, type Gold, type Job, type Library, type Verdict } from "./common.ts";

const libraries = readData<Library[]>("libraries");
const jobs = readData<Job[]>("jobs");
const gold = readData<Gold>("gold");
type Cell = { percent: number; error?: string };
const f3 = readOut<{ cells: Record<string, Cell[][][]> }>("e2e2").cells.F3 as Cell[][][];

const rows: { percent: number; gold: Verdict }[] = [];
for (const run of f3)
  libraries.forEach((lib, li) =>
    jobs.forEach((job, ji) => {
      const pair = gold.pairs[pairKey(lib.id, job.url)];
      const cell = run[li]?.[ji];
      if (pair && cell && !cell.error) rows.push({ percent: cell.percent, gold: pair.verdict });
    }),
  );

const best = fitThresholds(rows);
const pred = rows.map((r) => at(r.percent, best));
console.log(`pairs ${rows.length} (both runs)`);
console.log(`JEV_STRETCH_RAW ${best.stretchAt}  JEV_MATCH_RAW ${best.matchAt}`);
console.log(`in-sample accuracy ${mean(pred.map((p, i) => (p === rows[i]?.gold ? 1 : 0))).toFixed(3)}  macro-F1 ${macroF1(pred, rows.map((r) => r.gold)).toFixed(3)}`);
