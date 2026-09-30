import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { MissingGatewayKey } from "@/lib/classify";
import {
  extractGamesFromImage,
  fetchImageBytesFromUrl,
  type ImageInput,
} from "@/lib/extract";
import {
  RESOLVER_BUSY_COPY,
  ResolverBusyError,
  TweetNotFoundError,
  resolveTweetMedia,
} from "@/lib/tweet-media";
import { LIMITED_COPY, Limited, limitedFromGateway, modelGate } from "@/lib/guard";
import { GATEWAY_MISSING } from "@/lib/hire";
import { acceptedMediaType, rejectImageFile } from "@/lib/image-limit";

// Card uploads land here. A Server Action body stops at 1MB and drops a real My9Games PNG.
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let imageInput: ImageInput;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") || formData.get("image");

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: "invalid_input", message: "No image file provided in form data." },
          { status: 400 },
        );
      }

      const rejected = rejectImageFile({ size: file.size, type: file.type });
      if (rejected) {
        return NextResponse.json(
          { error: rejected.error, message: rejected.message },
          { status: 400 },
        );
      }

      const buffer = await file.arrayBuffer();
      imageInput = {
        bytes: new Uint8Array(buffer),
        mediaType: acceptedMediaType(file),
      };
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      const tweetUrl = body?.tweetUrl;

      if (!tweetUrl || typeof tweetUrl !== "string") {
        return NextResponse.json(
          { error: "invalid_input", message: "Missing or invalid 'tweetUrl' string." },
          { status: 400 },
        );
      }

      const resolved = await resolveTweetMedia(tweetUrl);
      imageInput = await fetchImageBytesFromUrl(resolved.mediaUrl);
    } else {
      return NextResponse.json(
        {
          error: "unsupported_content_type",
          message: "Request must be multipart/form-data or application/json.",
        },
        { status: 415 },
      );
    }

    const result = await extractGamesFromImage(imageInput, undefined, { beforeModel: modelGate() });
    return NextResponse.json(result);
  } catch (error) {
    const limited = error instanceof Limited ? error : limitedFromGateway(error);
    if (limited) {
      Sentry.getActiveSpan()?.setAttribute("top9.limited", limited.reason);
      Sentry.logger.warn("model call refused", { "top9.limited": limited.reason });
      return NextResponse.json(
        { error: "extract_failed", message: LIMITED_COPY[limited.reason], limited: limited.reason },
        { status: limited.reason === "budget" || limited.reason === "paused" ? 503 : 429 },
      );
    }
    if (error instanceof MissingGatewayKey) {
      return NextResponse.json(
        { error: "missing_key", message: GATEWAY_MISSING },
        { status: 503 },
      );
    }
    if (error instanceof ResolverBusyError) {
      // A short-circuit repeats a limit already reported when it began.
      if (!error.shortCircuit) {
        Sentry.captureException(error, {
          level: "warning",
          fingerprint: ["fxtwitter-limited"],
          tags: {
            resolver: error.source,
            resolver_status: String(error.status),
            resolver_limited: "true",
          },
          extra: { retryAfter: error.retryAfter },
        });
      }
      return NextResponse.json(
        { error: "extract_failed", message: RESOLVER_BUSY_COPY },
        {
          status: 503,
          ...(error.retryAfter && { headers: { "Retry-After": String(error.retryAfter) } }),
        },
      );
    }
    if (error instanceof TweetNotFoundError) {
      return NextResponse.json({ error: "extract_failed", message: error.message }, { status: 422 });
    }

    const message = error instanceof Error ? error.message : "Failed to extract games from image";
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "extract_failed", message },
      { status: 422 },
    );
  }
}
