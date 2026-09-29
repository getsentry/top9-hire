import { useState, type ReactNode } from "react";
import { DISCLAIMER, type HireCard } from "@/lib/hire";
import { CLASSIFY_MODEL } from "@/lib/models";
import { sealScore, signalStrength } from "@/lib/pack";
import { AxisTrack } from "./axis";
import { Check } from "./check";
import { renderCritPng } from "./export-png";
import { PlateArt, sourceLabel, type PlateSource } from "./plate-art";
import { Seal } from "./seal";

type Props = {
  source: PlateSource;
  titles: readonly string[];
  plate: string;
  handle?: string;
  roleLabel: string | null;
  card: HireCard | null;
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

export function Crit({ source, titles, plate, handle, roleLabel, card, blurb, readAt, onEdit }: Props) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "failed">("idle");
  const tweetUrl = source.kind === "fixture" ? source.tweetUrl : null;
  const runnerUp = card?.badge.kind === "soft" ? card.badge.runnerUp : undefined;

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
      const blob = await renderCritPng({ source, titles, card, plate, handle, roleLabel });
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
      aria-labelledby="crit-title"
      aria-busy={card ? undefined : true}
    >
      <header className="section-head">
        <p className="eyebrow">
          <span>03</span> Crit
        </p>
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
          <Field label="Crit no">
            <span className="mono-figure">{plate}</span>
          </Field>
          <Field label="Candidate">{handle ? `@${handle}` : <span className="muted">Unnamed</span>}</Field>
          <Field label="Role">{roleLabel ?? <span className="muted">No role picked</span>}</Field>
        </dl>

        <div className="crit-body">
          <figure className="crit-card">
            <PlateArt source={source} titles={titles} />
            <div className="crit-seal">
              {card ? <Seal plate={plate} score={sealScore(card.confidence)} /> : <Seal plate={plate} pending />}
            </div>
          </figure>

          {card ? (
            <div className="crit-doc" aria-live="polite">
              <p className="verdict-strength">{signalStrength(card)}</p>
              <h2 className="verdict-archetype" id="crit-title">
                {card.label}
              </h2>
              <p className="verdict-signal">{card.signal}</p>
              <dl className="crit-ledger">
                <div>
                  <dt>Titles read</dt>
                  <dd className="mono-figure">{titles.filter((t) => t.trim()).length} / 9</dd>
                </div>
                {runnerUp ? (
                  <div>
                    <dt>Runner-up</dt>
                    <dd>{runnerUp}</dd>
                  </div>
                ) : null}
                <div className="crit-total">
                  <dt>Signal</dt>
                  <dd className="mono-figure">{sealScore(card.confidence)} / 10</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="crit-doc" aria-live="polite">
              <p className="verdict-strength muted" id="crit-title">
                Reading nine titles…
              </p>
              <span className="skeleton h-lg w-80" />
              <span className="skeleton w-90" />
              <span className="skeleton w-70" />
              <span className="skeleton w-40 crit-skeleton-gap" />
              <span className="skeleton w-90" />
            </div>
          )}
        </div>

        {card ? (
          <div className="crit-axes">
            {card.scores.map((score) => (
              <AxisTrack key={score.id} score={score} />
            ))}
          </div>
        ) : null}

        {card && readAt ? (
          <p className="crit-provenance">
            <Check />
            <span>
              Read <time dateTime={readAt}>{formatRead(readAt)}</time> · {CLASSIFY_MODEL} via AI Gateway ·
              confidence <span className="mono-figure">{card.confidence.toFixed(2)}</span>
            </span>
          </p>
        ) : null}

        <footer className="crit-foot mono">
          <span>Top9 Hire · a hire signal, not a hiring decision</span>
          <span>Crit {plate}</span>
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
