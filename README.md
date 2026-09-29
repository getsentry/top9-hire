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

Open http://localhost:3000. Fill the nine slots, or paste a whole list into any slot and it fills forward. A slot may add a note after `|`. The handle field can stay empty. The job URL field is optional. It accepts a public Greenhouse or Ashby posting and, when the fetch works, adds a role card and a match choice next to the hire card.

The example chips at the top load nine titles from a card someone posted publicly. Those cards are hardcoded in `lib/__fixtures__/top9-examples.ts` with the post URL and the engagement counts at capture time. Picking a chip fills the slots and the handle without calling the extract route, the vision model, or X. Prominent handles lead the row; the rest sit behind `more`. Real cards come from https://my9games.com/en.

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

The classification model id is `openai/gpt-5.4-mini` in `lib/classify.ts`. Role judgment and hire/job match use that same id. The default extraction vision model is `google/gemini-3.8-flash` in `lib/extract.ts`. A plain `provider/model` string goes through AI Gateway. There is no provider SDK and no `TYPESAFE_API_KEY`.

Without a gateway credential the form returns an error and does not invent a card. A Vercel deployment with OIDC does not need a static `AI_GATEWAY_API_KEY`.

## Verify

```bash
npm test
npm run build
```

Manual checks, in order.

1. Pick the `@theo` chip. The nine slots fill with Outer Wilds through Persona 5, the handle reads `theo`, the counter reads 9 / 9, and no network request leaves the browser. Open `more`, pick `@dorryspears`, and the first slot changes to Factorio. Clear empties the slots and the handle.
2. Paste 8 titles and submit. The page says it found 8.
3. Remove the gateway keys and leave `VERCEL` unset. Paste 9 titles and submit. The page says there is no AI Gateway credential and shows no card.
4. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, or deploy on Vercel with OIDC. Paste 9 titles and submit. The card shows one badge, four score bars, one roast line, and the entertainment disclaimer.
5. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` for a project in `sentry-developer-experience`. Submit 9 titles. In Sentry Trace Explorer, find a span with op `gen_ai.evaluate` and name `evaluate hire_archetype`. The AI SDK call is a child span with function id `hire-archetype`.
6. Drop or upload a PNG, JPEG, or WebP 3×3 card (4MB or smaller). The nine title fields fill. A larger file or a non-image shows an error and does not fill the fields.
7. Paste a public `x.com` or `twitter.com` status URL whose post has a card image and choose Extract from post. The nine fields fill. A URL that is not a status link shows an error and does not invent titles.
8. Paste 9 titles and a job URL that is not a public Greenhouse or Ashby posting. The page shows the hire card, a role error, and no invented description.
9. Paste 9 titles and a public Greenhouse or Ashby job URL with a gateway credential. The page shows the hire card, a role card on the same four axes, and a match choice of `match`, `stretch`, or `mismatch` with a short why. The entertainment disclaimer stays on the card.
10. With the Sentry DSNs set, that job submit also produces spans named `evaluate role_archetype` and `evaluate hire_job_match` (op `gen_ai.evaluate`). The role call's function id is `role-archetype`. The match call's function id is `hire-job-match`.

Titles are sent to the gateway and, when a DSN is set, to Sentry on that evaluation span. A fetched job description is sent the same way on the role span.

Job URL fetches are rebuilt onto `boards-api.greenhouse.io` or `jobs.ashbyhq.com`. Other hosts, redirects, and non-posting paths are refused. The page does not invent a description when the fetch fails.

Layout slots: `[data-slot="examples"]`, `[data-slot="job-url"]`, `[data-slot="hire-card"]`, `[data-slot="role-card"]`, `[data-slot="hire-job-match"]`.

## Example cards

`lib/__fixtures__/top9-examples.ts` holds eight public Top9 cards captured from x.com on 2026-09-28: handle, post URL, the nine titles, and the like / repost / reply / quote counts at that time. `lib/examples.ts` orders them. `theo`, `hajimesyacho`, and `LinkofSunshine` lead when present, the row is topped up by engagement, and the rest sit behind `more`. Each entry may carry an optional `jobUrl`; none does today. `lib/examples.test.ts` checks that every entry is an `x.com` status link with nine distinct titles that pass `parsePaste`.

## Fixture proof cases

Public Top9 cards for these people were not found when the proof cases were written. The nine-title pastes in `lib/__fixtures__/proof-cases.ts` are labeled fixtures and are separate from the example cards above. The job URLs below were live public postings on 2026-09-28. Checked-in HTML and JSON under `lib/__fixtures__/` cover the parsers if a posting 404s.

| Case | Job URL | Intended |
| --- | --- | --- |
| Sergiy-shaped fixture × Sentry DX | https://jobs.ashbyhq.com/sentry/7ed2b263-3873-44c6-a730-2ca96100c58f | match |
| dorryspears-shaped fixture × Cloudflare Platforms | https://boards.greenhouse.io/cloudflare/jobs/8168623 | match |
| theo-shaped fixture × Cloudflare Load Balancing | https://boards.greenhouse.io/cloudflare/jobs/8212352 | stretch or mismatch |

The same Greenhouse jobs are also at `https://job-boards.greenhouse.io/cloudflare/jobs/8168623` and `https://job-boards.greenhouse.io/cloudflare/jobs/8212352`.

Sergiy fixture paste:

```
Stardew Valley
Animal Crossing: New Horizons
Minecraft
Overcooked! 2
It Takes Two
Spiritfarer
Untitled Goose Game
Portal 2
The Legend of Zelda: Breath of the Wild
```

dorryspears fixture paste:

```
Factorio
Satisfactory
Oxygen Not Included
Dwarf Fortress
Kerbal Space Program
Opus Magnum
Shapez
Cities: Skylines
SpaceChem
```

theo fixture paste:

```
Hades
Celeste
Disco Elysium
Hollow Knight
Undertale
Outer Wilds
The Witness
Baba Is You
Slay the Spire
```
