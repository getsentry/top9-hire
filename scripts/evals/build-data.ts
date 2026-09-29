// Builds scripts/evals/data/*.json once. Reruns overwrite; the evals only read the files.
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeTitle } from "../../lib/breakdown.ts";
import { readGames } from "../../lib/hire.ts";
import { fetchJobPosting, parseJobUrl } from "../../lib/job.ts";
import { PROOF_CASES } from "../../lib/__fixtures__/proof-cases.ts";
import { SAMPLE_JOBS } from "../../app/_verdict/sample-data.ts";
import { clip } from "../../lib/text.ts";
import { PAGE_FIX } from "../../lib/wiki.ts";

const data = (name: string) => new URL(`./data/${name}.json`, import.meta.url);
const save = (name: string, value: unknown) => writeFileSync(data(name), JSON.stringify(value, null, 2) + "\n");

const reads = JSON.parse(readFileSync(new URL("../../app/_verdict/sample-reads.json", import.meta.url), "utf8"));
const cards: Record<string, { image: string; titles: string[] }> = {};
for (const [handle, card] of Object.entries<{ titles: string[] }>(reads.cards)) {
  cards[handle] = { image: `public/top9/${handle}.jpg`, titles: card.titles };
}
save("cards", cards);

type Library = { id: string; source: "card" | "fixture"; titles: string[]; intended?: string; jobUrl?: string };
const libraries: Library[] = [
  ...Object.entries(cards).map(([id, c]) => ({ id, source: "card" as const, titles: c.titles })),
  ...PROOF_CASES.map((p) => ({
    id: p.id,
    source: "fixture" as const,
    titles: readGames(p.paste).map((g) => g.title),
    intended: p.intended,
    jobUrl: p.jobUrl,
  })),
];
save("libraries", libraries);

const EXTRA: { org: string; url: string }[] = [
  { org: "Epic Games", url: "https://job-boards.greenhouse.io/epicgames/jobs/6006487004" },
  { org: "Epic Games", url: "https://job-boards.greenhouse.io/epicgames/jobs/6141143004" },
  { org: "Duolingo", url: "https://job-boards.greenhouse.io/duolingo/jobs/8784354002" },
  { org: "Discord", url: "https://job-boards.greenhouse.io/discord/jobs/8595014002" },
  { org: "Riot Games", url: "https://job-boards.greenhouse.io/riotgames/jobs/8073566" },
  { org: "Duolingo", url: "https://job-boards.greenhouse.io/duolingo/jobs/8705196002" },
  { org: "Stripe", url: "https://job-boards.greenhouse.io/stripe/jobs/8170772" },
  { org: "Anthropic", url: "https://job-boards.greenhouse.io/anthropic/jobs/5370615008" },
  { org: "Discord", url: "https://job-boards.greenhouse.io/discord/jobs/8769799002" },
  { org: "Riot Games", url: "https://job-boards.greenhouse.io/riotgames/jobs/8194780" },
  // The third proof case (theo) targets this posting, which is not among the five samples.
  { org: "Cloudflare", url: "https://job-boards.greenhouse.io/cloudflare/jobs/8212352" },
];
const jobs: { url: string; org: string; title: string; description: string }[] = [];
for (const { url, org } of [...SAMPLE_JOBS, ...EXTRA]) {
  const locked = parseJobUrl(url);
  if (!locked) throw new Error(`Unparseable job url ${url}`);
  let posting;
  for (let attempt = 1; !posting; attempt++) {
    try {
      posting = await fetchJobPosting(locked);
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
  jobs.push({ url, org, title: posting.title, description: posting.text });
  console.log(org, "|", posting.title, "|", posting.text.length);
}
save("jobs", jobs);

const titles = [...new Map(libraries.flatMap((l) => l.titles).map((t) => [normalizeTitle(t), t])).values()];
const tokens = (s: string) => new Set(normalizeTitle(s).split(" ").filter((w) => w.length >= 3));
const headers = { "user-agent": "top9-evals/1.0 (s@serg.tech)" };
async function get(url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status !== 429) return res.json();
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return {};
}
async function wiki(title: string) {
  const fixed = PAGE_FIX[title];
  if (fixed) {
    const sum = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fixed)}`);
    if (sum.extract && sum.type !== "disambiguation") return { title, page: fixed, summary: clip(sum.extract, 800) };
  }
  const q = title.replace(/\.\.\.$/, "").trim();
  try {
    const search = await get(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(`${q} video game`)}`,
    );
    const page: string | undefined = search.query?.search?.[0]?.title;
    if (!page || ![...tokens(page)].some((w) => tokens(q).has(w))) return null;
    const sum = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`);
    if (!sum.extract || sum.type === "disambiguation") return null;
    return { title, page, summary: clip(sum.extract, 800) };
  } catch {
    return null;
  }
}
const wikis = [];
for (const title of titles) wikis.push((await wiki(title)) ?? { title, page: null, summary: null });
save("wiki", wikis);
console.log("libraries", libraries.length, "games", titles.length, "wiki hits", wikis.filter((w) => w.summary).length);
