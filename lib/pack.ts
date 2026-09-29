import pack from "./jobs.json" with { type: "json" };
import {
  CAPTURED_AT,
  TOP9_EXAMPLES,
  type Top9Example,
} from "./__fixtures__/top9-examples.ts";
import type { HireCard } from "./hire.ts";
import type { MatchChoice } from "./fit.ts";

export { CAPTURED_AT, TOP9_EXAMPLES, type Top9Example };

/** The match choice in hiring-committee words: the panel decision on the crit. */
export const DECISION: Record<MatchChoice, string> = {
  match: "Strong hire",
  stretch: "Lean hire",
  mismatch: "No hire",
};

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

/** Stable four-hex plate id for a typed or extracted list, e.g. `T9-7F3A`. */
export function plateId(titles: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of titles.map((t) => t.trim().toLowerCase()).join("\n")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `T9-${(hash & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
}

export function shareBlurb(input: {
  handle?: string;
  plate: string;
  card: Pick<HireCard, "label" | "signal">;
  match?: { choice: MatchChoice; percent?: number; jobTitle: string; company?: string };
}): string {
  const who = input.handle ? `@${input.handle.replace(/^@/, "")}` : "This Top9";
  if (!input.match) {
    return [
      `${who}: ${input.card.label}.`,
      `"${input.card.signal}"`,
      `top9.wtf crit ${input.plate}`,
    ].join("\n");
  }
  const role = input.match.company
    ? `${input.match.company} ${input.match.jobTitle}`
    : input.match.jobTitle;
  const aligned = input.match.percent === undefined ? "" : `, ${input.match.percent}% aligned`;
  return [
    `${who} for ${role}: ${DECISION[input.match.choice]}.`,
    `Evidence: ${input.card.label}${aligned}.`,
    `Nine games instead of a leetcode round. top9.wtf crit ${input.plate}`,
  ].join("\n");
}
