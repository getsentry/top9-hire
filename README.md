# top9.wtf

Nine games are a hire signal. Drop someone's Top9 card and the server asks TypeSafe Jev, through Vercel AI Gateway, for one evaluation: an archetype chosen from eleven, and a level on each of four working-style axes. The page prints the archetype in plain English with one signal line, the four axes as poles, and a seal with the score. Pick an open role and the same axes are read against that job.

It is a signal for a conversation, not a hiring decision. The idea follows Dillon Mulroy's Top9 hiring thesis. The repo and the Vercel project keep the name `top9-hire`; the product is top9.wtf.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

For local runs, fill `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`. On Vercel, OIDC is enough when `VERCEL` is `1` and `getVercelOidcToken` can read the request token. Fill the Sentry DSN vars when you want traces. Open http://localhost:3000.

## The page

One desk. The masthead is the wordmark. The footer is the one provenance line and prints `JUDGE_MODEL` from `lib/models.ts`.

1. **Intake.** Paste an `x.com` / `twitter.com` status URL and choose Extract, drop a PNG, JPEG, or WebP card, type nine titles by hand, or pick one of the eight real cards in the strip. The cards are hardcoded in `lib/__fixtures__/top9-examples.ts` and served as plain static files from `public/top9/`, not through `/_next/image`, so they load behind Deployment Protection. Picking one fills the plate with no network call.
2. **Plate.** The card, the handle, the nine editable titles, the picked role, and Read the signal.
3. **Read.** The plate becomes the result in place. The handle, the strength line, the archetype, the signal line, the card with the seal, and four axes as poles with one dot each. A hollow dot marks a low-confidence axis. Save PNG draws the same sheet to a 1600×900 image; Copy blurb and Post on X share the text. Edit titles goes back to the plate.
4. **Role match.** Only when a role is picked. The rail shows `match`, `stretch`, or `mismatch`, an alignment percent, a two-sentence why, and one facet per axis marked aligned, adjacent, or diverges.

## Judgment

`lib/classify.ts` builds five questions once and asks them of Jev in one `experimental_evaluate` call: a `choice` over `ARCHETYPES`, whose criteria are the archetype descriptions, and a `score` per axis in `AXES`, whose criteria are the four ordered level descriptions. The state is the nine titles for a person and the posting title, URL, and description for a role. Jev answers each question independently with a distribution. The app takes the chosen archetype, its probability as the confidence, the runner-up from the same distribution, and `round(score) + 1` as each axis level. Nothing is generated as text.

The match is a rule, not a model. An axis diverges when the two levels are two or more apart. No diverging axes is `match`, one or two is `stretch`, three or four is `mismatch`. The percent is one minus the summed gaps over the largest possible gap. `matchWhy` writes the why from those facets.

Extraction from a card image stays on `google/gemini-3.8-flash` through the Gateway (`lib/extract.ts`, span op `gen_ai.extract`). Image bytes go to `POST /api/extract` as `multipart/form-data` because a Server Action body stops at 1MB. The upload cap is 4MB. Tweet URLs use the `extractFromTweetUrl` Server Action.

Extract and Read call the paid Gateway and do not check a session. Keep the Vercel preview behind Deployment Protection or SSO. Do not publish an unprotected URL.

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

The judge model id is `typesafe-ai/jev`, exported as `JUDGE_MODEL` from `lib/models.ts`. A plain `provider/model` string goes through AI Gateway, so there is no TypeSafe SDK and no `TYPESAFE_API_KEY`.

Without a Gateway credential the page returns an error and does not invent a signal. If the read never comes back at all (a network failure, a function timeout, or a protected deployment answering the action POST with its login page), the plate shows a failed-read line and Read the signal re-enables. The failure is sent to Sentry from the browser.

## Verify

```bash
npm test
npm run build
```

`lib/copy.test.ts` fails if any app, lib, or README line frames the product as anything other than a hire signal. `lib/classify.test.ts` drives the real questions through `Experimental_EvaluationMockModelV4` from `ai/test` and asserts the card that comes out.

Manual checks, in order.

1. Load the page. The masthead reads top9.wtf. The strip shows eight cards with handles. No serial numbers anywhere.
2. Pick `@theo`. The plate shows his card, `@theo`, and nine filled titles. No network request is made.
3. Clear one title. The count reads 8/9 and Read the signal is disabled.
4. Remove the Gateway keys and leave `VERCEL` unset. Read the signal. The page says there is no AI Gateway credential and stamps nothing. With DevTools set to offline, it instead says the read did not come back, and the button re-enables.
5. With a Gateway credential, Read the signal. The plate becomes the result: `@theo`, the strength line, the archetype, the signal line, the card with the seal, four axes. Save PNG downloads a `top9-wtf-*.png`.
6. With the Sentry DSNs set, find a span with op `gen_ai.evaluate` and name `evaluate hire_archetype`. Its `gen_ai.request.model` is `typesafe-ai/jev`, `gen_ai.response.model` is what the Gateway answered with, `gen_ai.evaluation.score.label` is the archetype id, and `gen_ai.output.messages` holds Jev's answers with their probabilities. The AI SDK call is a child span with function id `hire-archetype`.
7. Drop or upload a 3×3 card (4MB or smaller). The drop row shows the card while it is read, then the plate fills. A larger file or a non-image shows an error and does not fill the plate.
8. Paste a public status URL whose post has a card image and choose Extract. The plate fills with that image. A URL that is not a status link shows an error and does not invent titles.
9. Pick `@dorryspears`. Roles that suggest that card carry a "Suggested for @dorryspears" tag. Pick one and Read. The rail shows the role, a stamp, a percent, the why, and a facet per axis plus the two archetypes. The role read is a second `gen_ai.evaluate` span named `evaluate role_archetype` with function id `role-archetype`. There is no match span; the match is computed.
10. Paste a job URL that is not a public Greenhouse or Ashby posting. The sheet still stamps the signal, and the rail shows a role error with no invented description.

Titles are sent to the Gateway and, when a DSN is set, to Sentry on the evaluation span. A fetched job description is sent the same way on the role span.

Job URL fetches are rebuilt onto `boards-api.greenhouse.io` or `jobs.ashbyhq.com`. Other hosts, redirects, and non-posting paths are refused. The page does not invent a description when the fetch fails.

## Data

`lib/__fixtures__/top9-examples.ts` holds eight public Top9 posts captured from x.com on 2026-09-28: theo, LinkofSunshine, justalexoki, bentlegen, grichadev, sergical, dorryspears, and ptruiz_dev. Seven card images were downloaded once from the post media into `public/top9/`. ptruiz_dev posted a numbered text list with no card, so the strip prints it as a typeset card.

`lib/jobs.json` is the curated role list: twelve public postings, each checked through `parseJobUrl` and `fetchJobPosting` on 2026-09-29. Sentry (Developer Experience, Platform), Linear (Product Engineer, Design Engineer), Cloudflare (Platforms & Productivity, Load Balancing), Vercel (Next.js, Platform), Notion (Developer Experience, Developer Platform), and Roblox (Design Engineer, Core Engine). Each entry keeps the curator's `notes` and `suggestedFixtureHandles`; `facet` is the one line the rail prints. `lib/pack.test.ts` checks that every URL still passes `parseJobUrl`, that `board` agrees with the URL, and that every suggested handle is a real card. Postings close; swap a dead one for a live one on the same board.

`lib/__fixtures__/proof-cases.ts` keeps three older labeled nine-title pastes for the job parser tests. Checked-in HTML and JSON under `lib/__fixtures__/` cover the parsers if a posting 404s.
