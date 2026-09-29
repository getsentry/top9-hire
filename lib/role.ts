import { generateText, Output } from "ai";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import {
  MODEL,
  MissingGatewayKey,
  archetypeChoiceSchema,
  requestOidcToken,
  scoresSchema,
  toJudgment,
} from "./classify.ts";
import {
  ARCHETYPES,
  AXES,
  gatewayReady,
  toCard,
  type Archetype,
  type AxisId,
  type Judgment,
} from "./hire.ts";
import { type JobPosting } from "./job.ts";

export { MODEL };

export const roleJudgmentSchema = z.object({
  role_archetype: archetypeChoiceSchema,
  scores: scoresSchema,
});

export type MatchChoice = "match" | "stretch" | "mismatch";

/** A gap of this many levels or more on one axis counts as diverging. */
export const DIVERGE_AT = 2;

export type AxisFacet = {
  id: AxisId;
  axis: string;
  left: string;
  right: string;
  hire: number;
  role: number;
  gap: number;
  read: "aligned" | "adjacent" | "diverges";
};

export type Alignment = {
  percent: number;
  choice: MatchChoice;
  diverging: number;
  facets: AxisFacet[];
  archetypes: { hire: string; role: string; same: boolean };
};

export type HireJobMatch = { choice: MatchChoice; why: string; alignment: Alignment };

/**
 * The match choice is a rule on the axis gaps, not a model mood:
 * no diverging axes is a match, one or two is a stretch, three or four is a mismatch.
 */
export function alignment(hire: Pick<Judgment, "archetype" | "scores">, role: Pick<Judgment, "archetype" | "scores">): Alignment {
  const ids = Object.keys(AXES) as AxisId[];
  const facets = ids.map((id): AxisFacet => {
    const gap = Math.abs(hire.scores[id].level - role.scores[id].level);
    return {
      id,
      axis: `${AXES[id].left} vs ${AXES[id].right}`,
      left: AXES[id].left,
      right: AXES[id].right,
      hire: hire.scores[id].level,
      role: role.scores[id].level,
      gap,
      read: gap === 0 ? "aligned" : gap < DIVERGE_AT ? "adjacent" : "diverges",
    };
  });
  const totalGap = facets.reduce((sum, facet) => sum + facet.gap, 0);
  const diverging = facets.filter((facet) => facet.read === "diverges").length;
  return {
    percent: Math.round(100 * (1 - totalGap / (ids.length * 3))),
    choice: diverging === 0 ? "match" : diverging <= 2 ? "stretch" : "mismatch",
    diverging,
    facets,
    archetypes: {
      hire: ARCHETYPES[hire.archetype].label,
      role: ARCHETYPES[role.archetype].label,
      same: hire.archetype === role.archetype,
    },
  };
}

const READ_PHRASES: Record<AxisFacet["read"], { one: string; many: string }> = {
  aligned: { one: "lines up", many: "line up" },
  adjacent: { one: "is one level apart", many: "are one level apart" },
  diverges: { one: "diverges", many: "diverge" },
};

const axisList = new Intl.ListFormat("en", { type: "conjunction" });

export function matchWhy({ facets, archetypes }: Alignment): string {
  const axes = Object.entries(READ_PHRASES).flatMap(([read, { one, many }]) => {
    const named = facets.filter((facet) => facet.read === read).map((facet) => facet.axis);
    if (named.length === 0) return [];
    if (named.length === facets.length) return [`Every axis ${one}.`];
    return [`${axisList.format(named)} ${named.length === 1 ? one : many}.`];
  });
  const archetype = archetypes.same
    ? `Both read as ${archetypes.hire}.`
    : `Top9 reads as ${archetypes.hire}, the role as ${archetypes.role}.`;
  return [...axes, archetype].join(" ");
}

export function matchFor(hire: Judgment, role: Judgment): HireJobMatch {
  const aligned = alignment(hire, role);
  return { choice: aligned.choice, why: matchWhy(aligned), alignment: aligned };
}

function axisGuide(): string {
  return (Object.keys(AXES) as AxisId[])
    .map((id) => {
      const axis = AXES[id];
      const levels = axis.criteria.map((line, index) => `${index + 1}. ${line}`).join("\n");
      return `${id} (${axis.left} = 1, ${axis.right} = 4)\n${axis.instructions}\n${levels}`;
    })
    .join("\n\n");
}

function archetypeGuide(): string {
  return (Object.keys(ARCHETYPES) as Archetype[])
    .map((id) => `${id}: ${ARCHETYPES[id].criterion}`)
    .join("\n");
}

export function roleInstructions(): string {
  return [
    "Score this job description on the same four axes used for a nine-title game library.",
    "The axes are a hire-signal metaphor for working style. This is not a hiring rubric.",
    "Level 1 is the left pole and level 4 is the right pole. Use the numbered game criteria as that scale, applied to the work in the description.",
    "systems_vs_product: hard systems, infrastructure, and engineering internals versus product, docs, developer-delight, and player-facing polish.",
    "competitive_vs_collaborative: solo climb or individual performance versus team, community, and enabling others.",
    "depth_vs_breadth: a narrow deep specialty versus a wide surface.",
    "builder_vs_optimizer: creating new tools or products versus tuning, scaling, and min-maxing what already exists.",
    "role_archetype.choice is the closest archetype metaphor for that work. Use no_match when the description is too thin or too mixed.",
    "Do not invent duties that are not in the description.",
    "Do not write the signal line. The app writes it from the archetype.",
    "",
    "Archetypes",
    archetypeGuide(),
    "",
    "Scores. level is 1, 2, 3, or 4 and matches the numbered criterion. confidence is 0 to 1.",
    axisGuide(),
    "",
    "role_archetype.confidence is 0 to 1 for the chosen label.",
    "alternatives is required. Send [] when no other label competes. At most 3 items. probability is 0 to 1.",
  ].join("\n");
}

function inputMessages(prompt: string) {
  return JSON.stringify([
    { role: "user", parts: [{ type: "text", content: prompt }] },
  ]);
}

function outputMessages(content: string) {
  return JSON.stringify([
    { role: "assistant", parts: [{ type: "text", content }] },
  ]);
}

async function requireGateway(): Promise<void> {
  const oidcToken = await requestOidcToken(process.env);
  if (!gatewayReady(process.env, oidcToken)) throw new MissingGatewayKey();
}

export async function evaluateRole(posting: JobPosting): Promise<Judgment> {
  await requireGateway();
  const instructions = roleInstructions();
  const prompt = JSON.stringify({
    title: posting.title,
    url: posting.pageUrl,
    description: posting.text,
  });
  const judgment = await Sentry.startSpan(
    {
      op: "gen_ai.evaluate",
      name: "evaluate role_archetype",
      attributes: {
        "gen_ai.operation.name": "evaluate",
        "gen_ai.evaluation.name": "role_archetype",
        "gen_ai.request.model": MODEL,
        "gen_ai.provider.name": "vercel.ai_gateway",
        "gen_ai.system_instructions": instructions,
        "gen_ai.input.messages": inputMessages(prompt),
      },
    },
    async (span) => {
      const { output } = await generateText({
        model: MODEL,
        system: instructions,
        prompt,
        output: Output.object({
          schema: roleJudgmentSchema,
          name: "role_judgment",
          description:
            "Archetype metaphor plus four taste scores for a job description.",
        }),
        telemetry: {
          isEnabled: true,
          functionId: "role-archetype",
          recordInputs: true,
          recordOutputs: true,
        },
      });
      if (!output) throw new Error("Model returned an empty role judgment");
      const next = toJudgment(
        output.role_archetype.choice,
        output.role_archetype.confidence,
        output.role_archetype.alternatives,
        output.scores,
      );
      const card = toCard(next);
      span.setAttribute("gen_ai.evaluation.score.value", next.confidence);
      span.setAttribute("gen_ai.evaluation.score.label", next.archetype);
      span.setAttribute("gen_ai.evaluation.explanation", card.signal);
      span.setAttribute("gen_ai.output.messages", outputMessages(JSON.stringify(next)));
      span.setAttribute("role.scores", JSON.stringify(next.scores));
      return next;
    },
  );
  // Streamed gen_ai spans wait on an unref'd timer. Flush before Vercel freezes the function.
  await Sentry.flush(2000);
  return judgment;
}
