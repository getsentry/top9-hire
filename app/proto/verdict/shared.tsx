"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { DECISION, plateId, shareBlurb } from "@/lib/pack";
import type { HireJobMatch, MatchChoice } from "@/lib/fit";
import type { Verdict } from "./use-intake";
import "./shared.css";

export { DECISION };

export const TONE: Record<MatchChoice, string> = {
  match: "Your nine and this job want the same things.",
  stretch: "Close, with a gap or two to talk through.",
  mismatch: "You and this job are playing different games.",
};

export function jobName(verdict: Verdict): string {
  return verdict.job?.title ?? verdict.role?.label ?? "this role";
}

export function useShare(verdict: Verdict | null, titles: readonly string[], handle: string) {
  const [copied, setCopied] = useState(false);
  const blurb = verdict?.match
    ? shareBlurb({
        handle: handle || undefined,
        plate: plateId(titles),
        card: verdict.card,
        match: {
          choice: verdict.match.choice,
          percent: verdict.match.alignment.percent,
          jobTitle: jobName(verdict),
        },
      })
    : "";

  async function share() {
    if (!blurb) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: blurb });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(blurb);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return { blurb, share, copied, xHref: `https://x.com/intent/post?text=${encodeURIComponent(blurb)}` };
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** One row per job requirement: the trait, must or nice, a four-dot meter for how much the library shows it, and the posting quote behind it. */
export function Evidence({ fit, limit }: { fit: HireJobMatch["fit"]; limit?: number }) {
  const rows = limit ? fit.rows.slice(0, limit) : fit.rows;
  return (
    <div className="ev">
      <ol className="ev-list">
        {rows.map((row, i) => (
          <li key={row.id} className="ev-row" style={{ "--i": i } as CSSProperties}>
            <div className="ev-head">
              <span className="ev-text">{row.text}</span>
              <span className="ev-tag" data-kind={row.kind}>
                {row.kind}
              </span>
              <span className="ev-meter" role="img" aria-label={`${row.level} of 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="ev-dot" data-on={n <= row.level || undefined} />
                ))}
              </span>
            </div>
            <p className="ev-quote">{clip(row.evidence, 90)}</p>
          </li>
        ))}
      </ol>
      {fit.dropped.length > 0 ? <p className="ev-cant">Jev can&apos;t check: {fit.dropped.join(", ")}</p> : null}
    </div>
  );
}

export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

/** Cycles through the user's own titles while the panel works, so the wait shows their data. */
export function useTicker(items: readonly string[], ms = 1100): string | undefined {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), ms);
    return () => clearInterval(id);
  }, [items, ms]);
  return items[i % Math.max(items.length, 1)];
}

/** Runs a state change inside a view transition when the browser has one and motion is allowed. */
export function morph(update: () => void) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

export function Spinner({ label }: { label: string }) {
  return <span className="sh-spin" role="status" aria-label={label} />;
}

export const VERDICT_COLOR: Record<MatchChoice, string> = { match: "#1f7a4d", stretch: "#b3650c", mismatch: "#e23d28" };

/** A one-shot burst of paper confetti from `origin` (viewport %). Hidden when motion is reduced. */
export function Confetti({ colors, count = 48, origin = [50, 50] }: { colors: readonly string[]; count?: number; origin?: readonly [number, number] }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      x: (Math.random() * 2 - 1) * 44,
      y: -(24 + Math.random() * 44),
      r: (Math.random() * 2 - 1) * 540,
      d: 1000 + Math.random() * 700,
      delay: Math.random() * 140,
      w: 6 + Math.random() * 7,
      color: colors[i % colors.length],
    })),
  );
  return (
    <div className="sh-confetti" aria-hidden="true" style={{ "--ox": `${origin[0]}%`, "--oy": `${origin[1]}%` } as CSSProperties}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              "--x": `${p.x}vw`,
              "--y": `${p.y}vh`,
              "--r": `${p.r}deg`,
              "--d": `${p.d}ms`,
              "--delay": `${p.delay}ms`,
              "--w": `${p.w}px`,
              background: p.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
