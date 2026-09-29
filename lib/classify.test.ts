import assert from "node:assert/strict";
import { test } from "node:test";
import { experimental_evaluate } from "ai";
import { Experimental_EvaluationMockModelV4 } from "ai/test";
import {
  MissingGatewayKey,
  evaluateHire,
  evaluateRole,
  judgmentFrom,
  judgmentQuestions,
  type JudgmentAnswers,
} from "./classify.ts";
import {
  ARCHETYPE_QUESTION,
  ARCHETYPE_RULES,
  ARCHETYPES,
  AXES,
  modelState,
  toCard,
  type Top9,
} from "./hire.ts";

const TOP9: Top9 = {
  titles: [
    { title: "Stardew Valley" },
    { title: "Unpacking" },
    { title: "A Short Hike" },
    { title: "Celeste", note: "assist mode on" },
    { title: "Spiritfarer" },
    { title: "It Takes Two" },
    { title: "Animal Crossing" },
    { title: "Hades" },
    { title: "Wingspan" },
  ],
};

const BARD: JudgmentAnswers = {
  archetype: {
    type: "choice",
    choice: "product_bard",
    probabilities: {
      systems_necromancer: 0.02,
      product_bard: 0.6,
      speedrun_gremlin: 0.02,
      solo_queue_demon: 0.02,
      co_op_cleric: 0.22,
      sandbox_builder: 0.02,
      meta_spreadsheet: 0.02,
      lore_monk: 0.02,
      chaos_indie: 0.02,
      completionist_hoarder: 0.02,
      no_match: 0.02,
    },
  },
  systems_vs_product: { type: "score", score: 2.1, probabilities: { 0: 0.05, 1: 0.1, 2: 0.55, 3: 0.3 } },
  competitive_vs_collaborative: { type: "score", score: 0.4, probabilities: { 0: 0.7, 1: 0.2, 2: 0.1, 3: 0 } },
  depth_vs_breadth: { type: "score", score: 2.5, probabilities: { 0: 0, 1: 0, 2: 0.5, 3: 0.5 } },
  builder_vs_optimizer: { type: "score", score: 1 },
};

test("hire and role ask one archetype choice and four ordered axis scores, each in its own words", () => {
  const hire = judgmentQuestions("hire");
  const role = judgmentQuestions("role");
  const ids = [
    "archetype",
    "systems_vs_product",
    "competitive_vs_collaborative",
    "depth_vs_breadth",
    "builder_vs_optimizer",
  ] as const;
  assert.deepEqual(Object.keys(hire), ids);
  assert.deepEqual(Object.keys(role), ids);
  assert.equal(hire.archetype.type, "choice");
  assert.deepEqual(hire.archetype.instructions.split("\n"), [ARCHETYPE_QUESTION, ...ARCHETYPE_RULES]);
  assert.deepEqual(Object.keys(hire.archetype.criteria), Object.keys(ARCHETYPES));
  assert.equal(hire.archetype.criteria.lore_monk, ARCHETYPES.lore_monk.criterion);
  assert.equal(hire.depth_vs_breadth.type, "score");
  assert.deepEqual(hire.depth_vs_breadth.criteria, AXES.depth_vs_breadth.criteria);
  assert.equal(hire.depth_vs_breadth.instructions, AXES.depth_vs_breadth.instructions);
  for (const id of ids) {
    assert.deepEqual(role[id].criteria, hire[id].criteria);
    assert.notEqual(role[id].instructions, hire[id].instructions);
  }
});

test("judgmentFrom takes the chosen probability and the runner-up, and rounds each score to a level", () => {
  assert.deepEqual(judgmentFrom(BARD), {
    archetype: "product_bard",
    confidence: 0.6,
    runnerUp: { archetype: "co_op_cleric", probability: 0.22 },
    scores: {
      systems_vs_product: { level: 3, confidence: 0.55 },
      competitive_vs_collaborative: { level: 1, confidence: 0.7 },
      depth_vs_breadth: { level: 4, confidence: 0.5 },
      builder_vs_optimizer: { level: 2, confidence: 1 },
    },
  });
});

test("without distributions confidence falls back to TypeSafe metadata, then to 1", () => {
  const plain: JudgmentAnswers = {
    archetype: { type: "choice", choice: "systems_necromancer" },
    systems_vs_product: { type: "score", score: 0 },
    competitive_vs_collaborative: { type: "score", score: 1 },
    depth_vs_breadth: { type: "score", score: 0 },
    builder_vs_optimizer: { type: "score", score: 2 },
  };
  assert.deepEqual(judgmentFrom(plain), {
    archetype: "systems_necromancer",
    confidence: 1,
    scores: {
      systems_vs_product: { level: 1, confidence: 1 },
      competitive_vs_collaborative: { level: 2, confidence: 1 },
      depth_vs_breadth: { level: 1, confidence: 1 },
      builder_vs_optimizer: { level: 3, confidence: 1 },
    },
  });
  assert.equal(judgmentFrom(plain, { typesafe: { confidence: { archetype: 0.42 } } }).confidence, 0.42);
  assert.equal(judgmentFrom(plain, { typesafe: { confidence: { archetype: "high" } } }).confidence, 1);
});

test("the hire questions and a handle-less top9 pass the evaluate checks and read into a card", async () => {
  const states: unknown[] = [];
  const model = new Experimental_EvaluationMockModelV4({
    doEvaluate: async ({ state }) => {
      states.push(state);
      return { answers: BARD, warnings: [] };
    },
  });
  const result = await experimental_evaluate({
    model,
    state: modelState(TOP9),
    questions: judgmentQuestions("hire"),
  });
  const card = toCard(judgmentFrom(result.answers, result.providerMetadata));
  assert.deepEqual(states, [{ top9: TOP9.titles }]);
  assert.deepEqual(card.badge, { kind: "soft", label: "Product bard", runnerUp: "Co-op cleric" });
  assert.deepEqual(
    card.scores.map((score) => score.level),
    [3, 1, 4, 2],
  );
  assert.equal(card.scores[0]?.criterion, "Mix leans toward narrative, design-forward, or delight-first games");
});

test("without a gateway credential both judgments throw MissingGatewayKey", async () => {
  const saved = { ...process.env };
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.VERCEL;
  try {
    await assert.rejects(evaluateHire(TOP9), MissingGatewayKey);
    await assert.rejects(
      evaluateRole({
        source: "ashby",
        title: "Staff Engineer, Ingest",
        pageUrl: "https://jobs.ashbyhq.com/sentry/ingest",
        text: "Own the ingest pipeline.",
      }),
      MissingGatewayKey,
    );
  } finally {
    Object.assign(process.env, saved);
  }
});
