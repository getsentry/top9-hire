import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { loadShare, readShare, saveShare, signShare, type SharePayload } from "./share.ts";
import { useBlobIo } from "./store.ts";

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

test("company and post id round trip; old tokens without them still read", () => {
  const read = readShare(signShare({ ...payload, c: "Sentry", t: "1797001231180009863" }) ?? "");
  assert.equal(read?.c, "Sentry");
  assert.equal(read?.t, "1797001231180009863");
  const old = readShare(signShare(payload) ?? "");
  assert.ok(old);
  assert.equal(old.c, undefined);
  assert.equal(old.t, undefined);
});

test("a long company is clipped and an empty one or a bad post id is dropped at signing", () => {
  const read = readShare(signShare({ ...payload, c: "x".repeat(100), t: "12ab" }) ?? "");
  assert.equal(read?.c, "x".repeat(60));
  assert.equal(read?.t, undefined);
  assert.equal(readShare(signShare({ ...payload, c: "" }) ?? "")?.c, undefined);
});

test("a validly signed token with a bad post id or company is rejected at read", () => {
  const sign = (extra: object) => {
    const body = Buffer.from(JSON.stringify({ ...payload, ...extra })).toString("base64url");
    const tag = createHmac("sha256", "top9-dev-share-secret").update(body).digest().subarray(0, 16).toString("base64url");
    return `${body}.${tag}`;
  };
  assert.ok(readShare(sign({ t: "123" })));
  assert.equal(readShare(sign({ t: "12ab" })), undefined);
  assert.equal(readShare(sign({ t: 5 })), undefined);
  assert.equal(readShare(sign({ c: "" })), undefined);
  assert.equal(readShare(sign({ c: "x".repeat(61) })), undefined);
});

function memoryBlob(stored: Record<string, string> = {}) {
  return {
    get: async (path: string) => (path in stored ? { statusCode: 200, stream: new Response(stored[path]).body } : null),
    put: async (path: string, body: string) => {
      stored[path] = body;
    },
    stored,
  };
}

async function withBlob<T>(io: ReturnType<typeof memoryBlob> | undefined, run: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.BLOB_READ_WRITE_TOKEN;
  if (io) env.BLOB_READ_WRITE_TOKEN = "test-token";
  else delete env.BLOB_READ_WRITE_TOKEN;
  useBlobIo(io as never);
  try {
    return await run();
  } finally {
    useBlobIo(undefined);
    if (saved === undefined) delete env.BLOB_READ_WRITE_TOKEN;
    else env.BLOB_READ_WRITE_TOKEN = saved;
  }
}

test("a saved share gets a short handle slug that loads the same payload, deterministically", async () => {
  await withBlob(memoryBlob(), async () => {
    const slug = await saveShare(payload);
    assert.match(slug ?? "", /^dorryspears-[A-Za-z0-9]{10}$/);
    assert.deepEqual(await loadShare(slug ?? ""), readShare(signShare(payload) ?? ""));
    assert.equal(await saveShare(payload), slug);
  });
});

test("a share without a handle gets a bare id that loads", async () => {
  await withBlob(memoryBlob(), async () => {
    const { h: _h, ...bare } = payload;
    const slug = await saveShare(bare);
    assert.match(slug ?? "", /^[A-Za-z0-9]{10}$/);
    assert.deepEqual(await loadShare(slug ?? ""), readShare(signShare(bare) ?? ""));
  });
});

test("with Blob off, saveShare returns the legacy token and loadShare reads it", async () => {
  await withBlob(undefined, async () => {
    const slug = await saveShare(payload);
    assert.ok(slug?.includes("."));
    assert.deepEqual(await loadShare(slug ?? ""), payload);
    assert.deepEqual(await loadShare(encodeURIComponent(slug ?? "")), payload);
  });
});

test("loadShare rejects unknown ids, bad shapes, a wrong handle prefix and a tampered stored token", async () => {
  const io = memoryBlob();
  await withBlob(io, async () => {
    const slug = (await saveShare(payload)) ?? "";
    const id = slug.slice(slug.lastIndexOf("-") + 1);
    assert.equal(await loadShare("dorryspears-AAAAAAAAAA"), undefined);
    assert.equal(await loadShare("dorryspears-short"), undefined);
    assert.equal(await loadShare("%E0%A4%A"), undefined);
    assert.equal(await loadShare(`someoneelse-${id}`), undefined);
    assert.equal(await loadShare(id), undefined);
    const token = signShare(payload) ?? "";
    const [body, tag] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...payload, m: "match" })).toString("base64url");
    io.stored[`shares/${id}.json`] = JSON.stringify({ token: `${forged}.${tag}` });
    assert.equal(await loadShare(slug), undefined);
    io.stored[`shares/${id}.json`] = JSON.stringify({ token: body });
    assert.equal(await loadShare(slug), undefined);
  });
});
