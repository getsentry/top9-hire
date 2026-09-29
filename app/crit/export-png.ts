import type { HireCard } from "@/lib/hire";
import { sealScore, signalStrength } from "@/lib/pack";
import type { PlateSource } from "./plate-art";

const W = 1600;
const H = 900;
const PAPER = "#f3efe6";
const LIFT = "#faf8f3";
const INK = "#121212";
const INK_2 = "#4b473f";
const MUTE = "#6b6560";
const RULE = "rgba(26, 26, 26, 0.14)";
const STAMP = "#e23d28";

type Drawable = CanvasImageSource & { width: number; height: number };

type Fonts = { serif: string; sans: string; mono: string };

function fontVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

async function loadFonts(): Promise<Fonts> {
  const fonts = {
    serif: fontVar("--font-serif", "Georgia, serif"),
    sans: fontVar("--font-sans", "system-ui, sans-serif"),
    mono: fontVar("--font-mono", "ui-monospace, monospace"),
  };
  await Promise.all([
    document.fonts.load(`400 96px ${fonts.serif}`),
    document.fonts.load(`italic 400 36px ${fonts.serif}`),
    document.fonts.load(`500 24px ${fonts.sans}`),
    document.fonts.load(`400 16px ${fonts.mono}`),
  ]).catch(() => undefined);
  return fonts;
}

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("card image failed to load"));
    img.src = src;
  });
}

async function cardImage(source: PlateSource): Promise<Drawable | null> {
  try {
    if (source.kind === "fixture" && source.image) return await loadImage(source.image.src, false);
    if (source.kind === "upload") return await createImageBitmap(source.file);
    if (source.kind === "post" && source.src) return await loadImage(source.src, true);
  } catch {
    return null;
  }
  return null;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawTypeset(ctx: CanvasRenderingContext2D, fonts: Fonts, titles: readonly string[], w: number, h: number) {
  ctx.fillStyle = LIFT;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = `italic 400 30px ${fonts.serif}`;
  ctx.fillText("My 9 Games", w / 2, 62);
  const pad = 26;
  const cell = (w - pad * 2 - 16) / 3;
  const rowH = (h - 100 - pad) / 3;
  ctx.textAlign = "left";
  titles.forEach((title, i) => {
    const x = pad + (i % 3) * (cell + 8);
    const y = 96 + Math.floor(i / 3) * rowH;
    ctx.strokeStyle = "rgba(18, 18, 18, 0.28)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, cell, rowH - 8, 10);
    ctx.stroke();
    ctx.fillStyle = MUTE;
    ctx.font = `400 13px ${fonts.mono}`;
    ctx.fillText(String(i + 1).padStart(2, "0"), x + 12, y + 24);
    ctx.fillStyle = INK;
    ctx.font = `400 19px ${fonts.serif}`;
    wrap(ctx, title, cell - 24)
      .slice(0, 4)
      .forEach((line, n) => ctx.fillText(line, x + 12, y + 54 + n * 22));
  });
}

function drawSeal(ctx: CanvasRenderingContext2D, fonts: Fonts, cx: number, cy: number, r: number, score: string, plate: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-9 * Math.PI) / 180);
  ctx.fillStyle = LIFT;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = STAMP;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();

  const ring = `HIRE SIGNAL · TOP9 HIRE · CRIT ${plate} · `.repeat(2);
  ctx.fillStyle = STAMP;
  ctx.font = `400 ${Math.round(r * 0.11)}px ${fonts.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = (Math.PI * 2) / ring.length;
  for (let i = 0; i < ring.length; i++) {
    ctx.save();
    ctx.rotate(-Math.PI / 2 + i * step);
    ctx.translate(0, -r * 0.83);
    ctx.fillText(ring[i] ?? "", 0, 0);
    ctx.restore();
  }

  ctx.font = `400 ${Math.round(r * 0.6)}px ${fonts.serif}`;
  ctx.fillText(score, 0, -r * 0.04);
  ctx.font = `400 ${Math.round(r * 0.12)}px ${fonts.mono}`;
  ctx.fillText("/ 10", 0, r * 0.36);
  ctx.restore();
}

function drawAxis(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  score: HireCard["scores"][number],
  x: number,
  y: number,
  w: number,
) {
  ctx.fillStyle = INK_2;
  ctx.font = `400 15px ${fonts.mono}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(score.left.toUpperCase(), x, y);
  ctx.textAlign = "right";
  ctx.fillText(score.right.toUpperCase(), x + w, y);
  const ty = y + 24;
  const tx = x + 8;
  const tw = w - 16;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + tw, ty);
  for (let i = 0; i < 4; i++) {
    const px = tx + (tw * i) / 3;
    ctx.moveTo(px, ty - 6);
    ctx.lineTo(px, ty + 6);
  }
  ctx.stroke();
  const px = tx + (tw * (score.level - 1)) / 3;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(px, ty, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(px, ty, 9, 0, Math.PI * 2);
  ctx.fill();
}

export async function renderCritPng(input: {
  source: PlateSource;
  titles: readonly string[];
  card: HireCard;
  plate: string;
  handle?: string;
  roleLabel?: string | null;
}): Promise<Blob> {
  const fonts = await loadFonts();
  const art = await cardImage(input.source);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = LIFT;
  ctx.fillRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  const cardH = 680;
  const ratio = art ? art.width / art.height : 778 / 1200;
  const cardW = Math.round(cardH * ratio);
  const cardX = 104;
  const cardY = 104;

  ctx.save();
  ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
  ctx.rotate((-1.2 * Math.PI) / 180);
  ctx.translate(-cardW / 2, -cardH / 2);
  ctx.shadowColor = "rgba(18, 18, 18, 0.28)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = LIFT;
  roundRect(ctx, 0, 0, cardW, cardH, 20);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.clip();
  if (art) ctx.drawImage(art, 0, 0, cardW, cardH);
  else drawTypeset(ctx, fonts, input.titles, cardW, cardH);
  ctx.restore();

  drawSeal(ctx, fonts, cardX + cardW - 6, cardY + cardH - 40, 104, sealScore(input.card.confidence), input.plate);

  const x0 = cardX + cardW + 150;
  const colW = W - 104 - x0;

  const fields: Array<[string, string, number]> = [
    ["Crit no", input.plate, 0.7],
    ["Candidate", input.handle ? `@${input.handle}` : "Unnamed", 1],
  ];
  if (input.roleLabel) {
    const [company, ...rest] = input.roleLabel.split(" · ");
    fields.push(rest.length ? [`Role · ${company}`, rest.join(" · "), 2] : ["Role", input.roleLabel, 2]);
  }
  const unit = colW / fields.reduce((sum, [, , weight]) => sum + weight, 0);
  let fx = x0;
  fields.forEach(([label, value, weight]) => {
    const fieldW = unit * weight;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = MUTE;
    ctx.font = `400 15px ${fonts.mono}`;
    ctx.fillText(label.toUpperCase(), fx, 124);
    ctx.fillStyle = INK;
    ctx.font = `500 24px ${fonts.sans}`;
    let text = value;
    while (text.length > 4 && ctx.measureText(text).width > fieldW - 24) text = `${text.slice(0, -2)}…`;
    ctx.fillText(text, fx, 158);
    fx += fieldW;
  });
  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(x0, 190);
  ctx.lineTo(x0 + colW, 190);
  ctx.stroke();

  let y = 250;
  ctx.fillStyle = STAMP;
  ctx.font = `400 17px ${fonts.mono}`;
  ctx.fillText(signalStrength(input.card).toUpperCase(), x0, y);

  ctx.fillStyle = INK;
  ctx.font = `400 96px ${fonts.serif}`;
  y += 86;
  for (const line of wrap(ctx, input.card.label, colW).slice(0, 2)) {
    ctx.fillText(line, x0, y);
    y += 94;
  }

  ctx.fillStyle = INK_2;
  ctx.font = `italic 400 34px ${fonts.serif}`;
  y -= 20;
  for (const line of wrap(ctx, input.card.signal, colW - 40).slice(0, 3)) {
    ctx.fillText(line, x0, y);
    y += 44;
  }

  const axisW = (colW - 56) / 2;
  const axisTop = Math.max(y + 24, 640);
  input.card.scores.forEach((score, i) => {
    drawAxis(ctx, fonts, score, x0 + (i % 2) * (axisW + 56), axisTop + Math.floor(i / 2) * 76, axisW);
  });

  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(x0, H - 110);
  ctx.lineTo(x0 + colW, H - 110);
  ctx.stroke();
  ctx.fillStyle = MUTE;
  ctx.font = `400 14px ${fonts.mono}`;
  ctx.textAlign = "left";
  ctx.fillText("TOP9 HIRE · A HIRE SIGNAL, NOT A HIRING DECISION", x0, H - 78);
  ctx.textAlign = "right";
  ctx.fillText(`CRIT ${input.plate}`, x0 + colW, H - 78);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))), "image/png");
  });
}
