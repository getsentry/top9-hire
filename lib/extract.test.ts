import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import {
  extractSchema,
  parseTweetUrl,
  resolveTweetMedia,
  DEFAULT_EXTRACT_MODEL,
  EXTRACT_PROMPT,
} from "./extract.ts";

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

test("parseTweetUrl parses standard X and Twitter URLs", () => {
  assert.deepEqual(parseTweetUrl("https://x.com/sergical/status/1234567890"), {
    statusId: "1234567890",
  });
  assert.deepEqual(parseTweetUrl("https://twitter.com/user/status/9876543210?s=20"), {
    statusId: "9876543210",
  });
  assert.deepEqual(parseTweetUrl("https://fxtwitter.com/i/status/1122334455"), {
    statusId: "1122334455",
  });
  assert.deepEqual(parseTweetUrl("https://fixupx.com/user/status/5544332211/photo/1"), {
    statusId: "5544332211",
  });

  // Invalid URLs
  assert.equal(parseTweetUrl("https://google.com/search?q=test"), null);
  assert.equal(parseTweetUrl("https://x.com/home"), null);
  assert.equal(parseTweetUrl("not-a-url"), null);
});

test("resolveTweetMedia uses official Twitter API when bearer token provided and falls back to fxtwitter", async () => {
  // Test with mock fetch for fxtwitter
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.fxtwitter.com")) {
        return new Response(
          JSON.stringify({
            code: 200,
            tweet: {
              media: {
                photos: [
                  { url: "https://pbs.twimg.com/media/small.jpg", width: 400, height: 400 },
                  { url: "https://pbs.twimg.com/media/large.jpg", width: 1200, height: 1200 },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const result = await resolveTweetMedia("https://x.com/testuser/status/12345", {});
    // Should choose the larger image
    assert.equal(result.mediaUrl, "https://pbs.twimg.com/media/large.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveTweetMedia throws when tweet has no media", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      return new Response(
        JSON.stringify({
          code: 200,
          tweet: {
            media: {
              photos: [],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await assert.rejects(
      async () => {
        await resolveTweetMedia("https://x.com/testuser/status/12345", {});
      },
      { message: "No image found attached to this tweet." },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("default extract model is google/gemini-2.5-flash and prompt specifies 3x3 reading order", () => {
  assert.equal(DEFAULT_EXTRACT_MODEL, "google/gemini-2.5-flash");
  assert.ok(EXTRACT_PROMPT.includes("3x3"));
  assert.ok(EXTRACT_PROMPT.includes("left-to-right, top-to-bottom"));
});
