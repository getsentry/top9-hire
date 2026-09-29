import { cacheKey, readJson, writeJson } from "./store.ts";
import { clip, normalizeTitle } from "./text.ts";

/** Pages the top search hit got wrong (a remake, a sequel, a different game) or a truncated card title. */
export const PAGE_FIX: Record<string, string> = {
  "Cities: Skylines": "Cities: Skylines",
  "System Shock 2": "System Shock 2",
  "RuneScape 2": "RuneScape",
  "The Legend of Zelda: Ocarina of Time": "The Legend of Zelda: Ocarina of Time",
  Skate: "Skate (2007 video game)",
  Shapez: "Shapez (video game)",
  "Sid Meier's Civilization II": "Civilization II",
  "The Settlers III": "The Settlers III",
  "Counter-Strike: Global Offens...": "Counter-Strike: Global Offensive",
  "Heroes of Might and Magic III: Armageddo...": "Heroes of Might and Magic III: Armageddon's Blade",
  "Mass Effect 2": "Mass Effect 2",
  "Kingdom Hearts II": "Kingdom Hearts II",
  "Diablo II": "Diablo II",
  "Persona 3 Portable": "Persona 3 Portable",
  "NieR: Automata": "Nier: Automata",
  "Pokémon HeartGold Version": "Pokémon HeartGold and SoulSilver",
  "Need for Speed: Most Wanted": "Need for Speed: Most Wanted (2005 video game)",
};

const SUMMARY_CHARS = 800;
const TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const HEADERS = { "User-Agent": "top9.wtf (https://top9.wtf)" };

/** "error" means Wikipedia did not answer (network error, timeout, error status), so the summary is unknown, not absent. */
export type WikiSource = "memory" | "blob" | "net" | "error";
export type WikiFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/** A summary, or null when Wikipedia has none. Set only after a real answer, never after a network error. */
const memory = new Map<string, string | null>();

/** The in-memory answer for a normalized title: a summary, null when Wikipedia has none, undefined when unknown. */
export const recalledWiki = (key: string): string | null | undefined => memory.get(key);

/** Remember a real answer for a normalized title. Never call this after a network error. */
export const rememberWiki = (key: string, summary: string | null): void => {
  memory.set(key, summary);
};

/** Test-only: forget in-memory summaries so the next call reads the blob again. */
export function clearWikiMemory(): void {
  memory.clear();
}

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
const words = (text: string) => normalizeTitle(text).split(" ").map((word) => ROMAN[word] ?? word);
/** Card titles add these to a game's name; the article is usually under the plain name. */
const EXTRA_WORDS = new Set(["version", "edition", "remake", "remastered", "classic", "definitive", "deluxe"]);

/** Every main-title word of 3+ letters and every number must start a word of the page title, so "Rain World" rejects "Rain" and "Baldur's Gate 3" rejects "Baldur's Gate". The prefix match keeps truncated card titles working. */
export function pageFits(page: string, query: string): boolean {
  // "Elden Ring (film)" is not the game; "Skate (2007 video game)" is.
  if (/\((?![^)]*game)[^)]*\)/.test(page)) return false;
  const pageWords = words(page);
  const needed = words(query.split(":")[0] as string).filter(
    (word) => (word.length >= 3 || /^\d+$/.test(word)) && !EXTRA_WORDS.has(word),
  );
  return needed.length > 0 && needed.every((word) => pageWords.some((candidate) => candidate.startsWith(word)));
}

async function getJson(url: string, doFetch: WikiFetch): Promise<Record<string, any>> {
  const res = await doFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Wikipedia body over 2 MB");
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const summaryUrl = (page: string) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`;
const searchUrl = (query: string) =>
  `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(`${query} video game`)}`;

/** Throws on a network error, timeout, or an error status other than 404; null means Wikipedia has no fitting page. */
export async function fetchSummary(title: string, doFetch: WikiFetch = fetch): Promise<string | null> {
  const fixed = PAGE_FIX[title];
  if (fixed) {
    const sum = await getJson(summaryUrl(fixed), doFetch);
    if (sum.extract && sum.type !== "disambiguation") return clip(sum.extract, SUMMARY_CHARS);
  }
  const query = title.replace(/\.\.\.$/, "").trim();
  const search = await getJson(searchUrl(query), doFetch);
  const hits: { title: string }[] = search.query?.search ?? [];
  const page = hits.find((hit) => pageFits(hit.title, query))?.title;
  if (!page) return null;
  const sum = await getJson(summaryUrl(page), doFetch);
  if (!sum.extract || sum.type === "disambiguation") return null;
  return clip(sum.extract, SUMMARY_CHARS);
}

/** The lookup and where it came from. A network error returns null with source "error" for this call only and caches nothing. */
export async function wikiLookup(
  title: string,
  doFetch: WikiFetch = fetch,
): Promise<{ summary: string | null; source: WikiSource }> {
  const key = normalizeTitle(title);
  if (memory.has(key)) return { summary: memory.get(key) as string | null, source: "memory" };
  const path = cacheKey("wiki", { title: key });
  const stored = await readJson<{ summary: string | null }>(path);
  if (stored) {
    memory.set(key, stored.summary);
    return { summary: stored.summary, source: "blob" };
  }
  let summary: string | null;
  try {
    summary = await fetchSummary(title, doFetch);
  } catch {
    return { summary: null, source: "error" };
  }
  memory.set(key, summary);
  await writeJson(path, { summary });
  return { summary, source: "net" };
}

export async function wikiSummary(title: string, doFetch?: WikiFetch): Promise<string | null> {
  return (await wikiLookup(title, doFetch)).summary;
}
