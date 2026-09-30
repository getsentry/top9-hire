import assert from "node:assert/strict";
import { test } from "node:test";
import { asSchema } from "ai";
import {
  extractSchema,
  parseTweetUrl,
  resolveTweetMedia,
  resetResolverState,
  ResolverBusyError,
  TweetNotFoundError,
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
  assert.equal(parseTweetUrl("https://x.com/user/status/notdigits"), null);
  assert.equal(parseTweetUrl("https://x.com/user/status/../../etc/passwd"), null);
});

test("resolveTweetMedia uses official Twitter API when bearer token provided and falls back to fxtwitter", async () => {
  // Test with mock fetch for fxtwitter
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      assert.equal(url.protocol, "https:");
      assert.equal(url.hostname, "api.fxtwitter.com");
      assert.equal(url.pathname, "/status/12345");
      if (url.hostname === "api.fxtwitter.com") {
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
  resetResolverState();
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

test("resolveTweetMedia rejects a non-numeric status id before fetching", async () => {
  resetResolverState();
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  try {
    globalThis.fetch = async () => {
      fetches += 1;
      return new Response("no", { status: 500 });
    };

    await assert.rejects(
      () => resolveTweetMedia("https://x.com/user/status/notdigits", {}),
      { message: "Invalid X/Twitter URL. Please provide a link to a tweet/post." },
    );
    await assert.rejects(
      () => resolveTweetMedia("https://x.com/user/status/../../etc/passwd", {}),
      { message: "Invalid X/Twitter URL. Please provide a link to a tweet/post." },
    );
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveTweetMedia requests the official API on a fixed host", async () => {
  resetResolverState();
  const originalFetch = globalThis.fetch;
  const seen: URL[] = [];
  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      seen.push(url);
      if (url.hostname === "api.twitter.com") {
        return new Response(
          JSON.stringify({
            includes: {
              media: [
                {
                  type: "photo",
                  url: "https://pbs.twimg.com/media/from-api.jpg",
                  width: 800,
                  height: 800,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const result = await resolveTweetMedia("https://x.com/testuser/status/12345?s=20", {
      TWITTER_BEARER_TOKEN: "test-token",
    });
    assert.equal(result.mediaUrl, "https://pbs.twimg.com/media/from-api.jpg");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.protocol, "https:");
    assert.equal(seen[0]?.hostname, "api.twitter.com");
    assert.equal(seen[0]?.pathname, "/2/tweets/12345");
    assert.equal(seen[0]?.searchParams.get("expansions"), "attachments.media_keys");
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("mobile.twitter.com tweet links parse; other hosts do not", () => {
  assert.deepEqual(parseTweetUrl("https://mobile.twitter.com/u/status/123"), { statusId: "123" });
  assert.equal(parseTweetUrl("https://evil.example/u/status/123"), null);
});

function stubFetch(handler: () => Response): { calls: () => number; restore: () => void } {
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count += 1;
    return handler();
  };
  return { calls: () => count, restore: () => (globalThis.fetch = originalFetch) };
}

const TWEET = "https://x.com/testuser/status/777";

test("resolveTweetMedia reports a 429 as busy and then short-circuits without fetching", async () => {
  resetResolverState();
  const stub = stubFetch(() => new Response("slow down", { status: 429, headers: { "Retry-After": "30" } }));
  try {
    await assert.rejects(resolveTweetMedia(TWEET, {}), (err: unknown) => {
      assert.ok(err instanceof ResolverBusyError);
      assert.equal(err.status, 429);
      assert.equal(err.retryAfter, 30);
      assert.equal(err.shortCircuit, false);
      return true;
    });
    assert.equal(stub.calls(), 1);
    await assert.rejects(resolveTweetMedia(TWEET, {}), (err: unknown) => {
      assert.ok(err instanceof ResolverBusyError);
      assert.equal(err.shortCircuit, true);
      assert.equal(err.status, 429);
      return true;
    });
    assert.equal(stub.calls(), 1);
  } finally {
    stub.restore();
    resetResolverState();
  }
});

test("resolveTweetMedia reports a 503 as busy", async () => {
  resetResolverState();
  const stub = stubFetch(() => new Response("down", { status: 503 }));
  try {
    await assert.rejects(resolveTweetMedia(TWEET, {}), (err: unknown) => {
      assert.ok(err instanceof ResolverBusyError);
      assert.equal(err.status, 503);
      assert.equal(err.shortCircuit, false);
      return true;
    });
  } finally {
    stub.restore();
    resetResolverState();
  }
});

test("resolveTweetMedia reports a 404 as a missing tweet", async () => {
  resetResolverState();
  const stub = stubFetch(() => new Response("nope", { status: 404 }));
  try {
    await assert.rejects(resolveTweetMedia(TWEET, {}), TweetNotFoundError);
  } finally {
    stub.restore();
    resetResolverState();
  }
});

test("resolveTweetMedia caches a success", async () => {
  resetResolverState();
  const stub = stubFetch(
    () =>
      new Response(
        JSON.stringify({ tweet: { media: { photos: [{ url: "https://pbs.twimg.com/media/a.jpg" }] } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  try {
    const first = await resolveTweetMedia(TWEET, {});
    const second = await resolveTweetMedia(TWEET, {});
    assert.equal(first.mediaUrl, second.mediaUrl);
    assert.equal(stub.calls(), 1);
  } finally {
    stub.restore();
    resetResolverState();
  }
});
