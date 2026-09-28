# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and gamers who post a Top9 (a 3×3 card of their nine favourite games) on X. They arrive from a post, on a phone or a laptop, with the nine titles in their head, in their clipboard, or in a card image. They want the verdict fast and they want a screenshot worth reposting.

Secondary, inferred from the brief: people who hire developers and want the joke to land as a critique of LeetCode interviews rather than as a toy.

## Product Purpose

Top9 Hire turns nine game titles into a hire archetype, four taste scores, and one roast line. The thesis is Dillon Mulroy's: taste in games says more about how someone will work than a whiteboard puzzle does. Success is a verdict that feels earned, reads in one glance, and gets shared.

## Positioning

The input is a Top9 card, the artifact people already post. No quiz, no résumé upload. The verdict is a hire archetype, not a personality type. The next step, matching that archetype against a job posting URL, is planned and not built.

## Operating Context

- Input arrives three ways: a pasted list of titles, a My9Games-style 3×3 card image, or a link to an X post that contains one.
- Extraction yields nine editable titles. The person corrects them before classification.
- Classification is one structured call through Vercel AI Gateway (`lib/classify.ts`). The app never invents a card when the gateway is unavailable.
- Sentry traces the evaluation span.

## Capabilities and Constraints

- Exactly nine titles are required. A title may carry a note after `|`.
- The handle is optional.
- Archetypes, axes, roast lines, and the disclaimer live in `lib/hire.ts` and are the copy source of truth.
- Image and tweet extraction is served by `POST /api/extract` (multipart file, or JSON `{ tweetUrl }`) returning `{ games: string[9] }`. The route lands in a separate PR; the UI treats a missing route as an unavailable feature, not an error in the person's input.
- Undecided: the job URL field and the match verdict. The layout reserves a place for both (a "Position" line under the candidate, a second stamp under the archetype).
- No authentication. No persistence. Nothing is posted back to X.

## Brand Commitments

- Name: Top9 Hire.
- Voice: dry, specific, playful. Copy in `lib/hire.ts` is the register to match.
- The disclaimer is always visible with a verdict: this is a roast of taste, not a hiring decision.

## Evidence on Hand

- Ten archetypes with roast lines and criteria, four scoring axes with level rubrics (`lib/hire.ts`).
- No logo beyond `app/icon.svg`, no screenshots, no testimonials. Do not fabricate any.

## Product Principles

- The nine titles are the document. Everything on the page either fills them, corrects them, or judges them.
- One verdict, one action. Extract, edit, classify must be obvious without instruction.
- Honest under failure. Missing credentials and failed model calls are stated plainly, never papered over.
- Built to be screenshotted. The verdict must read as a complete artifact at phone width.
- Room to grow without a bolt-on. Job URL and match verdict join the same form and the same stamp language.

## Accessibility & Inclusion

Body text and controls meet 4.5:1 against the paper. Motion (text morphing, the stamp landing, any shader movement) respects `prefers-reduced-motion`. Everything is reachable by keyboard.
