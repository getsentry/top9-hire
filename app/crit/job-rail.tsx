import { useEffect, useState } from "react";
import type { HireJobMatch } from "@/lib/fit";
import type { HireCard, RoleCard } from "@/lib/hire";
import { suggestedFor, type PackJob } from "@/lib/pack";

export type RailResult = {
  hire: HireCard;
  role?: RoleCard;
  match?: HireJobMatch;
  job?: { title: string; url: string; company?: string };
  jobError?: string;
};

export function JobRail({
  jobs,
  selectedUrl,
  customUrl,
  onSelect,
  onCustom,
  result,
  locked,
  suggestHandle,
}: {
  jobs: readonly PackJob[];
  selectedUrl: string;
  customUrl: string;
  onSelect: (url: string) => void;
  onCustom: (url: string) => void;
  result: RailResult | null;
  locked: boolean;
  suggestHandle: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMatch = Boolean(result && (result.role || result.match || result.jobError));
  const collapsed = hasMatch && !expanded;
  const visible = collapsed ? jobs.filter((job) => job.url === selectedUrl) : jobs;

  useEffect(() => {
    if (hasMatch) setExpanded(false);
  }, [hasMatch, result]);

  return (
    <aside className="rail" aria-labelledby="rail-title" data-slot="job-url">
      <header className="section-head">
        <p className="eyebrow" id="rail-title">
          Hiring for
        </p>
        {selectedUrl ? (
          <button type="button" className="link-button small" onClick={() => onSelect("")} disabled={locked}>
            Clear
          </button>
        ) : null}
      </header>
      <fieldset className="job-pack" disabled={locked}>
        <legend className="field-label">
          Role pack <span className="count">{jobs.length}</span>
        </legend>
        {visible.map((job) => {
          const checked = selectedUrl === job.url;
          const suggested = suggestedFor(job, suggestHandle);
          return (
            <label key={job.id} className="job-row" data-checked={checked || undefined}>
              <input
                type="radio"
                name="job"
                value={job.url}
                checked={checked}
                onChange={() => onSelect(job.url)}
              />
              <span className="job-radio" aria-hidden />
              <span className="job-text">
                <span className="job-title">{job.title}</span>
                <span className="job-meta">
                  <span className="mono">{job.company}</span> · {job.facet}
                </span>
                {suggested ? (
                  <span className="job-suggested mono">Suggested for @{suggestHandle}</span>
                ) : null}
              </span>
            </label>
          );
        })}
        {collapsed ? (
          <button type="button" className="link-button small job-more" onClick={() => setExpanded(true)}>
            Try another role · {jobs.length} in the pack
          </button>
        ) : null}
        <label className="job-custom" hidden={collapsed}>
          <span className="field-label">Or paste a Greenhouse / Ashby URL</span>
          <input
            type="url"
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="jobs.ashbyhq.com/… or job-boards.greenhouse.io/…"
            value={customUrl}
            onChange={(e) => onCustom(e.target.value.trim())}
          />
        </label>
      </fieldset>
    </aside>
  );
}
