import Image from "next/image";
import { CAPTURED_AT, type Top9Example } from "@/lib/pack";

function TypesetCard({ games }: { games: readonly string[] }) {
  return (
    <span className="typeset-card" aria-hidden>
      <span className="typeset-kicker">Text post</span>
      <ol>
        {games.map((game) => (
          <li key={game}>{game}</li>
        ))}
      </ol>
    </span>
  );
}

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
        {examples.map((example) => {
          const active = example.id === activeId;
          return (
            <li key={example.id}>
              <button
                type="button"
                className="strip-card"
                aria-pressed={active}
                onClick={() => onPick(example)}
              >
                <span className="strip-frame">
                  {example.image ? (
                    <Image
                      src={example.image.src}
                      width={example.image.width}
                      height={example.image.height}
                      sizes="160px"
                      alt={`@${example.handle}'s Top9 card: ${example.games.join(", ")}`}
                    />
                  ) : (
                    <TypesetCard games={example.games} />
                  )}
                  {active ? <span className="strip-tag">On sheet</span> : null}
                </span>
                <span className="strip-caption">
                  <span className="mono">{example.id}</span>
                  <span className="strip-handle">@{example.handle}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
