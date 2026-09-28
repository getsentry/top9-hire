# Top9 Hire

Paste nine game titles. The server asks Vercel AI Gateway for one structured judgment, then draws an entertainment card. The card is a roast of taste. It is not a hiring decision.

## Run

Install dependencies and copy the env file.

```bash
npm install
cp .env.example .env.local
```

Fill `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`. Fill the Sentry DSN vars when you want traces. Then start the app.

```bash
npm run dev
```

Open http://localhost:3000. One title per line. A line may add a note after `|`. The handle field can stay empty.

## Environment

| Name | Role |
| --- | --- |
| `AI_GATEWAY_API_KEY` | Static AI Gateway key. Server only. |
| `VERCEL_OIDC_TOKEN` | Short-lived gateway token from `vercel env pull`. Server only. |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser Sentry DSN. |
| `SENTRY_DSN` | Server and edge Sentry DSN. Falls back to the public DSN. |
| `SENTRY_AUTH_TOKEN` | Uploads source maps during `npm run build`. |
| `SENTRY_ORG` | Defaults to `sentry-developer-experience`. |
| `SENTRY_PROJECT` | Defaults to `top9-hire`. |

The model id is `openai/gpt-5.4-mini` in `lib/classify.ts`. A plain `provider/model` string goes through AI Gateway. There is no provider SDK and no `TYPESAFE_API_KEY`.

Without a gateway credential the form returns an error and does not invent a card.

## Verify

```bash
npm test
npm run build
```

Manual checks, in order.

1. Paste 8 titles and submit. The page says it found 8.
2. Remove the gateway keys, paste 9 titles, and submit. The page names the missing env var and shows no card.
3. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, paste 9 titles, and submit. The card shows one badge, four score bars, one roast line, and the entertainment disclaimer.
4. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` for a project in `sentry-developer-experience`. Submit 9 titles. In Sentry Trace Explorer, find a span with op `gen_ai.evaluate` and name `evaluate hire_archetype`. The AI SDK call is a child span with function id `hire-archetype`.

Titles are sent to the gateway and, when a DSN is set, to Sentry on that evaluation span.
