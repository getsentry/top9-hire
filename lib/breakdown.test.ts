import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SKILLS,
  breakdownGames,
  breakdownJob,
  cachedGameBreakdowns,
  clearMemoryCaches,
  jobFingerprint,
  libraryCard,
  libraryLabel,
  requirementsFromNeeds,
  skillTally,
  type GameBreakdown,
  type GameSkill,
} from "./breakdown.ts";
import { normalizeTitle } from "./text.ts";
import type { EvaluationAnswers } from "./classify.ts";
import { JEV_STATE_CHARS, type AskJev } from "./jev-breakdown.ts";
import { useBlobIo } from "./store.ts";
import { clearWikiMemory, wikiLookup, type WikiFetch } from "./wiki.ts";

const levelsOf = (over: Partial<Record<GameSkill, number>>) =>
  ({ ...Object.fromEntries(GAME_SKILLS.map((s) => [s, 0])), ...over }) as Record<GameSkill, number>;

function game(skills: GameSkill[]): GameBreakdown {
  return { title: "g", summary: "s", levels: levelsOf({}), skills, traits: [] };
}

const nine = (make: (i: number) => GameBreakdown) => Array.from({ length: 9 }, (_, i) => make(i));

test("skills weigh 3, 2, 1 by position", () => {
  const tally = skillTally([game(["building", "exploring", "teamwork"])]);
  const weight = (skill: GameSkill) => tally.find((t) => t.skill === skill)?.weight;
  assert.equal(weight("building"), 3);
  assert.equal(weight("exploring"), 2);
  assert.equal(weight("teamwork"), 1);
});

test("a skill above its baseline picks the label", () => {
  assert.equal(libraryLabel(nine(() => game(["building"]))), "sandbox_builder");
  assert.equal(libraryLabel(nine(() => game(["storytelling", "teamwork"]))), "lore_monk");
});

test("a common skill needs more than the baseline to win", () => {
  // planning at 9 x 3 = 27 beats its 15.86 baseline by 11.1; building at 27 beats 3.57 by 23.4
  const games = nine((i) => game(i < 9 ? ["building", "planning"] : ["planning"]));
  assert.equal(libraryLabel(games), "sandbox_builder");
});

test("an empty library still gets a label from the full skill list", () => {
  assert.ok(libraryLabel([]));
  assert.equal(skillTally([]).length, GAME_SKILLS.length);
});

test("the card carries the label, top three skills, and per-game traits", () => {
  const card = libraryCard(nine(() => game(["building", "exploring", "teamwork"])));
  assert.equal(card.archetype, "sandbox_builder");
  assert.equal(card.label, "Sandbox builder");
  assert.equal(card.skills.length, 3);
  assert.equal(card.skills[0]?.skill, "building");
  assert.deepEqual(card.games[0]?.traits, []);
});

test("requirements come from needs: level 1 or more, highest first, at most six", () => {
  const needs = levelsOf({ planning: 3, reflexes: 2, teamwork: 1, optimizing: 2.5, building: 1.5, exploring: 1, storytelling: 1, persistence: 0.9 });
  const out = requirementsFromNeeds(needs);
  assert.deepEqual(out.map((r) => r.id), ["planning", "optimizing", "reflexes", "building", "teamwork", "exploring"]);
  assert.deepEqual(out.map((r) => r.kind), ["must", "must", "must", "nice", "nice", "nice"]);
  assert.ok(out.every((r) => r.evidence === "" && r.text.length > 0 && r.text.length <= 40));
  assert.deepEqual(requirementsFromNeeds(levelsOf({ planning: 0.9 })), []);
});

/** Jev answers for every skill question: each skill scores `score`, and a job is asked for its archetype too. */
const fakeAsk = (score: (skill: string) => number): AskJev => async (_state, questions) => {
  const answers: EvaluationAnswers = {};
  for (const name of Object.keys(questions)) {
    answers[name] = name === "wants" ? { type: "choice", choice: "co_op_cleric" } : { type: "score", score: score(name) };
  }
  return { answers, info: { ms: 1, input: 1, output: 1, cost: 0 } };
};

test("games get a clipped wiki summary, levels, and the top three skills", async () => {
  const wiki: typeof wikiLookup = async (title) =>
    title === "Nowhere"
      ? { summary: null, source: "net" }
      : { summary: "x".repeat(300), source: "net" };
  const ask = fakeAsk((skill) => ({ planning: 3, building: 2, exploring: 1 })[skill] ?? 0);
  const titles = ["Alpha", "Nowhere"];
  const [alpha, nowhere] = await breakdownGames(titles, { cache: false, ask, wiki });
  assert.equal(alpha?.summary.length, 300);
  assert.equal(alpha?.levels.planning, 3);
  assert.deepEqual(alpha?.skills, ["planning", "building", "exploring"]);
  assert.deepEqual(alpha?.traits, []);
  assert.equal(nowhere?.summary, "");
});

test("a job keeps its clipped posting, needs, archetype, and built requirements", async () => {
  const ask = fakeAsk((skill) => (skill === "teamwork" ? 3 : 0));
  const job = await breakdownJob(
    { url: "https://x.test/job", title: "Lead", description: "d".repeat(JEV_STATE_CHARS + 50) },
    { cache: false, ask },
  );
  assert.equal(job.description.length, JEV_STATE_CHARS);
  assert.equal(job.wants, "co_op_cleric");
  assert.equal(job.needs.teamwork, 3);
  assert.deepEqual(job.requirements.map((r) => [r.id, r.kind]), [["teamwork", "must"]]);
  assert.deepEqual(job.dropped, []);
});

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("onSummaries fires once, in title order, before the Jev answers resolve", async () => {
  const jev = gate();
  const inner = fakeAsk(() => 1);
  const ask: AskJev = async (state, questions, id) => {
    await jev.opened;
    return inner(state, questions, id);
  };
  const delays: Record<string, number> = { Alpha: 15, Beta: 0, Gamma: 5 };
  const wiki: typeof wikiLookup = async (title) => {
    await new Promise((resolve) => setTimeout(resolve, delays[title]));
    return title === "Beta" ? { summary: null, source: "net" } : { summary: `${title} summary`, source: "net" };
  };
  const seen: { title: string; summary: string; complete: boolean }[][] = [];
  const pending = breakdownGames(["Alpha", "Beta", "Gamma"], { cache: false, ask, wiki, onSummaries: (games) => seen.push(games) });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(seen, [
    [
      { title: "Alpha", summary: "Alpha summary", complete: true },
      { title: "Beta", summary: "", complete: true },
      { title: "Gamma", summary: "Gamma summary", complete: true },
    ],
  ]);
  jev.open();
  await pending;
  assert.equal(seen.length, 1);
});

test("a game's Jev call starts before a slower game's wiki lookup finishes", async () => {
  const slowWiki = gate();
  const started: string[] = [];
  const inner = fakeAsk(() => 1);
  const ask: AskJev = async (state, questions, id) => {
    started.push((state as { game: string }).game);
    return inner(state, questions, id);
  };
  const wiki: typeof wikiLookup = async (title) => {
    if (title === "Slow") await slowWiki.opened;
    return { summary: `${title} summary`, source: "net" };
  };
  const pending = breakdownGames(["Slow", "Quick"], { cache: false, ask, wiki });
  await tick();
  await tick();
  assert.deepEqual(started, ["Quick"]);
  slowWiki.open();
  await pending;
  assert.deepEqual(started, ["Quick", "Slow"]);
});

/** An in-memory Blob: `puts` lists every written path. */
function fakeBlob() {
  const files = new Map<string, string>();
  const puts: string[] = [];
  useBlobIo({
    get: (async (path: string) => {
      const body = files.get(path);
      return body === undefined ? null : { statusCode: 200, stream: new Response(body).body };
    }) as never,
    put: (async (path: string, body: string) => {
      files.set(path, body);
      puts.push(path);
    }) as never,
  });
  return { puts };
}

test("a Wikipedia outage is returned but not cached; the next call retries and stores", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  const blob = fakeBlob();
  clearMemoryCaches();
  clearWikiMemory();
  try {
    const ask = fakeAsk(() => 1);
    const title = "Outage Quest";
    const key = normalizeTitle(title);
    const offline: WikiFetch = async () => {
      throw new Error("offline");
    };
    const seen: { complete: boolean }[][] = [];
    const [first] = await breakdownGames([title], {
      ask,
      wiki: (t) => wikiLookup(t, offline),
      onSummaries: (games) => seen.push(games),
    });
    assert.equal(first?.summary, "");
    assert.deepEqual(seen, [[{ title, summary: "", complete: false }]]);
    assert.equal(key in cachedGameBreakdowns(), false);
    assert.deepEqual(blob.puts, []);

    let calls = 0;
    const working: WikiFetch = async (url) => {
      calls += 1;
      const body = url.includes("list=search")
        ? { query: { search: [{ title: "Outage Quest (video game)" }] } }
        : { extract: "A quest game." };
      return new Response(JSON.stringify(body));
    };
    const [second] = await breakdownGames([title], { ask, wiki: (t) => wikiLookup(t, working) });
    assert.ok(calls > 0);
    assert.equal(second?.summary, "A quest game.");
    assert.equal(cachedGameBreakdowns()[key]?.summary, "A quest game.");
    assert.ok((blob.puts as string[]).some((path) => path.includes("/games/")));
  } finally {
    useBlobIo(undefined);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }
});

test("a job breakdown is reused for the same text and rebuilt when the posting changes", async () => {
  clearMemoryCaches();
  let calls = 0;
  const inner = fakeAsk(() => 1);
  const ask: AskJev = async (state, questions, id) => {
    calls += 1;
    return inner(state, questions, id);
  };
  const posting = { url: "https://x.test/edited", title: "Lead", description: "Original text." };
  await breakdownJob(posting, { ask });
  await breakdownJob(posting, { ask });
  assert.equal(calls, 1);
  const edited = await breakdownJob({ ...posting, description: "Edited text." }, { ask });
  assert.equal(calls, 2);
  assert.equal(edited.description, "Edited text.");
});

test("the fingerprint follows the normalized title and the clipped description", () => {
  const long = "d".repeat(JEV_STATE_CHARS + 500);
  const base = jobFingerprint("Lead Engineer", long);
  assert.match(base, /^[0-9a-f]{16}$/);
  assert.equal(jobFingerprint(" lead  engineer! ", long), base);
  assert.equal(jobFingerprint("Lead Engineer", `${long}more`), base);
  assert.notEqual(jobFingerprint("Lead Engineer", "e"), base);
});

test("a seed is used only for the posting text it was built from", async () => {
  const seeded = Object.entries((await import("./job-breakdowns.json", { with: { type: "json" } })).default as Record<string, { title: string; description: string }>)[0];
  assert.ok(seeded, "the seed has at least one job");
  const [url, job] = seeded;
  let calls = 0;
  const inner = fakeAsk(() => 1);
  const ask: AskJev = async (state, questions, id) => {
    calls += 1;
    return inner(state, questions, id);
  };
  await breakdownJob({ url, title: job.title, description: job.description }, { ask });
  assert.equal(calls, 0);
  await breakdownJob({ url, title: job.title, description: `${job.description} Edited.` }, { ask });
  assert.equal(calls, 1);
});

test("beforeModel runs on a cache miss and not for a seeded title", async () => {
  const seeded = Object.keys(cachedGameBreakdowns())[0] as string;
  let gated = 0;
  const beforeModel = async () => {
    gated += 1;
  };
  const ask = fakeAsk(() => 1);
  await breakdownGames([seeded], { ask, beforeModel });
  assert.equal(gated, 0);
  await breakdownGames(["Brand New Title"], { cache: false, ask, beforeModel, wiki: async () => ({ summary: null, source: "net" }) });
  assert.ok(gated > 0);
});

test("a refusing beforeModel stops the Jev call", async () => {
  const ask: AskJev = async () => assert.fail("Jev must not run");
  const beforeModel = async () => {
    throw new Error("refused");
  };
  const wiki: typeof wikiLookup = async () => ({ summary: null, source: "net" });
  await assert.rejects(breakdownGames(["Some Title"], { cache: false, ask, beforeModel, wiki }), /refused/);
  await assert.rejects(
    breakdownJob({ url: "https://x.test/j", title: "t", description: "d" }, { cache: false, ask, beforeModel }),
    /refused/,
  );
});
