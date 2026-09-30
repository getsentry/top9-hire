import { readResponseWithinCap } from "../../lib/tweet-media.ts";
import type { SharePayload } from "../../lib/share.ts";

const TIMEOUT_MS = 2500;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

type Fetch = typeof fetch;

/** An https pbs.twimg.com image URL with the wanted size, else undefined. The size swap keeps the fetch small. */
function twimgUrl(raw: unknown, size: { avatar: true } | { name: "small" }): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || url.port !== "") return undefined;
    if ("avatar" in size) url.pathname = url.pathname.replace("_normal.", "_200x200.");
    else url.searchParams.set("name", size.name);
    return url.toString();
  } catch {
    return undefined;
  }
}

async function getJson(fetcher: Fetch, url: string): Promise<Record<string, any> | undefined> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  if (!res.ok) return undefined;
  const bytes = await readResponseWithinCap(res, MAX_JSON_BYTES);
  if (!bytes) return undefined;
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

async function getImage(fetcher: Fetch, url: string): Promise<string | undefined> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!res.ok || !IMAGE_TYPES.includes(type)) return undefined;
  const bytes = await readResponseWithinCap(res, MAX_IMAGE_BYTES);
  if (!bytes?.byteLength) return undefined;
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Runs one lookup and turns any failure into `undefined`, so a slow or broken X never blocks the image. */
async function attempt<T>(work: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await work();
  } catch {
    return undefined;
  }
}

/**
 * The person's avatar and the Top 9 post's card image as data URIs, so satori never fetches on its own.
 * `cardAspect` is the photo's width over height, from the post data, so the frame can match the photo.
 * Both lookups run in parallel; a field that fails is left undefined and this never throws.
 */
export async function shareMedia(
  share: SharePayload,
  fetcher: Fetch = fetch,
): Promise<{ avatar?: string; card?: string; cardAspect?: number }> {
  const post = share.t
    ? attempt(async () => (await getJson(fetcher, `https://api.fxtwitter.com/status/${share.t}`))?.tweet)
    : Promise.resolve(undefined);
  const profile = share.h
    ? attempt(async () => (await getJson(fetcher, `https://api.fxtwitter.com/${share.h}`))?.user)
    : Promise.resolve(undefined);
  const [tweet, user] = await Promise.all([post, profile]);

  const avatarUrl = twimgUrl((user ?? tweet?.author)?.avatar_url, { avatar: true });
  const photo = tweet?.media?.photos?.[0];
  const cardUrl = twimgUrl(photo?.url, { name: "small" });
  const [avatar, card] = await Promise.all([
    avatarUrl ? attempt(() => getImage(fetcher, avatarUrl)) : undefined,
    cardUrl ? attempt(() => getImage(fetcher, cardUrl)) : undefined,
  ]);
  const aspect = Number(photo?.width) / Number(photo?.height);
  return Number.isFinite(aspect) && aspect > 0 && card ? { avatar, card, cardAspect: aspect } : { avatar, card };
}
