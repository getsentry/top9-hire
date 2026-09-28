import assert from "node:assert/strict";
import { test } from "node:test";
import { gatewayReady, parsePaste, toCard, type Judgment } from "./hire.ts";

const NINE = "a\nb\nc\nd\ne\nf\ng\nh\ni";

function scores(confidence: number): Judgment["scores"] {
  return {
    systems_vs_product: { level: 1, confidence },
    competitive_vs_collaborative: { level: 2, confidence },
    depth_vs_breadth: { level: 3, confidence },
    builder_vs_optimizer: { level: 4, confidence },
  };
}

test("nine titles become a top9 and a blank handle is dropped", () => {
  const parsed = parsePaste(`${NINE}\n`, "  ");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.top9.handle, undefined);
  assert.deepEqual(
    parsed.top9.titles.map((game) => game.title),
    ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
  );
});

test("a pipe splits a title from an optional note", () => {
  const parsed = parsePaste("Factorio | belts\nb\nc\nd\ne\nf\ng\nh\ni", "ada");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.top9.handle, "ada");
  assert.deepEqual(parsed.top9.titles[0], { title: "Factorio", note: "belts" });
});

test("eight titles fail and report the count", () => {
  assert.deepEqual(parsePaste("a\n\nb\nc\nd\ne\nf\ng\nh", ""), {
    ok: false,
    count: 8,
  });
});

test("ten titles fail", () => {
  assert.deepEqual(parsePaste(`${NINE}\nj`, "x"), { ok: false, count: 10 });
});

test("gateway is ready only when a server credential is set", () => {
  assert.equal(gatewayReady({}), false);
  assert.equal(gatewayReady({ AI_GATEWAY_API_KEY: "k" }), true);
  assert.equal(gatewayReady({ VERCEL_OIDC_TOKEN: "t" }), true);
});

test("a Vercel request OIDC token counts as ready", () => {
  assert.equal(gatewayReady({ VERCEL: "1" }, "header-token"), true);
});

test("vercel without a token stays closed, and a token off Vercel does not open it", () => {
  assert.equal(gatewayReady({ VERCEL: "1" }), false);
  assert.equal(gatewayReady({ VERCEL: "1" }, ""), false);
  assert.equal(gatewayReady({}, "header-token"), false);
});

test("confidence 0.9 on systems taste is a primary badge and a clear bar", () => {
  const card = toCard({
    archetype: "systems_necromancer",
    confidence: 0.9,
    scores: scores(0.8),
  });
  assert.deepEqual(card.badge, {
    kind: "primary",
    label: "Systems necromancer",
  });
  assert.equal(
    card.roast,
    "You would automate the coffee machine and then argue with it about throughput.",
  );
  assert.equal(card.scores[0]?.fuzzy, false);
  assert.equal(
    card.scores[0]?.criterion,
    "Almost all simulation, engineering, or hard-systems titles",
  );
  assert.equal(
    card.scores[3]?.criterion,
    "Pure optimization / competitive efficiency mindset",
  );
  assert.equal(
    card.disclaimer,
    "Entertainment only. This card roasts taste. It is not a hiring decision.",
  );
});

test("confidence 0.65 is primary and 0.40 is soft", () => {
  assert.equal(
    toCard({ archetype: "lore_monk", confidence: 0.65, scores: scores(0.5) })
      .badge.kind,
    "primary",
  );
  const soft = toCard({
    archetype: "product_bard",
    confidence: 0.4,
    runnerUp: { archetype: "co_op_cleric", probability: 0.21 },
    scores: scores(0.34),
  });
  assert.deepEqual(soft.badge, {
    kind: "soft",
    label: "Product bard",
    runnerUp: "Co-op cleric",
  });
  assert.equal(soft.scores[0]?.fuzzy, true);
});

test("a runner-up at 0.20 stays hidden and a low score at 0.35 stays clear", () => {
  const card = toCard({
    archetype: "sandbox_builder",
    confidence: 0.5,
    runnerUp: { archetype: "meta_spreadsheet", probability: 0.2 },
    scores: scores(0.35),
  });
  assert.deepEqual(card.badge, { kind: "soft", label: "Sandbox builder" });
  assert.equal(card.scores[0]?.fuzzy, false);
});

test("no_match is chaos even when confidence is high", () => {
  const card = toCard({
    archetype: "no_match",
    confidence: 0.9,
    scores: scores(0.9),
  });
  assert.deepEqual(card.badge, { kind: "chaos" });
  assert.equal(card.roast, "Nine titles, and none of them agree.");
});

test("confidence under 0.40 is chaos and the score bars remain", () => {
  const card = toCard({
    archetype: "chaos_indie",
    confidence: 0.39,
    scores: scores(0.9),
  });
  assert.deepEqual(card.badge, { kind: "chaos" });
  assert.equal(card.scores.length, 4);
  assert.equal(card.roast, "Your library looks like a dare.");
});
