/**
 * Upload cap for a My9Games card.
 *
 * Next.js Server Actions reject bodies over 1MB, so the page posts the file to
 * `POST /api/extract` instead. Vercel Functions still reject request bodies over
 * 4.5MB (`FUNCTION_PAYLOAD_TOO_LARGE`). 4MB leaves room for multipart framing
 * and matches the size of a real 3×3 PNG that the 1MB action limit dropped.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const MAX_IMAGE_LABEL = "4MB";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type ImageFileError =
  | "invalid_input"
  | "file_too_large"
  | "unsupported_media_type"
  | "extract_failed"
  | "missing_key";

export type ImageExtractPayload =
  | { ok: true; games: string[] }
  | { ok: false; error: ImageFileError; message: string };

export type ImageFileRejection = Extract<ImageExtractPayload, { ok: false }>;

export function acceptedMediaType(file: { type: string }): string {
  return file.type?.toLowerCase() || "image/jpeg";
}

export function rejectImageFile(file: {
  size: number;
  type: string;
}): ImageFileRejection | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: "file_too_large",
      message: `File size exceeds ${MAX_IMAGE_LABEL} limit (${Math.round(file.size / 1024)}KB).`,
    };
  }
  const mediaType = acceptedMediaType(file);
  if (!ALLOWED_IMAGE_TYPES.has(mediaType)) {
    return {
      ok: false,
      error: "unsupported_media_type",
      message: `Unsupported file format '${mediaType}'. Supported formats: JPEG, PNG, WebP.`,
    };
  }
  return null;
}

export function titlesChanged(current: readonly string[], next: readonly string[]): boolean {
  if (current.length !== next.length) return true;
  return next.some((title, index) => title !== current[index]);
}

function isGameList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === 9 &&
    value.every((game) => typeof game === "string" && game.length > 0)
  );
}

export function interpretExtractResponse(status: number, body: unknown): ImageExtractPayload {
  const games = body && typeof body === "object" ? (body as { games?: unknown }).games : undefined;
  if (status >= 200 && status < 300 && isGameList(games)) {
    return { ok: true, games };
  }

  if (body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
    const message = (body as { message: string }).message;
    const errorField = (body as { error?: unknown }).error;
    const error: ImageFileError =
      errorField === "missing_key" ||
      errorField === "invalid_input" ||
      errorField === "file_too_large" ||
      errorField === "unsupported_media_type" ||
      errorField === "extract_failed"
        ? errorField
        : status === 413
          ? "file_too_large"
          : "extract_failed";
    return { ok: false, error, message };
  }

  if (status === 413) {
    return {
      ok: false,
      error: "file_too_large",
      message: `File size exceeds ${MAX_IMAGE_LABEL} limit.`,
    };
  }

  return {
    ok: false,
    error: "extract_failed",
    message: "Failed to extract titles from image.",
  };
}
