import { useState, type ReactNode } from "react";
import { Evidence } from "@/app/proto/verdict/shared";
import type { HireJobMatch } from "@/lib/fit";
import { DISCLAIMER, type HireCard, type RoleCard } from "@/lib/hire";
import { EVALUATE_MODEL } from "@/lib/models";
import { DECISION } from "@/lib/pack";
import { renderCritPng } from "./export-png";
import { PlateArt, sourceLabel, type PlateSource } from "./plate-art";
import { Seal } from "./seal";

type Props = {
  source: PlateSource;
  titles: readonly string[];
  plate: string;
  handle?: string;
  roleLabel: string | null;
  jobUrl?: string;
  card: HireCard | null;
  role?: RoleCard;
  match?: HireJobMatch;
  jobError?: string;
  blurb: string;
  readAt?: string;
  onEdit: () => void;
};

function formatRead(iso: string) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-CA");
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="crit-field">
      <dt className="mono">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Decision({
  match,
  roleLabel,
  jobUrl,
}: {
  match: HireJobMatch;
  roleLabel: string | null;
  jobUrl?: string;
}) {
  return (
    <div className="decision" data-choice={match.choice} data-slot="hire-job-match">
      <p className="eyebrow">Panel decision</p>
      <h2 className="decision-stamp" id="crit-title">
        {DECISION[match.choice]}
      </h2>
      <p className="decision-for">
        <span>
          for{" "}
          {jobUrl ? (
            <a href={jobUrl} target="_blank" rel="noreferrer">
              {roleLabel}&nbsp;↗
            </a>
          ) : (
            roleLabel
          )}
        </span>
        <span className="decision-percent mono-figure">{match.alignment.percent}% aligned</span>
      </p>
      <blockquote className="decision-note">{match.why}</blockquote>
    </div>
  );
}

export function Crit({
  source,
  titles,
  plate,
  handle,
  roleLabel,
  jobUrl,
  card,
  role,
  match,
  jobError,
  blurb,
  readAt,
  onEdit,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "failed">("idle");
  const tweetUrl = source.kind === "fixture" ? source.tweetUrl : null;
  const decided = Boolean(card && match);

  async function copy() {
    try {
      await navigator.clipboard.writeText(blurb);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function save() {
    if (!card) return;
    setSaving("saving");
    try {
      const blob = await renderCritPng({ source, titles, card, match, plate, handle, roleLabel });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `top9-hire-crit-${plate}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setSaving("idle");
    } catch {
      setSaving("failed");
    }
  }

  return (
    <section
      className="crit"
      id="plate"
      data-slot="hire-card"
      data-decided={decided || undefined}
      aria-labelledby="crit-title"
      aria-busy={card ? undefined : true}
    >
      <header className="section-head">
        <p className="eyebrow">Interview packet</p>
        <p className="section-meta">
          {sourceLabel(source)}
          {tweetUrl ? (
            <>
              {" · "}
              <a href={tweetUrl} target="_blank" rel="noreferrer">
                source post ↗
              </a>
            </>
          ) : null}
          {" · "}
          <button type="button" className="link-button small" onClick={onEdit} disabled={!card}>
            Edit titles
          </button>
        </p>
      </header>

      <article className="crit-sheet" id="verdict">
        <dl className="crit-fields">
          <Field label="File no">
            <span className="mono-figure">{plate}</span>
          </Field>
          <Field label="Candidate">{handle ? `@${handle}` : <span className="muted">Unnamed</span>}</Field>
          <Field label="Hiring for">{roleLabel ?? <span className="muted">No role on file</span>}</Field>
        </dl>

        {card && match ? <Decision match={match} roleLabel={roleLabel} jobUrl={jobUrl} /> : null}
        {card && jobError ? (
          <p className="error decision-error" role="alert">
            {jobError}
          </p>
        ) : null}

        <div className="crit-body">
          <figure className="crit-card">
            <PlateArt source={source} titles={titles} />
            <div className="crit-seal">
              {card && match ? (
                <Seal plate={plate} score={String(match.alignment.percent)} />
              ) : (
                <Seal plate={plate} pending={!card} />
              )}
            </div>
          </figure>

          {card ? (
            <div className="crit-doc" aria-live="polite">
              <p className="verdict-strength">
                {decided ? "Evidence" : "Library read"}
              </p>
              {decided ? (
                <p className="verdict-archetype">{card.label}</p>
              ) : (
                <h2 className="verdict-archetype" id="crit-title">
                  {card.label}
                </h2>
              )}
              <p className="verdict-signal">{card.signal}</p>
              <dl className="crit-ledger">
                <div>
                  <dt>Titles reviewed</dt>
                  <dd className="mono-figure">{titles.filter((t) => t.trim()).length} / 9</dd>
                </div>
                <div>
                  <dt>Top skills</dt>
                  <dd>{card.skills.map((entry) => entry.skill).join(", ")}</dd>
                </div>
                {role ? (
                  <div>
                    <dt>The role reads as</dt>
                    <dd>{role.label}</dd>
                  </div>
                ) : null}
                {match ? (
                  <div className="crit-total">
                    <dt>Fit</dt>
                    <dd className="mono-figure">{match.alignment.percent}%</dd>
                  </div>
                ) : null}
              </dl>
              {!roleLabel ? (
                <p className="crit-nudge">No role on file, so no hiring decision. Pick a role and run it again.</p>
              ) : null}
            </div>
          ) : (
            <div className="crit-doc" aria-live="polite">
              <p className="verdict-strength muted" id="crit-title">
                {roleLabel ? "The panel is deliberating…" : "Reviewing nine titles…"}
              </p>
              <span className="skeleton h-lg w-80" />
              <span className="skeleton w-90" />
              <span className="skeleton w-70" />
              <span className="skeleton w-40 crit-skeleton-gap" />
              <span className="skeleton w-90" />
            </div>
          )}
        </div>

        {card && match ? (
          <div className="crit-axes-block">
            <Evidence fit={match.fit} />
          </div>
        ) : null}

        {card && readAt ? (
          <p className="crit-provenance">
            Read <time dateTime={readAt}>{formatRead(readAt)}</time> · {EVALUATE_MODEL} via AI Gateway
          </p>
        ) : null}

        <footer className="crit-foot mono">
          <span>top9.wtf · nine games instead of a leetcode round</span>
          <span>File {plate}</span>
        </footer>
      </article>

      {card ? (
        <div className="crit-actions">
          <div className="share-actions">
            <button type="button" className="btn-primary small" onClick={save} disabled={saving === "saving"}>
              {saving === "saving" ? "Saving…" : "Save PNG"}
            </button>
            <button type="button" className="btn-quiet" onClick={copy}>
              {copied ? "Copied" : "Copy blurb"}
            </button>
            <a
              className="btn-quiet"
              href={`https://x.com/intent/post?text=${encodeURIComponent(blurb)}`}
              target="_blank"
              rel="noreferrer"
            >
              Post on X ↗
            </a>
          </div>
          <p className="disclaimer">
            {saving === "failed" ? "The PNG could not be drawn in this browser. " : null}
            {DISCLAIMER}
          </p>
        </div>
      ) : null}
    </section>
  );
}
