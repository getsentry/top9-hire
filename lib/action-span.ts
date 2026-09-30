import * as Sentry from "@sentry/nextjs";

/** Renames the request's root span, which Next.js calls "POST /" for every server action, so a trace says which action ran. */
export function nameActionRoot(name: string): void {
  const span = Sentry.getActiveSpan();
  if (span) Sentry.updateSpanName(Sentry.getRootSpan(span), name);
}
