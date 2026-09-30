import assert from "node:assert/strict";
import test from "node:test";
import { readShare, signShare, type SharePayload } from "./share.ts";

const payload: SharePayload = {
  v: 1,
  h: "dorryspears",
  g: ["Hades", "Celeste", "Portal"],
  a: "Systems necromancer",
  j: "Software Engineer, Platform",
  m: "stretch",
  p: 75,
};

test("a signed share reads back unchanged", () => {
  const token = signShare(payload);
  assert.ok(token);
  assert.deepEqual(readShare(token), payload);
});

test("a tampered payload or MAC is rejected", () => {
  const token = signShare(payload) ?? "";
  const [body, tag] = token.split(".") as [string, string];
  const forged = Buffer.from(JSON.stringify({ ...payload, m: "match" })).toString("base64url");
  assert.equal(readShare(`${forged}.${tag}`), undefined);
  const flipped = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
  assert.equal(readShare(`${body}.${flipped}`), undefined);
  assert.equal(readShare(body), undefined);
});

test("an oversize token is rejected", () => {
  assert.equal(readShare(`${"a".repeat(2049)}.b`), undefined);
});

test("an invalid handle is dropped at sign time", () => {
  const token = signShare({ ...payload, h: "not a handle!" }) ?? "";
  const read = readShare(token);
  assert.ok(read);
  assert.equal(read.h, undefined);
});

test("production without the secret signs nothing", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { secret: env.SHARE_SECRET, node: env.NODE_ENV };
  delete env.SHARE_SECRET;
  env.NODE_ENV = "production";
  try {
    assert.equal(signShare(payload), undefined);
  } finally {
    if (saved.secret === undefined) delete env.SHARE_SECRET;
    else env.SHARE_SECRET = saved.secret;
    env.NODE_ENV = saved.node;
  }
});

test("nine wide-character titles shrink until the token fits and still reads back", () => {
  const wide: SharePayload = {
    v: 1,
    g: Array(9).fill("職".repeat(80)),
    a: "職".repeat(120),
    j: "職".repeat(120),
    m: "match",
  };
  const token = signShare(wide);
  assert.ok(token);
  assert.ok(token.length <= 2048);
  const read = readShare(token);
  assert.ok(read);
  for (const text of [...read.g, read.a, read.j]) {
    assert.ok(text.length >= 1);
    assert.ok(wide.a.startsWith(text));
  }
});

test("clipping never leaves a lone surrogate", () => {
  const title = `${"a".repeat(79)}😀`;
  const token = signShare({ ...payload, g: [title] });
  assert.ok(token);
  const read = readShare(token);
  assert.ok(read);
  assert.doesNotMatch(read.g[0] ?? "", /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  assert.equal(read.g[0], "a".repeat(79));
});
