import { generateText, Output } from "ai";
import { getVercelOidcToken } from "@vercel/oidc";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import {
  ARCHETYPES,
  AXES,
  gatewayReady,
  judgmentInstructions,
  modelState,
  toCard,
  type Archetype,
  type HireCard,
  type Judgment,
  type Top9,
} from "./hire.ts";

export const MODEL = "openai/gpt-5.4-mini";

const archetypeIds = Object.keys(ARCHETYPES) as [Archetype, ...Archetype[]];
const archetypeSchema = z.enum(archetypeIds);
const levelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
const axisSchema = z.object({
  level: levelSchema,
  confidence: z.number().min(0).max(1),
});

export const judgmentSchema = z.object({
  hire_archetype: z.object({
    choice: archetypeSchema,
    confidence: z.number().min(0).max(1),
    alternatives: z
      .array(
        z.object({
          choice: archetypeSchema,
          probability: z.number().min(0).max(1),
        }),
      )
      .max(3),
  }),
  scores: z.object({
    systems_vs_product: axisSchema,
    competitive_vs_collaborative: axisSchema,
    depth_vs_breadth: axisSchema,
    builder_vs_optimizer: axisSchema,
  }),
});

async function requestOidcToken(env: {
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

function runnerUp(
  choice: Archetype,
  alternatives: { choice: Archetype; probability: number }[],
): Judgment["runnerUp"] {
  let best: Judgment["runnerUp"];
  for (const option of alternatives) {
    if (option.choice === choice) continue;
    if (!best || option.probability > best.probability) {
      best = { archetype: option.choice, probability: option.probability };
    }
  }
  return best;
}

export async function classify(top9: Top9): Promise<HireCard> {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) throw new MissingGatewayKey();
  const state = modelState(top9);
  const instructions = judgmentInstructions();
  const card = await Sentry.startSpan(
    {
      op: "gen_ai.evaluate",
      name: "evaluate hire_archetype",
      attributes: {
        "gen_ai.operation.name": "evaluate",
        "gen_ai.evaluation.name": "hire_archetype",
        "gen_ai.request.model": MODEL,
        "gen_ai.provider.name": "vercel.ai_gateway",
        "gen_ai.system_instructions": instructions,
        "gen_ai.input.messages": JSON.stringify([
          {
            role: "user",
            parts: [{ type: "text", content: JSON.stringify(state) }],
          },
        ]),
      },
    },
    async (span) => {
      const { output } = await generateText({
        model: MODEL,
        system: instructions,
        prompt: JSON.stringify(state),
        output: Output.object({
          schema: judgmentSchema,
          name: "hire_judgment",
          description:
            "Archetype choice plus four taste scores for a nine-title library.",
        }),
        telemetry: {
          isEnabled: true,
          functionId: "hire-archetype",
          recordInputs: true,
          recordOutputs: true,
        },
      });
      if (!output) throw new Error("Model returned an empty judgment");
      const judgment: Judgment = {
        archetype: output.hire_archetype.choice,
        confidence: output.hire_archetype.confidence,
        runnerUp: runnerUp(
          output.hire_archetype.choice,
          output.hire_archetype.alternatives,
        ),
        scores: output.scores,
      };
      const card = toCard(judgment);
      span.setAttribute("gen_ai.evaluation.score.value", judgment.confidence);
      span.setAttribute("gen_ai.evaluation.score.label", judgment.archetype);
      span.setAttribute("gen_ai.evaluation.explanation", card.roast);
      span.setAttribute(
        "gen_ai.output.messages",
        JSON.stringify([
          {
            role: "assistant",
            parts: [{ type: "text", content: JSON.stringify(judgment) }],
          },
        ]),
      );
      span.setAttribute("hire.scores", JSON.stringify(judgment.scores));
      return card;
    },
  );
  // Streamed gen_ai spans wait on an unref'd timer. Flush before Vercel freezes the function.
  await Sentry.flush(2000);
  return card;
}
