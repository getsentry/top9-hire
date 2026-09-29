import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { toCard } from "./hire.ts";
import { parseJobUrl } from "./job.ts";
import {
  JOB_PACK,
  TOP9_EXAMPLES,
  findExample,
  findJob,
  plateId,
  sealScore,
  shareBlurb,
  signalStrength,
} from "./pack.ts";

const scores = {
  systems_vs_product: { level: 1, confidence: 0.8 },
  competitive_vs_collaborative: { level: 2, confidence: 0.8 },
  depth_vs_breadth: { level: 2, confidence: 0.8 },
  builder_vs_optimizer: { level: 1, confidence: 0.8 },
} as const;

test("the job pack is twelve unique public Greenhouse or Ashby postings", () => {
  assert.equal(JOB_PACK.length, 12);
  assert.equal(new Set(JOB_PACK.map((job) => job.id)).size, 12);
  assert.equal(new Set(JOB_PACK.map((job) => job.url)).size, 12);
  const sources = new Set<string>();
  for (const job of JOB_PACK) {
    const locked = parseJobUrl(job.url);
    assert.ok(locked, `${job.id} must pass parseJobUrl`);
    sources.add(locked.source);
    for (const field of [job.company, job.title, job.location, job.lean]) {
      assert.ok(field.trim().length > 0, `${job.id} has an empty field`);
    }
  }
  assert.deepEqual([...sources].sort(), ["ashby", "greenhouse"]);
});

test("findJob matches a pack URL exactly and ignores others", () => {
  const first = JOB_PACK[0];
  assert.ok(first);
  assert.equal(findJob(` ${first.url} `)?.id, first.id);
  assert.equal(findJob("https://example.com/jobs/1"), undefined);
});

test("eight fixtures, nine titles each, and every card image is on disk", () => {
  assert.equal(TOP9_EXAMPLES.length, 8);
  assert.equal(new Set(TOP9_EXAMPLES.map((e) => e.id)).size, 8);
  assert.equal(new Set(TOP9_EXAMPLES.map((e) => e.handle.toLowerCase())).size, 8);
  for (const example of TOP9_EXAMPLES) {
    assert.equal(example.games.length, 9);
    assert.ok(example.games.every((title) => title.trim().length > 0));
    assert.match(example.tweetUrl, /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/);
    if (!example.image) continue;
    const path = new URL(`../public${example.image.src}`, import.meta.url);
    assert.ok(existsSync(path), `${example.image.src} is missing`);
    assert.ok(readFileSync(path).byteLength > 10_000);
  }
  assert.ok(TOP9_EXAMPLES.filter((e) => e.image).length >= 7);
});

test("findExample ignores case and a leading @", () => {
  assert.equal(findExample("@Theo")?.id, "T9-01");
  assert.equal(findExample("nobody"), undefined);
});

test("plate ids are stable, case-blind, and differ by list", () => {
  const theo = TOP9_EXAMPLES[0]?.games ?? [];
  const dorry = TOP9_EXAMPLES[6]?.games ?? [];
  assert.match(plateId(theo), /^T9-[0-9A-F]{4}$/);
  assert.equal(plateId(theo), plateId(theo.map((t) => ` ${t.toUpperCase()} `)));
  assert.notEqual(plateId(theo), plateId(dorry));
});

test("the seal prints confidence as a one-decimal score", () => {
  assert.equal(sealScore(0.84), "8.4");
  assert.equal(sealScore(1), "10.0");
  assert.equal(sealScore(-1), "0.0");
});

test("the share blurb carries the archetype, signal line, score, and role read", () => {
  const card = toCard({ archetype: "systems_necromancer", confidence: 0.84, scores });
  assert.equal(signalStrength(card), "Strong signal");
  const blurb = shareBlurb({
    handle: "dorryspears",
    plate: "T9-07",
    card,
    match: { choice: "match", jobTitle: "Design Engineer", company: "Vercel" },
  });
  assert.equal(
    blurb,
    [
      "@dorryspears: Systems necromancer. Strong signal, 8.4/10.",
      '"Reads a factory floor like a trace. Hand them the pipeline nobody else wants to own."',
      "Role read: match for Vercel Design Engineer.",
      "Top9 Hire crit T9-07",
    ].join("\n"),
  );
});
