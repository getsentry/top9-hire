import Image from "next/image";

export type PlateSource =
  | { kind: "fixture"; id: string; tweetUrl: string; image: { src: string; width: number; height: number } | null }
  | { kind: "upload"; src: string }
  | { kind: "post"; src?: string; tweetUrl: string }
  | { kind: "typed" };

function sourceLabel(source: PlateSource) {
  if (source.kind === "fixture") return "Fixture";
  if (source.kind === "upload") return "Uploaded card";
  if (source.kind === "post") return "From post";
  return "Typed by hand";
}

function PlateArt({ source, titles }: { source: PlateSource; titles: string[] }) {
  if (source.kind === "fixture" && source.image) {
    return (
      <Image
        className="plate-image"
        src={source.image.src}
        width={source.image.width}
        height={source.image.height}
        sizes="(max-width: 720px) 70vw, 320px"
        priority
        alt={`Top9 card: ${titles.join(", ")}`}
      />
    );
  }
  const remote = source.kind === "upload" ? source.src : source.kind === "post" ? source.src : undefined;
  if (remote) {
    return <img className="plate-image" src={remote} alt={`Top9 card: ${titles.join(", ")}`} />;
  }
  return (
    <div className="plate-typeset" aria-hidden>
      <span className="plate-typeset-head">My 9 Games</span>
      <span className="plate-typeset-grid">
        {titles.map((title, i) => (
          <span key={i} data-empty={!title.trim() || undefined}>
            <span className="mono">{String(i + 1).padStart(2, "0")}</span>
            {title.trim() || "—"}
          </span>
        ))}
      </span>
    </div>
  );
}

export function Plate({
  source,
  plate,
  titles,
  handle,
  onTitle,
  onHandle,
  onSubmit,
  reading,
  disabled,
  roleLabel,
  error,
}: {
  source: PlateSource;
  plate: string;
  titles: string[];
  handle: string;
  onTitle: (index: number, value: string) => void;
  onHandle: (value: string) => void;
  onSubmit: () => void;
  reading: boolean;
  disabled: boolean;
  roleLabel: string | null;
  error: string | null;
}) {
  const filled = titles.filter((t) => t.trim()).length;
  const tweetUrl = source.kind === "fixture" || source.kind === "post" ? source.tweetUrl : null;

  return (
    <section className="plate" id="plate" aria-labelledby="plate-title">
      <header className="section-head">
        <p className="eyebrow" id="plate-title">
          <span>03</span> Plate
        </p>
        <p className="section-meta">
          <span className="mono ink">{plate}</span> · {sourceLabel(source)}
          {tweetUrl ? (
            <>
              {" · "}
              <a href={tweetUrl} target="_blank" rel="noreferrer">
                source post ↗
              </a>
            </>
          ) : null}
        </p>
      </header>

      <form
        className="plate-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSubmit();
        }}
      >
        <div className="plate-art">
          <PlateArt source={source} titles={titles} />
        </div>

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
              Nine titles
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
