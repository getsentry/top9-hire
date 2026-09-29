import { CAPTURED_AT, type Top9Example } from "@/lib/pack";
import { PlateArt, fixtureSource } from "./plate-art";

export function FixtureStrip({
  examples,
  activeId,
  onPick,
}: {
  examples: readonly Top9Example[];
  activeId: string | null;
  onPick: (example: Top9Example) => void;
}) {
  return (
    <section className="strip" aria-labelledby="strip-title">
      <p className="field-label" id="strip-title">
        Fixtures · {examples.length} real cards, captured {CAPTURED_AT}
      </p>
      <ul className="strip-row">
        {examples.map((example) => (
          <li key={example.id}>
            <button
              type="button"
              className="strip-card"
              aria-pressed={example.id === activeId}
              aria-label={`${example.id}, @${example.handle}'s card`}
              onClick={() => onPick(example)}
            >
              <span className="strip-frame">
                <PlateArt source={fixtureSource(example)} titles={example.games} />
              </span>
              <span className="strip-caption" aria-hidden>
                <span className="mono">{example.id}</span>
                <span className="strip-handle">@{example.handle}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
