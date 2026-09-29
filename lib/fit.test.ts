import assert from "node:assert/strict";
import test from "node:test";
import { GAME_SKILLS, type GameBreakdown, type GameSkill, type JobBreakdown } from "./breakdown.ts";
import type { EvaluationAnswers } from "./classify.ts";
import {
  JEV_MATCH_RAW,
  JEV_STRETCH_RAW,
  MATCH_AT,
  STRETCH_AT,
  calibrate,
  choiceFor,
  clearFitCache,
  evaluateFit,
  fitMatch,
  fitRows,
  judgeFit,
  fitWhy,
  lastFitSource,
  toMatch,
  type FitLevel,
  type FitRow,
} from "./fit.ts";
import type { AskJev } from "./jev-breakdown.ts";
import { useBlobIo } from "./store.ts";
import { normalizeTitle } from "./text.ts";

const levelsOf = (over: Partial<Record<GameSkill, number>>) =>
  ({ ...Object.fromEntries(GAME_SKILLS.map((s) => [s, 0])), ...over }) as Record<GameSkill, number>;
const game = (title: string, over: Partial<Record<GameSkill, number>>): GameBreakdown => ({
  title,
  summary: `${title} summary`,
  levels: levelsOf(over),
  skills: [],
  traits: [],
});
const job = (needs: Partial<Record<GameSkill, number>>, requirements: JobBreakdown["requirements"]): JobBreakdown => ({
  title: "Engineer",
  description: "Build things.",
  needs: levelsOf(needs),
  wants: "systems_necromancer",
  requirements,
  dropped: [],
});
const req = (id: GameSkill, kind: "must" | "nice") => ({ id, text: `ability ${id}`, kind, evidence: "" });

function row(id: string, kind: "must" | "nice", level: FitLevel, expected: number = level): FitRow {
  return { id, text: `ability ${id}`, kind, evidence: "", level, expected, confidence: 1 };
}

test("calibrate puts the raw cut points on the display cut points", () => {
  assert.equal(calibrate(0), 0);
  assert.equal(calibrate(JEV_STRETCH_RAW), STRETCH_AT);
  assert.equal(calibrate(JEV_MATCH_RAW), MATCH_AT);
  assert.equal(calibrate(100), 100);
});

test("calibrate is linear inside each segment", () => {
  assert.equal(calibrate(4, 8, 20), 25);
  assert.equal(calibrate(14, 8, 20), 56);
  assert.equal(calibrate(60, 8, 20), 81);
  assert.equal(calibrate(-5), 0);
  assert.equal(calibrate(140), 100);
});

test("the percent and the choice never disagree with the raw cut points", () => {
  for (let raw = 0; raw <= 100; raw++) {
    const choice = choiceFor(calibrate(raw), false);
    const expected = raw >= JEV_MATCH_RAW ? "match" : raw >= JEV_STRETCH_RAW ? "stretch" : "mismatch";
    assert.equal(choice, expected, `raw ${raw}`);
  }
});

test("rows follow the library's three best games at each required skill", () => {
  const games = [
    game("Alpha", { planning: 3 }),
    game("Beta", { planning: 3 }),
    game("Gamma", { planning: 0 }),
    game("Delta", { planning: 3 }),
    game("Echo", { planning: 1, reflexes: 1 }),
  ];
  const rows = fitRows(games, job({ planning: 3, reflexes: 2 }, [req("planning", "must"), req("reflexes", "must")]));
  assert.equal(rows[0]?.expected, 3);
  assert.equal(rows[0]?.level, 4);
  assert.equal(rows[0]?.evidence, "Best here: Alpha");
  // reflexes: one game at 1 and four at 0 => the three best average 1/3; need 2 => coverage 1/6
  assert.equal(rows[1]?.expected, 0.33);
  assert.equal(rows[1]?.level, 2);
  assert.equal(rows[1]?.evidence, "Best here: Echo");
  assert.equal(rows[1]?.confidence, 1);
  assert.equal(rows[1]?.kind, "must");
});

test("a row caps at level 4 when strength passes the need, and a long title fits 90 chars", () => {
  const long = "T".repeat(200);
  const rows = fitRows([game(long, { building: 3 })], job({ building: 1 }, [req("building", "nice")]));
  assert.equal(rows[0]?.level, 4);
  assert.ok((rows[0]?.evidence.length ?? 0) <= 90);
});

test("fitWhy names strongest and weakest within 160 chars", () => {
  assert.equal(fitWhy([row("a", "must", 4), row("b", "must", 1)]), "Strong on “ability a”. Thin on “ability b”.");
  const long = { ...row("a", "must", 4), text: "x".repeat(80) };
  assert.ok(fitWhy([long, { ...long, id: "b", level: 1 }]).length <= 160);
});

test("fitWhy uses one sentence when levels are equal", () => {
  assert.equal(fitWhy([row("a", "must", 2), row("b", "nice", 2)]), "Thin across the board, even on “ability a”.");
  const solid = fitWhy([row("a", "must", 3), row("b", "nice", 3)]);
  assert.equal(solid, "Solid across the board, including “ability a”.");
  assert.ok(!solid.includes("Thin on"));
});

test("fitWhy prefers must, then the higher strength, on equal levels", () => {
  const why = fitWhy([row("nice_hi", "nice", 4, 3), row("must_lo", "must", 4, 2), row("weak", "nice", 1)]);
  assert.equal(why, "Strong on “ability must_lo”. Thin on “ability weak”.");
});

const games = [game("Alpha", { planning: 3 }), game("Beta", { planning: 3 }), game("Gamma", { planning: 3 })];
const planningJob = job({ planning: 3 }, [req("planning", "must")]);
const askWith = (fit: EvaluationAnswers[string], calls: { state?: unknown; id?: string }[] = []): AskJev => async (state, _questions, id) => {
  calls.push({ state, id });
  return { answers: { fit }, info: { ms: 1, input: 2, output: 3, cost: 0 } };
};

test("the judge reads titles, summaries and the posting, and scores the expected level out of 100", async () => {
  const calls: { state?: unknown; id?: string }[] = [];
  const raw = await evaluateFit(games, planningJob, askWith({ type: "score", score: 2, probabilities: { "1": 0.5, "3": 0.5 } }, calls));
  assert.equal(raw, 67);
  assert.equal(calls[0]?.id, "top9.fit");
  assert.deepEqual(calls[0]?.state, {
    games: games.map(({ title, summary }) => ({ title, summary })),
    job: { title: "Engineer", description: "Build things." },
  });
});

test("fitMatch builds the match from the raw score and serves a repeat from memory", async () => {
  clearFitCache();
  const calls: { state?: unknown; id?: string }[] = [];
  const ask = askWith({ type: "score", score: 3 }, calls);
  const url = "https://x.test/fit";
  const first = await fitMatch(url, games, planningJob, { ask });
  assert.equal(lastFitSource.value, "model");
  assert.equal(first.alignment.percent, 100);
  assert.equal(first.choice, "match");
  assert.equal(first.fit.rows.length, 1);
  const again = await fitMatch(url, games, planningJob, { ask });
  assert.equal(lastFitSource.value, "memory");
  assert.deepEqual(again, first);
  assert.equal(calls.length, 1);
});

test("judgeFit returns the same raw on the model and memory paths", async () => {
  clearFitCache();
  const url = "https://x.test/judge";
  const first = await judgeFit(url, games, planningJob, { ask: askWith({ type: "score", score: 2 }) });
  assert.equal(lastFitSource.value, "model");
  const again = await judgeFit(url, games, planningJob, { ask: askWith({ type: "score", score: 0 }) });
  assert.equal(lastFitSource.value, "memory");
  assert.equal(again, first);
});

test("a changed posting at the same URL is judged again; the same text is a hit", async () => {
  clearFitCache();
  const calls: { state?: unknown; id?: string }[] = [];
  const ask = askWith({ type: "score", score: 2 }, calls);
  const url = "https://x.test/edited-fit";
  await judgeFit(url, games, planningJob, { ask });
  await judgeFit(url, games, planningJob, { ask });
  assert.equal(calls.length, 1);
  await judgeFit(url, games, { ...planningJob, description: "Build other things." }, { ask });
  assert.equal(lastFitSource.value, "model");
  assert.equal(calls.length, 2);
});

test("store false judges without remembering, and still reads what a complete run stored", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  const files = new Map<string, string>();
  const puts: string[] = [];
  useBlobIo({
    get: (async (path: string) => {
      const body = files.get(path);
      return body === undefined ? null : { statusCode: 200, stream: new Response(body).body };
    }) as never,
    put: (async (path: string, body: string) => {
      files.set(path, body);
      puts.push(path);
    }) as never,
  });
  try {
    clearFitCache();
    const calls: { state?: unknown; id?: string }[] = [];
    const ask = askWith({ type: "score", score: 3 }, calls);
    const url = "https://x.test/partial";
    await judgeFit(url, games, planningJob, { ask, store: false });
    assert.deepEqual(puts, []);
    await judgeFit(url, games, planningJob, { ask, store: false });
    assert.equal(calls.length, 2);
    await judgeFit(url, games, planningJob, { ask });
    assert.equal(puts.length, 1);
    clearFitCache();
    await judgeFit(url, games, planningJob, { ask, store: false });
    assert.equal(lastFitSource.value, "blob");
    assert.equal(calls.length, 3);
  } finally {
    useBlobIo(undefined);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }
});

test("fitMatch equals toMatch of the judged raw", async () => {
  clearFitCache();
  const url = "https://x.test/wrapper";
  const ask = askWith({ type: "score", score: 3 });
  const raw = await judgeFit(url, games, planningJob, { ask });
  assert.deepEqual(await fitMatch(url, games, planningJob, { ask }), toMatch(raw, games, planningJob));
});

test("toMatch keeps the percent and the word in step", () => {
  const low = toMatch(0, games, planningJob);
  assert.equal(low.alignment.percent, 0);
  assert.equal(low.choice, "mismatch");
  assert.equal(toMatch(JEV_STRETCH_RAW, games, planningJob).choice, "stretch");
  assert.equal(toMatch(JEV_MATCH_RAW, games, planningJob).choice, "match");
});

test("normalizeTitle lowercases, strips punctuation, collapses space", () => {
  assert.equal(normalizeTitle("  Sid Meier's   Civilization II "), "sid meiers civilization ii");
  assert.equal(normalizeTitle("StarCraft II: Wings of Liberty"), "starcraft ii wings of liberty");
  assert.equal(normalizeTitle("Fallout 2!"), "fallout 2");
});

test("judgeFit calls beforeModel only on a cache miss", async () => {
  clearFitCache();
  const url = "https://x.test/gate";
  let gated = 0;
  const beforeModel = async () => {
    gated += 1;
  };
  await judgeFit(url, games, planningJob, { ask: askWith({ type: "score", score: 2 }), beforeModel });
  assert.equal(gated, 1);
  await judgeFit(url, games, planningJob, { ask: askWith({ type: "score", score: 2 }), beforeModel });
  assert.equal(gated, 1);
});
