import type { ReactNode } from "react";
import type { ScoreBar } from "@/lib/hire";

function position(level: number) {
  return `${((level - 1) / 3) * 100}%`;
}

export function AxisTrack({
  score,
  compare,
  note,
}: {
  score: ScoreBar;
  compare?: ScoreBar;
  note?: ReactNode;
}) {
  return (
    <div className="axis" data-fuzzy={score.fuzzy || undefined}>
      <div className="axis-poles">
        <span>{score.left}</span>
        {note ? <span className="axis-note">{note}</span> : null}
        <span>{score.right}</span>
      </div>
      <div
        className="axis-track"
        role="img"
        aria-label={`${score.left} to ${score.right}: level ${score.level} of 4${
          score.fuzzy ? ", low confidence" : ""
        }${compare ? `, role at level ${compare.level}` : ""}`}
      >
        {[1, 2, 3, 4].map((tick) => (
          <span key={tick} className="axis-tick" style={{ left: position(tick) }} />
        ))}
        {compare ? (
          <span className="axis-mark role" style={{ left: position(compare.level) }} />
        ) : null}
        <span className="axis-mark hire" style={{ left: position(score.level) }} />
      </div>
    </div>
  );
}
