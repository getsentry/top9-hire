import * as Sentry from "@sentry/nextjs";
import { NEXT_INTERNAL_SPAN_NAMES } from "./lib/sentry-noise";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ignoreSpans: NEXT_INTERNAL_SPAN_NAMES,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    genAI: { inputs: true, outputs: true },
  },
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

type VercelRequestContext = { get?: () => { waitUntil?: (task: Promise<unknown>) => void } | undefined };

/** Longest a request's function stays alive waiting for its root span to end. */
const SEGMENT_WAIT_CAP_MS = 60_000;
const segmentEnded = new WeakMap<Sentry.Span, () => void>();

// Fluid compute freezes the instance once the response is sent, and the SDK only hands its span flush to
// `waitUntil` on the Edge runtime. Without this, a request's last spans (its `POST /` root) wait in the buffer
// until another request thaws the instance, or are lost. The request context is read when the root span
// starts: by the time it ends the response is done and `get()` can come back empty.
Sentry.getClient()?.on("spanStart", (span) => {
  if (Sentry.getRootSpan(span) !== span) return;
  const context = (globalThis as Record<symbol, VercelRequestContext | undefined>)[Symbol.for("@vercel/request-context")];
  const waitUntil = context?.get?.()?.waitUntil;
  if (!waitUntil) return;
  const ended = new Promise<void>((resolve) => {
    const cap = setTimeout(resolve, SEGMENT_WAIT_CAP_MS);
    segmentEnded.set(span, () => {
      clearTimeout(cap);
      resolve();
    });
  });
  waitUntil(ended.then(() => Sentry.flush(2000)));
});

Sentry.getClient()?.on("afterSegmentSpanEnd", (span) => {
  segmentEnded.get(span)?.();
  segmentEnded.delete(span);
});
