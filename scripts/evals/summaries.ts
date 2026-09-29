// Eval 5: can a model write the game summary instead of Wikipedia? Three parts (skills, fit, invented facts) plus a latency baseline.
// Variants: title (no summary), wiki (production), gen:<model> (one text call per library), vision:<model> (summary written in the card extract call).
import { generateText, Output, type ModelMessage } from "ai";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { GAME_SKILLS, normalizeTitle, type GameSkill } from "../../lib/breakdown.ts";
import { EXTRACT_PROMPT, extractSchema } from "../../lib/extract.ts";
import { JEV_MATCH_RAW, JEV_STRETCH_RAW, calibrate, choiceFor } from "../../lib/fit.ts";
import { JEV_STATE_CHARS, askJev, expectedLevel, jevGameSkills, topSkills, type SkillLevels } from "../../lib/jev-breakdown.ts";
import { clip } from "../../lib/text.ts";
import { fetchSummary } from "../../lib/wiki.ts";
import {
  addSpend, fmt, gated, gatewayCost, macroF1, mean, meanDefined, pairKey, percentile, readData, sameSet, spearman, vec, weightedKappa, writeOut,
  type Gold, type Job, type Library, type Verdict, type Wiki,
} from "./common.ts";

const RUNS = 2;
const LOCAL_CAP = 3.0;
const GEN_MODELS = ["google/gemini-3.1-flash-lite", "google/gemini-3.5-flash-lite", "openai/gpt-5.4-mini", "alibaba/qwen3.8-flash"];
const VISION_MODELS = ["google/gemini-3.1-flash-lite", "google/gemini-3.5-flash-lite", "openai/gpt-5.4-mini"];
const JUDGE_MODEL = "anthropic/claude-haiku-4.5";
const SUMMARY_MAX = 600;

const libraries = readData<Library[]>("libraries");
const jobs = readData<Job[]>("jobs");
const gold = readData<Gold>("gold");
const cards = readData<Record<string, { image: string; titles: string[] }>>("cards");
const wiki = new Map(readData<Wiki[]>("wiki").map((w) => [w.title, w.summary ?? ""]));
const root = new URL("../../", import.meta.url);

// This script's own spend; common.ts HARD_CAP is cumulative across scripts and stays as is.
let localSpend = 0;
function spend(label: string, usd: number): void {
  localSpend += usd;
  addSpend(`summaries.${label}`, usd);
  if (localSpend > LOCAL_CAP) {
    console.error(`Local spend guard: $${localSpend.toFixed(2)} passed $${LOCAL_CAP.toFixed(2)}`);
    process.exit(4);
  }
}

/** Lowest reasoning each provider takes. Gemini 3 flash-lite has a "minimal" thinking level; gpt-5.4 takes "none"; Qwen thinking is a flag. */
const optionsFor = (model: string): Record<string, Record<string, unknown>> | undefined =>
  model.startsWith("google/")
    ? { google: { thinkingConfig: { thinkingLevel: "minimal" } } }
    : model.startsWith("openai/")
      ? { openai: { reasoningEffort: "none" } }
      : model.startsWith("alibaba/")
        ? { alibaba: { enableThinking: false } }
        : undefined;

const SUMMARY_INSTRUCTION = `write what the first two or three sentences of its English Wikipedia article would say: genre, setting, core gameplay loop, and how it is played (solo, co-op, or competitive). At most ${SUMMARY_MAX} characters. Plain facts, no opinions. If you do not know the game with confidence, set known to false and summary to an empty string.`;
const genSchema = z.object({ games: z.array(z.object({ title: z.string(), known: z.boolean(), summary: z.string() })) });
type GenGame = z.infer<typeof genSchema>["games"][number];
const genPrompt = (titles: string[]) =>
  `For each game title below, ${SUMMARY_INSTRUCTION} Return one entry per title, in the same order.\n\n${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
const visionPrompt = `${EXTRACT_PROMPT}\n\nAlso, for each of the nine games, ${SUMMARY_INSTRUCTION} Return one entry per game, in grid order, with the title as read from the card.`;

type Call<T> = { value: T; ms: number; cost: number; output: number };
async function textCall<T>(label: string, model: string, messages: ModelMessage[], schema: z.ZodType<T>, name: string): Promise<Call<T>> {
  const started = Date.now();
  const result = await generateText({ model, providerOptions: optionsFor(model) as never, messages, output: Output.object({ schema, name }) });
  const cost = gatewayCost(result);
  spend(label, cost);
  return { value: schema.parse(result.output), ms: Date.now() - started, cost, output: result.usage.outputTokens ?? 0 };
}
type Row<T> = { value?: T; ms: number; cost: number; output: number; error?: string };
async function row<T>(label: string, model: string, messages: ModelMessage[], schema: z.ZodType<T>, name: string, check?: (v: T) => void): Promise<Row<T>> {
  const out = await gated(async () => {
    const call = await textCall(label, model, messages, schema, name);
    check?.(call.value);
    return call;
  });
  return out.ok ? { ...out.value, value: out.value.value } : { ms: NaN, cost: 0, output: 0, error: out.error };
}
const text = (content: string): ModelMessage[] => [{ role: "user", content }];
const sized = (n: number) => (v: { games: unknown[] }) => {
  if (v.games.length !== n) throw new Error(`expected ${n} games, got ${v.games.length}`);
};
const clipGen = (g: GenGame): GenGame => ({ ...g, summary: g.known ? clip(g.summary, SUMMARY_MAX) : "" });
const gamesOf = (r: Row<{ games: GenGame[] }>): Row<GenGame[]> => ({ ...r, value: r.value?.games.map(clipGen) });

/** A prefix match where one side is a truncation of the other counts as correct (same rule as extract.ts). */
const sameTitle = (a: string, b: string) => {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  return x === y || (x.length > 0 && y.length > 0 && (x.startsWith(y) || y.startsWith(x)));
};

// ---------- Real and invented titles for Part C2 ----------
const REAL_OBSCURE = ["Caves of Qud", "Hypnospace Outlaw", "Umurangi Generation", "Mosa Lina", "Pentiment", "Rain World", "Hardspace: Shipbreaker", "Chants of Sennaar"];
const INVENTED = ["Ashgrove Relay", "Tidewater Tactics", "Kestrel Protocol", "Saltmarsh Cartographer", "Lanternfall Odyssey", "Brindle & Moss"];
// Interleave so no call is all invented; two calls of 7.
const OBSCURE_ORDER = [...REAL_OBSCURE.slice(0, 6).flatMap((t, i) => [t, INVENTED[i] as string]), ...REAL_OBSCURE.slice(6)];
const OBSCURE_BATCHES = [OBSCURE_ORDER.slice(0, 7), OBSCURE_ORDER.slice(7)];

// ---------- Phase 1: generation, vision, latency baseline, obscure titles ----------
type Gen = Row<GenGame[]>;
const genRuns: Record<string, Gen[][]> = {}; // model -> run -> library
const obscureRuns: Record<string, Gen[][]> = {}; // model -> run -> batch
type Vision = { vision: Row<GenGame[]>; plain: Row<string[]>; visionCorrect: number; plainCorrect: number };
const visionRuns: Record<string, Vision[][]> = {}; // model -> run -> card index (in libraries order of cards)
const cardLibs = libraries.map((lib, li) => ({ lib, li })).filter(({ lib }) => cards[lib.id]);
const wikiMs: number[][] = Array.from({ length: RUNS }, () => []); // run -> per library max of 9 titles

const tasks: Promise<void>[] = [];
for (const model of GEN_MODELS) {
  genRuns[model] = Array.from({ length: RUNS }, () => libraries.map(() => ({ ms: NaN, cost: 0, output: 0 })));
  obscureRuns[model] = Array.from({ length: RUNS }, () => OBSCURE_BATCHES.map(() => ({ ms: NaN, cost: 0, output: 0 })));
  for (let run = 0; run < RUNS; run++) {
    libraries.forEach((lib, i) =>
      tasks.push(
        (async () => {
          const r = await row("gen", model, text(genPrompt(lib.titles)), genSchema, "top9_game_summaries", sized(lib.titles.length));
          genRuns[model]![run]![i] = gamesOf(r);
        })(),
      ),
    );
    OBSCURE_BATCHES.forEach((batch, b) =>
      tasks.push(
        (async () => {
          const r = await row("obscure", model, text(genPrompt(batch)), genSchema, "top9_game_summaries", sized(batch.length));
          obscureRuns[model]![run]![b] = gamesOf(r);
        })(),
      ),
    );
  }
}
for (const model of VISION_MODELS) {
  visionRuns[model] = Array.from({ length: RUNS }, () => []);
  for (let run = 0; run < RUNS; run++)
    cardLibs.forEach(({ lib }, ci) =>
      tasks.push(
        (async () => {
          const card = cards[lib.id] as { image: string; titles: string[] };
          const bytes = new Uint8Array(readFileSync(new URL(card.image, root)));
          const image = (prompt: string): ModelMessage[] => [{ role: "user", content: [{ type: "text", text: prompt }, { type: "file", data: bytes, mediaType: "image/jpeg" }] }];
          const [vision, plain] = await Promise.all([
            row("vision", model, image(visionPrompt), genSchema, "top9_extracted_games", sized(9)),
            row("vision.plain", model, image(EXTRACT_PROMPT), extractSchema, "top9_extracted_games"),
          ]);
          const visionRow = gamesOf(vision);
          const visionGames = visionRow.value;
          visionRuns[model]![run]![ci] = {
            vision: visionRow,
            plain: plain.value ? { ...plain, value: plain.value.games } : { ...plain, value: undefined },
            visionCorrect: visionGames ? visionGames.filter((g, i) => sameTitle(g.title, card.titles[i] as string)).length : 0,
            plainCorrect: plain.value ? plain.value.games.filter((g, i) => sameTitle(g, card.titles[i] as string)).length : 0,
          };
        })(),
      ),
    );
}
// Latency baseline: live fetchSummary for the 9 titles of a library in parallel, no cache; run libraries one at a time so they do not compete.
const wikiBaseline = (async () => {
  for (let run = 0; run < RUNS; run++)
    for (const lib of libraries) {
      const times = await Promise.all(
        lib.titles.map(async (t) => {
          const started = Date.now();
          try {
            await fetchSummary(t);
          } catch {}
          return Date.now() - started;
        }),
      );
      wikiMs[run]!.push(Math.max(...times));
    }
})();
const realWiki = new Map<string, string | null>();
const realWikiFetch = Promise.all(REAL_OBSCURE.map(async (t) => realWiki.set(t, await fetchSummary(t).catch(() => null))));
await Promise.all([...tasks, wikiBaseline, realWikiFetch]);

const genOk = (model: string) => genRuns[model]!.flat().some((r) => r.value);
const droppedModels = GEN_MODELS.filter((m) => !genOk(m));
const genModels = GEN_MODELS.filter(genOk);
const visionModels = VISION_MODELS.filter((m) => visionRuns[m]!.flat().some((v) => v.vision.value));
const droppedVision = VISION_MODELS.filter((m) => !visionModels.includes(m));
if (droppedModels.length) console.error(`Dropped gen models (no successful call): ${droppedModels.join(", ")}`);
if (droppedVision.length) console.error(`Dropped vision models (no successful call): ${droppedVision.join(", ")}`);

// ---------- Part A: game skills vs the jury gold ----------
type Read = { title: string; summary: string; goldTitle: string };
/** The (title, summary) each variant hands Jev for game k of library li in a run; undefined when its upstream call failed. */
function readFor(variant: string, run: number, li: number, k: number): Read | undefined {
  const lib = libraries[li] as Library;
  const goldTitle = lib.titles[k] as string;
  if (variant === "title") return { title: goldTitle, summary: "", goldTitle };
  if (variant === "wiki") return { title: goldTitle, summary: wiki.get(goldTitle) ?? "", goldTitle };
  if (variant.startsWith("gen:")) {
    const g = genRuns[variant.slice(4)]![run]![li]!.value?.[k];
    return g && { title: goldTitle, summary: g.summary, goldTitle };
  }
  const ci = cardLibs.findIndex((c) => c.li === li);
  if (ci < 0) return undefined;
  const g = visionRuns[variant.slice(7)]![run]![ci]!.vision.value?.[k];
  return g && { title: g.title, summary: g.summary, goldTitle };
}
const variantsA = ["title", "wiki", ...genModels.map((m) => `gen:${m}`), ...visionModels.map((m) => `vision:${m}`)];
type JevRead = { levels?: SkillLevels; error?: string };
const skillRuns: Record<string, JevRead[][][]> = {}; // variant -> run -> library -> game
const taskA: Promise<void>[] = [];
for (const variant of variantsA) {
  skillRuns[variant] = Array.from({ length: RUNS }, () => libraries.map((lib) => lib.titles.map((): JevRead => ({ error: "no upstream summary" }))));
  for (let run = 0; run < RUNS; run++)
    libraries.forEach((lib, li) =>
      lib.titles.forEach((_, k) => {
        const r = readFor(variant, run, li, k);
        if (!r) {
          if (!variant.startsWith("vision:") || cardLibs.some((c) => c.li === li)) return;
          skillRuns[variant]![run]![li]![k] = {}; // fixture libraries have no card; not an error
          return;
        }
        taskA.push(
          (async () => {
            const out = await gated(() => jevGameSkills(r.title, r.summary || undefined));
            if (out.ok) spend("skills", out.value.info.cost);
            skillRuns[variant]![run]![li]![k] = out.ok ? { levels: out.value.levels } : { error: out.error };
          })(),
        );
      }),
    );
}
await Promise.all(taskA);

type Instance = { pred: GameSkill[]; levels: SkillLevels; gold: Gold["games"][string] };
const rankOverlap = (x: Instance) => x.pred.filter((s) => x.gold.top3.includes(s)).length / 3;
function scoreSkills(variant: string) {
  const perRun = skillRuns[variant]!.map((libs) =>
    libs.flatMap((games, li) =>
      games.map((g, k): Instance | undefined =>
        g.levels ? { pred: topSkills(g.levels), levels: g.levels, gold: gold.games[(libraries[li] as Library).titles[k] as string] as Gold["games"][string] } : undefined,
      ),
    ),
  );
  const flat = perRun.flat().filter((x): x is Instance => Boolean(x));
  const a = perRun[0] as (Instance | undefined)[];
  const b = perRun[1] as (Instance | undefined)[];
  return {
    variant,
    n: flat.length,
    top3Overlap: mean(flat.map(rankOverlap)),
    top1Exact: mean(flat.map((x) => (x.pred[0] === topSkills(x.gold.levels, 1)[0] ? 1 : 0))),
    top1InGold3: mean(flat.map((x) => (x.pred[0] && x.gold.top3.includes(x.pred[0]) ? 1 : 0))),
    spearman: meanDefined(flat.map((x) => spearman(vec(x.levels), vec(x.gold.levels)))),
    stableTop3: mean(a.flatMap((x, i) => (x && b[i] ? [sameSet(x.pred, b[i]!.pred) ? 1 : 0] : []))),
    errors: skillRuns[variant]!.flat(2).filter((g) => g.error).length,
  };
}
const partA = variantsA.map(scoreSkills);

// ---------- Part B: F3 judge over the gold pairs ----------
const genCostPerLibrary = (model: string) => mean(genRuns[model]!.flat().filter((r) => r.value).map((r) => r.cost));
const bestGen = genModels
  .map((m) => ({ variant: `gen:${m}`, a: partA.find((r) => r.variant === `gen:${m}`)!, cost: genCostPerLibrary(m) }))
  .sort((x, y) => y.a.top3Overlap - x.a.top3Overlap || x.cost - y.cost)
  .slice(0, 2)
  .map((x) => x.variant);
const variantsB = ["title", "wiki", ...bestGen];
const FIT_LEVELS = [
  "This person's play style does not fit the day-to-day work",
  "The play style fits a little",
  "The play style fits well",
  "The play style fits very well",
];
// Same state and question as lib/fit.ts evaluateFit.
const fitQuestions = {
  fit: {
    type: "score" as const,
    instructions: "Judging only by how this person plays, how well does their play style fit the work this job does day to day?",
    criteria: FIT_LEVELS,
  },
};
const goldOf = (li: number, ji: number) => gold.pairs[pairKey((libraries[li] as Library).id, (jobs[ji] as Job).url)];
const pairs = libraries.flatMap((_, li) => jobs.map((__, ji) => ({ li, ji }))).filter(({ li, ji }) => goldOf(li, ji));
type Cell = { verdict?: Verdict; raw?: number; ms: number; cost: number; error?: string };
const fitRuns: Record<string, Cell[][]> = {}; // variant -> run -> pair index
const taskB: Promise<void>[] = [];
for (const variant of variantsB) {
  fitRuns[variant] = Array.from({ length: RUNS }, () => pairs.map((): Cell => ({ ms: NaN, cost: 0, error: "no upstream summary" })));
  for (let run = 0; run < RUNS; run++)
    pairs.forEach(({ li, ji }, p) => {
      const lib = libraries[li] as Library;
      const reads = lib.titles.map((_, k) => readFor(variant, run, li, k));
      if (reads.some((r) => !r)) return;
      const job = jobs[ji] as Job;
      const state = {
        games: reads.map((r) => ({ title: (r as Read).title, summary: (r as Read).summary })),
        job: { title: job.title, description: clip(job.description, JEV_STATE_CHARS) },
      };
      taskB.push(
        (async () => {
          const out = await gated(async () => {
            const { answers, info } = await askJev(state, fitQuestions, "top9.fit");
            spend("fit", info.cost);
            const raw = Math.round((100 * expectedLevel(answers.fit)) / 3);
            return { raw, verdict: choiceFor(calibrate(raw, JEV_STRETCH_RAW, JEV_MATCH_RAW), false) as Verdict, ms: info.ms, cost: info.cost };
          });
          fitRuns[variant]![run]![p] = out.ok ? out.value : { ms: NaN, cost: 0, error: out.error };
        })(),
      );
    });
}
await Promise.all(taskB);

const partB = variantsB.map((variant) => {
  const perRun = fitRuns[variant]!.map((cells) => {
    const ok = cells.map((c, p) => ({ c, p })).filter(({ c }) => c.verdict);
    const pred = ok.map(({ c }) => c.verdict as Verdict);
    const truth = ok.map(({ p }) => goldOf((pairs[p] as { li: number }).li, (pairs[p] as { ji: number }).ji)!.verdict);
    return { ok, f1: macroF1(pred, truth), kappa: weightedKappa(pred, truth), accuracy: mean(pred.map((v, i) => (v === truth[i] ? 1 : 0))) };
  });
  const agree = (other: Cell[][]) =>
    mean(
      fitRuns[variant]!.flatMap((cells, run) =>
        cells.flatMap((c, p) => {
          const o = other[run]![p]!;
          return c.verdict && o.verdict ? [c.verdict === o.verdict ? 1 : 0] : [];
        }),
      ),
    );
  const runAgree = mean(
    (fitRuns[variant]![0] as Cell[]).flatMap((c, p) => {
      const o = (fitRuns[variant]![1] as Cell[])[p] as Cell;
      return c.verdict && o.verdict ? [c.verdict === o.verdict ? 1 : 0] : [];
    }),
  );
  const cells = fitRuns[variant]!.flat().filter((c) => c.verdict);
  return {
    variant,
    n: cells.length,
    macroF1: mean(perRun.map((r) => r.f1)),
    kappa: meanDefined(perRun.map((r) => r.kappa)),
    accuracy: mean(perRun.map((r) => r.accuracy)),
    agreeWithWiki: variant === "wiki" ? NaN : agree(fitRuns.wiki as Cell[][]),
    runToRunAgree: runAgree,
    msPerPair: mean(cells.map((c) => c.ms)),
    costPerPair: mean(cells.map((c) => c.cost)),
    errors: fitRuns[variant]!.flat().filter((c) => c.error).length,
  };
});

// ---------- Part C: invented facts ----------
const judgeSchema = z.object({ items: z.array(z.object({ title: z.string(), contradicts: z.boolean(), note: z.string() })) });
type Item = z.infer<typeof judgeSchema>["items"][number];
type Pair = { title: string; reference: string; candidate: string };
/** One Haiku call for up to 9 pairs. Returns one item per pair, in order. */
async function judgePairs(label: string, batch: Pair[]): Promise<Row<Item[]>> {
  const prompt =
    "For each game below, compare the CANDIDATE summary to the WIKIPEDIA summary. Does the candidate contradict Wikipedia on genre, setting, core gameplay, or play mode (solo, co-op, competitive)? Extra or missing detail is not a contradiction; only a statement that conflicts with Wikipedia (or describes a different game) is. Give a short note, empty when there is no contradiction. Return one entry per game, in order.\n\n" +
    batch.map((p, i) => `${i + 1}. ${p.title}\nWIKIPEDIA: ${p.reference}\nCANDIDATE: ${p.candidate}`).join("\n\n");
  const r = await row(label, JUDGE_MODEL, text(prompt), judgeSchema, "top9_summary_judge", (v) => {
    if (v.items.length !== batch.length) throw new Error(`expected ${batch.length} items, got ${v.items.length}`);
  });
  return r.value ? { ...r, value: r.value.items } : { ...r, value: undefined };
}
type Verdicted = { model: string; title: string; contradicts: boolean; note: string; error?: string };

// C1: known games, run 0 of each gen model, judged against data/wiki.json.
const c1: Verdicted[] = [];
const c1Known: Record<string, { known: number; total: number }> = {};
const taskC: Promise<void>[] = [];
for (const model of genModels) {
  c1Known[model] = { known: 0, total: 0 };
  libraries.forEach((lib, li) => {
    const gen = genRuns[model]![0]![li]!.value;
    if (!gen) return;
    c1Known[model]!.total += gen.length;
    c1Known[model]!.known += gen.filter((g) => g.known && g.summary).length;
    const batch: Pair[] = gen.flatMap((g, k) => {
      const reference = wiki.get(lib.titles[k] as string);
      return g.known && g.summary && reference ? [{ title: lib.titles[k] as string, reference, candidate: g.summary }] : [];
    });
    if (!batch.length) return;
    taskC.push(
      (async () => {
        const r = await judgePairs("judge.c1", batch);
        batch.forEach((p, i) => c1.push({ model, title: p.title, contradicts: r.value?.[i]?.contradicts ?? false, note: r.value?.[i]?.note ?? "", error: r.value ? undefined : r.error }));
      })(),
    );
  });
}
// C2: obscure real titles against live Wikipedia; invented titles are only checked for known: true.
const c2: (Verdicted & { known: boolean; summary: string; run: number })[] = [];
const c2Fake: { model: string; run: number; title: string; summary: string }[] = [];
const c2Real: Record<string, { total: number; known: number }> = {};
for (const model of genModels) {
  c2Real[model] = { total: 0, known: 0 };
  for (let run = 0; run < RUNS; run++) {
    const games = (obscureRuns[model]![run] as Gen[]).flatMap((b) => b.value ?? []);
    const batch: Pair[] = [];
    for (const g of games) {
      const title = OBSCURE_ORDER.find((t) => sameTitle(t, g.title)) ?? g.title;
      if (INVENTED.includes(title)) {
        if (g.known && g.summary) c2Fake.push({ model, run, title, summary: g.summary });
        continue;
      }
      c2Real[model]!.total++;
      if (!g.known || !g.summary) continue;
      c2Real[model]!.known++;
      const reference = realWiki.get(title);
      if (reference) batch.push({ title, reference, candidate: g.summary });
    }
    if (!batch.length) continue;
    taskC.push(
      (async () => {
        const r = await judgePairs("judge.c2", batch);
        batch.forEach((p, i) =>
          c2.push({ model, run, title: p.title, known: true, summary: p.candidate, contradicts: r.value?.[i]?.contradicts ?? false, note: r.value?.[i]?.note ?? "", error: r.value ? undefined : r.error }),
        );
      })(),
    );
  }
}
await Promise.all(taskC);

// ---------- Report ----------
const ok = <T>(rows: Row<T>[]) => rows.filter((r) => r.value);
const ms = (xs: number[], p: number) => fmt(percentile(xs.filter((x) => !Number.isNaN(x)), p), 0);
const usd = (n: number) => (Number.isNaN(n) ? "n/a" : `$${n.toFixed(4)}`);
const table = (head: string[], body: string[][]) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");

const genTable = genModels.map((model) => {
  const calls = ok(genRuns[model]!.flat());
  const sizes = calls.flatMap((c) => (c.value as GenGame[]).filter((g) => g.known).map((g) => g.summary.length));
  return [model, String(calls.length), ms(calls.map((c) => c.ms), 50), ms(calls.map((c) => c.ms), 90), usd(mean(calls.map((c) => c.cost))), fmt(mean(calls.map((c) => c.output)), 0), fmt(mean(sizes), 0), fmt(c1Known[model]!.known / c1Known[model]!.total), String(genRuns[model]!.flat().filter((c) => c.error).length)];
});
const wikiAll = wikiMs.flat();
const wikiTable = libraries.map((lib, li) => {
  const xs = wikiMs.map((run) => run[li] as number);
  return [lib.id, ms(xs, 50), ms(xs, 90)];
});
const visionTable = visionModels.map((model) => {
  const all = visionRuns[model]!.flat();
  const both = all.filter((v) => v.vision.value && v.plain.value);
  const delta = both.map((v) => v.vision.ms - v.plain.ms);
  const total = all.length * 9;
  return [
    model, String(both.length), ms(both.map((v) => v.plain.ms), 50), ms(both.map((v) => v.vision.ms), 50), ms(both.map((v) => v.vision.ms), 90),
    fmt(mean(delta), 0), usd(mean(both.map((v) => v.plain.cost))), usd(mean(both.map((v) => v.vision.cost))),
    `${all.reduce((n, v) => n + v.plainCorrect, 0)}/${total}`, `${all.reduce((n, v) => n + v.visionCorrect, 0)}/${total}`,
    fmt(mean(both.flatMap((v) => (v.vision.value as GenGame[]).map((g) => (g.known ? 1 : 0))))), String(all.filter((v) => v.vision.error || v.plain.error).length),
  ];
});
const c1Table = genModels.map((model) => {
  const rows = c1.filter((r) => r.model === model && !r.error);
  const bad = rows.filter((r) => r.contradicts);
  return [model, String(c1Known[model]!.total), fmt(c1Known[model]!.known / c1Known[model]!.total), String(rows.length), String(bad.length), fmt(bad.length / Math.max(rows.length, 1)), String(c1.filter((r) => r.model === model && r.error).length)];
});
const c2Table = genModels.map((model) => {
  const real = c2.filter((r) => r.model === model && !r.error);
  const bad = real.filter((r) => r.contradicts);
  const fakes = c2Fake.filter((f) => f.model === model);
  return [model, String(c2Real[model]!.total), fmt(c2Real[model]!.known / Math.max(c2Real[model]!.total, 1)), String(real.length), String(bad.length), fmt(bad.length / Math.max(real.length, 1)), `${fakes.length}/${INVENTED.length * RUNS}`];
});
const realNoWiki = REAL_OBSCURE.filter((t) => !realWiki.get(t));

const md = [
  "# Summaries eval: can a model write the game summary?",
  "",
  `Variants: title (no summary), wiki (production), gen:<model> (one text call per library), vision:<model> (summary in the card extract call). ${RUNS} runs each. Local spend $${localSpend.toFixed(2)} of $${LOCAL_CAP.toFixed(2)}.`,
  `Dropped gen models: ${droppedModels.join(", ") || "none"}. Dropped vision models: ${droppedVision.join(", ") || "none"}.`,
  "",
  `## Part A: game skills vs the jury gold (10 libraries x 9 games x ${RUNS} runs = 180 reads; vision 7 x 9 x ${RUNS} = 126)`,
  "",
  table(["variant", "n", "top3Overlap", "top1Exact", "top1InGold3", "spearman", "stableTop3", "errors"], partA.map((r) => [r.variant, String(r.n), fmt(r.top3Overlap), fmt(r.top1Exact), fmt(r.top1InGold3), fmt(r.spearman), fmt(r.stableTop3), String(r.errors)])),
  "",
  "Vision rows cover only the 7 card libraries, so compare them with title/wiki only loosely.",
  "",
  `## Part B: fit vs gold verdicts (F3 judge, production cut points ${JEV_STRETCH_RAW}/${JEV_MATCH_RAW}; ${pairs.length} pairs x 2 runs)`,
  "",
  table(["variant", "n", "macroF1", "kappa", "accuracy", "agree w/ wiki", "run-to-run agree", "ms/pair", "$/pair", "errors"], partB.map((r) => [r.variant, String(r.n), fmt(r.macroF1), fmt(r.kappa), fmt(r.accuracy), fmt(r.agreeWithWiki), fmt(r.runToRunAgree), fmt(r.msPerPair, 0), usd(r.costPerPair), String(r.errors)])),
  "",
  "## Part C1: contradictions on known games (judge: claude-haiku-4.5, run 0, vs data/wiki.json)",
  "",
  table(["model", "titles", "known rate", "judged", "contradicts", "rate", "judge errors"], c1Table),
  "",
  ...genModels.flatMap((model) => {
    const bad = c1.filter((r) => r.model === model && r.contradicts);
    return [`**${model}**: ${bad.length ? "" : "none"}`, ...bad.map((r) => `- ${r.title}: ${r.note}`), ""];
  }),
  "## Part C2: obscure and invented titles (2 calls of 7, 2 runs)",
  "",
  table(["model", "real reads", "known rate", "judged", "contradicts", "rate", "invented marked known"], c2Table),
  "",
  `Real titles without a live Wikipedia summary (not judged): ${realNoWiki.join(", ") || "none"}. fetchSummary takes the top search hit, so a wrong page can show up as a contradiction; read the notes.`,
  "",
  "Contradictions on real obscure titles:",
  ...genModels.flatMap((model) => c2.filter((r) => r.model === model && r.contradicts).map((r) => `- ${model} run ${r.run} ${r.title}: ${r.note}`)),
  "",
  "Invented titles marked known: true (invented facts):",
  ...(c2Fake.length ? c2Fake.map((f) => `- ${f.model} run ${f.run} ${f.title}: ${f.summary}`) : ["- none"]),
  "",
  "## Latency: gen call per library of 9",
  "",
  table(["model", "calls", "p50 ms", "p90 ms", "$/library", "output tokens", "mean chars (known)", "known rate", "errors"], genTable),
  "",
  `Live fetchSummary, 9 titles in parallel, max of 9 per library (2 runs each; titles shared between libraries may hit Wikipedia\'s CDN cache, so later libraries look faster). All libraries: p50 ${ms(wikiAll, 50)} ms, p90 ${ms(wikiAll, 90)} ms.`,
  "",
  table(["library", "p50 ms", "p90 ms"], wikiTable),
  "",
  "## Vision: summary in the extract call vs the plain extract call (per card, 7 cards x 2 runs)",
  "",
  table(["model", "pairs", "plain p50 ms", "vision p50 ms", "vision p90 ms", "mean delta ms", "plain $", "vision $", "plain titles ok", "vision titles ok", "known rate", "errors"], visionTable),
  "",
].join("\n");
writeFileSync(new URL("out/summaries.md", import.meta.url), md);
writeOut("summaries", {
  localSpend, droppedModels, droppedVision, bestGen, partA, partB, c1, c1Known, c2, c2Fake, c2Real, realWiki: Object.fromEntries(realWiki), wikiMs,
  genRuns, obscureRuns, visionRuns, skillRuns: Object.fromEntries(Object.entries(skillRuns).map(([k, v]) => [k, v.map((r) => r.map((l) => l.map((g) => g.levels ?? g.error)))])), fitRuns,
});
console.table(partA);
console.table(partB);
console.log(`local spend $${localSpend.toFixed(2)}`);
void GAME_SKILLS;
