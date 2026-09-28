"use client";

import { useRef, useState } from "react";
import { roastLibrary } from "./actions";
import { Verdict } from "./verdict";
import type { HireCard } from "@/lib/hire";
import {
  EMPTY_SLOTS,
  fillSlots,
  filledCount,
  readExtracted,
  readIntake,
  readLines,
  setSlot,
  slotsToPaste,
  type Slots,
} from "@/lib/intake";

type Status =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "classifying" }
  | { kind: "failed"; message: string };

const EXTRACT_UNAVAILABLE =
  "Card and post reading is not enabled on this deployment. Type or paste the titles instead.";
const EXTRACT_FAILED =
  "Could not read nine titles from that. Type or paste them instead.";

async function requestExtract(
  input: File | string,
): Promise<{ ok: true; slots: Slots } | { ok: false; message: string }> {
  let response: Response;
  if (input instanceof File) {
    const form = new FormData();
    form.set("file", input);
    response = await fetch("/api/extract", { method: "POST", body: form });
  } else {
    response = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tweetUrl: input }),
    });
  }
  if (response.status === 404) return { ok: false, message: EXTRACT_UNAVAILABLE };
  const body: unknown = await response.json().catch(() => null);
  const slots = response.ok ? readExtracted(body) : null;
  if (slots) return { ok: true, slots };
  const message = (body as { message?: unknown } | null)?.message;
  return { ok: false, message: typeof message === "string" ? message : EXTRACT_FAILED };
}

function statusLine(status: Status, count: number): string {
  if (status.kind === "extracting") return "Reading the card…";
  if (status.kind === "classifying") return "Reading the nine…";
  if (status.kind === "failed") return status.message;
  return count === 9 ? "Nine of nine. Ready." : `${count} of 9`;
}

export default function HomePage() {
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS);
  const [handle, setHandle] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [card, setCard] = useState<HireCard | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const count = filledCount(slots);
  const busy = status.kind === "extracting" || status.kind === "classifying";

  async function extractFrom(input: File | string) {
    setStatus({ kind: "extracting" });
    const result = await requestExtract(input);
    if (result.ok) {
      setSlots(result.slots);
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "failed", message: result.message });
    }
  }

  function takeIntake(text: string) {
    const intake = readIntake(text);
    if (intake.kind === "tweet") {
      void extractFrom(intake.url);
    } else if (intake.lines.length > 0) {
      setSlots(fillSlots(EMPTY_SLOTS, 0, intake.lines));
      setStatus({ kind: "idle" });
    }
    setSource("");
  }

  function takeFile(file: File | undefined) {
    if (file && file.type.startsWith("image/")) void extractFrom(file);
  }

  function onSourcePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const file = event.clipboardData.files[0];
    if (file) takeFile(file);
    else takeIntake(event.clipboardData.getData("text"));
  }

  function onSourceKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    takeIntake(source);
  }

  function onSlotPaste(index: number, event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const lines = readLines(event.clipboardData.getData("text"));
    if (lines.length < 2) return;
    event.preventDefault();
    setSlots(fillSlots(slots, index, lines));
  }

  function onSlotKeyDown(index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = event.currentTarget.form?.elements.namedItem(`title-${index + 2}`);
    if (next instanceof HTMLTextAreaElement) next.focus();
    else event.currentTarget.form?.requestSubmit();
  }

  function onDrop(event: React.DragEvent<HTMLFieldSetElement>) {
    event.preventDefault();
    setDropping(false);
    takeFile(event.dataTransfer.files[0]);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (count !== 9) {
      setStatus({ kind: "failed", message: `Need exactly 9 titles. Found ${count}.` });
      return;
    }
    setStatus({ kind: "classifying" });
    const result = await roastLibrary({ paste: slotsToPaste(slots), handle });
    if (result.ok) {
      setCard(result.card);
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "failed", message: result.message });
    }
  }

  return (
    <main className="sheet">
      <header className="head">
        <h1>Top9 Hire</h1>
        <p className="lede">Nine games in. One hire archetype out. Skip the LeetCode.</p>
      </header>

      <form onSubmit={onSubmit} aria-busy={busy}>
        <div className="line">
          <label htmlFor="handle">Candidate</label>
          <input
            id="handle"
            name="handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            autoComplete="nickname"
            placeholder="@handle, optional"
          />
        </div>

        <div className="line">
          <label htmlFor="source">Source</label>
          <input
            id="source"
            name="source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onPaste={onSourcePaste}
            onKeyDown={onSourceKeyDown}
            placeholder="Paste a title list or an x.com link"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="quiet" onClick={() => fileInput.current?.click()}>
            Upload card image
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              takeFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>

        <fieldset
          className="nine"
          onDragOver={(event) => {
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
        >
          <legend>Nine titles, left to right, top to bottom</legend>
          <div className={dropping ? "grid dropping" : "grid"}>
            {slots.map((slot, index) => (
              <label key={index} className="slot">
                <span className="slot-n" aria-hidden>
                  {index + 1}
                </span>
                <textarea
                  name={`title-${index + 1}`}
                  aria-label={`Title ${index + 1}`}
                  value={slot}
                  rows={2}
                  onChange={(event) =>
                    setSlots(setSlot(slots, index, event.target.value.replace(/\r?\n/g, " ")))
                  }
                  onPaste={(event) => onSlotPaste(index, event)}
                  onKeyDown={(event) => onSlotKeyDown(index, event)}
                  placeholder="Title"
                  autoComplete="off"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="actions">
          <button type="submit" disabled={busy}>
            Stamp the verdict
          </button>
          <p
            className={status.kind === "failed" ? "status failed" : "status"}
            role={status.kind === "failed" ? "alert" : "status"}
          >
            {statusLine(status, count)}
          </p>
        </div>
      </form>

      <aside className="office" aria-live="polite">
        {card ? (
          <Verdict card={card} />
        ) : (
          <p className="pending" aria-hidden>
            No verdict yet
          </p>
        )}
      </aside>
    </main>
  );
}
