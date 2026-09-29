import { useEffect, useState } from "react";
import type { HireCard } from "@/lib/hire";
import { suggestedFor, type PackJob } from "@/lib/pack";
import type { HireJobMatch } from "@/lib/role";
import { AxisTrack } from "./axis";

export type RailResult = {
  hire: HireCard;
  role?: HireCard;
  match?: HireJobMatch;
  job?: { title: string; url: string; company?: string };
  jobError?: string;
};

function MatchCard({ result }: { result: RailResult }) {
  const { role, match, job, jobError, hire } = result;
  const facets = match?.alignment.facets;
  const sameArchetype = role ? role.archetype === hire.archetype : false;
  return (
    <div className="match-card" data-slot="hire-job-match">
      {job ? (
        <p className="match-job">
          {job.company ? <span className="mono">{job.company}</span> : null}
          <a href={job.url} target="_blank" rel="noreferrer">
            {job.title}&nbsp;↗
          </a>
        </p>
      ) : null}
      {match ? (
        <>
          <div className="match-head">
            <p className="match-stamp" data-choice={match.choice}>
              {match.choice}
            </p>
            <p className="match-percent">
              <span className="mono-figure">{match.alignment.percent}%</span>
              <span className="mono">aligned</span>
            </p>
          </div>
          <p className="match-why">{match.why}</p>
        </>
      ) : null}
      {jobError ? (
        <p className="error" role="alert">
          {jobError}
        </p>
      ) : null}
      {role ? (
        <div className="match-role" data-slot="role-card">
          <p className="field-label match-facets-head">
            Facets
            <span className="match-legend mono">
              <span className="dot hire" /> Top9 <span className="dot role" /> Role
            </span>
          </p>
          <ol className="match-facets">
            {hire.scores.map((score, i) => {
              const compare = role.scores[i];
              const facet = facets?.[i];
              return (
                <li key={score.id} data-read={facet?.read}>
                  <AxisTrack
                    score={score}
                    compare={compare}
                    note={facet ? facet.read : undefined}
                  />
                </li>
              );
            })}
            <li className="facet-archetype" data-read={sameArchetype ? "aligned" : "diverges"}>
              <p className="axis-poles">
                <span>Archetype</span>
                <span className="axis-note">{sameArchetype ? "same" : "differs"}</span>
              </p>
              <p className="facet-arch">
                <span>
                  <span className="dot hire" /> {hire.label}
                </span>
                <span>
                  <span className="dot role" /> {role.label}
                </span>
              </p>
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}

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
          Role match <span className="muted">optional</span>
        </p>
        {selectedUrl ? (
          <button type="button" className="link-button small" onClick={() => onSelect("")} disabled={locked}>
            Clear
          </button>
        ) : null}
      </header>
      {hasMatch && result ? <MatchCard result={result} /> : null}

      <fieldset className="job-pack" disabled={locked}>
        <legend className="field-label">
          Open roles <span className="count">{jobs.length}</span>
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
            Try another role
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
