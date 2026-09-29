"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

/**
 * One shader, and only in the verdict pane. It is the unread card: amber and
 * ink moving slowly while the pile waits, faster while a judgment is in flight.
 * It is not a page costume. Reduced motion holds a single frame.
 */
export function VerdictField({ active }: { active: boolean }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return (
    <MeshGradient
      className="verdict-field"
      aria-hidden
      colors={["#f6f1e7", "#1a120c", "#e7a24a", "#0c0d12"]}
      distortion={0.9}
      swirl={0.22}
      grainMixer={0.12}
      grainOverlay={0.06}
      speed={reduced ? 0 : active ? 0.5 : 0.14}
      minPixelRatio={1}
      maxPixelCount={900_000}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
