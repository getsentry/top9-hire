export const ARCHETYPES = {
  systems_necromancer: {
    label: "Systems necromancer",
    criterion:
      "Simulation / engineering / hard-systems titles (Factorio, Kerbal, Dwarf Fortress energy)",
    roast:
      "You would automate the coffee machine and then argue with it about throughput.",
  },
  product_bard: {
    label: "Product bard",
    criterion: "Player-delight, polish, cozy or design-forward games",
    roast: "You rate a game by how the pause menu feels.",
  },
  speedrun_gremlin: {
    label: "Speedrun gremlin",
    criterion: "Frame-shave, WR chase, precision platformers / time-attack",
    roast: "Your whole personality is one frame-perfect input.",
  },
  solo_queue_demon: {
    label: "Solo queue demon",
    criterion: "Ranked PvP, fighting games, Elo grind",
    roast: "You queue alone and still blame the lobby.",
  },
  co_op_cleric: {
    label: "Co-op cleric",
    criterion: "Team PvE, healers/supports, wins by enabling others",
    roast: "You keep the team alive and resent the people dealing damage.",
  },
  sandbox_builder: {
    label: "Sandbox builder",
    criterion: "Craft, colony, city-builder, creative sandbox",
    roast: "You have not finished a game. You have founded a city.",
  },
  meta_spreadsheet: {
    label: "Meta spreadsheet",
    criterion: "Theorycraft, builds, grand strategy, spreadsheet brain",
    roast: "Your idea of fun is a spreadsheet with a boss.",
  },
  lore_monk: {
    label: "Lore monk",
    criterion:
      "Deep single-player, FromSoft/CRPG/story epics, mastery over dopamine",
    roast: "You read every item description and call that a build.",
  },
  chaos_indie: {
    label: "Chaos indie",
    criterion: "Weird / experimental / obscure taste, horror or avant-garde",
    roast: "Your library looks like a dare.",
  },
  completionist_hoarder: {
    label: "Completionist hoarder",
    criterion: "100%, collectathons, achievement hunting",
    roast: "You clear the tutorial at 100 percent and then the credits.",
  },
  no_match: {
    label: "No match",
    criterion: "Too mixed, thin, or contradictory for a clean label",
    roast: "Nine titles, and none of them agree.",
  },
} as const;

export type Archetype = keyof typeof ARCHETYPES;

export const AXES = {
  systems_vs_product: {
    left: "Systems",
    right: "Product",
    instructions:
      "Where does this library sit between hard systems/engineering taste and product/player-delight taste?",
    criteria: [
      "Almost all simulation, engineering, or hard-systems titles",
      "Mostly systems-heavy with a few polish / player-facing games",
      "Mix leans toward narrative, design-forward, or delight-first games",
      "Library screams product/UX/player-delight over engine internals",
    ],
  },
  competitive_vs_collaborative: {
    left: "Competitive",
    right: "Collaborative",
    instructions:
      "Where does this library sit between competitive climb and collaborative play?",
    criteria: [
      "Dominated by ranked, PvP, fighting, or solo-climb titles",
      "Competitive core with some co-op",
      "Co-op or team PvE with some competitive spice",
      "Almost all co-op, party, or social/peaceful multiplayer",
    ],
  },
  depth_vs_breadth: {
    left: "Depth",
    right: "Breadth",
    instructions:
      "Is this library deep in a few niches or broad across many genres?",
    criteria: [
      "Narrow genres, deep mastery / long-complexity titles",
      "A couple niches with high investment",
      "Wide genres, dabbler energy across styles",
      "Maximum breadth, little repeated genre pattern",
    ],
  },
  builder_vs_optimizer: {
    left: "Builder",
    right: "Optimizer",
    instructions:
      "Where does this library sit between building/creating and optimizing/min-maxing?",
    criteria: [
      "Craft, colony, city-builder, or creative sandbox dominate",
      "Build/create with some min-max",
      "Loadouts, efficiency, speedrun energy with some create",
      "Pure optimization / competitive efficiency mindset",
    ],
  },
} as const;

export type AxisId = keyof typeof AXES;

export const SCORE_LEVELS = [1, 2, 3, 4] as const;
export type ScoreLevel = (typeof SCORE_LEVELS)[number];

export type Game = { title: string; note?: string };

export type Top9 = {
  handle?: string;
  titles: readonly [Game, Game, Game, Game, Game, Game, Game, Game, Game];
};

export type AxisScore = { level: ScoreLevel; confidence: number };

export type Judgment = {
  archetype: Archetype;
  confidence: number;
  runnerUp?: { archetype: Archetype; probability: number };
  scores: Record<AxisId, AxisScore>;
};

export type HireBadge =
  | { kind: "primary"; label: string }
  | { kind: "soft"; label: string; runnerUp?: string }
  | { kind: "chaos" };

export type ScoreBar = {
  id: AxisId;
  left: string;
  right: string;
  level: ScoreLevel;
  criterion: string;
  fuzzy: boolean;
};

export type HireCard = {
  badge: HireBadge;
  roast: string;
  scores: ScoreBar[];
  disclaimer: string;
};

export const DISCLAIMER =
  "Entertainment only. This card roasts taste. It is not a hiring decision.";

const ARCHETYPE_QUESTION =
  "Which hire archetype best fits this person's taste, judging only from `top9`?";

const ARCHETYPE_RULES = [
  "Playful roast of taste, not a hiring recommendation",
  "Prefer the clearest cluster over averaging everything",
  "Use no_match when the list is contradictory or too thin to label",
] as const;

export function readGames(paste: string): Game[] {
  const games: Game[] = [];
  for (const raw of paste.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const pipe = line.indexOf("|");
    if (pipe === -1) {
      games.push({ title: line });
      continue;
    }
    const title = line.slice(0, pipe).trim();
    const note = line.slice(pipe + 1).trim();
    if (!title) {
      games.push({ title: line });
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

export function gatewayReady(
  env: { [key: string]: string | undefined },
  oidcToken?: string,
): boolean {
  if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN) return true;
  return env.VERCEL === "1" && Boolean(oidcToken?.trim());
}

export function modelState(top9: Top9): {
  candidate?: { handle: string };
  top9: Game[];
} {
  return {
    candidate: top9.handle ? { handle: top9.handle } : undefined,
    top9: top9.titles.map((game) =>
      game.note ? { title: game.title, note: game.note } : { title: game.title },
    ),
  };
}

export function judgmentInstructions(): string {
  const labels = (Object.keys(ARCHETYPES) as Archetype[])
    .map((id) => `${id}: ${ARCHETYPES[id].criterion}`)
    .join("\n");
  const axes = (Object.keys(AXES) as AxisId[])
    .map((id) => {
      const axis = AXES[id];
      const levels = axis.criteria
        .map((line, index) => `${index + 1}. ${line}`)
        .join("\n");
      return `${id}\n${axis.instructions}\n${levels}`;
    })
    .join("\n\n");
  return [
    ARCHETYPE_QUESTION,
    ...ARCHETYPE_RULES,
    "",
    "Archetypes",
    labels,
    "",
    "Scores. level is 1, 2, 3, or 4 and matches the numbered criterion. confidence is 0 to 1.",
    axes,
    "",
    "hire_archetype.confidence is 0 to 1 for the chosen label.",
    "alternatives is required. Send [] when no other label competes. At most 3 items. probability is 0 to 1.",
    "Do not write a roast. The app writes that from the archetype.",
  ].join("\n");
}

export function toCard(judgment: Judgment): HireCard {
  const archetype = ARCHETYPES[judgment.archetype];
  const runnerUp =
    judgment.runnerUp && judgment.runnerUp.probability > 0.2
      ? ARCHETYPES[judgment.runnerUp.archetype].label
      : undefined;
  let badge: HireBadge;
  if (judgment.archetype === "no_match" || judgment.confidence < 0.4) {
    badge = { kind: "chaos" };
  } else if (judgment.confidence >= 0.65) {
    badge = { kind: "primary", label: archetype.label };
  } else {
    badge = runnerUp
      ? { kind: "soft", label: archetype.label, runnerUp }
      : { kind: "soft", label: archetype.label };
  }
  const scores = (Object.keys(AXES) as AxisId[]).map((id) => {
    const axis = AXES[id];
    const score = judgment.scores[id];
    return {
      id,
      left: axis.left,
      right: axis.right,
      level: score.level,
      criterion: axis.criteria[score.level - 1],
      fuzzy: score.confidence < 0.35,
    };
  });
  return {
    badge,
    roast: archetype.roast,
    scores,
    disclaimer: DISCLAIMER,
  };
}
