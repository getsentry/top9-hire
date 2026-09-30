import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  // The OG routes read the Geist files with readFile at runtime, which file tracing cannot see.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./app/_og/fonts/**/*"],
    "/v/[token]/opengraph-image": ["./app/_og/fonts/**/*"],
  },
};

export default withSentryConfig(withBotId(nextConfig), {
  org: process.env.SENTRY_ORG ?? "sentry-developer-experience",
  project: process.env.SENTRY_PROJECT ?? "top9-hire",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
