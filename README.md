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

The page is one desk. A thin masthead carries the wordmark and the plate number, and the footer prints the Gateway model from `CLASSIFY_MODEL`.

1. **Intake.** A compact band on top. Paste an `x.com` / `twitter.com` status URL and choose Extract, drop a PNG, JPEG, or WebP card on the drop row, or type nine titles by hand.
2. **Fixtures.** The same band holds a strip of eight real card thumbnails, hardcoded in `lib/__fixtures__/top9-examples.ts`. Their images live in `public/top9/` and are served as plain static files, not through `/_next/image`, so they load behind Deployment Protection. A card that fails to load shows the typeset card. Picking one fills the plate with no network call and no vision call.
3. **Plate.** The centre of the desk. The card with a caption strip, the candidate handle, and the nine editable titles. Every plate gets a stable id (`T9-01` for fixtures, a four-hex hash for anything else).
4. **Crit.** Reading the signal turns the plate into one sheet in place: a numbered header (crit no, candidate, role), the card with the seal stamped on its corner, the archetype, one hire-signal line, the four axes, and a provenance line (read time, Gateway model, raw confidence). The seal prints the confidence as a score out of 10. Save PNG draws the same sheet to a 1600×900 image; Copy blurb and Post on X share the text. Edit titles goes back to the plate.
5. **Role match.** A quiet ruled column beside the plate (below it on narrow screens) with the twelve-role pack from `lib/jobs.json`, plus a field for any other public posting. The result is `match`, `stretch`, or `mismatch`, an alignment percent, a short why, and one facet per axis marked aligned, adjacent, or diverges.

The match choice is a rule, not a model mood. An axis diverges when the two levels are two or more apart. No diverging axes is `match`, one or two is `stretch`, three or four is `mismatch`. The alignment percent is one minus the summed axis gaps over the largest possible gap. The model writes the why and is told the choice; its own choice is kept on the span as `hire_job_match.model_choice`.

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

The classification model id is `openai/gpt-5.4-mini`, exported as `CLASSIFY_MODEL` from `lib/models.ts` and used by `lib/classify.ts`. Role judgment and hire/job match use that same id. The default extraction vision model is `google/gemini-3.8-flash` in `lib/extract.ts`. A plain `provider/model` string goes through AI Gateway. There is no provider SDK and no `TYPESAFE_API_KEY`.

Without a gateway credential the page returns an error and does not invent a signal. A Vercel deployment with OIDC does not need a static `AI_GATEWAY_API_KEY`.

## Verify

```bash
npm test
npm run build
```

`lib/copy.test.ts` fails if any app, lib, or README line frames the product as anything other than a hire signal.

Manual checks, in order.

1. Load the page. The strip shows eight fixture cards. The plate area holds a blank card and one line of text, not an empty title grid.
2. Pick `@theo` in the strip. The plate shows his card image, `@theo`, and nine filled titles. No network request is made.
3. Clear one title. The count reads 8/9 and Read the signal is disabled.
4. Remove the gateway keys and leave `VERCEL` unset. Read the signal. The page says there is no AI Gateway credential and stamps nothing.
5. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, or deploy on Vercel with OIDC. Read the signal. The plate becomes the crit: the card with a seal and score, the archetype, one signal line, four axes, Save PNG, Copy blurb, and the disclaimer. Save PNG downloads `top9-hire-crit-<id>.png`.
6. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` for a project in `sentry-developer-experience`. Read the signal. In Sentry Trace Explorer, find a span with op `gen_ai.evaluate` and name `evaluate hire_archetype`. The AI SDK call is a child span with function id `hire-archetype`.
7. Drop or upload a PNG, JPEG, or WebP 3×3 card (4MB or smaller). The drop row shows the card while it is read, then the plate fills. A larger file or a non-image shows an error and does not fill the plate.
8. Paste a public `x.com` or `twitter.com` status URL whose post has a card image and choose Extract. The plate fills with the post's card image. A URL that is not a status link shows an error and does not invent titles.
9. Pick `@dorryspears`. Roles that suggest that fixture carry a "Suggested for @dorryspears" tag. Pick one and read the signal. The rail shows the role title, a `match`, `stretch`, or `mismatch` stamp, an alignment percent, a short why, and a facet per axis plus the two archetypes.
10. Paste a job URL that is not a public Greenhouse or Ashby posting. The sheet still stamps the signal, and the rail shows a role error with no invented description.
11. With the Sentry DSNs set, a role read also produces spans named `evaluate role_archetype` and `evaluate hire_job_match` (op `gen_ai.evaluate`). The role call's function id is `role-archetype`. The match call's function id is `hire-job-match`. The match span also carries `hire_job_match.alignment_percent`, `hire_job_match.model_choice`, and `hire_job_match.model_agrees`.

Titles are sent to the gateway and, when a DSN is set, to Sentry on that evaluation span. A fetched job description is sent the same way on the role span.

Job URL fetches are rebuilt onto `boards-api.greenhouse.io` or `jobs.ashbyhq.com`. Other hosts, redirects, and non-posting paths are refused. The page does not invent a description when the fetch fails.

## Data

`lib/__fixtures__/top9-examples.ts` holds eight public Top9 posts captured from x.com on 2026-09-28: theo, LinkofSunshine, justalexoki, bentlegen, grichadev, sergical, dorryspears, and ptruiz_dev. Seven card images were downloaded once from the post media into `public/top9/`. ptruiz_dev posted a numbered text list with no card, so the strip prints it as a typeset card.

`lib/jobs.json` is the curated role pack: twelve public postings, each checked through `parseJobUrl` and `fetchJobPosting` on 2026-09-29. Sentry (Developer Experience, Platform), Linear (Product Engineer, Design Engineer), Cloudflare (Platforms & Productivity, Load Balancing), Vercel (Next.js, Platform), Notion (Developer Experience, Developer Platform), and Roblox (Design Engineer, Core Engine). Each entry keeps the curator's `notes` and `suggestedFixtureHandles`; `facet` is the one line the rail prints. When a fixture is on the sheet, the roles that suggest it carry a "Suggested for" tag. `lib/pack.test.ts` checks that every URL still passes `parseJobUrl`, that `board` agrees with the URL, and that every suggested handle is a real fixture. Postings close; swap a dead one for a live one on the same board.

`lib/__fixtures__/proof-cases.ts` keeps three older labeled nine-title pastes for the job parser tests. Checked-in HTML and JSON under `lib/__fixtures__/` cover the parsers if a posting 404s.
