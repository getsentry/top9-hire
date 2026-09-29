# Top9 Hire

Nine games are a hire signal. Drop someone's Top9 card, and the server asks Vercel AI Gateway for one structured judgment: an archetype, four working-style axes, and a confidence. The page prints it as a crit sheet with a seal and a shareable blurb. Pick a role from the pack and the same signal is read against that job.

It is a signal for a conversation, not a hiring decision. The idea follows Dillon Mulroy's Top9 hiring thesis.

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

Open http://localhost:3000.

## The sheet

1. **Intake.** Drop a PNG, JPEG, or WebP card on the card silhouette, paste an `x.com` / `twitter.com` status URL, or type nine titles by hand.
2. **Fixtures.** Eight public Top9s from tech Twitter, hardcoded in `lib/__fixtures__/top9-examples.ts`. Their card images live in `public/top9/`. Picking one fills the plate with no network call and no vision call.
3. **Plate.** The card, the candidate handle, and the nine editable titles. Every plate gets a stable id (`T9-01` for fixtures, a four-hex hash for anything else).
4. **Signal.** A seal with the confidence printed as a score out of 10, the archetype, one hire-signal line, and the four axes. Copy the blurb or post it on X.
5. **Role match.** A secondary rail with twelve curated Greenhouse and Ashby postings from `lib/jobs.json`, plus a field for any other public posting. The result is `match`, `stretch`, or `mismatch` with a short why and both sets of axes on one track.

Image bytes go to `POST /api/extract` as `multipart/form-data`. A Server Action body stops at 1MB, and a real My9Games PNG is often larger than that, so the card does not travel through an action. The upload cap is 4MB. That stays under Vercel's 4.5MB function payload limit after multipart framing. Tweet URLs stay on the `extractFromTweetUrl` Server Action. That body is only the URL.

Extract and the signal read call the paid AI Gateway and do not check a session. This demo expects the Vercel preview to stay behind Deployment Protection or SSO. Do not publish an unprotected URL.

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

The classification model id is `openai/gpt-5.4-mini` in `lib/classify.ts`. Role judgment and hire/job match use that same id. The default extraction vision model is `google/gemini-3.8-flash` in `lib/extract.ts`. A plain `provider/model` string goes through AI Gateway. There is no provider SDK and no `TYPESAFE_API_KEY`.

Without a gateway credential the page returns an error and does not invent a signal. A Vercel deployment with OIDC does not need a static `AI_GATEWAY_API_KEY`.

## Verify

```bash
npm test
npm run build
```

`lib/copy.test.ts` fails if any app, lib, or README line frames the product as anything other than a hire signal.

Manual checks, in order.

1. Load the page. The strip shows eight fixture cards. The plate area holds one line of text, not an empty title grid.
2. Pick `@theo` in the strip. The plate shows his card image, `@theo`, and nine filled titles. No network request is made.
3. Clear one title. The count reads 8/9 and Read the signal is disabled.
4. Remove the gateway keys and leave `VERCEL` unset. Read the signal. The page says there is no AI Gateway credential and stamps nothing.
5. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, or deploy on Vercel with OIDC. Read the signal. The sheet shows a seal with a score, the archetype, one signal line, four axes, a Copy blurb button, and the disclaimer.
6. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` for a project in `sentry-developer-experience`. Read the signal. In Sentry Trace Explorer, find a span with op `gen_ai.evaluate` and name `evaluate hire_archetype`. The AI SDK call is a child span with function id `hire-archetype`.
7. Drop or upload a PNG, JPEG, or WebP 3×3 card (4MB or smaller). The silhouette shows the card while it is read, then the plate fills. A larger file or a non-image shows an error and does not fill the plate.
8. Paste a public `x.com` or `twitter.com` status URL whose post has a card image and choose Extract. The plate fills with the post's card image. A URL that is not a status link shows an error and does not invent titles.
9. Pick a role from the pack and read the signal. The rail shows the role title, a `match`, `stretch`, or `mismatch` stamp with a short why, the role archetype, and both sets of axes.
10. Paste a job URL that is not a public Greenhouse or Ashby posting. The sheet still stamps the signal, and the rail shows a role error with no invented description.
11. With the Sentry DSNs set, a role read also produces spans named `evaluate role_archetype` and `evaluate hire_job_match` (op `gen_ai.evaluate`). The role call's function id is `role-archetype`. The match call's function id is `hire-job-match`.

Titles are sent to the gateway and, when a DSN is set, to Sentry on that evaluation span. A fetched job description is sent the same way on the role span.

Job URL fetches are rebuilt onto `boards-api.greenhouse.io` or `jobs.ashbyhq.com`. Other hosts, redirects, and non-posting paths are refused. The page does not invent a description when the fetch fails.

## Data

`lib/__fixtures__/top9-examples.ts` holds eight public Top9 posts captured from x.com on 2026-09-28: theo, LinkofSunshine, justalexoki, bentlegen, grichadev, sergical, dorryspears, and ptruiz_dev. Seven card images were downloaded once from the post media into `public/top9/`. ptruiz_dev posted a numbered text list with no card, so the strip prints it as a typeset card.

`lib/jobs.json` holds twelve public postings, each checked through `parseJobUrl` and `fetchJobPosting` on 2026-09-29: Sentry (Developer Experience, Issues), Cloudflare (Platforms & Productivity, Load Balancing), Vercel (Design Engineer), Linear (Product Engineer), Resend (Product Engineer), Supabase (Developer Relations), Railway (Baremetal Orchestration), PlanetScale (Vitess), Discord (Data Platform), and Riot Games (Teamfight Tactics gameplay). `lib/pack.test.ts` checks that every URL still passes `parseJobUrl`. Postings close; swap a dead one for a live one on the same board.

`lib/__fixtures__/proof-cases.ts` keeps three older labeled nine-title pastes for the job parser tests. Checked-in HTML and JSON under `lib/__fixtures__/` cover the parsers if a posting 404s.
