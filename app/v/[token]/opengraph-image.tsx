import { DECISION } from "@/lib/pack";
import { readShare } from "@/lib/share";
import { homeBody, INK, INK_2, LIME, OG_SIZE, ogImage } from "@/app/_og/og";

export const alt = "A Top 9 hire verdict on top9.wtf";
export const size = OG_SIZE;
export const contentType = "image/png";

const CHOICE_INK = { match: "#0f5c37", stretch: "#8a4d05", mismatch: "#a82a18" } as const;

export default async function OpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = readShare(decodeURIComponent(token));
  if (!share) return ogImage(homeBody(), 300);

  const who = share.h ? `@${share.h}` : "This Top 9";
  return ogImage(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>top9.wtf</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 30, color: INK_2, maxWidth: 800 }}>
          {`${who} for ${share.j.length > 60 ? `${share.j.slice(0, 59)}…` : share.j}`}
        </div>
        <div style={{ display: "flex", marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              padding: "4px 18px 12px",
              background: LIME,
              color: share.m === "match" ? INK : CHOICE_INK[share.m],
              fontSize: 104,
              fontWeight: 700,
              letterSpacing: "-4px",
              lineHeight: 0.95,
            }}
          >
            {DECISION[share.m]}
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 32, color: INK }}>
          {`${share.a}${share.p === undefined ? "" : ` · ${share.p}% aligned`}`}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", width: 1044, justifyContent: "space-between" }}>
        {share.g.map((title, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: 336,
              marginTop: i < 3 ? 0 : 10,
              padding: "8px 14px",
              border: `2px solid ${INK}`,
              fontSize: 22,
              color: INK_2,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
        ))}
      </div>
    </div>,
    240,
  );
}
