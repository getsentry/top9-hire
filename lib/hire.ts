import type { GameSkill } from "./breakdown.ts";
import { clip } from "./text.ts";

export const ARCHETYPES = {
  systems_necromancer: {
    label: "Systems necromancer",
    criterion:
      "Simulation / engineering / hard-systems titles (Factorio, Kerbal, Dwarf Fortress energy)",
    signal:
      "Reads a factory floor like a trace. Hand them the pipeline nobody else wants to own.",
  },
  product_bard: {
    label: "Product bard",
    criterion: "Player-delight, polish, cozy or design-forward games",
    signal:
      "Judges a game by how the pause menu feels. That instinct ships the details users notice.",
  },
  speedrun_gremlin: {
    label: "Speedrun gremlin",
    criterion: "Frame-shave, WR chase, precision platformers / time-attack",
    signal: "Shaves frames for fun. Point them at the p99 and the cold start.",
  },
  solo_queue_demon: {
    label: "Solo-queue climber",
    criterion: "Ranked PvP, fighting games, Elo grind",
    signal:
      "Climbs ranked alone. Give them a hard problem with a clear scoreboard and room to own it.",
  },
  co_op_cleric: {
    label: "Co-op cleric",
    criterion: "Team PvE, healers/supports, wins by enabling others",
    signal:
      "Wins by keeping the party alive. Signal for DX, tooling, and the glue work that unblocks a team.",
  },
  sandbox_builder: {
    label: "Sandbox builder",
    criterion: "Craft, colony, city-builder, creative sandbox",
    signal:
      "Founds cities instead of finishing campaigns. Put them on zero-to-one work and a blank repo.",
  },
  meta_spreadsheet: {
    label: "Meta spreadsheet",
    criterion: "Theorycraft, builds, grand strategy, spreadsheet brain",
    signal:
      "Theorycrafts before the first move. Signal for capacity plans, pricing, and anything with a model behind it.",
  },
  lore_monk: {
    label: "Lore monk",
    criterion:
      "Deep single-player, FromSoft/CRPG/story epics, mastery over dopamine",
    signal:
      "Reads every item description. Signal for deep specs, long-horizon systems, and docs people trust.",
  },
  chaos_indie: {
    label: "Outsider indie",
    criterion: "Weird / experimental / obscure taste, horror or avant-garde",
    signal:
      "Finds the strange game before anyone else. Signal for R&D, prototypes, and taste calls under ambiguity.",
  },
  completionist_hoarder: {
    label: "Completionist",
    criterion: "100%, collectathons, achievement hunting",
    signal:
      "Clears the map to 100 percent. Signal for migrations, launch checklists, and the last ten percent.",
  },
} as const;

export type ArchetypeId = keyof typeof ARCHETYPES;

export type Game = { title: string; note?: string };

export type Top9 = {
  handle?: string;
  titles: readonly [Game, Game, Game, Game, Game, Game, Game, Game, Game];
};

export const DISCLAIMER =
  "Nine games instead of a leetcode round. A hire signal to start a conversation, not a hiring decision.";

export type RoleCard = { archetype: ArchetypeId; label: string; signal: string };

export type HireCard = RoleCard & {
  /** The three skills that carry the label, with their weighted tally. */
  skills: { skill: GameSkill; weight: number }[];
  games: { title: string; traits: string[] }[];
};

export function roleCard(archetype: ArchetypeId): RoleCard {
  const { label, signal } = ARCHETYPES[archetype];
  return { archetype, label, signal };
}

const MAX_TITLE_CHARS = 100;

export function readGames(paste: string): Game[] {
  const games: Game[] = [];
  for (const raw of paste.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const pipe = line.indexOf("|");
    if (pipe === -1) {
      games.push({ title: clip(line, MAX_TITLE_CHARS) });
      continue;
    }
    const title = clip(line.slice(0, pipe).trim(), MAX_TITLE_CHARS);
    const note = line.slice(pipe + 1).trim();
    if (!title) {
      games.push({ title: clip(line, MAX_TITLE_CHARS) });
      continue;
    }
    games.push(note ? { title, note } : { title });
  }
  return games;
}

export function parsePaste(
  paste: string,
  handle: string,
): { ok: true; top9: Top9 } | { ok: false; count: number } {
  const games = readGames(paste);
  if (games.length !== 9) return { ok: false, count: games.length };
  const [a, b, c, d, e, f, g, h, i] = games;
  if (!a || !b || !c || !d || !e || !f || !g || !h || !i) {
    return { ok: false, count: games.length };
  }
  const trimmed = handle.trim();
  return {
    ok: true,
    top9: {
      handle: trimmed ? trimmed : undefined,
      titles: [a, b, c, d, e, f, g, h, i],
    },
  };
}

export const GATEWAY_MISSING =
  "No AI Gateway credential. Set AI_GATEWAY_API_KEY, set VERCEL_OIDC_TOKEN, or enable Vercel OIDC so the request token is available. This app will not invent a classification.";

/** The server action never answered: network, timeout, or a protected deployment answering with a login page. */
export const READ_UNREACHABLE =
  "The read did not come back from the server. Nothing was invented in its place. Try again.";

export function gatewayReady(
  env: { [key: string]: string | undefined },
  oidcToken?: string,
): boolean {
  if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN) return true;
  return env.VERCEL === "1" && Boolean(oidcToken?.trim());
}
