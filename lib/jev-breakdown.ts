import * as Sentry from "@sentry/nextjs";
import {
  experimental_evaluate as evaluate,
  type Experimental_EvaluationQuestion as EvaluationQuestion,
} from "ai";
import { MissingGatewayKey, requestOidcToken, type EvaluationAnswers } from "./classify.ts";
import { GAME_SKILLS, type CallInfo, type GameSkill } from "./skills.ts";
import { ARCHETYPES, gatewayReady, type ArchetypeId } from "./hire.ts";
import { EVALUATE_MODEL } from "./models.ts";
import { clip } from "./text.ts";

/** Skill levels 0 to 3 for one game or one job. */
export type SkillLevels = Record<GameSkill, number>;

const SKILL_MEANING: Record<GameSkill, string> = {
  planning: "planning ahead: sequencing moves, resources, and long-term plans",
  reflexes: "fast, precise reactions under time pressure",
  teamwork: "cooperating with, supporting, or leading other players",
  optimizing: "min-maxing, theorycrafting, and tuning numbers or builds",
  building: "constructing, crafting, and creating things",
  exploring: "exploring, experimenting, and discovering the unknown",
  storytelling: "following or making stories, lore, and characters",
  persistence: "grinding, retrying, and seeing hard or long goals through",
};

const GAME_LEVELS = [
  "Playing it does not train this",
  "Playing it trains this a little",
  "Playing it clearly trains this",
  "This is core to the game",
];
const JOB_LEVELS = [
  "The work barely needs this",
  "The work needs this a little",
  "The work clearly needs this",
  "This is core to the work",
];

/** Characters of job text sent to Jev. Its state limit is about 32K tokens (130K characters of plain words passed), so this leaves wide margin. */
export const JEV_STATE_CHARS = 24_000;

export function gameQuestions(): Record<string, EvaluationQuestion> {
  return Object.fromEntries(
    GAME_SKILLS.map((skill) => [
      skill,
      {
        type: "score",
        instructions: `How much does playing this game train ${SKILL_MEANING[skill]}?`,
        criteria: [...GAME_LEVELS],
      },
    ]),
  );
}

export function jobQuestions(): Record<string, EvaluationQuestion> {
  const questions: Record<string, EvaluationQuestion> = Object.fromEntries(
    GAME_SKILLS.map((skill) => [
      skill,
      {
        type: "score",
        instructions: `How much does the day-to-day work need ${SKILL_MEANING[skill]}, read as a play style?`,
        criteria: [...JOB_LEVELS],
      },
    ]),
  );
  questions.wants = {
    type: "choice",
    instructions: "Which kind of player would love this job's day-to-day work most?",
    criteria: Object.fromEntries(Object.entries(ARCHETYPES).map(([id, a]) => [id, a.criterion])),
  };
  return questions;
}

/** Probability-weighted level of a score answer: levels are zero-based indexes, so the result runs 0 to 3. */
export function expectedLevel(answer: EvaluationAnswers[string] | undefined): number {
  if (!answer || answer.type !== "score") throw new Error("Evaluation returned no score answer");
  const entries = Object.entries(answer.probabilities ?? {});
  const total = entries.reduce((sum, [, p]) => sum + p, 0);
  if (total <= 0) return Math.min(3, Math.max(0, answer.score));
  return entries.reduce((sum, [index, p]) => sum + p * Number(index), 0) / total;
}

export function levelsFromAnswers(answers: EvaluationAnswers): SkillLevels {
  return Object.fromEntries(GAME_SKILLS.map((skill) => [skill, expectedLevel(answers[skill])])) as SkillLevels;
}

/** Highest levels first; ties keep GAME_SKILLS order. */
export function topSkills(levels: SkillLevels, count = 3): GameSkill[] {
  return GAME_SKILLS.map((skill, order) => ({ skill, order, level: levels[skill] }))
    .sort((a, b) => b.level - a.level || a.order - b.order)
    .slice(0, count)
    .map((entry) => entry.skill);
}

/** The plain-words span name for one Jev call, so a trace shows what each call was for. */
function jevSpanName(functionId: string, state: Record<string, unknown>): string {
  if (functionId === "top9.job.needs") return "Jev reads the job";
  if (functionId === "top9.fit") return "Jev judges the fit";
  if (functionId === "top9.game.skills") return typeof state.game === "string" ? `Jev reads ${state.game}` : "Jev reads a game";
  return `Jev runs ${functionId}`;
}

/**
 * One Jev call. `functionId` names the call in telemetry, so Sentry shows it as its own gen_ai.evaluate span.
 * The wrapper span above it names the call in plain words and carries the gateway cost; tokens stay on the SDK span.
 */
export async function askJev(state: Record<string, unknown>, questions: Record<string, EvaluationQuestion>, functionId: string) {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) throw new MissingGatewayKey();
  return Sentry.startSpan(
    {
      op: "gen_ai.invoke_agent",
      name: jevSpanName(functionId, state),
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": "Jev",
        "gen_ai.function_id": functionId,
        "gen_ai.request.model": EVALUATE_MODEL,
      },
    },
    async (span) => {
      const started = Date.now();
      const result = await evaluate({
        model: EVALUATE_MODEL,
        state: state as never,
        questions,
        telemetry: { isEnabled: true, functionId, recordInputs: true, recordOutputs: true },
      });
      const gateway = (result.providerMetadata as { gateway?: { cost?: string } } | undefined)?.gateway;
      const info: CallInfo = {
        ms: Date.now() - started,
        input: result.usage.inputTokens ?? 0,
        output: result.usage.outputTokens ?? 0,
        cost: Number(gateway?.cost ?? 0) || 0,
      };
      if (info.cost > 0) span.setAttribute("gen_ai.cost.total_tokens", info.cost);
      return { answers: result.answers as EvaluationAnswers, info, response: result.response };
    },
  );
}
/** The seam tests replace. */
export type AskJev = (
  state: Record<string, unknown>,
  questions: Record<string, EvaluationQuestion>,
  functionId: string,
) => Promise<{ answers: EvaluationAnswers; info: CallInfo; response?: { modelId: string } }>;

/** One Jev call per game. Jev has no world knowledge, so without a summary it only sees the title. */
export async function jevGameSkills(title: string, summary?: string, ask: AskJev = askJev) {
  const { answers, info } = await ask(summary ? { game: title, summary } : { game: title }, gameQuestions(), "top9.game.skills");
  return { levels: levelsFromAnswers(answers), info };
}

export async function jevJobNeeds(job: { title: string; description: string }, ask: AskJev = askJev) {
  const { answers, info } = await ask(
    { title: job.title, description: clip(job.description, JEV_STATE_CHARS) },
    jobQuestions(),
    "top9.job.needs",
  );
  const wants = answers.wants;
  if (!wants || wants.type !== "choice") throw new Error("Evaluation returned no archetype");
  return { needs: levelsFromAnswers(answers), wants: wants.choice as ArchetypeId, info };
}

/** A library's strength at one skill: the mean of its three best games. */
export function libraryStrength(games: SkillLevels[], skill: GameSkill): number {
  const best = games
    .map((game) => game[skill])
    .sort((a, b) => b - a)
    .slice(0, 3);
  return best.reduce((sum, level) => sum + level, 0) / Math.max(best.length, 1);
}

/**
 * For each skill the job needs (level 1 or more), the library's strength is the mean of its three best games
 * at that skill, and coverage is strength over need, capped at 1. Percent is the need-weighted mean coverage.
 */
export function vectorFit(games: SkillLevels[], needs: SkillLevels): number {
  let earned = 0;
  let possible = 0;
  for (const skill of GAME_SKILLS) {
    const need = needs[skill];
    if (need < 1) continue;
    earned += need * Math.min(libraryStrength(games, skill) / need, 1);
    possible += need;
  }
  return possible === 0 ? 0 : Math.round((100 * earned) / possible);
}

/** Sum of a library's game skill vectors, in GAME_SKILLS order. */
export function libraryProfile(games: SkillLevels[]): number[] {
  return GAME_SKILLS.map((skill) => games.reduce((sum, game) => sum + game[skill], 0));
}

/**
 * Cosine between the library profile and the job need vector, each with its mean removed
 * (the library's mean is taken across all libraries, the job's across its own skills), mapped from -1..1 to 0..100.
 */
export function profileFit(profile: number[], meanProfile: number[], needs: SkillLevels): number {
  const a = profile.map((value, i) => value - (meanProfile[i] as number));
  const raw = GAME_SKILLS.map((skill) => needs[skill]);
  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  const b = raw.map((value) => value - mean);
  const dot = a.reduce((sum, value, i) => sum + value * (b[i] as number), 0);
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm === 0 ? 50 : Math.round(50 + 50 * (dot / norm));
}
