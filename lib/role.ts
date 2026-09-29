import { ARCHETYPES, AXES, type AxisId, type Judgment } from "./hire.ts";

export type MatchChoice = "match" | "stretch" | "mismatch";

/** A gap of this many levels or more on one axis counts as diverging. */
export const DIVERGE_AT = 2;

export type AxisFacet = {
  id: AxisId;
  axis: string;
  left: string;
  right: string;
  hire: number;
  role: number;
  gap: number;
  read: "aligned" | "adjacent" | "diverges";
};

export type Alignment = {
  percent: number;
  choice: MatchChoice;
  diverging: number;
  facets: AxisFacet[];
  archetypes: { hire: string; role: string; same: boolean };
};

export type HireJobMatch = { choice: MatchChoice; why: string; alignment: Alignment };

/**
 * The match choice is a rule on the axis gaps, not a model mood:
 * no diverging axes is a match, one or two is a stretch, three or four is a mismatch.
 */
export function alignment(hire: Pick<Judgment, "archetype" | "scores">, role: Pick<Judgment, "archetype" | "scores">): Alignment {
  const ids = Object.keys(AXES) as AxisId[];
  const facets = ids.map((id): AxisFacet => {
    const gap = Math.abs(hire.scores[id].level - role.scores[id].level);
    return {
      id,
      axis: `${AXES[id].left} vs ${AXES[id].right}`,
      left: AXES[id].left,
      right: AXES[id].right,
      hire: hire.scores[id].level,
      role: role.scores[id].level,
      gap,
      read: gap === 0 ? "aligned" : gap < DIVERGE_AT ? "adjacent" : "diverges",
    };
  });
  const totalGap = facets.reduce((sum, facet) => sum + facet.gap, 0);
  const diverging = facets.filter((facet) => facet.read === "diverges").length;
  return {
    percent: Math.round(100 * (1 - totalGap / (ids.length * 3))),
    choice: diverging === 0 ? "match" : diverging <= 2 ? "stretch" : "mismatch",
    diverging,
    facets,
    archetypes: {
      hire: ARCHETYPES[hire.archetype].label,
      role: ARCHETYPES[role.archetype].label,
      same: hire.archetype === role.archetype,
    },
  };
}

const READ_PHRASES: Record<AxisFacet["read"], { one: string; many: string }> = {
  aligned: { one: "lines up", many: "line up" },
  adjacent: { one: "is one level apart", many: "are one level apart" },
  diverges: { one: "diverges", many: "diverge" },
};

const axisList = new Intl.ListFormat("en", { type: "conjunction" });

export function matchWhy({ facets, archetypes }: Alignment): string {
  const axes = Object.entries(READ_PHRASES).flatMap(([read, { one, many }]) => {
    const named = facets.filter((facet) => facet.read === read).map((facet) => facet.axis);
    if (named.length === 0) return [];
    if (named.length === facets.length) return [`Every axis ${one}.`];
    return [`${axisList.format(named)} ${named.length === 1 ? one : many}.`];
  });
  const archetype = archetypes.same
    ? `Both read as ${archetypes.hire}.`
    : `Top9 reads as ${archetypes.hire}, the role as ${archetypes.role}.`;
  return [...axes, archetype].join(" ");
}

export function matchFor(hire: Judgment, role: Judgment): HireJobMatch {
  const aligned = alignment(hire, role);
  return { choice: aligned.choice, why: matchWhy(aligned), alignment: aligned };
}
