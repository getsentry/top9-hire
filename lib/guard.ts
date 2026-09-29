import { captureException, captureMessage } from "@sentry/core";

export class Limited extends Error {
  readonly reason: "paused" | "bot" | "ip" | "budget";
  constructor(reason: "paused" | "bot" | "ip" | "budget") {
    super(`limited: ${reason}`);
    this.reason = reason;
  }
}

export const RATE_LIMIT_ID = "top9-fresh-ip";

export const LIMITED_COPY: Record<Limited["reason"], string> = {
  paused: "top9.wtf is swamped right now. The sample cards still work — try one.",
  budget: "top9.wtf is swamped right now. The sample cards still work — try one.",
  ip: "Easy, speedrunner. You've run a lot of fresh matches. Try again in a few minutes, or play a sample.",
  bot: "We couldn't check this browser. Reload the page and try again.",
};

type GateDeps = {
  checkBot: () => Promise<{ isBot: boolean }>;
  checkRate: (id: string, headers: Headers) => Promise<{ rateLimited: boolean; error?: "not-found" | "blocked" }>;
  getHeaders: () => Promise<Headers>;
  env: { [key: string]: string | undefined };
};

// Lazy imports keep the node test runner away from next/* and the vendor SDKs.
const realDeps: GateDeps = {
  checkBot: async () => (await import("botid/server")).checkBotId(),
  checkRate: async (id, headers) => (await import("@vercel/firewall")).checkRateLimit(id, { headers }),
  getHeaders: async () => (await import("next/headers")).headers(),
  env: process.env,
};

const reported = new Set<string>();

/** Reports once per process, so an outage in a vendor SDK cannot flood Sentry. */
function reportOnce(kind: string, report: () => void): void {
  if (reported.has(kind)) return;
  reported.add(kind);
  report();
}

/** Test-only: forget which failures were already reported. */
export function resetReported(): void {
  reported.clear();
}

/**
 * Checks pause switch, BotID and the fresh-IP rate limit, in that order. The result is memoized, so one request
 * pays for one check however many model calls it makes. A vendor outage fails open: it must not block real players.
 */
export function modelGate(deps: Partial<GateDeps> = {}): () => Promise<void> {
  const { checkBot, checkRate, getHeaders, env } = { ...realDeps, ...deps };
  let gate: Promise<void> | undefined;
  const run = async () => {
    if (env.TOP9_MODELS === "off") throw new Limited("paused");
    try {
      if ((await checkBot()).isBot) throw new Limited("bot");
    } catch (error) {
      if (error instanceof Limited) throw error;
      reportOnce("botid", () => captureException(error));
    }
    try {
      const { rateLimited, error } = await checkRate(RATE_LIMIT_ID, await getHeaders());
      if (rateLimited || error === "blocked") throw new Limited("ip");
      if (error === "not-found") {
        reportOnce("rate-limit-missing", () =>
          captureMessage(`rate limit rule missing: ${RATE_LIMIT_ID}`, "error"),
        );
      }
    } catch (error) {
      if (error instanceof Limited) throw error;
      reportOnce("firewall", () => captureException(error));
    }
  };
  return () => (gate ??= run());
}

/** The gateway answers 402 when the budget is spent. Walks the cause chain of an AI SDK error. */
export function limitedFromGateway(error: unknown): Limited | null {
  for (let e: unknown = error, depth = 0; e && typeof e === "object" && depth < 5; depth++) {
    const { statusCode, responseBody, cause } = e as { statusCode?: unknown; responseBody?: unknown; cause?: unknown };
    if (statusCode === 402) return new Limited("budget");
    if (typeof responseBody === "string" && responseBody.includes("quota_for_entity_exceeded")) {
      return new Limited("budget");
    }
    e = cause;
  }
  return null;
}
