import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import { MODEL as classifyModel } from "./classify.ts";
import { AXES, type Judgment } from "./hire.ts";
import { MODEL, matchInstructions, matchSchema, matchState, roleInstructions, roleJudgmentSchema } from "./role.ts";

const scores = {
  systems_vs_product: { level: 1 as const, confidence: 0.8 },
  competitive_vs_collaborative: { level: 2 as const, confidence: 0.7 },
  depth_vs_breadth: { level: 3 as const, confidence: 0.6 },
  builder_vs_optimizer: { level: 4 as const, confidence: 0.5 },
};

test("role and match use the classify model", () => {
  assert.equal(MODEL, classifyModel);
  assert.equal(MODEL, "openai/gpt-5.4-mini");
});

test("role schema mirrors hire axes and requires alternatives", async () => {
  const parsed = roleJudgmentSchema.safeParse({
    role_archetype: { choice: "systems_necromancer", confidence: 0.8, alternatives: [] },
    scores,
  });
  assert.equal(parsed.success, true);

  const missing = roleJudgmentSchema.safeParse({
    role_archetype: { choice: "systems_necromancer", confidence: 0.8 },
    scores,
  });
  assert.equal(missing.success, false);

  const schema = await asSchema(roleJudgmentSchema).jsonSchema;
  const scoresProp = schema.properties?.scores;
  assert.ok(scoresProp && typeof scoresProp === "object" && !Array.isArray(scoresProp));
  assert.deepEqual(Object.keys(scoresProp.properties ?? {}).sort(), Object.keys(AXES).sort());
  const archetype = schema.properties?.role_archetype;
  assert.ok(archetype && typeof archetype === "object" && !Array.isArray(archetype));
  assert.deepEqual([...(archetype.required ?? [])].sort(), ["alternatives", "choice", "confidence"]);
});

test("match schema is match, stretch, or mismatch plus a why", () => {
  assert.equal(matchSchema.safeParse({ choice: "match", why: "Systems lines up." }).success, true);
  assert.equal(matchSchema.safeParse({ choice: "stretch", why: "Depth diverges." }).success, true);
  assert.equal(matchSchema.safeParse({ choice: "mismatch", why: "Product versus systems." }).success, true);
  assert.equal(matchSchema.safeParse({ choice: "hire", why: "no" }).success, false);
  assert.equal(matchSchema.safeParse({ choice: "match", why: "   " }).success, false);
});

test("match state places hire and role scores on the same axes", () => {
  const hire: Judgment = {
    archetype: "sandbox_builder",
    confidence: 0.7,
    scores,
  };
  const role: Judgment = {
    archetype: "systems_necromancer",
    confidence: 0.6,
    scores: {
      ...scores,
      systems_vs_product: { level: 4, confidence: 0.4 },
    },
  };
  const state = matchState(hire, role, { title: "DX", url: "https://jobs.ashbyhq.com/sentry/x" });
  assert.deepEqual(
    state.hire.scores.map((score) => score.id),
    Object.keys(AXES),
  );
  assert.deepEqual(
    state.role.scores.map((score) => score.id),
    Object.keys(AXES),
  );
  assert.equal(state.hire.scores[0]?.level, 1);
  assert.equal(state.role.scores[0]?.level, 4);
  assert.match(roleInstructions(), /role_archetype/);
  assert.match(matchInstructions(), /mismatch/);
  for (const id of Object.keys(AXES)) {
    assert.match(roleInstructions(), new RegExp(id));
  }
});
