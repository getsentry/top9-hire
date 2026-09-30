import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export const INK = "#171815";
export const INK_2 = "#42463f";
export const LIME = "#caff4a";

const font = (file: string) => readFile(join(process.cwd(), "app/_og/fonts", file));
const fonts = [
  { name: "Geist", data: await font("Geist-500.ttf"), weight: 500 as const, style: "normal" as const },
  { name: "Geist", data: await font("Geist-700.ttf"), weight: 700 as const, style: "normal" as const },
];

const mascotData = await readFile(join(process.cwd(), "public/brand/top9-mascot-og.png"), "base64");
const mascotSrc = `data:image/png;base64,${mascotData}`;

type OgOptions = {
  /** Mascot size in pixels. */
  mascot: number;
  /** Where the mascot sits; the home image keeps the top-right default. */
  corner?: "top-right" | "bottom-right";
  padding?: string;
};

/** The brand canvas: paper, Geist, and the mascot in a corner. Satori needs `display: flex` on any div with several children. */
export function ogImage(children: ReactNode, { mascot, corner = "top-right", padding = "72px 78px" }: OgOptions) {
  const place = corner === "top-right" ? { right: 58, top: 42 } : { right: 40, bottom: 28 };
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding,
        background: "#f5f2e9",
        color: INK,
        fontFamily: "Geist",
      }}
    >
      {children}
      <img src={mascotSrc} alt="" width={mascot} height={mascot} style={{ position: "absolute", objectFit: "contain", ...place }} />
    </div>,
    { ...OG_SIZE, fonts },
  );
}

export function homeBody() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>top9.wtf</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 102, fontWeight: 700, letterSpacing: "-5px", lineHeight: 0.9 }}>
          Nine games.
        </div>
        <div
          style={{
            display: "flex",
            width: "auto",
            marginTop: 12,
            padding: "4px 14px 10px",
            background: LIME,
            fontSize: 102,
            fontWeight: 700,
            letterSpacing: "-5px",
            lineHeight: 0.9,
          }}
        >
          Zero LeetCode.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 28, color: INK_2 }}>
        Match your nine formative games with a job posting.
      </div>
    </div>
  );
}
