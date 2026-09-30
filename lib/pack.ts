import pack from "./jobs.json" with { type: "json" };
import {
  CAPTURED_AT,
  TOP9_EXAMPLES,
  type Top9Example,
} from "./__fixtures__/top9-examples.ts";
import type { HireCard } from "./hire.ts";
import type { MatchChoice } from "./fit.ts";

export { CAPTURED_AT, TOP9_EXAMPLES, type Top9Example };

/** The match choice in hiring-committee words: the panel decision. */
export const DECISION: Record<MatchChoice, string> = {
  match: "Strong hire",
  stretch: "Lean hire",
  mismatch: "No hire",
};

/** The ink of each decision: the seal in the app and on the share image. */
export const VERDICT_COLOR: Record<MatchChoice, string> = { match: "#1f7a4d", stretch: "#b3650c", mismatch: "#e23d28" };

export type PackJob = {
  id: string;
  company: string;
  title: string;
  url: string;
  board: "ashby" | "greenhouse";
  /** Short display line for the rail. `notes` is curator context, not UI copy. */
  facet: string;
  notes: string;
  suggestedFixtureHandles: string[];
};

export const JOB_PACK = pack.jobs as readonly PackJob[];
export const JOB_PACK_CHECKED_AT: string = pack.checkedAt;

export function findJob(url: string, jobs: readonly PackJob[] = JOB_PACK): PackJob | undefined {
  const needle = url.trim();
  return jobs.find((job) => job.url === needle);
}

export function suggestedFor(job: PackJob, handle: string | null | undefined): boolean {
  const needle = handle?.trim().replace(/^@/, "").toLowerCase();
  if (!needle) return false;
  return job.suggestedFixtureHandles.some((h) => h.toLowerCase() === needle);
}

export function findExample(
  handle: string,
  examples: readonly Top9Example[] = TOP9_EXAMPLES,
): Top9Example | undefined {
  const needle = handle.trim().replace(/^@/, "").toLowerCase();
  return examples.find((example) => example.handle.toLowerCase() === needle);
}

export function shareBlurb(input: {
  handle?: string;
  card: Pick<HireCard, "label" | "signal">;
  match?: { choice: MatchChoice; percent?: number; jobTitle: string; company?: string };
  url?: string;
}): string {
  const who = input.handle ? `@${input.handle.replace(/^@/, "")}` : "This Top9";
  const link = input.url ? [input.url] : [];
  if (!input.match) {
    return [`${who}: ${input.card.label}.`, `"${input.card.signal}"`, ...link].join("\n");
  }
  const role = input.match.company
    ? `${input.match.company} ${input.match.jobTitle}`
    : input.match.jobTitle;
  const aligned = input.match.percent === undefined ? "" : `, ${input.match.percent}% aligned`;
  return [
    `${who} for ${role}: ${DECISION[input.match.choice]}${aligned}.`,
    `Evidence: ${input.card.label}.`,
    "Nine games instead of a LeetCode round.",
    ...link,
  ].join("\n");
}
