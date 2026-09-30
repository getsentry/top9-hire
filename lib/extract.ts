import { generateText, Output } from "ai";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { MissingGatewayKey, requestOidcToken } from "./classify.ts";
import { gatewayReady } from "./hire.ts";
import { MAX_IMAGE_BYTES, rejectImageFile } from "./image-limit.ts";
import { fetchOptions, readResponseWithinCap } from "./tweet-media.ts";

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

/** Tweet photos are served from the Twitter/X image CDN. */
const ALLOWED_MEDIA_HOSTS = new Set(["pbs.twimg.com"]);

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

  const bytes = await readResponseWithinCap(res, maxSizeBytes);
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
      name: "Read the game titles from the card",
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
      return result;
    },
  );
  return extracted;
}
