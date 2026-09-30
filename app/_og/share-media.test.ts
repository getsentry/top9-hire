import assert from "node:assert/strict";
import test from "node:test";
import { shareMedia } from "./share-media.ts";
import type { SharePayload } from "../../lib/share.ts";

const share: SharePayload = { v: 1, h: "someone", g: ["Hades"], a: "The Strategist", j: "Engineer", m: "match", t: "123" };
const PNG = new Uint8Array([137, 80, 78, 71]);

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const image = (type = "image/png") => new Response(PNG, { headers: { "content-type": type } });

/** A fake X: answers the two fxtwitter lookups, then any image by URL. */
function fakeFetch(avatarUrl: string, photoUrl: string, seen: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    if (url === "https://api.fxtwitter.com/someone") return json({ user: { avatar_url: avatarUrl } });
    if (url === "https://api.fxtwitter.com/status/123") {
      return json({ tweet: { author: { avatar_url: avatarUrl }, media: { photos: [{ url: photoUrl }] } } });
    }
    return image();
  }) as typeof fetch;
}

test("avatar and card come back as data URIs, with the larger avatar and the small card", async () => {
  const seen: string[] = [];
  const media = await shareMedia(
    share,
    fakeFetch("https://pbs.twimg.com/profile_images/1/a_normal.jpg", "https://pbs.twimg.com/media/b.jpg?name=orig", seen),
  );
  assert.match(media.avatar ?? "", /^data:image\/png;base64,/);
  assert.match(media.card ?? "", /^data:image\/png;base64,/);
  assert.ok(seen.includes("https://pbs.twimg.com/profile_images/1/a_200x200.jpg"));
  assert.ok(seen.includes("https://pbs.twimg.com/media/b.jpg?name=small"));
});

test("an image URL on another host is rejected", async () => {
  const seen: string[] = [];
  const media = await shareMedia(share, fakeFetch("https://evil.example/a_normal.jpg", "http://pbs.twimg.com/media/b.jpg", seen));
  assert.deepEqual(media, { avatar: undefined, card: undefined });
  assert.ok(seen.every((url) => url.startsWith("https://api.fxtwitter.com/")));
});

test("a failed or non-image answer leaves the field undefined and never throws", async () => {
  const failing = (async () => {
    throw new Error("timeout");
  }) as typeof fetch;
  assert.deepEqual(await shareMedia(share, failing), { avatar: undefined, card: undefined });

  const html = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.fxtwitter.com/")) {
      return json({ user: { avatar_url: "https://pbs.twimg.com/a_normal.jpg" }, tweet: { media: { photos: [{ url: "https://pbs.twimg.com/b.jpg" }] } } });
    }
    return image("text/html");
  }) as typeof fetch;
  assert.deepEqual(await shareMedia(share, html), { avatar: undefined, card: undefined });
});
