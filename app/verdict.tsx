"use client";

import { TextMorph } from "torph/react";
import { SCORE_LEVELS, type HireBadge, type HireCard } from "@/lib/hire";

const MORPH = { duration: 520, ease: "cubic-bezier(0.19, 1, 0.22, 1)" };

function stampText(badge: HireBadge): string {
  return badge.kind === "chaos" ? "Unclassifiable chaos" : badge.label;
}

function stampNote(badge: HireBadge): string {
  if (badge.kind !== "soft") return "";
  return badge.runnerUp ? `Split vibes. Runner-up: ${badge.runnerUp}` : "Split vibes";
}

export function Verdict({ card }: { card: HireCard }) {
  return (
    <section className="verdict" aria-labelledby="verdict-title">
      <div className={`stamp ${card.badge.kind}`}>
        <h2 id="verdict-title" className="stamp-text">
          <TextMorph {...MORPH}>{stampText(card.badge)}</TextMorph>
        </h2>
      </div>
      <TextMorph as="p" className="stamp-note" {...MORPH}>
        {stampNote(card.badge)}
      </TextMorph>
      <TextMorph as="p" className="roast" {...MORPH}>
        {card.roast}
      </TextMorph>
      <ul className="scores">
        {card.scores.map((score) => (
          <li key={score.id} className={score.fuzzy ? "score fuzzy" : "score"}>
            <span className="pole">{score.left}</span>
            <span className="ticks" role="img" aria-label={`${score.level} of 4`}>
              {SCORE_LEVELS.map((level) => (
                <span key={level} className={level === score.level ? "tick on" : "tick"} />
              ))}
            </span>
            <span className="pole right">{score.right}</span>
            <TextMorph as="span" className="criterion" {...MORPH}>
              {score.fuzzy ? `${score.criterion} (fuzzy)` : score.criterion}
            </TextMorph>
          </li>
        ))}
      </ul>
      <p className="disclaimer">{card.disclaimer}</p>
    </section>
  );
}
