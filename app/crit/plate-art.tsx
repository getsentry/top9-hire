import Image from "next/image";
import { CardBitmap } from "./card-bitmap";

export type PlateSource =
  | { kind: "fixture"; id: string; tweetUrl: string; image: { src: string; width: number; height: number } | null }
  | { kind: "upload"; file: File }
  | { kind: "post"; src?: string }
  | { kind: "typed" };

export function sourceLabel(source: PlateSource) {
  if (source.kind === "fixture") return "Fixture";
  if (source.kind === "upload") return "Uploaded card";
  if (source.kind === "post") return "From post";
  return "Typed by hand";
}

export function PlateArt({ source, titles }: { source: PlateSource; titles: readonly string[] }) {
  const alt = `Top9 card: ${titles.join(", ")}`;
  if (source.kind === "fixture" && source.image) {
    return (
      <Image
        className="plate-image"
        src={source.image.src}
        width={source.image.width}
        height={source.image.height}
        sizes="(max-width: 720px) 70vw, 320px"
        priority
        alt={alt}
      />
    );
  }
  if (source.kind === "upload") {
    return <CardBitmap className="plate-image" file={source.file} label={alt} />;
  }
  if (source.kind === "post" && source.src) {
    return <img className="plate-image" src={source.src} alt={alt} />;
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
