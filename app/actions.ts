"use server";

import * as Sentry from "@sentry/nextjs";
import { classify, MissingGatewayKey } from "@/lib/classify";
import {
  extractGamesFromImage,
  fetchImageBytesFromUrl,
  resolveTweetMedia,
  type ExtractResult,
  type ImageInput,
} from "@/lib/extract";
import { GATEWAY_MISSING, parsePaste, type HireCard } from "@/lib/hire";

export type RoastResult =
  | { ok: true; card: HireCard }
  | { ok: false; error: "need_nine" | "missing_key" | "model_failed"; message: string };

export type ExtractActionResult =
  | { ok: true; games: string[] }
  | {
      ok: false;
      error:
        | "missing_key"
        | "invalid_input"
        | "file_too_large"
        | "unsupported_media_type"
        | "extract_failed";
      message: string;
    };

export async function roastLibrary(input: {
  paste: string;
  handle: string;
}): Promise<RoastResult> {
  const parsed = parsePaste(input.paste, input.handle);
  if (!parsed.ok) {
    return {
      ok: false,
      error: "need_nine",
      message: `Need exactly 9 titles. Found ${parsed.count}.`,
    };
  }
  try {
    const card = await classify(parsed.top9);
    return { ok: true, card };
  } catch (error) {
    if (error instanceof MissingGatewayKey) {
      return {
        ok: false,
        error: "missing_key",
        message: GATEWAY_MISSING,
      };
    }
    Sentry.captureException(error);
    return {
      ok: false,
      error: "model_failed",
      message: "The model call failed. Nothing was invented in its place.",
    };
  }
}

export async function extractFromFormData(formData: FormData): Promise<ExtractActionResult> {
  const file = formData.get("file") || formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return {
      ok: false,
      error: "invalid_input",
      message: "No image file provided.",
    };
  }

  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: "file_too_large",
      message: `File size exceeds 5MB limit (${Math.round(file.size / 1024)}KB).`,
    };
  }

  const mimeType = file.type?.toLowerCase() || "image/jpeg";
  const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  if (!allowed.has(mimeType)) {
    return {
      ok: false,
      error: "unsupported_media_type",
      message: `Unsupported file format '${mimeType}'. Supported formats: JPEG, PNG, WebP.`,
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const imageInput: ImageInput = {
      bytes: new Uint8Array(buffer),
      mediaType: mimeType,
    };
    const result = await extractGamesFromImage(imageInput);
    return { ok: true, games: result.games };
  } catch (error) {
    if (error instanceof MissingGatewayKey) {
      return {
        ok: false,
        error: "missing_key",
        message: GATEWAY_MISSING,
      };
    }
    const message = error instanceof Error ? error.message : "Failed to extract games from image";
    Sentry.captureException(error);
    return {
      ok: false,
      error: "extract_failed",
      message,
    };
  }
}

export async function extractFromTweetUrl(tweetUrl: string): Promise<ExtractActionResult> {
  if (!tweetUrl || typeof tweetUrl !== "string" || !tweetUrl.trim()) {
    return {
      ok: false,
      error: "invalid_input",
      message: "Please enter a valid tweet URL.",
    };
  }

  try {
    const resolved = await resolveTweetMedia(tweetUrl.trim());
    const imageInput = await fetchImageBytesFromUrl(resolved.mediaUrl);
    const result = await extractGamesFromImage(imageInput);
    return { ok: true, games: result.games };
  } catch (error) {
    if (error instanceof MissingGatewayKey) {
      return {
        ok: false,
        error: "missing_key",
        message: GATEWAY_MISSING,
      };
    }
    const message = error instanceof Error ? error.message : "Failed to extract games from tweet";
    Sentry.captureException(error);
    return {
      ok: false,
      error: "extract_failed",
      message,
    };
  }
}

