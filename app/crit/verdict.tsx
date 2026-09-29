import { useState } from "react";
import { DISCLAIMER, type HireCard } from "@/lib/hire";
import { sealScore, signalStrength } from "@/lib/pack";
import { AxisTrack } from "./axis";
import { Seal } from "./seal";

export function VerdictPending({ plate }: { plate: string }) {
  return (
    <section className="verdict" id="verdict" aria-live="polite" aria-busy="true">
      <header className="section-head">
        <p className="eyebrow">
          <span>04</span> Signal
        </p>
        <p className="section-meta">Reading nine titles…</p>
      </header>
      <div className="verdict-body">
        <Seal plate={plate} pending />
        <div className="verdict-copy">
          <span className="skeleton w-40" />
          <span className="skeleton h-lg w-80" />
          <span className="skeleton w-90" />
          <span className="skeleton w-70" />
        </div>
      </div>
    </section>
  );
}

export function Verdict({
  card,
  plate,
  handle,
  blurb,
}: {
  card: HireCard;
  plate: string;
  handle?: string;
  blurb: string;
}) {
  const [copied, setCopied] = useState(false);
  const runnerUp = card.badge.kind === "soft" ? card.badge.runnerUp : undefined;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(blurb)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(blurb);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="verdict" id="verdict" data-slot="hire-card" aria-labelledby="verdict-title">
      <header className="section-head">
        <p className="eyebrow">
          <span>04</span> Signal
        </p>
        <p className="section-meta">
          {handle ? <span className="mono ink">@{handle}</span> : null}
          {handle ? " · " : null}crit {plate}
        </p>
      </header>

      <div className="verdict-body">
        <Seal plate={plate} score={sealScore(card.confidence)} />
        <div className="verdict-copy">
          <p className="verdict-strength">{signalStrength(card)}</p>
          <h2 className="verdict-archetype" id="verdict-title">
            {card.label}
          </h2>
          <p className="verdict-signal">{card.signal}</p>
          {runnerUp ? <p className="verdict-runner mono">Runner-up · {runnerUp}</p> : null}
        </div>
      </div>

      <div className="verdict-axes">
        {card.scores.map((score) => (
          <AxisTrack key={score.id} score={score} />
        ))}
      </div>

      <footer className="verdict-share">
        <div className="share-actions">
          <button type="button" className="btn-quiet" onClick={copy}>
            {copied ? "Copied" : "Copy blurb"}
          </button>
          <a className="btn-quiet" href={intent} target="_blank" rel="noreferrer">
            Post on X ↗
          </a>
        </div>
        <p className="disclaimer">{DISCLAIMER}</p>
      </footer>
    </section>
  );
}
