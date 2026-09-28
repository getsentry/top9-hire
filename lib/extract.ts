import { generateText, Output } from "ai";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { MissingGatewayKey, requestOidcToken } from "./classify.ts";
import { gatewayReady } from "./hire.ts";
import { MAX_IMAGE_BYTES } from "./image-limit.ts";

export const DEFAULT_EXTRACT_MODEL = "google/gemini-3.8-flash";

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

/** Tweet photos are served from Twitter/X image CDNs. */
const ALLOWED_MEDIA_HOSTS = new Set([
  "pbs.twimg.com",
  "video.twimg.com",
  "ton.twimg.com",
]);

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

export async function resolveTweetMedia(
  tweetUrl: string,
  env: { [key: string]: string | undefined } = process.env,
): Promise<ResolvedTweetMedia> {
  const parsed = parseTweetUrl(tweetUrl);
  if (!parsed) {
    throw new Error("Invalid X/Twitter URL. Please provide a link to a tweet/post.");
  }
  const statusId = assertNumericStatusId(parsed.statusId);

  // 1. Try official X API if bearer token or API credentials exist
  const bearerToken = env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN;
  if (bearerToken) {
    try {
      const apiUrl = twitterStatusUrl(statusId);
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          includes?: {
            media?: Array<{
              url?: string;
              preview_image_url?: string;
              type?: string;
              width?: number;
              height?: number;
            }>;
          };
        };
        const photos = data.includes?.media?.filter(
          (m) => (m.type === "photo" || !m.type) && (m.url || m.preview_image_url),
        );
        if (photos && photos.length > 0) {
          // Pick largest image if multiple
          photos.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
          const chosen = photos[0]?.url || photos[0]?.preview_image_url;
          if (chosen) return { mediaUrl: chosen };
        }
      }
    } catch {
      // Fall through to public resolver
    }
  }

  // 2. Reliable public tweet->media helper (fxtwitter API)
  const fxUrl = fxStatusUrl(statusId);
  let fxRes: Response;
  try {
    fxRes = await fetch(fxUrl, {
      headers: { "User-Agent": "top9-hire/1.0" },
    });
  } catch (err) {
    throw new Error(
      `Failed to reach tweet resolver: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!fxRes.ok) {
    throw new Error(
      `Tweet not found or could not be loaded (${fxRes.status}). Ensure the tweet is public and exists.`,
    );
  }

  const fxData = (await fxRes.json()) as {
    code?: number;
    message?: string;
    tweet?: {
      media?: {
        photos?: Array<{ url: string; width?: number; height?: number }>;
        all?: Array<{ url: string; type?: string; width?: number; height?: number }>;
      };
    };
  };

  const photos =
    fxData.tweet?.media?.photos ||
    fxData.tweet?.media?.all?.filter((m) => m.type === "photo" || !m.type);

  if (!photos || photos.length === 0) {
    throw new Error("No image found attached to this tweet.");
  }

  // Pick largest image if multiple
  photos.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  const chosen = photos[0];
  if (!chosen?.url) {
    throw new Error("Tweet image URL could not be resolved.");
  }

  return { mediaUrl: chosen.url };
}

export async function fetchImageBytesFromUrl(
  url: string,
  maxSizeBytes = MAX_IMAGE_BYTES,
): Promise<ImageInput> {
  const mediaUrl = allowlistedMediaUrl(url);
  let res: Response;
  try {
    res = await fetch(mediaUrl);
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

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > maxSizeBytes) {
    throw new Error(
      `Image size (${Math.round(arrayBuffer.byteLength / 1024)}KB) exceeds limit of ${Math.round(
        maxSizeBytes / (1024 * 1024),
      )}MB.`,
    );
  }

  return {
    bytes: new Uint8Array(arrayBuffer),
    mediaType,
  };
}

export async function extractGamesFromImage(
  image: ImageInput,
  overrideModel?: string,
): Promise<ExtractResult> {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) {
    throw new MissingGatewayKey();
  }

  const model =
    overrideModel || process.env.TOP9_EXTRACT_MODEL || DEFAULT_EXTRACT_MODEL;

  const extracted = await Sentry.startSpan(
    {
      op: "gen_ai.extract",
      name: "extract top9 games from card",
      attributes: {
        "gen_ai.operation.name": "extract",
        "gen_ai.request.model": model,
        "gen_ai.provider.name": "vercel.ai_gateway",
      },
    },
    async (span) => {
      const { output } = await generateText({
        model,
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
      span.setAttribute("extract.games_count", result.games.length);
      return result;
    },
  );
  // Streamed gen_ai spans wait on an unref'd timer. Flush before Vercel freezes the function.
  await Sentry.flush(2000);
  return extracted;
}
