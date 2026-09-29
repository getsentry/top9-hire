// Shared plumbing for the evals: data files, the gateway gate (6 in flight, one retry, spend cap), and stats.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { experimental_evaluate as evaluate } from "ai";
import { GAME_SKILLS, type GameSkill } from "../../lib/breakdown.ts";
import type { EvaluationAnswers } from "../../lib/classify.ts";
import { choiceFor } from "../../lib/fit.ts";
import { EVALUATE_MODEL } from "../../lib/models.ts";
import { fitQuestions, rowsFromAnswers, scoreFit, type GameBreakdown, type JobBreakdown } from "./writer.ts";

export const WRITERS = [
  "openai/gpt-5.4-mini",
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-fast",
  "google/gemini-3.8-flash",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-5.5",
  "spacexai/grok-4.1-fast-non-reasoning",
];
/** Low reasoning for Gemini, whose default thinking dominates latency. */
export const providerOptionsFor = (model: string) =>
  model.startsWith("google/gemini-3.8") ? { google: { thinkingConfig: { thinkingLevel: "low" } } } : undefined;
export const JURY = ["anthropic/claude-opus-5.5", "openai/gpt-6.1-sol", "spacexai/grok-4.7"];

const dir = new URL("./", import.meta.url);
export const readData = <T>(name: string): T => JSON.parse(readFileSync(new URL(`data/${name}.json`, dir), "utf8"));
export const readOut = <T>(name: string): T => JSON.parse(readFileSync(new URL(`out/${name}.json`, dir), "utf8"));
export function writeOut(name: string, value: unknown): void {
  mkdirSync(new URL("out/", dir), { recursive: true });
  writeFileSync(new URL(`out/${name}.json`, dir), JSON.stringify(value, null, 1) + "\n");
}
export const hasData = (name: string) => existsSync(new URL(`data/${name}.json`, dir));
export function writeData(name: string, value: unknown): void {
  writeFileSync(new URL(`data/${name}.json`, dir), JSON.stringify(value, null, 1) + "\n");
}

export type Library = { id: string; source: "card" | "fixture"; titles: string[]; intended?: string; jobUrl?: string };
export type Job = { url: string; org: string; title: string; description: string };
export type Wiki = { title: string; page: string | null; summary: string | null };
export type Gold = {
  games: Record<string, { levels: Record<GameSkill, number>; top3: GameSkill[] }>;
  jobs: Record<string, { needs: Record<GameSkill, number>; top3: GameSkill[]; wants: string | null }>;
  pairs: Record<string, { verdict: Verdict; fit: number; votes: Verdict[] }>;
  agreement: Record<string, number>;
};
export type Verdict = "match" | "stretch" | "mismatch";
export const VERDICTS: Verdict[] = ["mismatch", "stretch", "match"];

export const pairKey = (libraryId: string, jobUrl: string) => `${libraryId}|${jobUrl}`;

const SPEND_FILE = new URL("out/spend.json", dir);
const HARD_CAP = 14.5;
/** Adds gateway cost in USD to the running total (also persisted across scripts) and stops the run past the cap. */
export function addSpend(label: string, usd: number): void {
  let spend: { total: number; byLabel: Record<string, number> } = { total: 0, byLabel: {} };
  if (existsSync(SPEND_FILE)) spend = JSON.parse(readFileSync(SPEND_FILE, "utf8"));
  spend.total += usd;
  spend.byLabel[label] = (spend.byLabel[label] ?? 0) + usd;
  mkdirSync(new URL("out/", dir), { recursive: true });
  writeFileSync(SPEND_FILE, JSON.stringify(spend, null, 1));
  if (spend.total > HARD_CAP) {
    console.error(`Spend cap reached: $${spend.total.toFixed(2)}`);
    process.exit(3);
  }
}
export const gatewayCost = (result: { providerMetadata?: unknown }): number =>
  Number((result.providerMetadata as { gateway?: { cost?: string } } | undefined)?.gateway?.cost ?? 0) || 0;

/** Weighted gate: at most 6 gateway calls in flight across the process. */
const LIMIT = 6;
let inFlight = 0;
const waiting: { weight: number; go: () => void }[] = [];
async function acquire(weight: number): Promise<void> {
  if (inFlight + weight <= LIMIT) {
    inFlight += weight;
    return;
  }
  await new Promise<void>((go) => waiting.push({ weight, go }));
}
function release(weight: number): void {
  inFlight -= weight;
  while (waiting.length > 0 && inFlight + (waiting[0] as { weight: number }).weight <= LIMIT) {
    const next = waiting.shift() as { weight: number; go: () => void };
    inFlight += next.weight;
    next.go();
  }
}
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };
/** Runs one gateway task holding `weight` slots (a task that fans out to 3 calls weighs 3). Retries once; never throws. */
export async function gated<T>(fn: () => Promise<T>, weight = 1): Promise<Outcome<T>> {
  await acquire(weight);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return { ok: true, value: await fn() };
      } catch (error) {
        if (attempt >= 1) return { ok: false, error: String((error as Error).message).slice(0, 200) };
      }
    }
  } finally {
    release(weight);
  }
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
}
function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && (order[j + 1] as { x: number }).x === (order[i] as { x: number }).x) j++;
    for (let k = i; k <= j; k++) out[(order[k] as { i: number }).i] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}
/** Spearman rank correlation; NaN when either side is constant. */
export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = (ra[i] as number) - ma;
    const y = (rb[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db);
}
export const meanDefined = (xs: number[]) => mean(xs.filter((x) => !Number.isNaN(x)));

/** Quadratic weighted kappa over the ordered verdicts. */
export function weightedKappa(a: Verdict[], b: Verdict[]): number {
  const n = a.length;
  const k = VERDICTS.length;
  const obs = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const rowA = new Array<number>(k).fill(0);
  const rowB = new Array<number>(k).fill(0);
  a.forEach((v, i) => {
    const x = VERDICTS.indexOf(v);
    const y = VERDICTS.indexOf(b[i] as Verdict);
    (obs[x] as number[])[y]! += 1;
    rowA[x]! += 1;
    rowB[y]! += 1;
  });
  let observed = 0;
  let expected = 0;
  for (let x = 0; x < k; x++)
    for (let y = 0; y < k; y++) {
      const w = ((x - y) / (k - 1)) ** 2;
      observed += (w * (obs[x] as number[])[y]!) / n;
      expected += (w * (rowA[x] as number) * (rowB[y] as number)) / (n * n);
    }
  return expected === 0 ? NaN : 1 - observed / expected;
}
export const jaccard = <T>(a: T[], b: T[]) => {
  const x = new Set(a);
  const y = new Set(b);
  const union = new Set([...x, ...y]).size;
  return union === 0 ? 1 : [...x].filter((v) => y.has(v)).length / union;
};
export const vec = (levels: Record<GameSkill, number>) => GAME_SKILLS.map((s) => levels[s]);
export const sameSet = <T>(a: T[], b: T[]) => a.length === b.length && a.every((v) => b.includes(v));
export const fmt = (n: number | null, digits = 2) => (n === null || Number.isNaN(n) ? "n/a" : n.toFixed(digits));

/** Same call as the writer-era evaluateFit (scripts/evals/writer.ts), with the gateway cost and latency the app does not surface. */
export async function fit(gs: GameBreakdown[], job: JobBreakdown) {
  const started = Date.now();
  const result = await evaluate({
    model: EVALUATE_MODEL,
    state: { games: gs, job: { title: job.title, level: job.level, work: job.work, team: job.team } },
    questions: fitQuestions(job),
  });
  const cost = gatewayCost(result);
  addSpend("e2e.fit", cost);
  const score = scoreFit(rowsFromAnswers(result.answers as EvaluationAnswers, job));
  return { percent: score.percent, choice: score.choice, ms: Date.now() - started, cost };
}


export function macroF1(pred: Verdict[], truth: Verdict[]): number {
  return mean(
    VERDICTS.map((v) => {
      const tp = pred.filter((p, i) => p === v && truth[i] === v).length;
      const fp = pred.filter((p, i) => p === v && truth[i] !== v).length;
      const fn = pred.filter((p, i) => p !== v && truth[i] === v).length;
      return tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
    }),
  );
}
export const at = (percent: number, t: { matchAt: number; stretchAt: number }): Verdict => choiceFor(percent, false, t.matchAt, t.stretchAt);
/** Thresholds that maximise macro-F1 on the given rows; ties go to the lowest thresholds. */
export function fitThresholds(rows: { percent: number; gold: Verdict }[]) {
  let best = { matchAt: 101, stretchAt: 0, f1: -1 };
  const truth = rows.map((r) => r.gold);
  for (let stretchAt = 0; stretchAt <= 100; stretchAt++)
    for (let matchAt = stretchAt; matchAt <= 101; matchAt++) {
      const f1 = macroF1(rows.map((r) => at(r.percent, { matchAt, stretchAt })), truth);
      if (f1 > best.f1) best = { matchAt, stretchAt, f1 };
    }
  return best;
}
