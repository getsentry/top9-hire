// Server-only: uses node:dns. Never import this from client code.
import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import {
  JobFetchError,
  fetchJobPosting,
  parseJobUrl,
  postingFromWebPage,
  readCapped,
  type JobPosting,
  type LockedJob,
} from "./job.ts";

export type Lookup = (host: string) => Promise<{ address: string }[]>;

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const defaultLookup: Lookup = (host) => dnsLookup(host, { all: true });

function publicIpv4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

function parseIpv6(address: string): number[] | null {
  let text = address.split("%")[0] ?? "";
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((n) => n > 255)) return null;
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail].map((g) =>
    /^[0-9a-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN,
  );
  return groups.length === 8 && groups.every(Number.isInteger) ? groups : null;
}

/** True only for addresses a public website could use. Anything unparseable is refused. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number) as [number, number, number];
    return publicIpv4(a, b, c);
  }
  if (family !== 6) return false;
  const g = parseIpv6(address);
  if (!g) return false;
  const [g0, g1, g2, , , g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const embedded = (hi: number, lo: number) => publicIpv4(hi >> 8, hi & 0xff, lo >> 8);
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) take the IPv4 verdict, and so does ::/96 as a whole.
  if (g.slice(0, 5).every((n) => n === 0) && (g5 === 0xffff || g5 === 0)) return embedded(g6, g7);
  // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) carry an IPv4 address that can point inward.
  if (g0 === 0x64 && g1 === 0xff9b && g.slice(2, 6).every((n) => n === 0)) return embedded(g6, g7);
  if (g0 === 0x2002) return embedded(g1, g2);
  // Global unicast is 2000::/3; that excludes loopback, fc00::/7, fe80::/10 and multicast.
  return (g0 & 0xe000) === 0x2000;
}

const allPublic = (entries: { address: string }[]) =>
  entries.length > 0 && entries.every((entry) => isPublicAddress(entry.address));

const UNREACHABLE = "That job page could not be reached. No description was invented.";
const PRIVATE_ADDRESS = "Refusing to read a page on a private address. No description was fetched.";

/** Raised by the connect-time lookup so the caller can tell a refused address from a network failure. */
export class PrivateAddressError extends Error {
  readonly code = "EPRIVATEADDRESS";
  constructor() {
    super(PRIVATE_ADDRESS);
  }
}

type Resolved = { address: string; family: number };
type NodeLookupCallback = (
  error: Error | null,
  address?: string | Resolved[],
  family?: number,
) => void;

/**
 * Adapts a Lookup to the `lookup` option of net/tls. The socket connects to exactly the addresses checked here,
 * so a second DNS answer cannot swap in a private one between the check and the connect.
 */
export function guardedLookup(lookup: Lookup) {
  return (hostname: string, options: { all?: boolean }, callback: NodeLookupCallback): void => {
    lookup(hostname).then(
      (entries) => {
        if (!allPublic(entries)) {
          callback(new PrivateAddressError());
          return;
        }
        const resolved = entries.map(({ address }) => ({ address, family: isIP(address) }));
        if (options.all) callback(null, resolved);
        else callback(null, resolved[0]!.address, resolved[0]!.family);
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
    );
  };
}

const NO_BODY_STATUSES = new Set([204, 205, 304]);

/** An https GET that connects only to addresses the guarded lookup allowed. It never follows redirects. */
function httpsTransport(lookup: Lookup): typeof fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const req = request(url, {
        method: "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        signal: init?.signal ?? undefined,
        lookup: guardedLookup(lookup) as never,
      });
      req.on("error", (error) => {
        reject(
          error instanceof PrivateAddressError || (error as { code?: string }).code === "EPRIVATEADDRESS"
            ? new JobFetchError(PRIVATE_ADDRESS)
            : error,
        );
      });
      req.on("response", (res) => {
        try {
          respond(res);
        } catch {
          // A status outside 200-599, or a header Headers refuses, would throw inside this listener and crash the process
          res.destroy();
          reject(new JobFetchError(UNREACHABLE));
        }
      });
      const respond = (res: IncomingMessage) => {
        const status = res.statusCode ?? 502;
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        if (NO_BODY_STATUSES.has(status) || (status >= 300 && status < 400)) {
          res.resume();
          resolve(new Response(null, { status, headers }));
          return;
        }
        resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status, headers }));
      };
      req.end();
    });
}

async function assertPublicHost(url: URL, lookup: Lookup): Promise<void> {
  if (!parseJobUrl(url.toString())) {
    throw new JobFetchError("That job page redirected somewhere we cannot read. No description was fetched.");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new JobFetchError(UNREACHABLE);
  }
  if (!allPublic(addresses)) {
    throw new JobFetchError(PRIVATE_ADDRESS);
  }
}

export type WebFetchDeps = { fetcher?: typeof fetch; lookup?: Lookup };

/** Reads any public https page. Every hop, including redirects, is re-checked against the address rules. */
export async function fetchWebPosting(
  pageUrl: string,
  { fetcher, lookup = defaultLookup }: WebFetchDeps = {},
): Promise<JobPosting> {
  const send = fetcher ?? httpsTransport(lookup);
  const signal = AbortSignal.timeout(8000);
  let url = new URL(pageUrl);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(url, lookup);
    let response: Response;
    try {
      response = await send(url, {
        redirect: "manual",
        headers: { accept: "text/html", "user-agent": "top9-hire/1.0 (job posting reader)" },
        signal,
      });
    } catch (error) {
      if (error instanceof JobFetchError) throw error;
      throw new JobFetchError(UNREACHABLE);
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      if (hop >= MAX_REDIRECTS) throw new JobFetchError("That job page redirected too many times. No description was fetched.");
      const location = response.headers.get("location");
      try {
        url = new URL(location ?? "", url);
      } catch {
        throw new JobFetchError(UNREACHABLE);
      }
      continue;
    }
    if (response.status === 404) {
      throw new JobFetchError("That job page returned 404. No description was invented.");
    }
    if (response.status !== 200) {
      throw new JobFetchError(
        `That job page could not be loaded (HTTP ${response.status}). No description was invented.`,
      );
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/\b(text\/html|application\/xhtml\+xml)\b/i.test(type)) {
      throw new JobFetchError("That link is not a web page. No description was invented.");
    }
    const html = new TextDecoder().decode(await readCapped(response));
    return postingFromWebPage(html, pageUrl);
  }
}

/** Fetches a locked job from its fixed ATS host, or a generic page through the SSRF checks. */
export async function fetchAnyJob(job: LockedJob, deps: WebFetchDeps = {}): Promise<JobPosting> {
  if (job.source !== "web") return fetchJobPosting(job, deps.fetcher);
  return fetchWebPosting(job.fetchUrl, deps);
}
