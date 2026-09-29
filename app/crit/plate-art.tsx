import { useState } from "react";
import type { Top9Example } from "@/lib/pack";
import { CardBitmap } from "./card-bitmap";

export type PlateSource =
  | { kind: "fixture"; id: string; tweetUrl: string; image: { src: string; width: number; height: number } | null }
  | { kind: "upload"; file: File }
  | { kind: "post"; src?: string }
  | { kind: "typed" };

export function fixtureSource(example: Top9Example): PlateSource {
  return { kind: "fixture", id: example.id, tweetUrl: example.tweetUrl, image: example.image };
}

export function sourceLabel(source: PlateSource) {
  if (source.kind === "fixture") return "Fixture";
  if (source.kind === "upload") return "Uploaded card";
  if (source.kind === "post") return "From post";
  return "Typed by hand";
}

function cardImage(source: PlateSource): { src: string; width?: number; height?: number } | null {
  if (source.kind === "fixture") return source.image;
  if (source.kind === "post" && source.src) return { src: source.src };
  return null;
}

/** Fixture cards are served straight from /top9, never through /_next/image, so they load behind Deployment Protection. */
export function PlateArt({ source, titles }: { source: PlateSource; titles: readonly string[] }) {
  const [failed, setFailed] = useState<string | null>(null);
  const alt = `Top9 card: ${titles.join(", ")}`;
  const image = cardImage(source);

  if (image && failed !== image.src) {
    const fail = () => setFailed(image.src);
    return (
      <img
        className="plate-image"
        src={image.src}
        width={image.width}
        height={image.height}
        decoding="async"
        alt={alt}
        onError={fail}
        ref={(el) => {
          if (el?.complete && el.naturalWidth === 0) fail();
        }}
      />
    );
  }
  if (source.kind === "upload") {
    return <CardBitmap className="plate-image" file={source.file} label={alt} />;
  }
  return (
    <div className="plate-typeset" aria-hidden>
      <span className="plate-typeset-head">My 9 Games</span>
      <span className="plate-typeset-grid">
        {titles.map((title, i) => (
          <span key={i} data-empty={!title.trim() || undefined}>
            <span className="mono">{String(i + 1).padStart(2, "0")}</span>
            {title.trim() || "—"}
          </span>
        ))}
      </span>
    </div>
  );
}
