import pack from "./jobs.json" with { type: "json" };
import {
  CAPTURED_AT,
  TOP9_EXAMPLES,
  type Top9Example,
} from "./__fixtures__/top9-examples.ts";
import type { HireCard } from "./hire.ts";

export { CAPTURED_AT, TOP9_EXAMPLES, type Top9Example };

export type PackJob = {
  id: string;
  company: string;
  title: string;
  url: string;
  location: string;
  lean: string;
};

export const JOB_PACK: readonly PackJob[] = pack.jobs;
export const JOB_PACK_CHECKED_AT: string = pack.checkedAt;

export function findJob(url: string, jobs: readonly PackJob[] = JOB_PACK): PackJob | undefined {
  const needle = url.trim();
  return jobs.find((job) => job.url === needle);
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
  plate: string;
  card: Pick<HireCard, "label" | "signal" | "confidence" | "badge">;
  match?: { choice: string; jobTitle: string; company?: string };
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
    lines.push(`Role read: ${input.match.choice} for ${role}.`);
  }
  lines.push(`Top9 Hire crit ${input.plate}`);
  return lines.join("\n");
}
