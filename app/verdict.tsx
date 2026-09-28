"use client";

import { TextMorph } from "torph/react";
import { SCORE_LEVELS, type HireBadge, type HireCard } from "@/lib/hire";
import { wrapLines } from "@/lib/text";

const MORPH = { duration: 520, ease: "cubic-bezier(0.19, 1, 0.22, 1)" };

function stampText(badge: HireBadge): string {
  const label = badge.kind === "chaos" ? "Unclassifiable chaos" : badge.label;
  return label.replace(" ", "\n");
}

function stampNote(badge: HireBadge): string | null {
  if (badge.kind !== "soft") return null;
  return badge.runnerUp ? `Split vibes. Runner-up: ${badge.runnerUp}` : "Split vibes";
}

export function Verdict({ card }: { card: HireCard }) {
  const note = stampNote(card.badge);
  return (
    <section className="verdict" aria-labelledby="verdict-title">
      <div className={`stamp ${card.badge.kind}`}>
        <h2 id="verdict-title" className="stamp-text">
          <TextMorph {...MORPH}>{stampText(card.badge)}</TextMorph>
        </h2>
      </div>
      {note ? (
        <p key={note} className="stamp-note fade">
          {note}
        </p>
      ) : null}
      <TextMorph as="p" className="roast" {...MORPH}>
        {wrapLines(card.roast, 24)}
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
            <span key={score.criterion} className="criterion fade">
              {score.fuzzy ? `${score.criterion} (fuzzy)` : score.criterion}
            </span>
          </li>
        ))}
      </ul>
      <p className="disclaimer">{card.disclaimer}</p>
    </section>
  );
}
