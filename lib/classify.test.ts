import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import { judgmentSchema } from "./classify.ts";

const scores = {
  systems_vs_product: { level: 1 as const, confidence: 0.5 },
  competitive_vs_collaborative: { level: 2 as const, confidence: 0.5 },
  depth_vs_breadth: { level: 3 as const, confidence: 0.5 },
  builder_vs_optimizer: { level: 4 as const, confidence: 0.5 },
};

test("missing alternatives is invalid and an empty list is valid", () => {
  const missing = judgmentSchema.safeParse({
    hire_archetype: { choice: "lore_monk", confidence: 0.8 },
    scores,
  });
  assert.equal(missing.success, false);

  const empty = judgmentSchema.safeParse({
    hire_archetype: { choice: "lore_monk", confidence: 0.8, alternatives: [] },
    scores,
  });
  assert.equal(empty.success, true);
});

test("hire_archetype.required includes alternatives", async () => {
  const schema = await asSchema(judgmentSchema).jsonSchema;
  const archetype = schema.properties?.hire_archetype;
  assert.ok(archetype && typeof archetype === "object" && !Array.isArray(archetype));
  assert.deepEqual([...(archetype.required ?? [])].sort(), [
    "alternatives",
    "choice",
    "confidence",
  ]);
});
