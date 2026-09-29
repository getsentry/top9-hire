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
