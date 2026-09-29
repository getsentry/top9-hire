import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {};

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
