import {
  experimental_evaluate,
  type Experimental_EvaluationResult,
  type ProviderMetadata,
} from "ai";
import { getVercelOidcToken } from "@vercel/oidc";
import * as Sentry from "@sentry/nextjs";
import {
  ARCHETYPE_QUESTION,
  ARCHETYPE_RULES,
  ARCHETYPES,
  AXES,
  SCORE_LEVELS,
  gatewayReady,
  modelState,
  toCard,
  type Archetype,
  type AxisId,
  type AxisScore,
  type HireCard,
  type Judgment,
  type Top9,
} from "./hire.ts";
import { type JobPosting } from "./job.ts";
import { JUDGE_MODEL } from "./models.ts";

export async function requestOidcToken(env: {
  [key: string]: string | undefined;
}): Promise<string | undefined> {
  if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || env.VERCEL !== "1") {
    return undefined;
  }
  try {
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}

export class MissingGatewayKey extends Error {
  constructor() {
    super("AI gateway credentials are missing");
    this.name = "MissingGatewayKey";
  }
}

type Subject = "hire" | "role";

type ScoreQuestion = { type: "score"; instructions: string; criteria: readonly string[] };

export type JudgmentQuestions = {
  archetype: { type: "choice"; instructions: string; criteria: Record<Archetype, string> };
} & Record<AxisId, ScoreQuestion>;

export type JudgmentAnswers = Experimental_EvaluationResult<JudgmentQuestions>["answers"];

type EvaluationState = Parameters<typeof experimental_evaluate>[0]["state"];

const archetypeIds = Object.keys(ARCHETYPES) as Archetype[];
const axisIds = Object.keys(AXES) as AxisId[];

function recordOf<K extends string, T>(keys: readonly K[], value: (key: K) => T): Record<K, T> {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, T>;
}

const ROLE_AXES: Record<AxisId, string> = {
  systems_vs_product:
    "hard systems, infrastructure, and engineering internals versus product, docs, developer-delight, and player-facing polish",
  competitive_vs_collaborative:
    "solo climb or individual performance versus team, community, and enabling others",
  depth_vs_breadth: "a narrow deep specialty versus a wide surface",
  builder_vs_optimizer:
    "creating new tools or products versus tuning, scaling, and min-maxing what already exists",
};

const SUBJECTS: Record<
  Subject,
  { evaluation: string; functionId: string; archetype: string; axis: (id: AxisId) => string }
> = {
  hire: {
    evaluation: "hire_archetype",
    functionId: "hire-archetype",
    archetype: [ARCHETYPE_QUESTION, ...ARCHETYPE_RULES].join("\n"),
    axis: (id) => AXES[id].instructions,
  },
  role: {
    evaluation: "role_archetype",
    functionId: "role-archetype",
    archetype: [
      "Which archetype is the closest metaphor for the work in this job description?",
      "The archetypes are a hire-signal metaphor for working style. This is not a hiring rubric.",
      "Do not invent duties that are not in the description.",
      "Use no_match when the description is too thin or too mixed.",
    ].join("\n"),
    axis: (id) =>
      [
        `Score this job description on the ${AXES[id].left} vs ${AXES[id].right} axis used for a nine-title game library.`,
        `The axis is ${ROLE_AXES[id]}.`,
        `The first level is the ${AXES[id].left} pole and the last level is the ${AXES[id].right} pole.`,
        "The levels describe games. Apply them as a scale to the work in the description.",
        "Do not invent duties that are not in the description.",
      ].join("\n"),
  },
};

export function judgmentQuestions(subject: Subject): JudgmentQuestions {
  const { archetype, axis } = SUBJECTS[subject];
  return {
    archetype: {
      type: "choice",
      instructions: archetype,
      criteria: recordOf(archetypeIds, (id) => ARCHETYPES[id].criterion),
    },
    ...recordOf(axisIds, (id): ScoreQuestion => ({
      type: "score",
      instructions: axis(id),
      criteria: AXES[id].criteria,
    })),
  };
}

function runnerUp(choice: Archetype, probabilities: Record<Archetype, number>): Judgment["runnerUp"] {
  let best: Judgment["runnerUp"];
  for (const archetype of archetypeIds) {
    if (archetype === choice) continue;
    if (!best || probabilities[archetype] > best.probability) {
      best = { archetype, probability: probabilities[archetype] };
    }
  }
  return best;
}

function reportedConfidence(providerMetadata?: ProviderMetadata): number | undefined {
  const confidence = providerMetadata?.typesafe?.confidence;
  if (typeof confidence !== "object" || confidence === null || !("archetype" in confidence)) {
    return undefined;
  }
  const { archetype } = confidence;
  return typeof archetype === "number" && archetype >= 0 && archetype <= 1 ? archetype : undefined;
}

function axisScore({ score, probabilities }: JudgmentAnswers[AxisId]): AxisScore {
  const index = Math.min(Math.max(Math.round(score), 0), SCORE_LEVELS.length - 1);
  return { level: SCORE_LEVELS[index], confidence: probabilities?.[String(index)] ?? 1 };
}

export function judgmentFrom(answers: JudgmentAnswers, providerMetadata?: ProviderMetadata): Judgment {
  const { choice, probabilities } = answers.archetype;
  const runner = probabilities && runnerUp(choice, probabilities);
  return {
    archetype: choice,
    confidence: probabilities?.[choice] ?? reportedConfidence(providerMetadata) ?? 1,
    ...(runner ? { runnerUp: runner } : {}),
    scores: recordOf(axisIds, (id) => axisScore(answers[id])),
  };
}

async function judge(subject: Subject, state: EvaluationState): Promise<Judgment> {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) throw new MissingGatewayKey();
  const { evaluation, functionId } = SUBJECTS[subject];
  const questions = judgmentQuestions(subject);
  const judgment = await Sentry.startSpan(
    {
      op: "gen_ai.evaluate",
      name: `evaluate ${evaluation}`,
      attributes: {
        "gen_ai.operation.name": "evaluate",
        "gen_ai.evaluation.name": evaluation,
        "gen_ai.request.model": JUDGE_MODEL,
        "gen_ai.provider.name": "vercel.ai_gateway",
        "gen_ai.system_instructions": JSON.stringify(questions),
        "gen_ai.input.messages": JSON.stringify([
          { role: "user", parts: [{ type: "text", content: JSON.stringify(state) }] },
        ]),
      },
    },
    async (span) => {
      const result = await experimental_evaluate({
        model: JUDGE_MODEL,
        state,
        questions,
        telemetry: { isEnabled: true, functionId, recordInputs: true, recordOutputs: true },
      });
      const next = judgmentFrom(result.answers, result.providerMetadata);
      span.setAttributes({
        "gen_ai.response.model": result.response.modelId,
        "gen_ai.output.messages": JSON.stringify([
          { role: "assistant", parts: [{ type: "text", content: JSON.stringify(result.answers) }] },
        ]),
        "gen_ai.evaluation.score.value": next.confidence,
        "gen_ai.evaluation.score.label": next.archetype,
        "gen_ai.evaluation.explanation": toCard(next).signal,
        "gen_ai.usage.input_tokens": result.usage.inputTokens,
        "gen_ai.usage.output_tokens": result.usage.outputTokens,
        "gen_ai.usage.total_tokens": result.usage.totalTokens,
        [`${subject}.scores`]: JSON.stringify(next.scores),
      });
      return next;
    },
  );
  // Streamed gen_ai spans wait on an unref'd timer. Flush before Vercel freezes the function.
  await Sentry.flush(2000);
  return judgment;
}

export function evaluateHire(top9: Top9): Promise<Judgment> {
  return judge("hire", modelState(top9));
}

export function evaluateRole(posting: JobPosting): Promise<Judgment> {
  return judge("role", { title: posting.title, url: posting.pageUrl, description: posting.text });
}

export async function classify(top9: Top9): Promise<HireCard> {
  return toCard(await evaluateHire(top9));
}
