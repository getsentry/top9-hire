import type { ScoreBar } from "@/lib/hire";

function position(level: number) {
  return `${((level - 1) / 3) * 100}%`;
}

export function AxisTrack({
  score,
  compare,
  showCriterion = true,
}: {
  score: ScoreBar;
  compare?: ScoreBar;
  showCriterion?: boolean;
}) {
  return (
    <div className="axis" data-fuzzy={score.fuzzy || undefined}>
      <div className="axis-poles">
        <span>{score.left}</span>
        <span>{score.right}</span>
      </div>
      <div
        className="axis-track"
        role="img"
        aria-label={`${score.left} to ${score.right}: level ${score.level} of 4${
          compare ? `, role at level ${compare.level}` : ""
        }`}
      >
        {[1, 2, 3, 4].map((tick) => (
          <span key={tick} className="axis-tick" style={{ left: position(tick) }} />
        ))}
        {compare ? (
          <span className="axis-mark role" style={{ left: position(compare.level) }} />
        ) : null}
        <span className="axis-mark hire" style={{ left: position(score.level) }} />
      </div>
      {showCriterion ? (
        <p className="axis-criterion">
          {score.criterion}
          {score.fuzzy ? <span className="axis-fuzzy">low confidence</span> : null}
        </p>
      ) : null}
    </div>
  );
}
