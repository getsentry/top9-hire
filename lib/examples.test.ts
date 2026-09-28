import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePaste } from "./hire.ts";
import {
  PRIMARY_ROW_SIZE,
  PROMINENT_HANDLES,
  TOP9_EXAMPLES,
  arrangeExamples,
  engagement,
  exampleTitles,
  findExample,
  formatCount,
} from "./examples.ts";

test("every fixture is a real x.com status with nine distinct non-empty titles", () => {
  assert.ok(TOP9_EXAMPLES.length >= 3);
  const handles = new Set<string>();
  for (const example of TOP9_EXAMPLES) {
    assert.match(example.tweetUrl, /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/);
    assert.ok(example.tweetUrl.includes(`/${example.handle}/`), `${example.handle} url mismatch`);
    assert.equal(example.games.length, 9);
    for (const title of example.games) {
      assert.equal(title, title.trim());
      assert.ok(title.length > 0);
      assert.ok(!title.includes("\n"));
      assert.ok(!title.includes("|"), "pipe would be read as a note separator");
    }
    assert.equal(new Set(example.games).size, 9, `${example.handle} repeats a title`);
    assert.ok(!handles.has(example.handle.toLowerCase()), `${example.handle} listed twice`);
    handles.add(example.handle.toLowerCase());
    if (example.jobUrl) assert.match(example.jobUrl, /^https:\/\//);
  }
});

test("each fixture parses through the existing paste flow as exactly nine", () => {
  for (const example of TOP9_EXAMPLES) {
    const parsed = parsePaste(exampleTitles(example).join("\n"), example.handle);
    assert.equal(parsed.ok, true, example.handle);
    if (parsed.ok) {
      assert.equal(parsed.top9.handle, example.handle);
      assert.deepEqual(
        parsed.top9.titles.map((game) => game.title),
        [...example.games],
      );
    }
  }
});

test("arrangeExamples leads with prominent handles and keeps every fixture selectable", () => {
  const { primary, more } = arrangeExamples();
  assert.equal(primary[0]?.handle, "theo");
  assert.ok(primary.some((example) => example.handle === "LinkofSunshine"));
  assert.equal(primary.length, Math.min(PRIMARY_ROW_SIZE, TOP9_EXAMPLES.length));
  assert.equal(primary.length + more.length, TOP9_EXAMPLES.length);
  const all = [...primary, ...more].map((example) => example.handle);
  assert.equal(new Set(all).size, TOP9_EXAMPLES.length);
  for (let i = 1; i < more.length; i++) {
    const prev = more[i - 1] as (typeof more)[number];
    const curr = more[i] as (typeof more)[number];
    assert.ok(engagement(prev) >= engagement(curr), "more is sorted by engagement");
  }
});

test("arrangeExamples skips prominent handles that are not in the set", () => {
  assert.ok(PROMINENT_HANDLES.includes("hajimesyacho"));
  assert.equal(findExample("hajimesyacho"), undefined);
  const subset = TOP9_EXAMPLES.filter((example) => example.handle !== "theo");
  const { primary } = arrangeExamples(subset, 2);
  assert.equal(primary.length, 2);
  assert.equal(primary[0]?.handle, "LinkofSunshine");
  assert.equal(primary[1]?.handle, "justalexoki");
});

test("findExample ignores case and a leading @", () => {
  assert.equal(findExample("@Theo")?.tweetUrl, "https://x.com/theo/status/2104007341511467381");
  assert.equal(findExample("nobody"), undefined);
});

test("exampleTitles returns a fresh mutable copy", () => {
  const theo = findExample("theo");
  assert.ok(theo);
  const titles = exampleTitles(theo);
  titles[0] = "edited";
  assert.equal(theo.games[0], "Outer Wilds");
});

test("formatCount compacts thousands", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(873), "873");
  assert.equal(formatCount(1000), "1k");
  assert.equal(formatCount(1221), "1.2k");
});
