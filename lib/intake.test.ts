import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_SLOTS,
  fillSlots,
  filledCount,
  readIntake,
  readLines,
  setSlot,
  slotsToPaste,
} from "./intake.ts";
import { readGames } from "./hire.ts";

test("an x.com status link is a tweet intake", () => {
  assert.deepEqual(readIntake("  https://x.com/dillon_mulroy/status/1234567890 \n"), {
    kind: "tweet",
    url: "https://x.com/dillon_mulroy/status/1234567890",
  });
  assert.equal(readIntake("https://twitter.com/a_b/status/42?s=20").kind, "tweet");
  assert.equal(readIntake("https://mobile.twitter.com/a/status/42").kind, "tweet");
});

test("a profile link or plain text is a list of lines", () => {
  assert.deepEqual(readIntake("https://x.com/dillon_mulroy"), {
    kind: "lines",
    lines: ["https://x.com/dillon_mulroy"],
  });
  assert.deepEqual(readIntake("Factorio\n\nCeleste\r\nHades"), {
    kind: "lines",
    lines: ["Factorio", "Celeste", "Hades"],
  });
});

test("list markers are stripped and titles that start with a digit survive", () => {
  assert.deepEqual(
    readLines("1. Factorio\n2) Celeste\n- Hades\n• Outer Wilds\n7 Days to Die\n10. Rain World"),
    ["Factorio", "Celeste", "Hades", "Outer Wilds", "7 Days to Die", "Rain World"],
  );
});

test("filling from a slot writes forward and stops at nine", () => {
  const slots = fillSlots(EMPTY_SLOTS, 7, ["a", "b", "c"]);
  assert.deepEqual(slots, ["", "", "", "", "", "", "", "a", "b"]);
  assert.equal(filledCount(slots), 2);
});

test("setting one slot leaves the others alone", () => {
  const slots = setSlot(fillSlots(EMPTY_SLOTS, 0, ["a", "b"]), 1, "z");
  assert.deepEqual(slots, ["a", "z", "", "", "", "", "", "", ""]);
});

test("slots round-trip through the server paste parser, notes included", () => {
  const slots = fillSlots(EMPTY_SLOTS, 0, [
    "Factorio | belts",
    "Celeste",
    "  ",
    "Hades",
  ]);
  const paste = slotsToPaste(slots);
  assert.equal(paste, "Factorio | belts\nCeleste\nHades");
  assert.deepEqual(readGames(paste), [
    { title: "Factorio", note: "belts" },
    { title: "Celeste" },
    { title: "Hades" },
  ]);
  assert.equal(filledCount(slots), 3);
});
