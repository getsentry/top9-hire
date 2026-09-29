import assert from "node:assert/strict";
import test from "node:test";
import { GAME_SKILLS } from "./breakdown.ts";
import {
  expectedLevel,
  gameQuestions,
  libraryProfile,
  profileFit,
  jobQuestions,
  topSkills,
  vectorFit,
  type SkillLevels,
} from "./jev-breakdown.ts";

const levels = (over: Partial<SkillLevels>): SkillLevels => ({
  ...(Object.fromEntries(GAME_SKILLS.map((s) => [s, 0])) as SkillLevels),
  ...over,
});

test("expectedLevel weights zero-based level probabilities", () => {
  const answer = { type: "score" as const, score: 3, probabilities: { "0": 0.5, "3": 0.5 } };
  assert.equal(expectedLevel(answer), 1.5);
  assert.equal(expectedLevel({ type: "score", score: 2 }), 2);
  assert.throws(() => expectedLevel({ type: "boolean", probability: 1 }));
});

test("topSkills orders by level and keeps skill order on ties", () => {
  assert.deepEqual(topSkills(levels({ building: 3, planning: 1, reflexes: 1, storytelling: 2 })), [
    "building",
    "storytelling",
    "planning",
  ]);
});

test("questions cover every skill, and jobs add the archetype choice", () => {
  assert.deepEqual(Object.keys(gameQuestions()), [...GAME_SKILLS]);
  const job = jobQuestions();
  assert.equal(job.wants?.type, "choice");
  assert.equal(Object.keys(job).length, GAME_SKILLS.length + 1);
});

test("vectorFit uses the mean of the three best games, capped by need", () => {
  const games = [levels({ planning: 3 }), levels({ planning: 3 }), levels({ planning: 0 }), levels({ planning: 3 })];
  assert.equal(vectorFit(games, levels({ planning: 3 })), 100);
  const weak = [levels({ planning: 1 }), levels({ planning: 1 }), levels({ planning: 1 })];
  assert.equal(vectorFit(weak, levels({ planning: 2, reflexes: 2 })), 25);
  assert.equal(vectorFit(weak, levels({ planning: 0.5 })), 0);
});

test("profileFit is 100 for the same shape, 0 for the opposite, 50 for no signal", () => {
  const needs = levels({ planning: 3, reflexes: 1 });
  const same = [3, 1, 0, 0, 0, 0, 0, 0];
  assert.equal(profileFit(same, new Array(8).fill(0.5), needs) > 95, true);
  assert.equal(profileFit([-3, -1, 0, 0, 0, 0, 0, 0], new Array(8).fill(0), needs) < 20, true);
  assert.equal(profileFit(new Array(8).fill(1), new Array(8).fill(1), needs), 50);
  assert.deepEqual(libraryProfile([levels({ planning: 1 }), levels({ planning: 2 })])[0], 3);
});
