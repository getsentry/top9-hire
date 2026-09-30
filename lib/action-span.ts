import * as Sentry from "@sentry/nextjs";

/**
 * Runs a server action inside a span named for it, so a trace says which action ran. Next.js names every
 * server action root "POST /", and the SDK resets a renamed root to that when the request ends.
 */
export function inActionSpan<T>(name: string, run: () => Promise<T>): Promise<T> {
  return Sentry.startSpan({ op: "function.server_action", name }, run);
}
