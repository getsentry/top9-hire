// Eval 1: vision models read the 3x3 card image. Same prompt and schema as lib/extract.ts, with cost read from the gateway.
import { generateText, Output } from "ai";
import { readFileSync } from "node:fs";
import { normalizeTitle } from "../../lib/breakdown.ts";
import { EXTRACT_PROMPT, extractSchema } from "../../lib/extract.ts";
import { WRITERS, addSpend, gated, gatewayCost, mean, percentile, providerOptionsFor, readData, writeOut } from "./common.ts";

const MODELS = [...WRITERS, "google/gemini-3.5-flash-lite"];
const RUNS = 2;
const cards = readData<Record<string, { image: string; titles: string[] }>>("cards");

/** A prefix match where one side is a truncation of the other counts as correct. */
export function sameTitle(a: string, b: string): boolean {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  return x === y || (x.length > 0 && y.length > 0 && (x.startsWith(y) || y.startsWith(x)));
}

type Row = { model: string; card: string; run: number; correct: number; ms: number; cost: number; error?: string };
const rows: Row[] = [];
const root = new URL("../../", import.meta.url);

await Promise.all(
  MODELS.flatMap((model) =>
    Object.entries(cards).flatMap(([card, { image, titles }]) =>
      Array.from({ length: RUNS }, (_, run) =>
        (async () => {
          const bytes = new Uint8Array(readFileSync(new URL(image, root)));
          const out = await gated(async () => {
            const started = Date.now();
            const result = await generateText({
              model,
              providerOptions: providerOptionsFor(model),
              messages: [{ role: "user", content: [{ type: "text", text: EXTRACT_PROMPT }, { type: "file", data: bytes, mediaType: "image/jpeg" }] }],
              output: Output.object({ schema: extractSchema, name: "top9_extracted_games" }),
            });
            const cost = gatewayCost(result);
            addSpend("extract", cost);
            const games = extractSchema.parse(result.output).games;
            return { ms: Date.now() - started, cost, correct: games.filter((g, i) => sameTitle(g, titles[i] as string)).length };
          });
          rows.push(out.ok ? { model, card, run, ...out.value } : { model, card, run, correct: 0, ms: NaN, cost: 0, error: out.error });
        })(),
      ),
    ),
  ),
);

const summary = MODELS.map((model) => {
  const mine = rows.filter((r) => r.model === model);
  const ok = mine.filter((r) => !r.error);
  return {
    model,
    correct: mine.reduce((n, r) => n + r.correct, 0),
    total: Object.keys(cards).length * 9 * RUNS,
    errors: mine.length - ok.length,
    p50Ms: percentile(ok.map((r) => r.ms), 50),
    p90Ms: percentile(ok.map((r) => r.ms), 90),
    costPerCard: mean(ok.map((r) => r.cost)),
  };
});
writeOut("extract", { summary, rows });
console.table(summary);
