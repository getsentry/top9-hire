import { useRef, useState } from "react";
import { MAX_IMAGE_LABEL } from "@/lib/image-limit";

export function Intake({
  extracting,
  preview,
  error,
  onFile,
  onTweet,
  onTypeInstead,
}: {
  extracting: boolean;
  preview: string | null;
  error: string | null;
  onFile: (file: File) => void;
  onTweet: (url: string) => void;
  onTypeInstead: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [tweetUrl, setTweetUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function pick() {
    if (!extracting) fileInput.current?.click();
  }

  return (
    <div className="intake-drop">
      <div
        className="silhouette"
        data-dragging={dragging || undefined}
        data-extracting={extracting || undefined}
        role="button"
        tabIndex={extracting ? -1 : 0}
        aria-busy={extracting}
        aria-label="Drop a Top9 card image, or press Enter to browse"
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!extracting) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !extracting) onFile(file);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          disabled={extracting}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
        {preview ? <img className="silhouette-preview" src={preview} alt="" /> : null}
        <span className="silhouette-head" />
        <span className="silhouette-grid" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </span>
        <span className="silhouette-label">
          {extracting ? (
            <>
              <strong>Reading the card</strong>
              <span className="mono">Vision · nine titles</span>
            </>
          ) : (
            <>
              <strong>Drop a Top9 card</strong>
              <span className="mono">PNG · JPEG · WebP ≤ {MAX_IMAGE_LABEL}</span>
            </>
          )}
        </span>
      </div>

      <div className="intake-controls">
        <form
          className="post-form"
          onSubmit={(e) => {
            e.preventDefault();
            const url = tweetUrl.trim();
            if (url && !extracting) onTweet(url);
          }}
        >
          <label className="field-label" htmlFor="post-url">
            Or paste the post
          </label>
          <div className="inline-field">
            <input
              id="post-url"
              type="url"
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              placeholder="x.com/handle/status/…"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              disabled={extracting}
            />
            <button type="submit" className="btn-quiet" disabled={extracting || !tweetUrl.trim()}>
              {extracting ? "Reading…" : "Extract"}
            </button>
          </div>
        </form>
        <button type="button" className="link-button" onClick={onTypeInstead} disabled={extracting}>
          Or type nine titles by hand
        </button>
        <p className="intake-note">
          Titles are read by a vision model through AI Gateway. You can fix any of them before the read.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
