import { TOP9_EXAMPLES, type Top9Example } from "./__fixtures__/top9-examples.ts";

export { TOP9_EXAMPLES, type Top9Example };

/** Handles shown first when they exist in the fixture set. Order matters. */
export const PROMINENT_HANDLES: readonly string[] = ["theo", "hajimesyacho", "LinkofSunshine"];

export const PRIMARY_ROW_SIZE = 4;

export const MY9GAMES_URL = "https://my9games.com/en";

export function engagement(example: Pick<Top9Example, "likes" | "reposts" | "replies" | "quotes">) {
  return example.likes + example.reposts + example.replies + example.quotes;
}

/**
 * Split the fixtures into a short primary row and the rest.
 * Prominent handles lead the primary row in `PROMINENT_HANDLES` order. The row
 * is then topped up by engagement. Everything else lands in `more`, also by
 * engagement, so the whole set stays selectable.
 */
export function arrangeExamples(
  examples: readonly Top9Example[] = TOP9_EXAMPLES,
  rowSize = PRIMARY_ROW_SIZE,
): { primary: Top9Example[]; more: Top9Example[] } {
  const byHandle = new Map(examples.map((example) => [example.handle.toLowerCase(), example]));
  const primary: Top9Example[] = [];
  for (const handle of PROMINENT_HANDLES) {
    const hit = byHandle.get(handle.toLowerCase());
    if (hit && !primary.includes(hit)) primary.push(hit);
  }
  const rest = examples
    .filter((example) => !primary.includes(example))
    .sort((a, b) => engagement(b) - engagement(a));
  while (primary.length < rowSize && rest.length) primary.push(rest.shift() as Top9Example);
  return { primary, more: rest };
}

export function findExample(
  handle: string,
  examples: readonly Top9Example[] = TOP9_EXAMPLES,
): Top9Example | undefined {
  const needle = handle.trim().replace(/^@/, "").toLowerCase();
  return examples.find((example) => example.handle.toLowerCase() === needle);
}

/** Copy of the nine titles, ready for the slot inputs. */
export function exampleTitles(example: Top9Example): string[] {
  return example.games.map((title) => title.trim());
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}
