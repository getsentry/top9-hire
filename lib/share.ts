import { createHmac, timingSafeEqual } from "node:crypto";
import type { MatchChoice } from "./fit.ts";

/** What a share link shows. The signed token carries it, so the link needs no storage. */
export type SharePayload = {
  v: 1;
  h?: string;
  g: string[];
  a: string;
  j: string;
  m: MatchChoice;
  p?: number;
  /** Company name. */
  c?: string;
  /** X status id of the Top 9 post. */
  t?: string;
};

const MAX_TOKEN = 2048;
const MAC_BYTES = 16;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID = /^\d{1,25}$/;
const CHOICES: readonly string[] = ["match", "stretch", "mismatch"];
const DEV_SECRET = "top9-dev-share-secret";

/** Fail closed: production without a secret signs nothing, so no link is shared. */
function secret(): string | undefined {
  const value = process.env.SHARE_SECRET;
  if (value) return value;
  return process.env.NODE_ENV === "production" ? undefined : DEV_SECRET;
}

function mac(key: string, body: string): Buffer {
  return createHmac("sha256", key).update(body).digest().subarray(0, MAC_BYTES);
}

/** Cuts to at most `max` UTF-16 units and drops a trailing lone high surrogate. */
function clip(text: string, max: number): string {
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

function encode(key: string, clean: SharePayload): string {
  const body = Buffer.from(JSON.stringify(clean)).toString("base64url");
  return `${body}.${mac(key, body).toString("base64url")}`;
}

export function signShare(payload: SharePayload): string | undefined {
  const key = secret();
  if (!key) return undefined;
  // Wide characters such as CJK inflate under UTF-8 and base64url, so the caps shrink together until the token fits what readShare accepts.
  for (let step = 0; step < 10; step++) {
    const scale = 1 - step * 0.1;
    const cap = (max: number) => Math.max(1, Math.floor(max * scale));
    const clean: SharePayload = {
      v: 1,
      g: payload.g.map((title) => clip(title, cap(80))),
      a: clip(payload.a, cap(120)),
      j: clip(payload.j, cap(120)),
      m: payload.m,
    };
    if (payload.h && HANDLE.test(payload.h)) clean.h = payload.h;
    if (payload.p !== undefined) clean.p = payload.p;
    const company = payload.c ? clip(payload.c, cap(60)) : "";
    if (company) clean.c = company;
    if (payload.t && STATUS_ID.test(payload.t)) clean.t = payload.t;
    const token = encode(key, clean);
    if (token.length <= MAX_TOKEN) return token;
  }
  return undefined;
}

const inRange = (text: unknown, max: number): text is string =>
  typeof text === "string" && text.length >= 1 && text.length <= max;

export function readShare(token: string): SharePayload | undefined {
  if (token.length > MAX_TOKEN) return undefined;
  const key = secret();
  if (!key) return undefined;
  const [body, tag, extra] = token.split(".");
  if (!body || !tag || extra !== undefined) return undefined;
  const given = Buffer.from(tag, "base64url");
  const expected = mac(key, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const { v, h, g, a, j, m, p, c, t } = raw as Record<string, unknown>;
  if (v !== 1) return undefined;
  if (h !== undefined && !(typeof h === "string" && HANDLE.test(h))) return undefined;
  if (!Array.isArray(g) || g.length < 1 || g.length > 9 || !g.every((t) => inRange(t, 80))) return undefined;
  if (!inRange(a, 120) || !inRange(j, 120)) return undefined;
  if (typeof m !== "string" || !CHOICES.includes(m)) return undefined;
  if (p !== undefined && !(Number.isInteger(p) && (p as number) >= 0 && (p as number) <= 100)) return undefined;
  if (c !== undefined && !inRange(c, 60)) return undefined;
  if (t !== undefined && !(typeof t === "string" && STATUS_ID.test(t))) return undefined;
  return { v, h, g, a, j, m: m as MatchChoice, p, ...(c !== undefined && { c }), ...(t !== undefined && { t }) } as SharePayload;
}
