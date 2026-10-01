import { DECISION, VERDICT_COLOR } from "@/lib/pack";
import { loadShare } from "@/lib/share";
import { shareMedia } from "@/app/_og/share-media";
import { homeBody, INK, INK_2, LIME, OG_SIZE, ogImage } from "@/app/_og/og";

export const alt = "A Top 9 hire verdict on top9.wtf";
export const size = OG_SIZE;
export const contentType = "image/png";

const PAPER_LIFT = "#fbfaf5";
const CARD_SIZE = 470;
const CARD_MAX_HEIGHT = 520;
const CARD_SHADOW =
  "0 1px 2px rgba(23,24,21,.08), 0 12px 28px -8px rgba(23,24,21,.25), 0 30px 60px -20px rgba(23,24,21,.25)";

const clipText = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** The round seal from the app: the decision word over the percent, in two rings. */
function Stamp({ word, color, percent }: { word: string; color: string; percent?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        right: -50,
        bottom: -44,
        width: 190,
        height: 190,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 95,
        border: `5px solid ${color}`,
        background: PAPER_LIFT,
        transform: "rotate(-12deg)",
        boxShadow: CARD_SHADOW,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 9,
          left: 9,
          right: 9,
          bottom: 9,
          borderRadius: 86,
          border: `2px solid ${color}`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color }}>
        {word
          .toUpperCase()
          .split(" ")
          .map((part) => (
            <div key={part} style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1.05 }}>
              {part}
            </div>
          ))}
        {percent === undefined ? null : (
          <div style={{ display: "flex", marginTop: 4, fontSize: 20, fontWeight: 700, opacity: 0.8 }}>{`${percent}%`}</div>
        )}
      </div>
    </div>
  );
}

/** The card's outer size: the photo's own shape, clamped to the space the layout has; square for the title grid. */
function cardFrame(aspect?: number): { width: number; height: number } {
  if (!aspect) return { width: CARD_SIZE, height: CARD_SIZE };
  const clamped = Math.min(2, Math.max(0.6, aspect));
  return clamped >= CARD_SIZE / CARD_MAX_HEIGHT
    ? { width: CARD_SIZE, height: Math.round(CARD_SIZE / clamped) }
    : { width: Math.round(CARD_MAX_HEIGHT * clamped), height: CARD_MAX_HEIGHT };
}

/** The Top 9 post's image in a white frame, or a 3 by 3 of the titles when the post has none. */
function Card({ image, titles, frame }: { image?: string; titles: string[]; frame: { width: number; height: number } }) {
  const tilt = { transform: "rotate(-3deg)", boxShadow: CARD_SHADOW };
  if (image) {
    return (
      <div style={{ display: "flex", ...frame, padding: 10, borderRadius: 18, background: "#ffffff", ...tilt }}>
        <img src={image} alt="" width={frame.width - 20} height={frame.height - 20} style={{ borderRadius: 10, objectFit: "cover" }} />
      </div>
    );
  }
  const rows = [titles.slice(0, 3), titles.slice(3, 6), titles.slice(6, 9)].filter((row) => row.length > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: CARD_SIZE, height: CARD_SIZE, justifyContent: "space-between", ...tilt }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: "flex", justifyContent: "space-between" }}>
          {row.map((title, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: 150,
                height: 150,
                padding: 12,
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                borderRadius: 10,
                border: "1px solid rgba(23,24,21,.10)",
                background: PAPER_LIFT,
                fontSize: 20,
                fontWeight: 500,
                lineHeight: 1.15,
                color: INK_2,
                overflow: "hidden",
              }}
            >
              {clipText(title, 34)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Person({ handle, avatar }: { handle?: string; avatar?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          width={64}
          height={64}
          style={{ borderRadius: 32, border: "2px solid #ffffff", boxShadow: "0 2px 8px rgba(23,24,21,.18)" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 32,
            background: INK,
            color: LIME,
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          {(handle?.[0] ?? "9").toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>{handle ? `@${handle}` : "A Top 9"}</div>
    </div>
  );
}

export default async function OpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) return ogImage(homeBody(), { mascot: 300 });

  const media = await shareMedia(share);
  const role = clipText(share.j, 70);
  const frame = cardFrame(media.card ? media.cardAspect : undefined);
  return ogImage(
    <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 56 }}>
      <div style={{ display: "flex", position: "relative", ...frame, flexShrink: 0 }}>
        <Card image={media.card} titles={share.g} frame={frame} />
        <Stamp word={DECISION[share.m]} color={VERDICT_COLOR[share.m]} percent={share.p} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
        <Person handle={share.h} avatar={media.avatar} />
        <div
          style={{ display: "flex", marginTop: 10, fontSize: 20, fontWeight: 500, color: INK_2, letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          applying for
        </div>
        <div
          style={{
            display: "flex",
            fontSize: share.j.length > 40 ? 50 : 60,
            fontWeight: 700,
            letterSpacing: "-2px",
            lineHeight: 1.02,
            maxHeight: share.j.length > 40 ? 153 : 184,
            overflow: "hidden",
          }}
        >
          {role}
        </div>
        {share.c ? (
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
            <div style={{ display: "flex", marginRight: 12 }}>at</div>
            <div style={{ display: "flex", padding: "2px 12px", borderRadius: 6, background: LIME }}>{clipText(share.c, 32)}</div>
          </div>
        ) : null}
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: INK_2 }}>{share.a}</div>
      </div>
      {/* Sits beside the bottom-right mascot as one lockup: centered on its middle, just left of its edge. */}
      <div style={{ position: "absolute", right: 88, bottom: 12, display: "flex", fontSize: 24, fontWeight: 700, color: INK_2 }}>
        top9.wtf
      </div>
    </div>,
    { mascot: 96, corner: "bottom-right", padding: "48px 64px" },
  );
}
