import { useId } from "react";

export const SEAL_RING = "TOP9.WTF · HIRE SIGNAL · ".repeat(3);

export function Seal({ score, pending = false }: { score?: string; pending?: boolean }) {
  const pathId = useId();
  return (
    <div className={pending ? "seal pending" : "seal"} aria-hidden={pending || undefined}>
      <svg viewBox="0 0 200 200" role="img" aria-label={score ? `Signal ${score} out of 10` : "Reading"}>
        <defs>
          <path id={pathId} d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="96" className="seal-outer" />
        <circle cx="100" cy="100" r="64" className="seal-inner" />
        <text className="seal-ring">
          <textPath href={`#${pathId}`} textLength="486" lengthAdjust="spacing">
            {SEAL_RING}
          </textPath>
        </text>
        {score ? (
          <>
            <text x="100" y="112" textAnchor="middle" className="seal-score">
              {score}
            </text>
            <text x="100" y="138" textAnchor="middle" className="seal-out-of">
              / 10
            </text>
          </>
        ) : (
          <text x="100" y="106" textAnchor="middle" className="seal-out-of">
            READING
          </text>
        )}
      </svg>
    </div>
  );
}
