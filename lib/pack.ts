import pack from "./jobs.json" with { type: "json" };
import { TOP9_EXAMPLES, type Top9Example } from "./__fixtures__/top9-examples.ts";
import type { HireCard } from "./hire.ts";

export { TOP9_EXAMPLES, type Top9Example };

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

/** Confidence on the seal, printed like a review score: 0.84 → "8.4". */
export function sealScore(confidence: number): string {
  const clamped = Math.min(1, Math.max(0, confidence));
  return (Math.round(clamped * 100) / 10).toFixed(1);
}

export function signalStrength(card: Pick<HireCard, "badge">): string {
  if (card.badge.kind === "primary") return "Strong signal";
  if (card.badge.kind === "soft") return "Soft signal";
  return "No clear signal";
}

export function shareBlurb(input: {
  handle?: string;
  card: Pick<HireCard, "label" | "signal" | "confidence" | "badge">;
  match?: { choice: string; percent?: number; jobTitle: string; company?: string };
}): string {
  const who = input.handle ? `@${input.handle.replace(/^@/, "")}` : "This Top9";
  const lines = [
    `${who}: ${input.card.label}. ${signalStrength(input.card)}, ${sealScore(input.card.confidence)}/10.`,
    `"${input.card.signal}"`,
  ];
  if (input.match) {
    const role = input.match.company
      ? `${input.match.company} ${input.match.jobTitle}`
      : input.match.jobTitle;
    const aligned = input.match.percent === undefined ? "" : `, ${input.match.percent}% aligned`;
    lines.push(`Role read: ${input.match.choice}${aligned} for ${role}.`);
  }
  lines.push("top9.wtf");
  return lines.join("\n");
}
