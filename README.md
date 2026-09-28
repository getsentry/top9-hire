# Top9 Hire

Paste nine game titles. The server asks Vercel AI Gateway for one structured judgment, then draws an entertainment card. The card is a roast of taste. It is not a hiring decision.

## Run

Install dependencies and copy the env file.

```bash
npm install
cp .env.example .env.local
```

For local runs, fill `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`. On Vercel, OIDC is enough when `VERCEL` is `1` and `getVercelOidcToken` can read the request token. Fill the Sentry DSN vars when you want traces. Then start the app.

```bash
npm run dev
```

Open http://localhost:3000. One title per line. A line may add a note after `|`. The handle field can stay empty.

Drop a PNG, JPEG, or WebP card, or paste an `x.com` / `twitter.com` status URL. The page fills the nine title fields. Edit them, then submit the roast.

Image bytes go to `POST /api/extract` as `multipart/form-data`. A Server Action body stops at 1MB, and a real My9Games PNG is often larger than that, so the card does not travel through an action. The upload cap is 4MB. That stays under Vercel's 4.5MB function payload limit after multipart framing. Tweet URLs stay on the `extractFromTweetUrl` Server Action. That body is only the URL.

Extract and roast call the paid AI Gateway and do not check a session. This demo expects the Vercel preview to stay behind Deployment Protection or SSO. Do not publish an unprotected URL.

## Environment

| Name | Role |
| --- | --- |
| `AI_GATEWAY_API_KEY` | Static AI Gateway key. Server only. |
| `VERCEL_OIDC_TOKEN` | Short-lived gateway token from `vercel env pull`. Server only. |
| `VERCEL` | Set to `1` by Vercel. With OIDC enabled, the request header supplies the token. |
| `TOP9_EXTRACT_MODEL` | Optional model override for image extraction (defaults to `google/gemini-3.8-flash`). |
| `TWITTER_BEARER_TOKEN` / `X_BEARER_TOKEN` | Optional official X API bearer token. Falls back to fxtwitter helper if omitted. |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser Sentry DSN. |
| `SENTRY_DSN` | Server and edge Sentry DSN. Falls back to the public DSN. |
| `SENTRY_AUTH_TOKEN` | Uploads source maps during `npm run build`. |
| `SENTRY_ORG` | Defaults to `sentry-developer-experience`. |
| `SENTRY_PROJECT` | Defaults to `top9-hire`. |

The classification model id is `openai/gpt-5.4-mini` in `lib/classify.ts`. The default extraction vision model is `google/gemini-3.8-flash` in `lib/extract.ts`. A plain `provider/model` string goes through AI Gateway. There is no provider SDK and no `TYPESAFE_API_KEY`.

Without a gateway credential the form returns an error and does not invent a card. A Vercel deployment with OIDC does not need a static `AI_GATEWAY_API_KEY`.

## Verify

```bash
npm test
npm run build
```

Manual checks, in order.

1. Paste 8 titles and submit. The page says it found 8.
2. Remove the gateway keys and leave `VERCEL` unset. Paste 9 titles and submit. The page says there is no AI Gateway credential and shows no card.
3. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, or deploy on Vercel with OIDC. Paste 9 titles and submit. The card shows one badge, four score bars, one roast line, and the entertainment disclaimer.
4. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` for a project in `sentry-developer-experience`. Submit 9 titles. In Sentry Trace Explorer, find a span with op `gen_ai.evaluate` and name `evaluate hire_archetype`. The AI SDK call is a child span with function id `hire-archetype`.

Titles are sent to the gateway and, when a DSN is set, to Sentry on that evaluation span.
