"use client";

import { useState, useTransition } from "react";
import { roastLibrary, type RoastResult } from "./actions";
import { readGames, type HireCard } from "@/lib/hire";

function Badge({ card }: { card: HireCard }) {
  if (card.badge.kind === "chaos") {
    return <p className="badge chaos">unclassifiable chaos</p>;
  }
  if (card.badge.kind === "soft") {
    return (
      <p className="badge soft">
        {card.badge.label}
        <span>split vibes</span>
        {card.badge.runnerUp ? <span>runner-up {card.badge.runnerUp}</span> : null}
      </p>
    );
  }
  return <p className="badge primary">{card.badge.label}</p>;
}

function CardView({ card }: { card: HireCard }) {
  return (
    <article className="card">
      <Badge card={card} />
      <p className="roast">{card.roast}</p>
      <ul className="scores">
        {card.scores.map((score) => (
          <li key={score.id}>
            <div className="axis">
              <span>{score.left}</span>
              <span>{score.right}</span>
            </div>
            <div className={score.fuzzy ? "track fuzzy" : "track"}>
              <span
                className="mark"
                style={{ left: `${((score.level - 1) / 3) * 100}%` }}
              />
            </div>
            <p className="criterion">
              {score.criterion}
              {score.fuzzy ? <span className="fuzzy-tag">fuzzy</span> : null}
            </p>
          </li>
        ))}
      </ul>
      <p className="disclaimer">{card.disclaimer}</p>
    </article>
  );
}

export default function HomePage() {
  const [paste, setPaste] = useState("");
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<RoastResult | null>(null);
  const [pending, startTransition] = useTransition();
  const count = readGames(paste).length;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setResult(await roastLibrary({ paste, handle }));
    });
  }

  return (
    <main>
      <h1>Top9 Hire</h1>
      <p className="lede">Paste nine games. Get a roast of the taste.</p>
      <form onSubmit={onSubmit}>
        <label>
          Handle
          <input
            name="handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            autoComplete="nickname"
            placeholder="optional"
          />
        </label>
        <label>
          Nine titles
          <textarea
            name="titles"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            rows={11}
            placeholder="One title per line"
            required
          />
        </label>
        <p className={count === 9 ? "count ready" : "count"}>{count} of 9</p>
        <button type="submit" disabled={pending}>
          {pending ? "Reading" : "Read the pile"}
        </button>
      </form>
      {result && !result.ok ? (
        <p className="error" role="alert">
          {result.message}
        </p>
      ) : null}
      {result?.ok ? <CardView card={result.card} /> : null}
    </main>
  );
}
