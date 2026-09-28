/**
 * Fixture nine-title pastes. Public Top9 cards for these people were not found.
 * The titles are invented to exercise the archetypes named in the notes.
 * The job URLs were public Greenhouse / Ashby postings on 2026-09-28.
 */
export type ProofCase = {
  id: string;
  who: string;
  intended: "match" | "stretch-or-mismatch";
  fixture: true;
  note: string;
  jobUrl: string;
  jobTitle: string;
  paste: string;
};

const sergiyPaste = [
  "Stardew Valley",
  "Animal Crossing: New Horizons",
  "Minecraft",
  "Overcooked! 2",
  "It Takes Two",
  "Spiritfarer",
  "Untitled Goose Game",
  "Portal 2",
  "The Legend of Zelda: Breath of the Wild",
].join("\n");

const dorryPaste = [
  "Factorio",
  "Satisfactory",
  "Oxygen Not Included",
  "Dwarf Fortress",
  "Kerbal Space Program",
  "Opus Magnum",
  "Shapez",
  "Cities: Skylines",
  "SpaceChem",
].join("\n");

const theoPaste = [
  "Hades",
  "Celeste",
  "Disco Elysium",
  "Hollow Knight",
  "Undertale",
  "Outer Wilds",
  "The Witness",
  "Baba Is You",
  "Slay the Spire",
].join("\n");

export const PROOF_CASES: readonly ProofCase[] = [
  {
    id: "sergiy-sentry-dx",
    who: "sergiy",
    intended: "match",
    fixture: true,
    note: "Fixture paste, not Sergiy's published Top9. Product, co-op, and builder titles aimed at a docs/community DX role.",
    jobUrl: "https://jobs.ashbyhq.com/sentry/7ed2b263-3873-44c6-a730-2ca96100c58f",
    jobTitle: "Senior Developer Experience Engineer",
    paste: sergiyPaste,
  },
  {
    id: "dorryspears-cloudflare-platforms",
    who: "dorryspears",
    intended: "match",
    fixture: true,
    note: "Fixture paste, not dorryspears' published Top9. Systems and factory titles aimed at a developer-platform role.",
    jobUrl: "https://boards.greenhouse.io/cloudflare/jobs/8168623",
    jobTitle: "Software Engineer - Platforms & Productivity",
    paste: dorryPaste,
  },
  {
    id: "theo-cloudflare-load-balancing",
    who: "theo",
    intended: "stretch-or-mismatch",
    fixture: true,
    note: "Fixture paste, not Theo's published Top9. Narrative and delight titles against a hard systems load-balancing role. Intended stretch or mismatch.",
    jobUrl: "https://boards.greenhouse.io/cloudflare/jobs/8212352",
    jobTitle: "Senior Software Engineer - Load Balancing",
    paste: theoPaste,
  },
];
