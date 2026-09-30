"use client";

import { useState, type KeyboardEvent } from "react";
import { sniff, type Intake } from "./use-intake";
import { JOB_URL_REJECTED, jobUrlProblem, parseJobUrl } from "@/lib/job-url";

/** The "or an X post link" input under the card picker. Only x.com status links are accepted. */
export function PostField({ intake, locked, onAdd }: { intake: Intake; locked: boolean; onAdd: () => void }) {
  const [link, setLink] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function submit() {
    if (sniff(link) === "tweet") {
      onAdd();
      intake.addTweet(link);
      setLink("");
      setHint(null);
    } else if (link.trim()) {
      setHint("Use a post link: x.com/name/status/…");
    }
  }

  return (
    <div className="dp-or">
      <label htmlFor="dp-post" className="dp-or-label">
        or an X post link
      </label>
      <input
        id="dp-post"
        className="dp-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        placeholder="x.com/…"
        value={link}
        disabled={locked}
        aria-invalid={hint ? true : undefined}
        aria-describedby={hint ? "dp-post-note" : undefined}
        onChange={(e) => {
          setLink(e.target.value);
          if (hint && sniff(e.target.value) === "tweet") setHint(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
      {hint ? (
        <p className="dp-error" id="dp-post-note" role="alert">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The job link input. Takes any public https link; the error clears as soon as the text parses. */
export function JobField({ intake, locked }: { intake: Intake; locked: boolean }) {
  const [value, setValue] = useState("");
  // After a failed commit, judge the text as it is typed, so the error clears the moment the link is fixed
  const draft = value.trim();
  const error = intake.jobError && draft ? (parseJobUrl(draft) ? null : (jobUrlProblem(draft) ?? JOB_URL_REJECTED)) : null;

  function commit() {
    if (value.trim()) intake.setJobUrl(value.trim());
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
  }

  return (
    <div className="dp-or">
      <label htmlFor="dp-job" className="dp-or-label">
        Paste a job link
      </label>
      <input
        id="dp-job"
        className="dp-field"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        placeholder="https://…"
        value={value}
        disabled={locked}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "dp-job-note" : undefined}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").trim();
          if (sniff(text) === "job") {
            e.preventDefault();
            setValue(text);
            intake.setJobUrl(text);
          }
        }}
        onKeyDown={onKey}
        onBlur={commit}
      />
      {error ? (
        <p className="dp-error" id="dp-job-note" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
