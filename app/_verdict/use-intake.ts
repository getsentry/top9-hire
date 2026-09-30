"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFromTweetUrl, type SignalResult } from "@/app/actions";
import { matchSignal } from "./actions";
import { interpretExtractResponse, postImageUrl, rejectImageFile } from "@/lib/image-limit";
import { JOB_URL_REJECTED, jobUrlProblem, parseJobUrl } from "@/lib/job";

export type CardSource =
  | { kind: "file"; name: string; preview: string }
  | { kind: "tweet"; url: string; handle: string; preview?: string };

export type Step<T> =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "ok"; value: T }
  | { status: "error"; message: string };

export type Verdict = Extract<SignalResult, { ok: true }>;

const TWEET = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/\d+/i;

export function sniff(text: string): "tweet" | "job" | "other" {
  const value = text.trim();
  if (TWEET.test(value)) return "tweet";
  if (parseJobUrl(value)) return "job";
  return "other";
}

/** The employer shown on the job card: the board's org segment, or the company's own host without its careers prefix. */
export function jobLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const board = /(^|\.)(ashbyhq|greenhouse|lever)\.(io|co)$/.test(hostname);
    if (board) return pathname.split("/").filter(Boolean)[0] ?? hostname;
    return hostname.replace(/^(www|jobs|careers)\./, "");
  } catch {
    return url;
  }
}

/**
 * The card is read as soon as it lands, so the nine titles are usually back
 * before the user finishes pasting the job link.
 */
export function useIntake() {
  const [card, setCard] = useState<CardSource | null>(null);
  const [titles, setTitles] = useState<Step<string[]>>({ status: "idle" });
  const [verdict, setVerdict] = useState<Step<Verdict>>({ status: "idle" });
  const [jobUrl, setJobUrlState] = useState("");
  const [handle, setHandle] = useState("");
  const gen = useRef(0);
  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const jobError = jobUrl.trim() && !parseJobUrl(jobUrl) ? (jobUrlProblem(jobUrl) ?? JOB_URL_REJECTED) : null;

  const extract = useCallback(async (run: () => Promise<{ ok: true; games: string[]; imageUrl?: string } | { ok: false; message: string }>, onImage?: (url?: string) => void) => {
    const mine = ++gen.current;
    setTitles({ status: "busy" });
    setVerdict({ status: "idle" });
    try {
      const result = await run();
      if (mine !== gen.current) return;
      if (!result.ok) {
        setTitles({ status: "error", message: result.message });
        return;
      }
      onImage?.(result.imageUrl);
      setTitles({ status: "ok", value: result.games });
    } catch {
      if (mine !== gen.current) return;
      setTitles({ status: "error", message: "The card could not be read. Try again or use another image." });
    }
  }, []);

  const addFile = useCallback(
    (file: File) => {
      const rejected = rejectImageFile(file);
      if (rejected) {
        setTitles({ status: "error", message: rejected.message });
        return;
      }
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const preview = URL.createObjectURL(file);
      previewRef.current = preview;
      setCard({ kind: "file", name: file.name || "Pasted image", preview });
      void extract(async () => {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/extract", { method: "POST", body });
        return interpretExtractResponse(response.status, await response.json().catch(() => null));
      });
    },
    [extract],
  );

  const addTweet = useCallback(
    (url: string) => {
      const found = url.trim().match(TWEET);
      if (!found) {
        setTitles({ status: "error", message: "That is not a post link. Use a link like x.com/name/status/123." });
        return;
      }
      const handleFromUrl = found[1] ?? "";
      setCard({ kind: "tweet", url: url.trim(), handle: handleFromUrl });
      setHandle((current) => current || handleFromUrl);
      void extract(
        () => extractFromTweetUrl(url.trim()),
        (imageUrl) => {
          const preview = postImageUrl(imageUrl);
          if (preview) setCard({ kind: "tweet", url: url.trim(), handle: handleFromUrl, preview });
        },
      );
    },
    [extract],
  );

  /** Routes any pasted text: a post link becomes the card, any other public job link becomes the job. */
  const addText = useCallback(
    (text: string): "tweet" | "job" | "other" => {
      const kind = sniff(text);
      if (kind === "tweet") addTweet(text);
      if (kind === "job") setJobUrlState(text.trim());
      return kind;
    },
    [addTweet],
  );

  const setJobUrl = useCallback((url: string) => {
    setJobUrlState(url);
    setVerdict({ status: "idle" });
  }, []);

  const addKnown = useCallback((source: CardSource, games: string[]) => {
    gen.current++;
    setCard(source);
    setTitles({ status: "ok", value: games });
    setVerdict({ status: "idle" });
  }, []);

  const clearCard = useCallback(() => {
    gen.current++;
    setCard(null);
    setTitles({ status: "idle" });
    setVerdict({ status: "idle" });
  }, []);

  const run = useCallback(async () => {
    if (titles.status !== "ok" || !parseJobUrl(jobUrl)) return;
    const mine = gen.current;
    setVerdict({ status: "busy" });
    try {
      const result = await matchSignal({ paste: titles.value.join("\n"), handle, jobUrl: jobUrl.trim() });
      if (mine !== gen.current) return;
      if (!result.ok) setVerdict({ status: "error", message: result.message });
      else if (!result.match) setVerdict({ status: "error", message: result.jobError ?? "The panel could not read that job post." });
      else setVerdict({ status: "ok", value: result });
    } catch {
      if (mine !== gen.current) return;
      setVerdict({ status: "error", message: "The read did not come back from the server. Try again." });
    }
  }, [titles, jobUrl, handle]);

  const reset = useCallback(() => {
    clearCard();
    setJobUrlState("");
    setHandle("");
  }, [clearCard]);

  const ready = titles.status === "ok" && Boolean(parseJobUrl(jobUrl));

  return {
    card,
    titles,
    verdict,
    jobUrl,
    jobError,
    handle,
    ready,
    setHandle,
    setJobUrl,
    addFile,
    addTweet,
    addText,
    addKnown,
    clearCard,
    run,
    reset,
  };
}

export type Intake = ReturnType<typeof useIntake>;

/** Image files from a paste or drop event; screenshots arrive as clipboard files. */
export function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files)) if (file.type.startsWith("image/")) return file;
  return null;
}
