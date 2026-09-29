import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_FIX, clearWikiMemory, pageFits, wikiLookup, wikiSummary, type WikiFetch } from "./wiki.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const search = (title: string) => json({ query: { search: [{ title }] } });
const summary = (extract: string, type = "standard") => json({ extract, type });

/** Answers each URL with the first handler whose prefix it starts with, and records every URL. */
function fakeFetch(routes: [string, () => Response][]): { fetch: WikiFetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: WikiFetch = async (url) => {
    urls.push(url);
    const route = routes.find(([prefix]) => url.includes(prefix));
    if (!route) throw new Error(`unexpected ${url}`);
    return route[1]();
  };
  return { fetch, urls };
}

test("a PAGE_FIX title reads its fixed page and skips search", async () => {
  clearWikiMemory();
  const { fetch, urls } = fakeFetch([["/page/summary/", () => summary("Fixed page text.")]]);
  assert.equal(await wikiSummary("RuneScape 2", fetch), "Fixed page text.");
  assert.equal(urls.length, 1);
  assert.ok(urls[0]?.endsWith(encodeURIComponent(PAGE_FIX["RuneScape 2"] as string)));
  assert.ok(urls[0]?.startsWith("https://en.wikipedia.org/"));
});

test("a search hit with no word in common with the title is rejected", async () => {
  clearWikiMemory();
  const { fetch, urls } = fakeFetch([["list=search", () => search("Completely Unrelated")], ["/page/summary/", () => summary("nope")]]);
  assert.equal(await wikiSummary("Hades", fetch), null);
  assert.equal(urls.length, 1);
});

test("a disambiguation page is rejected", async () => {
  clearWikiMemory();
  const { fetch } = fakeFetch([["list=search", () => search("Hades")], ["/page/summary/", () => summary("Hades may refer to", "disambiguation")]]);
  assert.equal(await wikiSummary("Hades", fetch), null);
});

test("a summary is clipped to 800 characters", async () => {
  clearWikiMemory();
  const { fetch } = fakeFetch([["list=search", () => search("Hades (video game)")], ["/page/summary/", () => summary("y".repeat(2000))]]);
  const text = await wikiSummary("Hades", fetch);
  assert.equal(text?.length, 800);
});

test("a found summary and a real not-found are both served from memory afterwards", async () => {
  clearWikiMemory();
  const found = fakeFetch([["list=search", () => search("Celeste")], ["/page/summary/", () => summary("Celeste is a game.")]]);
  assert.equal((await wikiLookup("Celeste", found.fetch)).source, "net");
  const before = found.urls.length;
  assert.deepEqual(await wikiLookup("Celeste", found.fetch), { summary: "Celeste is a game.", source: "memory" });
  assert.equal(found.urls.length, before);
  const none = fakeFetch([["list=search", () => json({ query: { search: [] } })]]);
  assert.equal(await wikiSummary("Zzzzz", none.fetch), null);
  assert.equal((await wikiLookup("Zzzzz", none.fetch)).source, "memory");
});

test("a network error returns null for that call and is not cached", async () => {
  clearWikiMemory();
  const broken: WikiFetch = async () => {
    throw new Error("offline");
  };
  assert.deepEqual(await wikiLookup("Portal", broken), { summary: null, source: "error" });
  const { fetch } = fakeFetch([["list=search", () => search("Portal (video game)")], ["/page/summary/", () => summary("Portal is a puzzle game.")]]);
  assert.equal(await wikiSummary("Portal", fetch), "Portal is a puzzle game.");
});

test("a server error status is a network error, not a not-found", async () => {
  clearWikiMemory();
  const { fetch } = fakeFetch([["list=search", () => json({}, 503)]]);
  assert.equal((await wikiLookup("Portal", fetch)).source, "error");
  const ok = fakeFetch([["list=search", () => search("Portal (video game)")], ["/page/summary/", () => summary("Now found.")]]);
  assert.equal(await wikiSummary("Portal", ok.fetch), "Now found.");
});

test("a body over 2 MB is refused", async () => {
  clearWikiMemory();
  const { fetch } = fakeFetch([["list=search", () => new Response("x".repeat(2 * 1024 * 1024 + 1))]]);
  assert.deepEqual(await wikiLookup("Portal", fetch), { summary: null, source: "error" });
});

test("pageFits needs every main-title word and the sequel number", () => {
  assert.equal(pageFits("Rain", "Rain World"), false);
  assert.equal(pageFits("Rain World", "Rain World"), true);
  assert.equal(pageFits("Baldur's Gate", "Baldur's Gate 3"), false);
  assert.equal(pageFits("Baldur's Gate 3", "Baldur's Gate 3"), true);
  assert.equal(pageFits("Civilization VI", "Civilization 6"), true);
  assert.equal(pageFits("The Witcher 3: Wild Hunt", "The Witcher 3"), true);
  assert.equal(pageFits("Counter-Strike: Global Offensive", "Counter-Strike: Global Offens"), true);
  assert.equal(pageFits("Pokémon Crystal", "Pokémon Crystal Version"), true);
  assert.equal(pageFits("Elden Ring (film)", "Elden Ring"), false);
  assert.equal(pageFits("Skate (2007 video game)", "Skate"), true);
});
