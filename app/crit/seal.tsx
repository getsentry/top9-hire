import { useId } from "react";

export function Seal({ score, plate, pending = false }: { score?: string; plate: string; pending?: boolean }) {
  const pathId = useId();
  const ring = `HIRE SIGNAL · TOP9 HIRE · CRIT ${plate} · `;
  return (
    <div className={pending ? "seal pending" : "seal"} aria-hidden={pending || undefined}>
      <svg viewBox="0 0 200 200" role="img" aria-label={score ? `Fit ${score} percent` : pending ? "Reading" : "No role"}>
        <defs>
          <path id={pathId} d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="96" className="seal-outer" />
        <circle cx="100" cy="100" r="64" className="seal-inner" />
        <text className="seal-ring">
          <textPath href={`#${pathId}`} textLength="486" lengthAdjust="spacing">
            {ring}
            {ring}
          </textPath>
        </text>
        {score ? (
          <>
            <text x="100" y="112" textAnchor="middle" className="seal-score">
              {score}
            </text>
            <text x="100" y="138" textAnchor="middle" className="seal-out-of">
              %
            </text>
          </>
        ) : (
          <text x="100" y="106" textAnchor="middle" className="seal-out-of">
            {pending ? "READING" : "NO ROLE"}
          </text>
        )}
      </svg>
    </div>
  );
}
