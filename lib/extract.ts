import { generateText, Output } from "ai";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { MissingGatewayKey, requestOidcToken } from "./classify.ts";
import { gatewayReady } from "./hire.ts";
import { MAX_IMAGE_BYTES, rejectImageFile } from "./image-limit.ts";

export const DEFAULT_EXTRACT_MODEL = "google/gemini-3.5-flash-lite";
/** Tried by the gateway when the default model errors or is down. */
const FALLBACK_EXTRACT_MODEL = "openai/gpt-6-luna-fast";

export const extractSchema = z.object({
  games: z.array(z.string().min(1)).length(9),
});

export type ExtractResult = z.infer<typeof extractSchema>;

export const EXTRACT_PROMPT =
  "Analyze this My9Games / Steam-style 3x3 game card image. Extract the 9 game titles shown under the game covers, reading in standard left-to-right, top-to-bottom grid order (row 1: items 1, 2, 3; row 2: items 4, 5, 6; row 3: items 7, 8, 9). Return only the nine title strings under the covers. No commentary.";

export interface ImageInput {
  bytes: Uint8Array;
  mediaType: string;
}

export function parseTweetUrl(url: string): { statusId: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (
      host !== "twitter.com" &&
      host !== "mobile.twitter.com" &&
      host !== "www.twitter.com" &&
      host !== "x.com" &&
      host !== "www.x.com" &&
      host !== "fxtwitter.com" &&
      host !== "vxtwitter.com" &&
      host !== "fixupx.com"
    ) {
      return null;
    }
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/i);
    if (!match || !match[1]) return null;
    return { statusId: match[1] };
  } catch {
    return null;
  }
}

interface ResolvedTweetMedia {
  mediaUrl: string;
}

const NUMERIC_STATUS_ID = /^\d+$/;

const TWITTER_API_HOST = "api.twitter.com";
const FXTWITTER_API_HOST = "api.fxtwitter.com";

/** Tweet photos are served from the Twitter/X image CDN. */
const ALLOWED_MEDIA_HOSTS = new Set(["pbs.twimg.com"]);

const FETCH_TIMEOUT_MS = 8000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** Every outbound call times out and never follows a redirect off the checked host. */
const fetchOptions = (headers?: Record<string, string>): RequestInit => ({
  redirect: "manual",
  headers,
  signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
});

/** Reads the body, stopping as soon as it passes the cap. Returns null when it does. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function readJsonCapped<T>(res: Response): Promise<T> {
  const bytes = await readCapped(res, MAX_JSON_BYTES);
  if (!bytes) throw new Error("Tweet resolver answer was too large.");
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
}

function assertNumericStatusId(statusId: string): string {
  if (!NUMERIC_STATUS_ID.test(statusId)) {
    throw new Error("Invalid X/Twitter URL. Please provide a link to a tweet/post.");
  }
  return statusId;
}

function assertLockedHost(url: URL, host: typeof TWITTER_API_HOST | typeof FXTWITTER_API_HOST): URL {
  if (url.protocol !== "https:" || url.hostname !== host || url.port !== "") {
    throw new Error("Refusing to call an unexpected API host.");
  }
  return url;
}

function twitterStatusUrl(statusId: string): URL {
  const id = encodeURIComponent(assertNumericStatusId(statusId));
  const url = new URL(`/2/tweets/${id}`, "https://api.twitter.com");
  url.search =
    "?expansions=attachments.media_keys&media.fields=url,preview_image_url,type,width,height";
  return assertLockedHost(url, TWITTER_API_HOST);
}

function fxStatusUrl(statusId: string): URL {
  const id = encodeURIComponent(assertNumericStatusId(statusId));
  const url = new URL(`/status/${id}`, "https://api.fxtwitter.com");
  return assertLockedHost(url, FXTWITTER_API_HOST);
}

function allowlistedMediaUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Tweet image URL could not be resolved.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !ALLOWED_MEDIA_HOSTS.has(parsed.hostname)
  ) {
    throw new Error("Tweet image host is not allowed.");
  }
  return parsed;
}

export class TweetNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TweetNotFoundError";
  }
}

/** A tweet provider is rate limiting us or down. Not the user's fault, so callers report it apart from user errors. */
export class ResolverBusyError extends Error {
  source: "fxtwitter" | "x-api";
  status: number;
  retryAfter?: number;
  /** True when we refused locally inside a known cool-down window, without calling the provider. */
  shortCircuit: boolean;

  constructor(init: {
    source: "fxtwitter" | "x-api";
    status: number;
    retryAfter?: number;
    shortCircuit?: boolean;
  }) {
    super(`Tweet resolver ${init.source} is busy (${init.status}).`);
    this.name = "ResolverBusyError";
    this.source = init.source;
    this.status = init.status;
    this.retryAfter = init.retryAfter;
    this.shortCircuit = init.shortCircuit ?? false;
  }
}

export const RESOLVER_BUSY_COPY = "X lookups are busy right now. Upload the card image instead.";

const DEFAULT_COOLDOWN_SECONDS = 60;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

// Per server instance only; a cold start forgets both.
let busyUntil = 0;
const resolvedCache = new Map<string, { result: ResolvedTweetMedia; expires: number }>();

/** Test-only. */
export function resetResolverState(): void {
  busyUntil = 0;
  resolvedCache.clear();
}

/** Retry-After is delta-seconds or an HTTP date. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  let seconds: number;
  if (/^\d+$/.test(value)) {
    seconds = Number(value);
  } else {
    const at = Date.parse(value);
    if (Number.isNaN(at)) return undefined;
    seconds = Math.ceil((at - Date.now()) / 1000);
  }
  return Math.min(3600, Math.max(1, seconds));
}

function cacheResult(statusId: string, result: ResolvedTweetMedia): ResolvedTweetMedia {
  resolvedCache.delete(statusId);
  resolvedCache.set(statusId, { result, expires: Date.now() + CACHE_TTL_MS });
  if (resolvedCache.size > CACHE_MAX_ENTRIES) {
    const oldest = resolvedCache.keys().next().value;
    if (oldest !== undefined) resolvedCache.delete(oldest);
  }
  return result;
}

export async function resolveTweetMedia(
  tweetUrl: string,
  env: { [key: string]: string | undefined } = process.env,
): Promise<ResolvedTweetMedia> {
  const parsed = parseTweetUrl(tweetUrl);
  if (!parsed) {
    throw new Error("Invalid X/Twitter URL. Please provide a link to a tweet/post.");
  }
  const statusId = assertNumericStatusId(parsed.statusId);

  const cached = resolvedCache.get(statusId);
  if (cached) {
    if (cached.expires > Date.now()) return cached.result;
    resolvedCache.delete(statusId);
  }

  // 1. Try official X API if bearer token or API credentials exist
  const bearerToken = env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN;
  if (bearerToken) {
    try {
      const apiUrl = twitterStatusUrl(statusId);
      const res = await fetch(apiUrl, fetchOptions({ Authorization: `Bearer ${bearerToken}` }));
      if (res.ok) {
        const data = await readJsonCapped<{
          includes?: {
            media?: Array<{
              url?: string;
              preview_image_url?: string;
              type?: string;
              width?: number;
              height?: number;
            }>;
          };
        }>(res);
        const photos = data.includes?.media?.filter(
          (m) => (m.type === "photo" || !m.type) && (m.url || m.preview_image_url),
        );
        if (photos && photos.length > 0) {
          // Pick largest image if multiple
          photos.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
          const chosen = photos[0]?.url || photos[0]?.preview_image_url;
          if (chosen) return cacheResult(statusId, { mediaUrl: chosen });
        }
      }
    } catch {
      // Fall through to public resolver
    }
  }

  // 2. Reliable public tweet->media helper (fxtwitter API)
  if (Date.now() < busyUntil) {
    throw new ResolverBusyError({
      source: "fxtwitter",
      status: 429,
      retryAfter: Math.max(1, Math.ceil((busyUntil - Date.now()) / 1000)),
      shortCircuit: true,
    });
  }
  const fxUrl = fxStatusUrl(statusId);
  let fxRes: Response;
  try {
    fxRes = await fetch(fxUrl, fetchOptions({ "User-Agent": "top9-hire/1.0" }));
  } catch (err) {
    throw new Error(
      `Failed to reach tweet resolver: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (fxRes.status === 429 || fxRes.status >= 500) {
    const retryAfter = parseRetryAfter(fxRes.headers.get("retry-after"));
    if (fxRes.status === 429) {
      busyUntil = Date.now() + (retryAfter ?? DEFAULT_COOLDOWN_SECONDS) * 1000;
    }
    throw new ResolverBusyError({ source: "fxtwitter", status: fxRes.status, retryAfter });
  }

  if (!fxRes.ok) {
    throw new TweetNotFoundError(
      `Tweet not found or could not be loaded (${fxRes.status}). Ensure the tweet is public and exists.`,
    );
  }

  const fxData = await readJsonCapped<{
    code?: number;
    message?: string;
    tweet?: {
      media?: {
        photos?: Array<{ url: string; width?: number; height?: number }>;
        all?: Array<{ url: string; type?: string; width?: number; height?: number }>;
      };
    };
  }>(fxRes);

  const photos =
    fxData.tweet?.media?.photos ||
    fxData.tweet?.media?.all?.filter((m) => m.type === "photo" || !m.type);

  if (!photos || photos.length === 0) {
    throw new TweetNotFoundError("No image found attached to this tweet.");
  }

  // Pick largest image if multiple
  photos.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  const chosen = photos[0];
  if (!chosen?.url) {
    throw new Error("Tweet image URL could not be resolved.");
  }

  return cacheResult(statusId, { mediaUrl: chosen.url });
}

export async function fetchImageBytesFromUrl(
  url: string,
  maxSizeBytes = MAX_IMAGE_BYTES,
): Promise<ImageInput> {
  const mediaUrl = allowlistedMediaUrl(url);
  let res: Response;
  try {
    res = await fetch(mediaUrl, fetchOptions());
  } catch (err) {
    throw new Error(
      `Failed to download image from URL: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new Error(`Failed to download image: HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const mediaType = contentType.split(";")[0]?.trim() || "image/jpeg";

  const rejected = rejectImageFile({ size: 0, type: mediaType });
  if (rejected) throw new Error(rejected.message);

  const bytes = await readCapped(res, maxSizeBytes);
  if (!bytes) {
    throw new Error(`Image exceeds limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`);
  }

  return { bytes, mediaType };
}

export async function extractGamesFromImage(
  image: ImageInput,
  overrideModel?: string,
  opts: { beforeModel?: () => Promise<void> } = {},
): Promise<ExtractResult> {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) {
    throw new MissingGatewayKey();
  }

  const model =
    overrideModel || process.env.TOP9_EXTRACT_MODEL || DEFAULT_EXTRACT_MODEL;

  await opts.beforeModel?.();

  const extracted = await Sentry.startSpan(
    {
      op: "top9.extract",
      name: "read 9 titles from card",
      attributes: {
        "gen_ai.request.model": model,
        "gen_ai.provider.name": "vercel.ai_gateway",
      },
    },
    async (span) => {
      const { output } = await generateText({
        model,
        providerOptions: { gateway: { models: [FALLBACK_EXTRACT_MODEL] } },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: EXTRACT_PROMPT,
              },
              {
                type: "file",
                data: image.bytes,
                mediaType: image.mediaType as
                  | `image/${string}`
                  | "image"
                  | "application/pdf"
                  | "text/plain",
              },
            ],
          },
        ],
        output: Output.object({
          schema: extractSchema,
          name: "top9_extracted_games",
          description: "Nine extracted game titles in left-to-right, top-to-bottom order.",
        }),
        telemetry: {
          isEnabled: true,
          functionId: "extract-top9-games",
          recordInputs: false,
          recordOutputs: true,
        },
      });

      if (!output) {
        throw new Error("Model returned empty extraction result");
      }

      const result = extractSchema.parse(output);
      span.setAttribute("top9.games.count", result.games.length);
      span.updateName("read 9 titles from card · model");
      return result;
    },
  );
  // Streamed gen_ai spans wait on an unref'd timer. Flush before Vercel freezes the function.
  await Sentry.flush(2000);
  return extracted;
}
