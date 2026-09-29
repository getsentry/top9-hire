export const GAME_SKILLS = [
  "planning",
  "reflexes",
  "teamwork",
  "optimizing",
  "building",
  "exploring",
  "storytelling",
  "persistence",
] as const;
export type GameSkill = (typeof GAME_SKILLS)[number];

/** Wall ms, tokens and gateway cost (USD, when the gateway reports it) of one model call. */
export type CallInfo = { ms: number; input: number; output: number; cost: number };
