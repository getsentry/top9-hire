import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHETYPES, DISCLAIMER } from "./hire.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const BANNED = /roast|entertainment/i;
/** Wikipedia text (publisher names such as "Blizzard Entertainment"), not shipped copy. */
const DATA = join(ROOT, "lib", "game-breakdowns.json");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|css|md|json|html)$/.test(name)) out.push(path);
  }
  return out;
}

test("no shipped copy, prompt, or doc frames the product as a roast", () => {
  const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib")), join(ROOT, "README.md")];
  const hits = files
    .filter((file) => file !== SELF && file !== DATA)
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => BANNED.test(line))
        .map(({ line, index }) => `${relative(ROOT, file)}:${index + 1}: ${line.trim()}`),
    );
  assert.deepEqual(hits, []);
});

test("every archetype carries a hire-signal line and the disclaimer names the signal", () => {
  for (const [id, archetype] of Object.entries(ARCHETYPES)) {
    assert.ok(archetype.signal.length > 20, `${id} needs a signal line`);
    assert.doesNotMatch(archetype.signal, /\byou\b/i, `${id} should describe the candidate, not jab at the reader`);
  }
  assert.match(DISCLAIMER, /hire signal/);
  assert.match(DISCLAIMER, /not a hiring decision/);
});
