// Renders out/summary.md from the eval outputs. Findings live in out/findings.md and are appended when present.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fmt, readData, readOut, type Gold } from "./common.ts";

type Row = Record<string, string | number>;
const table = (rows: Row[], columns: [string, string, (v: never) => string][]) =>
  [
    `| ${columns.map((c) => c[0]).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${columns.map(([, key, f]) => f(r[key] as never)).join(" | ")} |`),
  ].join("\n");
const s = (v: string | number) => String(v);
const n2 = (v: number) => fmt(v, 2);
const pct = (v: number | null) => (v === null || Number.isNaN(v) ? "n/a" : fmt(v * 100, 0) + "%");
const ms = (v: number) => fmt(v, 0);
const usd = (v: number) => "$" + fmt(v, 4);

const gold = readData<Gold>("gold");
const a = gold.agreement as Record<string, number>;
const extract = readOut<{ summary: Row[]; rows: { model: string; correct: number }[] }>("extract");
const games = readOut<{ summary: Row[] }>("games");
const jobs = readOut<{ summary: Row[] }>("jobs");
const e2e = readOut<{ summary: Row[]; proof: { case: string; intended: string; gold: string; results: Record<string, string[]> }[] }>("e2e2");
const base = readOut<{ goldCounts: Record<string, number>; majorityBaseline: { verdict: string; accuracy: number } }>("e2e");
const spend = readOut<{ total: number; byLabel: Record<string, number> }>("spend");

const out: string[] = ["# Eval summary", ""];
out.push("## Jury agreement (the ceiling)", "");
out.push(
  `Jurors: opus-5.5, gpt-6.1-sol, grok-4.7. ${a.gamesScored} games, ${a.jobsScored} jobs, ${a.pairsScored} pairs scored.`,
  "",
  `- Games: mean pairwise Spearman of the 8-skill vector ${n2(a.gameSpearman as number)}`,
  `- Jobs: mean pairwise Spearman of the need vector ${n2(a.jobSpearman as number)}; archetype pairwise agreement ${pct(a.jobArchetypeAgree as number)}`,
  `- Pairs: verdict pairwise agreement ${pct(a.pairVerdictAgree as number)}; quadratic weighted kappa ${n2(a.pairWeightedKappa as number)}; fit Spearman ${n2(a.pairFitSpearman as number)}`,
  `- Gold verdict counts: ${Object.entries(base.goldCounts).map(([k, v]) => `${k} ${v}`).join(", ")}; majority-class baseline accuracy ${pct(base.majorityBaseline.accuracy)} (${base.majorityBaseline.verdict})`,
  "",
);
out.push("## 1. Extract (7 cards x 2 runs, titles correct out of 63 per run)", "");
const extractRows = extract.summary.map((r) => ({ ...r, correctPerRun: (r.correct as number) / 2 }));
out.push(table(extractRows, [["Model", "model", s], ["Correct /63", "correctPerRun", (v: number) => fmt(v, 1)], ["p50 ms", "p50Ms", ms], ["p90 ms", "p90Ms", ms], ["$/card", "costPerCard", usd], ["Errors", "errors", s]]), "");
out.push("## 2. Games (10 libraries x 2 runs, against jury gold)", "");
out.push(
  table(games.summary, [
    ["Candidate", "candidate", s], ["Top-3 overlap", "top3Overlap", n2], ["Top-1 = gold top-1", "top1Exact", pct], ["Top-1 in gold top-3", "top1InGold3", pct],
    ["Spearman", "spearman", n2], ["Same top-3 across runs", "stableTop3", pct], ["ms/library", "msPerLibrary", ms], ["$/library", "costPerLibrary", usd], ["Errors", "errors", s],
  ]),
  "",
);
out.push("## 3. Jobs", "", "Jev needs vs gold (16 jobs x 2 runs):", "");
const jev = jobs.summary.filter((r) => r.candidate === "jev-needs");
out.push(table(jev, [["Candidate", "candidate", s], ["Need Spearman", "spearman", n2], ["Top-3 overlap", "top3Overlap", n2], ["Archetype = jury majority", "archetypeAgree", pct], ["Jobs with majority", "archetypeN", (v: number) => s(v / 2)], ["Same top-3 across runs", "identicalTop3", pct], ["ms", "ms", ms], ["$/job", "cost", usd], ["Errors", "errors", s]]), "");
out.push("Writer job breakdowns (stability only):", "");
out.push(table(jobs.summary.filter((r) => r.candidate !== "jev-needs"), [["Model", "candidate", s], ["Jaccard req ids", "jaccardIds", n2], ["Jaccard must ids", "jaccardMust", n2], ["Archetype = jury majority", "archetypeAgree", pct], ["ms", "ms", ms], ["$/job", "cost", usd], ["Errors", "errors", s]]), "");
out.push("## 4. End to end (160 pairs x 2 runs, thresholds by 2-fold cross-validation split by job, chosen for macro-F1)", "");
out.push(
  table(e2e.summary, [
    ["Pipeline", "pipeline", s], ["Verdict accuracy", "accuracy", pct], ["Macro-F1", "macroF1", n2], ["QW kappa", "kappa", n2], ["Spearman fit (primary)", "spearmanFit", n2],
    ["Fit MAE (pts)", "maeFit", (v: number) => fmt(v, 1)], ["Verdict flip rate", "flipRate", pct], ["Cold ms/pair", "coldMsPerPair", ms], ["$/cold pair", "costPerColdPair", usd], ["Errors", "errors", s],
  ]),
  "",
  "Cold ms is the wait of a first-time user: P0 to P2 as before (games and job in parallel, then fit). F1, F2 and F4 add Jev game reads and the Jev job read (parallel), then their own step. F3 reads only the cached wiki text and the posting, so its cold ms is one Jev call. Wiki lookups are assumed cached. MAE compares the raw fit percent, not calibrated. P0 to P2 rescoring uses their saved percents and ignores the must-row cap of scoreFit.",
  "",
  "Proof cases (verdict with CV thresholds, percent, landed on intended side; run 1 / run 2):",
  "",
);
out.push(
  table(
    e2e.proof.map((p) => ({ case: `${p.case} (intended ${p.intended}, gold ${p.gold})`, ...Object.fromEntries(Object.entries(p.results).map(([k, v]) => [k, v.join(" / ")])) })),
    [["Case", "case", s], ["P0", "P0", s], ["P1", "P1", s], ["P2", "P2", s], ["P3", "P3", s], ["F1", "F1", s], ["F2", "F2", s], ["F3", "F3", s], ["F4", "F4", s]],
  ),
  "",
);
out.push(`Gateway spend for the whole suite: $${fmt(spend.total, 2)} (${Object.entries(spend.byLabel).map(([k, v]) => `${k} $${fmt(v, 2)}`).join(", ")})`, "");
const findings = new URL("out/findings.md", import.meta.url);
if (existsSync(findings)) out.push(readFileSync(findings, "utf8"));
writeFileSync(new URL("out/summary.md", import.meta.url), out.join("\n"));
