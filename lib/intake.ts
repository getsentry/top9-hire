export type Slots = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export const EMPTY_SLOTS: Slots = ["", "", "", "", "", "", "", "", ""];

export type Intake =
  | { kind: "tweet"; url: string }
  | { kind: "lines"; lines: string[] };

const TWEET_URL =
  /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/;

const LIST_MARKER = /^(?:\d{1,2}[.):]|[-*•–])\s+/;

export function readLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LIST_MARKER, "").trim())
    .filter(Boolean);
}

export function readIntake(text: string): Intake {
  const trimmed = text.trim();
  return TWEET_URL.test(trimmed)
    ? { kind: "tweet", url: trimmed }
    : { kind: "lines", lines: readLines(trimmed) };
}

export function fillSlots(slots: Slots, start: number, lines: string[]): Slots {
  const next = [...slots];
  lines.slice(0, next.length - start).forEach((line, offset) => {
    next[start + offset] = line;
  });
  return next as unknown as Slots;
}

export function setSlot(slots: Slots, index: number, value: string): Slots {
  const next = [...slots];
  next[index] = value;
  return next as unknown as Slots;
}

export function slotsToPaste(slots: Slots): string {
  return slots.filter((slot) => slot.trim()).join("\n");
}

export function filledCount(slots: Slots): number {
  return slots.filter((slot) => slot.trim()).length;
}
