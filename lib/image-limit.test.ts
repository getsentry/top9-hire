import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_IMAGE_BYTES,
  interpretExtractResponse,
  postImageUrl,
  rejectImageFile,
  titlesChanged,
} from "./image-limit.ts";

const SERVER_ACTION_BODY_LIMIT = 1 * 1024 * 1024;
const VERCEL_PAYLOAD_LIMIT = Math.floor(4.5 * 1024 * 1024);

test("image cap sits above the Server Action limit and under the Vercel payload limit", () => {
  assert.ok(MAX_IMAGE_BYTES > SERVER_ACTION_BODY_LIMIT);
  assert.ok(MAX_IMAGE_BYTES + 64 * 1024 <= VERCEL_PAYLOAD_LIMIT);
});

test("rejectImageFile accepts a card PNG and rejects oversize or unknown types", () => {
  assert.equal(rejectImageFile({ size: MAX_IMAGE_BYTES, type: "image/png" }), null);
  const oversize = rejectImageFile({ size: MAX_IMAGE_BYTES + 1, type: "image/png" });
  assert.equal(oversize?.ok, false);
  if (oversize && !oversize.ok) {
    assert.equal(oversize.error, "file_too_large");
    assert.match(oversize.message, /4MB/);
  }
  const gif = rejectImageFile({ size: 1000, type: "image/gif" });
  assert.equal(gif?.ok, false);
  if (gif && !gif.ok) assert.equal(gif.error, "unsupported_media_type");
});

test("interpretExtractResponse reads games and maps a platform 413", () => {
  const games = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  assert.deepEqual(interpretExtractResponse(200, { games }), { ok: true, games });
  assert.deepEqual(interpretExtractResponse(413, "payload too large"), {
    ok: false,
    error: "file_too_large",
    message: "File size exceeds 4MB limit.",
  });
  assert.equal(interpretExtractResponse(422, { error: "extract_failed", message: "nope" }).ok, false);
});

test("titlesChanged is false only when every slot matches", () => {
  const games = ["a", "b", "c"];
  assert.equal(titlesChanged(games, ["a", "b", "c"]), false);
  assert.equal(titlesChanged(games, ["a", "b", "d"]), true);
  assert.equal(titlesChanged(games, ["a", "b"]), true);
});

test("the plate only shows post images from https pbs.twimg.com", () => {
  assert.equal(
    postImageUrl("https://pbs.twimg.com/media/HTLvdylboAABRjQ.jpg?name=orig"),
    "https://pbs.twimg.com/media/HTLvdylboAABRjQ.jpg?name=orig",
  );
  assert.equal(postImageUrl("http://pbs.twimg.com/media/a.jpg"), undefined);
  assert.equal(postImageUrl("https://pbs.twimg.com.evil.test/a.jpg"), undefined);
  assert.equal(postImageUrl("javascript:alert(1)"), undefined);
  assert.equal(postImageUrl("https://user@pbs.twimg.com/a.jpg"), undefined);
  assert.equal(postImageUrl(undefined), undefined);
});
