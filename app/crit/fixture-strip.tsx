import type { Top9Example } from "@/lib/pack";
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
        Or pick a real card
      </p>
      <ul className="strip-row">
        {examples.map((example) => (
          <li key={example.id}>
            <button
              type="button"
              className="strip-card"
              aria-pressed={example.id === activeId}
              aria-label={`@${example.handle}'s card`}
              onClick={() => onPick(example)}
            >
              <span className="strip-frame">
                <PlateArt source={fixtureSource(example)} titles={example.games} />
              </span>
              <span className="strip-handle" aria-hidden>
                @{example.handle}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
