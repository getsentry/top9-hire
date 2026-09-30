// Extends the shipped seeds with Jev: lib/game-breakdowns.json, lib/job-breakdowns.json and the fits in sample-reads.json.
// Only missing entries are computed; stored results stay as they are. Every card x SAMPLE_JOBS pair gets a fit. Posting text comes from scripts/evals/data/jobs.json, else a live fetch.
// BLOB_READ_WRITE_TOKEN= node --env-file=.env.local --experimental-strip-types scripts/build-seeds.ts
import { readFileSync, writeFileSync } from "node:fs";
import { breakdownGames, breakdownJob, chunk, normalizeTitle, type GameBreakdown, type JobBreakdown } from "../lib/breakdown.ts";
import { fitMatch, type HireJobMatch } from "../lib/fit.ts";
import { SAMPLE_JOBS } from "../app/_verdict/sample-data.ts";
import { fetchJobPosting } from "../lib/job.ts";
import { parseJobUrl } from "../lib/job-url.ts";

const file = (path: string) => new URL(path, import.meta.url);
const save = (path: string, value: unknown) => writeFileSync(file(path), `${JSON.stringify(value, null, 2)}\n`);
const sorted = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));

const READS = "../app/_verdict/sample-reads.json";
const reads = JSON.parse(readFileSync(file(READS), "utf8")) as {
  cards: Record<string, { titles: string[] }>;
  jobs: Record<string, { title: string; pageUrl: string }>;
  fits: Record<string, HireJobMatch>;
};
const stored = JSON.parse(readFileSync(file("./evals/data/jobs.json"), "utf8")) as { url: string; title: string; description: string }[];

const load = <T>(path: string) => JSON.parse(readFileSync(file(path), "utf8")) as Record<string, T>;

for (const { url, title } of SAMPLE_JOBS) reads.jobs[url] ??= { title, pageUrl: url };
for (const handle of Object.keys(reads.cards)) {
  for (const url of Object.keys(reads.jobs)) reads.fits[`${handle}|${url}`] ??= null as unknown as HireJobMatch;
}

const games = new Map(Object.entries(load<GameBreakdown>("../lib/game-breakdowns.json")));
const titles = [...new Map(Object.values(reads.cards).flatMap((card) => card.titles).map((t) => [normalizeTitle(t), t])).values()].filter(
  (t) => !games.has(normalizeTitle(t)),
);
for (const group of chunk(titles, 9)) {
  for (const game of await breakdownGames(group, { cache: false })) games.set(normalizeTitle(game.title), game);
}
save("../lib/game-breakdowns.json", sorted(Object.fromEntries(games)));
console.log("games", games.size);

const jobs = load<JobBreakdown>("../lib/job-breakdowns.json");
for (const url of Object.keys(reads.jobs)) {
  if (jobs[url]) continue;
  let posting = stored.find((job) => job.url === url);
  if (!posting) {
    const locked = parseJobUrl(url);
    if (!locked) throw new Error(`Unparseable job url ${url}`);
    const fetched = await fetchJobPosting(locked);
    posting = { url, title: fetched.title, description: fetched.text };
  }
  jobs[url] = await breakdownJob({ url, title: posting.title, description: posting.description }, { cache: false });
  console.log("job", jobs[url].title, jobs[url].wants, jobs[url].requirements.length);
}
save("../lib/job-breakdowns.json", sorted(jobs));

const fits = { ...reads.fits };
await Promise.all(
  Object.keys(fits)
    .filter((key) => !fits[key])
    .map(async (key) => {
      const [handle, url] = key.split("|") as [string, string];
      const library = (reads.cards[handle] as { titles: string[] }).titles.map((t) => games.get(normalizeTitle(t)) as GameBreakdown);
      fits[key] = await fitMatch(url, library, jobs[url] as JobBreakdown);
    }),
);
save(READS, { ...reads, fits: sorted(fits) });
console.log("fits", Object.keys(fits).length);
