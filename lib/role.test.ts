import assert from "node:assert/strict";
import { test } from "node:test";
import { type Judgment } from "./hire.ts";
import { alignment, matchFor } from "./role.ts";

const scores = {
  systems_vs_product: { level: 1 as const, confidence: 0.8 },
  competitive_vs_collaborative: { level: 2 as const, confidence: 0.7 },
  depth_vs_breadth: { level: 3 as const, confidence: 0.6 },
  builder_vs_optimizer: { level: 4 as const, confidence: 0.5 },
};

test("alignment fixes the choice from axis gaps and prints a percent", () => {
  const hire: Judgment = { archetype: "systems_necromancer", confidence: 0.9, scores };
  const same = alignment(hire, hire);
  assert.equal(same.percent, 100);
  assert.equal(same.choice, "match");
  assert.equal(same.archetypes.same, true);
  assert.deepEqual(same.facets.map((f) => f.read), ["aligned", "aligned", "aligned", "aligned"]);
  assert.equal(same.facets[0]?.axis, "Systems vs Product");

  const adjacent = alignment(hire, {
    archetype: "product_bard",
    scores: { ...scores, depth_vs_breadth: { level: 4, confidence: 0.5 } },
  });
  assert.equal(adjacent.choice, "match");
  assert.equal(adjacent.percent, 92);
  assert.equal(adjacent.facets[2]?.read, "adjacent");
  assert.equal(adjacent.archetypes.role, "Product bard");

  const oneApart = alignment(hire, {
    ...hire,
    scores: { ...scores, competitive_vs_collaborative: { level: 4, confidence: 0.5 } },
  });
  assert.equal(oneApart.choice, "stretch");
  assert.equal(oneApart.diverging, 1);
  assert.equal(oneApart.facets[1]?.read, "diverges");

  const apart = alignment(hire, {
    ...hire,
    scores: {
      systems_vs_product: { level: 4, confidence: 0.5 },
      competitive_vs_collaborative: { level: 4, confidence: 0.5 },
      depth_vs_breadth: { level: 1, confidence: 0.5 },
      builder_vs_optimizer: { level: 1, confidence: 0.5 },
    },
  });
  assert.equal(apart.choice, "mismatch");
  assert.equal(apart.diverging, 4);
  assert.equal(apart.percent, 17);
});

test("a role that lines up on every axis with the same archetype is a match", () => {
  const hire: Judgment = { archetype: "systems_necromancer", confidence: 0.9, scores };
  const match = matchFor(hire, hire);
  assert.equal(match.choice, "match");
  assert.equal(match.why, "Every axis lines up. Both read as Systems necromancer.");
});

test("one axis a level apart is still a match and the why names it by its poles", () => {
  const hire: Judgment = { archetype: "systems_necromancer", confidence: 0.9, scores };
  const role: Judgment = {
    archetype: "product_bard",
    confidence: 0.7,
    scores: { ...scores, depth_vs_breadth: { level: 4, confidence: 0.5 } },
  };
  const match = matchFor(hire, role);
  assert.equal(match.choice, "match");
  assert.equal(match.alignment.percent, 92);
  assert.equal(
    match.why,
    "Systems vs Product, Competitive vs Collaborative, and Builder vs Optimizer line up. Depth vs Breadth is one level apart. Top9 reads as Systems necromancer, the role as Product bard.",
  );
});

test("two diverging axes are a stretch and the why lists each read in order", () => {
  const hire: Judgment = { archetype: "sandbox_builder", confidence: 0.7, scores };
  const role: Judgment = {
    archetype: "systems_necromancer",
    confidence: 0.6,
    scores: {
      systems_vs_product: { level: 4, confidence: 0.4 },
      competitive_vs_collaborative: { level: 4, confidence: 0.4 },
      depth_vs_breadth: { level: 2, confidence: 0.4 },
      builder_vs_optimizer: { level: 4, confidence: 0.4 },
    },
  };
  const match = matchFor(hire, role);
  assert.equal(match.choice, "stretch");
  assert.equal(
    match.why,
    "Builder vs Optimizer lines up. Depth vs Breadth is one level apart. Systems vs Product and Competitive vs Collaborative diverge. Top9 reads as Sandbox builder, the role as Systems necromancer.",
  );
});

test("four diverging axes are a mismatch even when the archetype is the same", () => {
  const hire: Judgment = { archetype: "systems_necromancer", confidence: 0.9, scores };
  const role: Judgment = {
    archetype: "systems_necromancer",
    confidence: 0.8,
    scores: {
      systems_vs_product: { level: 4, confidence: 0.5 },
      competitive_vs_collaborative: { level: 4, confidence: 0.5 },
      depth_vs_breadth: { level: 1, confidence: 0.5 },
      builder_vs_optimizer: { level: 1, confidence: 0.5 },
    },
  };
  const match = matchFor(hire, role);
  assert.equal(match.choice, "mismatch");
  assert.equal(match.why, "Every axis diverges. Both read as Systems necromancer.");
});
