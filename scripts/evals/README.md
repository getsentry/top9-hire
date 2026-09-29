# top9 model and Jev evals

Measures which model fits each model step, and whether Jev can replace the writer model for the breakdowns.
All output goes to `scripts/evals/out/`. Read `out/summary.md` first.

- `build-data.ts` freezes the inputs in `data/`: 10 libraries (7 sample cards, 3 proof fixtures), 7 card images, 16 job postings, Wikipedia summaries.
- `gold.ts` asks 3 jurors (opus-5.5, gpt-6.1-sol, grok-4.7) for skill levels per game and job, and verdict plus fit per pair.
  Gold is the mean (levels, fit) or the majority (verdict; a three-way split is stretch). Juror agreement is the ceiling.
  Pairs are judged one job at a time with all 10 libraries in the prompt.
- `extract.ts` (eval 1): vision models read the 7 cards, 2 runs.
- `games.ts` (eval 2): writers and Jev (title only, title plus wiki) rank skills per game against gold.
- `jobs.ts` (eval 3): Jev job needs against gold; writer job breakdowns for stability.
- `e2e.ts` (eval 4): four pipelines on all 160 pairs, twice. Reuses the breakdowns from evals 2 and 3, so run it last.
- `summary.ts` writes `out/summary.md` and appends `out/findings.md`.

Run from the repo root. The empty token turns the Blob cache off:

    R='BLOB_READ_WRITE_TOKEN= node --env-file=.env.local --experimental-strip-types scripts/evals'
    eval "$R/gold.ts"; for e in extract games jobs e2e summary; do eval "$R/$e.ts"; done

Data files are kept, so `build-data.ts` needs no rerun. Every script stops at $14.50 of total spend (`out/spend.json`).
Cost of one full pass is about $5 (gold $3, evals $2). Calls are limited to 6 in flight, with one retry.
