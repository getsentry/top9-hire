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
  no_match: {
    label: "No clear read",
    criterion: "Too mixed, thin, or contradictory for a clean label",
    signal: "Nine titles pull in different directions. Read the person, not the pile.",
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
  | { kind: "unclear" };

export type ScoreBar = {
  id: AxisId;
  left: string;
  right: string;
  level: ScoreLevel;
  criterion: string;
  fuzzy: boolean;
};

export type HireCard = {
  archetype: Archetype;
  label: string;
  confidence: number;
  badge: HireBadge;
  signal: string;
  scores: ScoreBar[];
  disclaimer: string;
};

export const DISCLAIMER =
  "A hire signal from nine games. It starts a conversation. It is not a hiring decision.";

const ARCHETYPE_QUESTION =
  "Which hire archetype best fits this person's taste, judging only from `top9`?";

const ARCHETYPE_RULES = [
  "Read the taste as a hire signal: the kind of work this person would recognize and do well. It is not a hiring decision",
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

export function modelState(top9: Top9): {
  candidate?: { handle: string };
  top9: Game[];
} {
  return {
    ...(top9.handle ? { candidate: { handle: top9.handle } } : {}),
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
    "Do not write the signal line. The app writes it from the archetype.",
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
    badge = { kind: "unclear" };
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
    archetype: judgment.archetype,
    label: archetype.label,
    confidence: judgment.confidence,
    badge,
    signal: archetype.signal,
    scores,
    disclaimer: DISCLAIMER,
  };
}
