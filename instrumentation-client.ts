import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";
import { BROWSER_RESOURCE_OPS, BROWSER_TIMING_SPAN_OPS } from "./lib/sentry-noise";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ignoreSpans: [{ op: BROWSER_TIMING_SPAN_OPS }],
  integrations: [
    Sentry.browserTracingIntegration({
      ignoreResourceSpans: BROWSER_RESOURCE_OPS,
      enableLongAnimationFrame: false,
    }),
  ],
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
});

initBotId({
  protect: [
    { path: "/", method: "POST" },
    { path: "/api/extract", method: "POST" },
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
