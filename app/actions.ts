"use server";

import * as Sentry from "@sentry/nextjs";
import { classify, MissingGatewayKey } from "@/lib/classify";
import { GATEWAY_MISSING, parsePaste, type HireCard } from "@/lib/hire";

export type RoastResult =
  | { ok: true; card: HireCard }
  | { ok: false; error: "need_nine" | "missing_key" | "model_failed"; message: string };

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
