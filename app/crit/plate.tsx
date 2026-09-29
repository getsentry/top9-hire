import { PlateArt, type PlateSource } from "./plate-art";

export type { PlateSource };

export function Plate({
  source,
  titles,
  handle,
  onTitle,
  onHandle,
  onSubmit,
  onBack,
  reading,
  disabled,
  roleLabel,
  error,
}: {
  source: PlateSource;
  titles: string[];
  handle: string;
  onTitle: (index: number, value: string) => void;
  onHandle: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  reading: boolean;
  disabled: boolean;
  roleLabel: string | null;
  error: string | null;
}) {
  const filled = titles.filter((t) => t.trim()).length;
  const tweetUrl = source.kind === "fixture" ? source.tweetUrl : null;

  return (
    <section className="plate" id="plate" aria-labelledby="plate-title">
      {tweetUrl || onBack ? (
        <p className="section-meta">
          {tweetUrl ? (
            <a href={tweetUrl} target="_blank" rel="noreferrer">
              source post ↗
            </a>
          ) : null}
          {tweetUrl && onBack ? " · " : null}
          {onBack ? (
            <button type="button" className="link-button small" onClick={onBack}>
              Back to crit
            </button>
          ) : null}
        </p>
      ) : null}

      <form
        className="plate-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSubmit();
        }}
      >
        <figure className="plate-art">
          <PlateArt source={source} titles={titles} />
        </figure>

        <div className="plate-sheet">
          <label className="plate-field">
            <span className="field-label">Candidate</span>
            <span className="handle-input">
              <span aria-hidden>@</span>
              <input
                value={handle}
                onChange={(e) => onHandle(e.target.value.replace(/^@/, ""))}
                placeholder="handle (optional)"
                autoComplete="off"
                spellCheck={false}
              />
            </span>
          </label>

          <div className="plate-field">
            <span className="field-label">
              <span id="plate-title">Nine titles</span>
              <span className={filled === 9 ? "count ready" : "count"}>{filled}/9</span>
            </span>
            <ol className="title-list">
              {titles.map((title, i) => (
                <li key={i}>
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                  <input
                    aria-label={`Title ${i + 1}`}
                    value={title}
                    onChange={(e) => onTitle(i, e.target.value)}
                    placeholder="Game title"
                    required
                  />
                </li>
              ))}
            </ol>
          </div>

          <div className="plate-actions">
            <p className="plate-role">
              <span className="field-label">Role</span>
              {roleLabel ? (
                <span>{roleLabel}</span>
              ) : (
                <span className="muted">None. Pick one from the role pack for a match read.</span>
              )}
            </p>
            <button type="submit" className="btn-primary" disabled={disabled}>
              {reading ? "Reading the signal…" : "Read the signal"}
              <span aria-hidden>→</span>
            </button>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
