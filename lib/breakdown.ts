import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { spanSourceTag } from "./action-span.ts";
import { roleCard, type ArchetypeId, type HireCard } from "./hire.ts";
import { JEV_STATE_CHARS, jevGameSkills, jevJobNeeds, topSkills, type AskJev } from "./jev-breakdown.ts";
import { cacheKey, readJson, readMany, writeJson, writeMany } from "./store.ts";
import { clip, normalizeTitle } from "./text.ts";
import { GAME_SKILLS, type CallInfo, type GameSkill } from "./skills.ts";
import { fetchSummary, recalledWiki, rememberWiki, wikiLookup, type WikiSource } from "./wiki.ts";
import gameSeed from "./game-breakdowns.json" with { type: "json" };
import jobSeed from "./job-breakdowns.json" with { type: "json" };

export { normalizeTitle, GAME_SKILLS };
export type { CallInfo, GameSkill };

export type GameBreakdown = {
  title: string;
  /** The game's Wikipedia summary (up to 800 characters), or "" when Wikipedia has none. */
  summary: string;
  /** Jev's expected level per skill, 0 to 3. */
  levels: Record<GameSkill, number>;
  /** The three highest levels; ties keep GAME_SKILLS order. */
  skills: GameSkill[];
  traits: string[];
};

export type Requirement = { id: string; text: string; kind: "must" | "nice"; evidence: string };

export type JobBreakdown = {
  title: string;
  /** The posting text, clipped to what the Jev judge reads. */
  description: string;
  needs: Record<GameSkill, number>;
  wants: ArchetypeId;
  requirements: Requirement[];
  dropped: string[];
};

const SKILL_ARCHETYPE: Record<GameSkill, ArchetypeId> = {
  planning: "systems_necromancer",
  reflexes: "speedrun_gremlin",
  teamwork: "co_op_cleric",
  optimizing: "meta_spreadsheet",
  building: "sandbox_builder",
  exploring: "chaos_indie",
  storytelling: "lore_monk",
  persistence: "completionist_hoarder",
};

/** Typical weighted tally per skill across the seven sample cards, so a common skill does not win by default. */
export const BASELINE: Record<GameSkill, number> = {
  planning: 15.86,
  reflexes: 10.57,
  teamwork: 3,
  optimizing: 7,
  building: 3.57,
  exploring: 6.14,
  storytelling: 2.57,
  persistence: 5.29,
};

const SKILL_POINTS = [3, 2, 1];

/** Skills ranked by weighted tally minus baseline (a game's 1st, 2nd, 3rd skill count 3, 2, 1). Ties keep GAME_SKILLS order. */
export function skillTally(games: GameBreakdown[]): { skill: GameSkill; weight: number }[] {
  const weights = Object.fromEntries(GAME_SKILLS.map((skill) => [skill, 0])) as Record<GameSkill, number>;
  for (const game of games) {
    game.skills.forEach((skill, i) => {
      weights[skill] += SKILL_POINTS[i] ?? 0;
    });
  }
  return GAME_SKILLS.map((skill) => ({ skill, weight: weights[skill] }))
    .map((entry, order) => ({ ...entry, order, lift: entry.weight - BASELINE[entry.skill] }))
    .sort((a, b) => b.lift - a.lift || a.order - b.order)
    .map(({ skill, weight }) => ({ skill, weight }));
}

/** The card's label: always one of the ten archetypes, never "no match". */
export function libraryLabel(games: GameBreakdown[]): ArchetypeId {
  const top = skillTally(games)[0]?.skill ?? GAME_SKILLS[0];
  return SKILL_ARCHETYPE[top];
}

export function libraryCard(games: GameBreakdown[]): HireCard {
  return {
    ...roleCard(libraryLabel(games)),
    skills: skillTally(games).slice(0, 3),
    games: games.map(({ title, traits }) => ({ title, traits })),
  };
}

export type BreakdownOptions = {
  /** false skips memory, seed and blob reads and writes. */
  cache?: boolean;
  /** Replaces the Jev call, for tests. */
  ask?: AskJev;
  /** Awaited after every cache miss, right before a Jev call. Throws to refuse the call. */
  beforeModel?: () => Promise<void>;
  /** Replaces the Wikipedia lookup, for tests. */
  wiki?: typeof wikiLookup;
  /** Called once, in title order, when every title has a summary ("" when Wikipedia has none) and before the Jev calls finish. `complete` is false when Wikipedia failed for that title, so the game is judged without a summary that may exist. */
  onSummaries?: (games: { title: string; summary: string; complete: boolean }[]) => void;
};

const gameCache = new Map<string, GameBreakdown>(
  Object.entries(gameSeed as Record<string, GameBreakdown>),
);

/** What the judge sees of a posting: the normalized title and the description clipped to JEV_STATE_CHARS. A changed posting at the same URL gets a new fingerprint. */
export function jobFingerprint(title: string, description: string): string {
  return createHash("sha256")
    .update(`${normalizeTitle(title)}\n${clip(description, JEV_STATE_CHARS)}`)
    .digest("hex")
    .slice(0, 16);
}

const jobKey = (url: string, fingerprint: string) => `${url}|${fingerprint}`;

// A seed answers only for the posting text it was built from, so its key carries the fingerprint of its stored text.
const seedJobKeys = new Set<string>();
const jobCache = new Map<string, JobBreakdown>(
  Object.entries(jobSeed as Record<string, JobBreakdown>).map(([url, job]) => {
    const key = jobKey(url, jobFingerprint(job.title, job.description));
    seedJobKeys.add(key);
    return [key, job];
  }),
);
// Seed JSON is emptied whenever a prompt or schema changes, so old shapes never load.

/** Every game breakdown known to this process, for the script to persist. */
export function cachedGameBreakdowns(): Record<string, GameBreakdown> {
  return Object.fromEntries(gameCache);
}

/** Job breakdowns by URL. The sample flow never fetches a posting, so a seed wins over a breakdown of an edited posting. */
export function cachedJobBreakdowns(): Record<string, JobBreakdown> {
  const byUrl = ([key, job]: [string, JobBreakdown]): [string, JobBreakdown] => [key.slice(0, key.lastIndexOf("|")), job];
  const entries = [...jobCache];
  return Object.fromEntries([...entries.filter(([key]) => !seedJobKeys.has(key)), ...entries.filter(([key]) => seedJobKeys.has(key))].map(byUrl));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Where each step's last result came from, for the smoke script. */
export const lastSource: { games: Record<string, "memory" | "seed" | "blob" | "model">; job: string } = {
  games: {},
  job: "",
};

/** Test-only: forget model and blob results so the next call reads the blob again. Seed entries stay. */
export function clearMemoryCaches(): void {
  for (const key of gameCache.keys()) if (!(key in gameSeed)) gameCache.delete(key);
  for (const key of jobCache.keys()) if (!seedJobKeys.has(key)) jobCache.delete(key);
}

export async function breakdownGames(titles: string[], opts: BreakdownOptions = {}): Promise<GameBreakdown[]> {
  return Sentry.startSpan(
    { op: "top9.games", name: `Get skills for ${titles.length} games` },
    async (span) => {
      const games = await readGames(titles, opts);
      const found = Object.values(lastSource.games);
      const source = (["model", "blob", "seed"] as const).find((kind) => found.includes(kind)) ?? "memory";
      span.updateName(`Get skills for ${titles.length} games ${spanSourceTag(source)}`);
      span.setAttributes({
        "top9.source": source,
        "top9.games.titles": games.map((game) => game.title),
        "top9.wiki.found": games.filter((game) => game.summary !== "").length,
        "top9.games.top_skills": skillTally(games)
          .slice(0, 3)
          .map((entry) => entry.skill),
      });
      return games;
    },
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One Jev call for the game's skill levels, given its Wikipedia summary. Nine of these run in parallel. */
async function judgeGame(title: string, summary: string | null, opts: BreakdownOptions): Promise<GameBreakdown> {
  await opts.beforeModel?.();
  const { levels } = await jevGameSkills(title, summary ?? undefined, opts.ask);
  const rounded = Object.fromEntries(GAME_SKILLS.map((skill) => [skill, round2(levels[skill])])) as Record<GameSkill, number>;
  return { title, summary: summary ?? "", levels: rounded, skills: topSkills(rounded), traits: [] };
}

type WikiBlob = { summary: string | null };

/** The summary from memory or a stored blob, else the network. A network error gives null with source "error" and is never cached. */
async function resolveWiki(
  title: string,
  stored: WikiBlob | undefined,
  cache: boolean,
  opts: BreakdownOptions,
): Promise<{ summary: string | null; source: WikiSource; fetched: boolean }> {
  if (opts.wiki) return { ...(await opts.wiki(title)), fetched: false };
  const key = normalizeTitle(title);
  const known = cache ? recalledWiki(key) : undefined;
  if (known !== undefined) return { summary: known, source: "memory", fetched: false };
  if (stored) {
    rememberWiki(key, stored.summary);
    return { summary: stored.summary, source: "blob", fetched: false };
  }
  try {
    const summary = await fetchSummary(title);
    if (cache) rememberWiki(key, summary);
    return { summary, source: "net", fetched: true };
  } catch {
    return { summary: null, source: "error", fetched: false };
  }
}

/** How a game's wiki lookup ended, in the words a span name shows. */
function wikiTag(source: WikiSource | "none"): string {
  if (source === "net") return "(wiki fetched)";
  if (source === "none") return "(no wiki page)";
  if (source === "error") return "(wiki failed)";
  return "(wiki cached)";
}

async function readGames(titles: string[], opts: BreakdownOptions): Promise<GameBreakdown[]> {
  const cache = opts.cache !== false;
  const fresh = new Map<string, GameBreakdown>();
  lastSource.games = {};
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const key = normalizeTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    if (cache && gameCache.has(key)) {
      lastSource.games[key] = key in gameSeed ? "seed" : "memory";
    } else {
      missing.push(title);
    }
  }
  const fromBlob = cache
    ? await readMany<GameBreakdown>("games", missing.map((title) => cacheKey("games", { title: normalizeTitle(title) })))
    : [];
  const uncached: string[] = [];
  missing.forEach((title, i) => {
    const hit = fromBlob[i];
    const key = normalizeTitle(title);
    if (hit) {
      gameCache.set(key, { ...hit, title });
      lastSource.games[key] = "blob";
    } else {
      uncached.push(title);
    }
  });

  const summaries = new Map<string, { summary: string; complete: boolean }>();
  for (const title of titles) {
    const key = normalizeTitle(title);
    const known = cache ? gameCache.get(key) : undefined;
    if (known) summaries.set(key, { summary: known.summary, complete: true });
  }
  let waiting = uncached.length;
  const announce = () => {
    if (waiting === 0) {
      opts.onSummaries?.(
        titles.map((title) => ({ title, ...(summaries.get(normalizeTitle(title)) ?? { summary: "", complete: true }) })),
      );
    }
  };
  if (waiting === 0) announce();

  if (uncached.length > 0) {
    const useBlob = cache && !opts.wiki;
    const wikiPaths = uncached.map((title) => cacheKey("wiki", { title: normalizeTitle(title) }));
    const wikiToRead = useBlob ? uncached.filter((title) => recalledWiki(normalizeTitle(title)) === undefined) : [];
    const stored = await readMany<WikiBlob>(
      "wiki",
      wikiToRead.map((title) => wikiPaths[uncached.indexOf(title)] as string),
    );
    const storedByTitle = new Map(wikiToRead.map((title, i) => [title, stored[i]]));
    const wikiWrites: [string, WikiBlob][] = [];
    const gameWrites: [string, GameBreakdown][] = [];
    await Promise.all(
      uncached.map((title, i) =>
        Sentry.startSpan(
          { op: "top9.game", name: `Look up ${title}`, attributes: { "top9.game.title": title } },
          async (span) => {
            const key = normalizeTitle(title);
            const wiki = await resolveWiki(title, storedByTitle.get(title), cache, opts);
            const summary = wiki.summary;
            const failed = wiki.source === "error";
            span.updateName(`Look up ${title} ${wikiTag(failed ? "error" : summary === null ? "none" : wiki.source)}`);
            span.setAttributes({ "top9.wiki.found": summary !== null, "top9.wiki.source": wiki.source });
            if (wiki.fetched && cache) wikiWrites.push([wikiPaths[i] as string, { summary }]);
            summaries.set(key, { summary: summary ?? "", complete: !failed });
            waiting -= 1;
            announce();
            const game = await judgeGame(title, summary, opts);
            lastSource.games[key] = "model";
            // A judgment made without a summary Wikipedia may have is returned but never remembered.
            if (!cache || failed) {
              fresh.set(key, game);
              return;
            }
            gameCache.set(key, game);
            gameWrites.push([cacheKey("games", { title: key }), game]);
          },
        ),
      ),
    );
    await Promise.all([writeMany("wiki", wikiWrites), writeMany("games", gameWrites)]);
  }
  return titles.map((title) => {
    const key = normalizeTitle(title);
    const game = fresh.get(key) ?? (cache ? gameCache.get(key) : undefined);
    if (!game) throw new Error(`No breakdown for ${title}`);
    return game;
  });
}

/** The skill read as work, in the words a requirement row shows. */
const SKILL_TEXT: Record<GameSkill, string> = {
  planning: "Plans several steps ahead",
  reflexes: "Reacts fast under pressure",
  teamwork: "Plays well with a squad",
  optimizing: "Tunes the numbers until it hums",
  building: "Builds new things from scratch",
  exploring: "Pokes at the unknown for fun",
  storytelling: "Cares about lore and story",
  persistence: "Keeps grinding until it is done",
};

const MAX_REQUIREMENTS = 6;

/** One row per skill the job needs (level 1 or more), highest need first, at most six. Evidence is filled per match. */
export function requirementsFromNeeds(needs: Record<GameSkill, number>): Requirement[] {
  return topSkills(needs, GAME_SKILLS.length)
    .filter((skill) => needs[skill] >= 1)
    .slice(0, MAX_REQUIREMENTS)
    .map((skill) => ({
      id: skill,
      text: SKILL_TEXT[skill],
      kind: needs[skill] >= 2 ? ("must" as const) : ("nice" as const),
      evidence: "",
    }));
}

export async function breakdownJob(
  job: { url: string; title: string; description: string },
  opts: BreakdownOptions = {},
): Promise<JobBreakdown> {
  const cache = opts.cache !== false;
  const jobHash = jobFingerprint(job.title, job.description);
  const key = jobKey(job.url, jobHash);
  const cached = cache ? jobCache.get(key) : undefined;
  if (cached) {
    lastSource.job = seedJobKeys.has(key) ? "seed" : "memory";
    return cached;
  }
  const path = cacheKey("jobs", { pageUrl: job.url, jobHash });
  const stored = cache ? await readJson<JobBreakdown>(path) : undefined;
  if (stored) {
    jobCache.set(key, stored);
    lastSource.job = "blob";
    return stored;
  }
  await opts.beforeModel?.();
  const { needs, wants } = await jevJobNeeds({ title: job.title, description: job.description }, opts.ask);
  const breakdown: JobBreakdown = {
    title: job.title,
    description: clip(job.description, JEV_STATE_CHARS),
    needs: Object.fromEntries(GAME_SKILLS.map((skill) => [skill, round2(needs[skill])])) as Record<GameSkill, number>,
    wants,
    requirements: [],
    dropped: [],
  };
  breakdown.requirements = requirementsFromNeeds(breakdown.needs);
  lastSource.job = "model";
  if (cache) {
    jobCache.set(key, breakdown);
    await writeJson(path, breakdown);
  }
  return breakdown;
}
