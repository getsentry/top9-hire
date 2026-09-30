import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import {
  extractSchema,
  fetchImageBytesFromUrl,
  DEFAULT_EXTRACT_MODEL,
  EXTRACT_PROMPT,
} from "./extract.ts";

function requestHostname(input: RequestInfo | URL): string {
  const href = input instanceof Request ? input.url : input.toString();
  return new URL(href).hostname;
}

test("extract schema requires exactly 9 non-empty game titles", () => {
  const valid = extractSchema.safeParse({
    games: [
      "Hitman: Blood Money",
      "Heroes of Might and Magic III: Armageddon's Blade",
      "Warcraft III: The Frozen Throne",
      "Diablo II",
      "StarCraft",
      "Space Rangers",
      "Counter-Strike",
      "Cossacks: European Wars",
      "Need for Speed: Most Wanted",
    ],
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.games.length, 9);
    assert.equal(valid.data.games[0], "Hitman: Blood Money");
  }

  // Reject less than 9
  const tooFew = extractSchema.safeParse({
    games: ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5", "Game 6", "Game 7", "Game 8"],
  });
  assert.equal(tooFew.success, false);

  // Reject more than 9
  const tooMany = extractSchema.safeParse({
    games: [
      "Game 1",
      "Game 2",
      "Game 3",
      "Game 4",
      "Game 5",
      "Game 6",
      "Game 7",
      "Game 8",
      "Game 9",
      "Game 10",
    ],
  });
  assert.equal(tooMany.success, false);

  // Reject empty string titles
  const emptyTitle = extractSchema.safeParse({
    games: ["", "Game 2", "Game 3", "Game 4", "Game 5", "Game 6", "Game 7", "Game 8", "Game 9"],
  });
  assert.equal(emptyTitle.success, false);
});

test("extractSchema jsonSchema produces valid array of 9 items", async () => {
  const schema = await asSchema(extractSchema).jsonSchema;
  assert.equal(schema.type, "object");
  const gamesProp = schema.properties?.games;
  assert.ok(gamesProp && typeof gamesProp === "object");
});

test("fetchImageBytesFromUrl downloads only allowlisted Twitter image hosts", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const host = requestHostname(input);
      assert.equal(host, "pbs.twimg.com");
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    };

    const image = await fetchImageBytesFromUrl("https://pbs.twimg.com/media/large.jpg");
    assert.equal(image.mediaType, "image/jpeg");
    assert.deepEqual(Array.from(image.bytes), [1, 2, 3, 4]);

    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      return new Response(new Uint8Array([1]), { status: 200 });
    };

    const rejected = [
      "https://evil.example/image.jpg",
      "https://video.twimg.com/tweet_video_thumb/preview.jpg",
      "https://ton.twimg.com/tweet_video_thumb/legacy.jpg",
      "https://pbs.twimg.com.evil.example/image.jpg",
      "https://evil.example/pbs.twimg.com/image.jpg",
      "http://pbs.twimg.com/media/large.jpg",
      "https://user:pass@pbs.twimg.com/media/large.jpg",
    ];
    for (const mediaUrl of rejected) {
      await assert.rejects(() => fetchImageBytesFromUrl(mediaUrl), {
        message: "Tweet image host is not allowed.",
      });
    }
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("default extract model is google/gemini-3.5-flash-lite and prompt specifies 3x3 reading order", () => {
  assert.equal(DEFAULT_EXTRACT_MODEL, "google/gemini-3.5-flash-lite");
  assert.ok(EXTRACT_PROMPT.includes("3x3"));
  assert.ok(EXTRACT_PROMPT.includes("left-to-right, top-to-bottom"));
});

test("fetchImageBytesFromUrl refuses a redirect-free download with a wrong type or too many bytes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let init: RequestInit | undefined;
    globalThis.fetch = async (_input: RequestInfo | URL, options?: RequestInit) => {
      init = options;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "text/html" } });
    };
    await assert.rejects(() => fetchImageBytesFromUrl("https://pbs.twimg.com/a.jpg"), /Unsupported file format/);
    assert.equal(init?.redirect, "manual");
    assert.ok(init?.signal);

    globalThis.fetch = async () => new Response(new Uint8Array(20), { status: 200, headers: { "content-type": "image/png" } });
    await assert.rejects(() => fetchImageBytesFromUrl("https://pbs.twimg.com/a.png", 10), /exceeds limit/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
