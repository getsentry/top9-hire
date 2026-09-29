import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { roleCard } from "./hire.ts";
import { parseJobUrl } from "./job.ts";
import {
  JOB_PACK,
  TOP9_EXAMPLES,
  findExample,
  findJob,
  plateId,
  shareBlurb,
  suggestedFor,
} from "./pack.ts";

test("the job pack is twelve unique public Greenhouse or Ashby postings", () => {
  assert.equal(JOB_PACK.length, 12);
  assert.equal(new Set(JOB_PACK.map((job) => job.id)).size, 12);
  assert.equal(new Set(JOB_PACK.map((job) => job.url)).size, 12);
  const sources = new Set<string>();
  for (const job of JOB_PACK) {
    const locked = parseJobUrl(job.url);
    assert.ok(locked, `${job.id} must pass parseJobUrl`);
    sources.add(locked.source);
    assert.equal(locked.source, job.board, `${job.id} board disagrees with its URL`);
    for (const field of [job.company, job.title, job.facet]) {
      assert.ok(field.trim().length > 0, `${job.id} has an empty field`);
    }
  }
  assert.deepEqual([...sources].sort(), ["ashby", "greenhouse"]);
});

test("every suggested handle is a fixture, and every fixture has a suggested role", () => {
  for (const job of JOB_PACK) {
    assert.ok(job.suggestedFixtureHandles.length > 0, `${job.id} suggests no fixture`);
    for (const handle of job.suggestedFixtureHandles) {
      assert.ok(findExample(handle), `${job.id} suggests unknown fixture @${handle}`);
    }
  }
  for (const example of TOP9_EXAMPLES) {
    assert.ok(
      JOB_PACK.some((job) => suggestedFor(job, example.handle)),
      `@${example.handle} has no suggested role`,
    );
  }
  const dx = JOB_PACK.find((job) => job.id === "sentry-dx");
  assert.ok(dx);
  assert.equal(suggestedFor(dx, "@Theo"), true);
  assert.equal(suggestedFor(dx, "dorryspears"), false);
  assert.equal(suggestedFor(dx, ""), false);
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

test("the share blurb leads with the panel decision when a role was read", () => {
  const card = roleCard("systems_necromancer");
  const blurb = shareBlurb({
    handle: "dorryspears",
    plate: "T9-07",
    card,
    match: { choice: "stretch", percent: 75, jobTitle: "Software Engineer, Platform", company: "Vercel" },
  });
  assert.equal(
    blurb,
    [
      "@dorryspears for Vercel Software Engineer, Platform: Lean hire.",
      "Evidence: Systems necromancer, 75% aligned.",
      "Nine games instead of a leetcode round. top9.wtf crit T9-07",
    ].join("\n"),
  );
});

test("the share blurb without a role carries the archetype and signal line", () => {
  const card = roleCard("systems_necromancer");
  assert.equal(
    shareBlurb({ handle: "dorryspears", plate: "T9-07", card }),
    [
      "@dorryspears: Systems necromancer.",
      '"Reads a factory floor like a trace. Hand them the pipeline nobody else wants to own."',
      "top9.wtf crit T9-07",
    ].join("\n"),
  );
});
