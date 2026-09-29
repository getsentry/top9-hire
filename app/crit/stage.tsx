import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Top9Example } from "@/lib/pack";

type Placement = { handle: string; slot: "back-left" | "left" | "right" | "back-right" };

const PLACEMENTS: readonly Placement[] = [
  { handle: "bentlegen", slot: "back-left" },
  { handle: "theo", slot: "left" },
  { handle: "dorryspears", slot: "right" },
  { handle: "LinkofSunshine", slot: "back-right" },
];

export function Stage({
  examples,
  activeId,
  onPick,
  children,
}: {
  examples: readonly Top9Example[];
  activeId: string | null;
  onPick: (example: Top9Example) => void;
  children: ReactNode;
}) {
  const cards = PLACEMENTS.flatMap(({ handle, slot }) => {
    const example = examples.find((e) => e.handle === handle);
    return example?.image ? [{ example, image: example.image, slot }] : [];
  });

  return (
    <section className="stage" aria-label="Drop a card, or pick one off the table">
      {cards.map(({ example, image, slot }) => (
        <button
          key={example.id}
          type="button"
          className="stage-card"
          data-slot={slot}
          aria-pressed={example.id === activeId}
          aria-label={`Load ${example.id}, ${example.name}'s card`}
          onClick={() => onPick(example)}
          style={{ "--ratio": `${image.width} / ${image.height}` } as CSSProperties}
        >
          <Image src={image.src} width={image.width} height={image.height} sizes="240px" alt="" priority />
          <span className="stage-caption mono" aria-hidden>
            {example.id} · @{example.handle}
          </span>
        </button>
      ))}
      <div className="stage-drop">{children}</div>
    </section>
  );
}
