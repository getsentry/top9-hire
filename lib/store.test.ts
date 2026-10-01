import assert from "node:assert/strict";
import test from "node:test";
import { CACHE_VERSION, cacheKey, readJson, readMany, readSpanName, writeJson, writeMany, writeSpanName } from "./store.ts";
import { chunk } from "./breakdown.ts";

test("cache keys are versioned, stable, and split by kind", () => {
  const game = cacheKey("games", { title: "hades" });
  assert.match(game, new RegExp(`^${CACHE_VERSION}/games/[0-9a-f]{16}\\.json$`));
  assert.equal(game, cacheKey("games", { title: "hades" }));
  assert.notEqual(game, cacheKey("games", { title: "celeste" }));
  assert.match(cacheKey("jobs", { pageUrl: "https://x.test/1" }), new RegExp(`^${CACHE_VERSION}/jobs/[0-9a-f]{64}\\.json$`));
});

test("fit keys depend on the url and on title order", () => {
  const a = cacheKey("fits", { pageUrl: "u", titles: ["a", "b"] });
  assert.match(a, new RegExp(`^${CACHE_VERSION}/fits/[0-9a-f]{64}\\.json$`));
  assert.notEqual(a, cacheKey("fits", { pageUrl: "u", titles: ["b", "a"] }));
  assert.notEqual(a, cacheKey("fits", { pageUrl: "v", titles: ["a", "b"] }));
});

test("chunk splits into groups of at most the size", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]]);
  assert.deepEqual(chunk([], 3), []);
});

test("readJson and writeJson do nothing without a token", async () => {
  const saved = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(await readJson("v1/x.json"), undefined);
    assert.equal(await writeJson("v1/x.json", { a: 1 }), false);
  } finally {
    if (saved !== undefined) process.env.BLOB_READ_WRITE_TOKEN = saved;
  }
});

test("cache span names say hit or miss for one key and count hits for many", () => {
  assert.equal(readSpanName("jobs", 1), "Check cache for job");
  assert.equal(readSpanName("jobs", 1, 1), "Check cache for job (found)");
  assert.equal(readSpanName("jobs", 1, 0), "Check cache for job (not found)");
  assert.equal(readSpanName("games", 9, 1), "Check cache for 9 games (1 found)");
  assert.equal(readSpanName("wiki", 8, 0), "Check cache for 8 wiki pages (0 found)");
  assert.equal(readSpanName("wiki", 1, 1), "Check cache for wiki page (found)");
  assert.equal(writeSpanName("fits", 1), "Save fit to cache");
  assert.equal(writeSpanName("games", 8), "Save 8 games to cache");
});

/** Blob stand-ins: `stored` paths hit, `broken` paths throw, the rest miss. */
function fakeBlob(stored: Record<string, unknown>, broken: string[] = []) {
  const puts: string[] = [];
  const io = {
    get: async (path: string) => {
      if (broken.includes(path)) throw new Error(`blob down: ${path}`);
      if (!(path in stored)) return null;
      return { statusCode: 200, stream: new Response(JSON.stringify(stored[path])).body };
    },
    put: async (path: string) => {
      if (broken.includes(path)) throw new Error(`blob down: ${path}`);
      puts.push(path);
    },
  };
  return { io: io as never, puts };
}

async function withToken<T>(run: () => Promise<T>): Promise<T> {
  const saved = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  try {
    return await run();
  } finally {
    if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = saved;
  }
}

test("readMany returns hits in path order and misses as undefined", async () => {
  const { io } = fakeBlob({ a: { n: 1 }, c: { n: 3 } });
  const out = await withToken(() => readMany("games", ["a", "b", "c"], io));
  assert.deepEqual(out, [{ n: 1 }, undefined, { n: 3 }]);
});

test("a failed blob call reads as a miss and a failed write does not throw", async () => {
  const { io, puts } = fakeBlob({ a: { n: 1 } }, ["b"]);
  await withToken(async () => {
    assert.deepEqual(await readMany("games", ["a", "b"], io), [{ n: 1 }, undefined]);
    assert.equal(await writeMany("games", [["a", 1], ["b", 2]], io), false);
  });
  assert.deepEqual(puts, ["a"]);
});

test("readMany and writeMany do nothing without a token", async () => {
  const saved = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.deepEqual(await readMany("games", ["a", "b"]), [undefined, undefined]);
    assert.equal(await writeMany("games", [["a", 1]]), false);
  } finally {
    if (saved !== undefined) process.env.BLOB_READ_WRITE_TOKEN = saved;
  }
});
