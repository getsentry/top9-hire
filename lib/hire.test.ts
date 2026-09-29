import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GATEWAY_MISSING,
  READ_UNREACHABLE,
  gatewayReady,
  parsePaste,
  readGames,
} from "./hire.ts";

const NINE = "a\nb\nc\nd\ne\nf\ng\nh\ni";

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

test("failed reads say so plainly and promise nothing was invented", () => {
  assert.match(GATEWAY_MISSING, /will not invent/);
  assert.match(READ_UNREACHABLE, /Nothing was invented/);
  assert.match(READ_UNREACHABLE, /Try again/);
});

test("a pasted title is clipped and only nine are accepted", () => {
  const long = "x".repeat(500);
  const games = readGames(`${long}\n${long} | note`);
  assert.equal(games[0]?.title.length, 100);
  assert.equal(games[1]?.title.length, 100);
  assert.equal(parsePaste(Array.from({ length: 10 }, () => "g").join("\n"), "").ok, false);
});
