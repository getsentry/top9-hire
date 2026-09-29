// Cold run of the whole pipeline on one sample card and one live job posting, with per-step timing.
// BLOB_READ_WRITE_TOKEN= node --env-file=.env.local --experimental-strip-types scripts/smoke.ts [handle] [jobUrl]
import { readFileSync } from "node:fs";
import { breakdownGames, breakdownJob, libraryCard } from "../lib/breakdown.ts";
import { fitMatch } from "../lib/fit.ts";
import { fetchJobPosting, parseJobUrl } from "../lib/job.ts";

const reads = JSON.parse(readFileSync(new URL("../app/_verdict/sample-reads.json", import.meta.url), "utf8")) as {
  cards: Record<string, { titles: string[] }>;
};
const handle = process.argv[2] ?? "sergical";
const jobUrl = process.argv[3] ?? "https://job-boards.greenhouse.io/epicgames/jobs/6006487004";
const locked = parseJobUrl(jobUrl);
if (!locked || !reads.cards[handle]) throw new Error("Unknown card handle or unparseable job url");

const timed = async <T>(fn: () => Promise<T>) => {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
};
const posting = await fetchJobPosting(locked);
const games = await timed(() => breakdownGames(reads.cards[handle]!.titles, { cache: false }));
const job = await timed(() => breakdownJob({ url: posting.pageUrl, title: posting.title, description: posting.text }, { cache: false }));
const fit = await timed(() => fitMatch(posting.pageUrl, games.value, job.value));
console.log(JSON.stringify({ handle, job: posting.title, card: libraryCard(games.value).label, match: fit.value }, null, 1));
console.log(`cold ms: games ${games.ms}, job ${job.ms}, fit ${fit.ms}`);
