import { createHash } from "node:crypto";
import { captureException, suppressTracing } from "@sentry/core";
import * as Sentry from "@sentry/nextjs";
import type { Span } from "@sentry/nextjs";
import { get, put } from "@vercel/blob";

/** Bump when a prompt or schema in breakdown.ts/fit.ts changes, so old blobs are never read. */
export const CACHE_VERSION = "v3";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Blob path for one cached value. `games` and `wiki` take a normalized title; `jobs` a URL and the job fingerprint; `fits` a URL, the job fingerprint and normalized titles in card order. */
export function cacheKey(
  kind: "games" | "jobs" | "fits" | "wiki",
  parts: { title?: string; pageUrl?: string; titles?: string[]; jobHash?: string },
): string {
  if (kind === "games" || kind === "wiki") return `${CACHE_VERSION}/${kind}/${sha256(parts.title ?? "").slice(0, 16)}.json`;
  if (kind === "jobs") return `${CACHE_VERSION}/jobs/${sha256([parts.pageUrl ?? "", parts.jobHash ?? ""].join("\n"))}.json`;
  return `${CACHE_VERSION}/fits/${sha256([parts.pageUrl ?? "", parts.jobHash ?? "", ...(parts.titles ?? [])].join("\n"))}.json`;
}

/** The first key segment after the version: games, jobs, fits, wiki. */
const kindOf = (path: string) => path.split("/")[1] ?? "value";

const enabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

type BlobIo = { get: typeof get; put: typeof put };

let defaultIo: BlobIo = { get, put };

/** Test-only: replaces the Blob client that reads and writes use when no `io` is passed. */
export function useBlobIo(io: BlobIo | undefined): void {
  defaultIo = io ?? { get, put };
}

const CACHE_NOUNS: Record<string, [one: string, many: string]> = {
  jobs: ["job", "jobs"],
  games: ["game", "games"],
  wiki: ["wiki page", "wiki pages"],
  fits: ["fit", "fits"],
  shares: ["share link", "share links"],
};

/** "job", "9 games": what a cache span holds, in plain words. */
function cacheNoun(kind: string, keys: number): string {
  const [one, many] = CACHE_NOUNS[kind] ?? [kind, kind];
  return keys === 1 ? one : `${keys} ${many}`;
}

/** Span name for a cache read: one key says found or not found, several say how many were found. */
export function readSpanName(kind: string, keys: number, hits?: number): string {
  const name = `Check cache for ${cacheNoun(kind, keys)}`;
  if (hits === undefined) return name;
  if (keys === 1) return `${name} ${hits ? "(found)" : "(not found)"}`;
  return `${name} (${hits} found)`;
}

export const writeSpanName = (kind: string, keys: number) => `Save ${cacheNoun(kind, keys)} to cache`;

/** The Blob calls run without their own http.client spans, so the one cache span keeps the first error. */
function reportError(span: Span, first: unknown): void {
  if (first === undefined) return;
  captureException(first);
  span.setStatus({ code: 2, message: "cache error" });
  span.setAttribute("top9.cache.error", first instanceof Error ? first.message : String(first));
}

/** Reads cached JSON values under one span. Any failure, or a missing token, reads as a miss. */
export async function readMany<T>(kind: string, paths: string[], io: BlobIo = defaultIo): Promise<(T | undefined)[]> {
  if (!enabled() || paths.length === 0) return paths.map(() => undefined);
  const attributes = { "top9.cache.kind": kind, "top9.cache.keys": paths.length };
  return Sentry.startSpan({ op: "top9.cache", name: readSpanName(kind, paths.length), attributes }, async (span) => {
    let first: unknown;
    const results = await suppressTracing(() =>
      Promise.all(
        paths.map(async (path): Promise<T | undefined> => {
          try {
            const result = await io.get(path, { access: "private", useCache: false });
            if (!result || result.statusCode !== 200) return undefined;
            return (await new Response(result.stream).json()) as T;
          } catch (error) {
            first ??= error;
            return undefined;
          }
        }),
      ),
    );
    const hitCount = results.filter((value) => value !== undefined).length;
    span.setAttribute("top9.cache.hits", hitCount);
    span.updateName(readSpanName(kind, paths.length, hitCount));
    reportError(span, first);
    return results;
  });
}

/** Writes cached JSON values under one span. A failure never reaches the caller; the result says whether every put succeeded. */
export async function writeMany(kind: string, entries: [string, unknown][], io: BlobIo = defaultIo): Promise<boolean> {
  if (!enabled() || entries.length === 0) return false;
  const attributes = { "top9.cache.kind": kind, "top9.cache.keys": entries.length };
  return Sentry.startSpan({ op: "top9.cache", name: writeSpanName(kind, entries.length), attributes }, async (span) => {
    let first: unknown;
    await suppressTracing(() =>
      Promise.all(
        entries.map(async ([path, value]) => {
          try {
            await io.put(path, JSON.stringify(value), {
              access: "private",
              addRandomSuffix: false,
              allowOverwrite: true,
              contentType: "application/json",
            });
          } catch (error) {
            first ??= error;
          }
        }),
      ),
    );
    reportError(span, first);
    return first === undefined;
  });
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  return (await readMany<T>(kindOf(path), [path]))[0];
}

export async function writeJson(path: string, value: unknown): Promise<boolean> {
  return writeMany(kindOf(path), [[path, value]]);
}
