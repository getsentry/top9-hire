import assert from "node:assert/strict";
import { test } from "node:test";
import { wrapLines } from "./text.ts";

test("a roast wraps at word boundaries under the width", () => {
  assert.equal(
    wrapLines(
      "You would automate the coffee machine and then argue with it about throughput.",
      24,
    ),
    "You would automate the\ncoffee machine and then\nargue with it about\nthroughput.",
  );
});

test("short text and a single long word pass through", () => {
  assert.equal(wrapLines("Nine titles.", 24), "Nine titles.");
  assert.equal(wrapLines("Supercalifragilisticexpialidocious yes", 10), "Supercalifragilisticexpialidocious\nyes");
  assert.equal(wrapLines("   ", 10), "");
});
