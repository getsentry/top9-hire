import { useRef, useState } from "react";
import { MAX_IMAGE_LABEL } from "@/lib/image-limit";
import { CardBitmap } from "./card-bitmap";

export function DropCard({
  extracting,
  preview,
  onFile,
}: {
  extracting: boolean;
  preview: File | null;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function pick() {
    if (!extracting) fileInput.current?.click();
  }

  return (
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
      {preview ? <CardBitmap className="silhouette-preview" file={preview} /> : null}
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
  );
}

export function PostForm({
  extracting,
  error,
  onTweet,
  onTypeInstead,
}: {
  extracting: boolean;
  error: string | null;
  onTweet: (url: string) => void;
  onTypeInstead: () => void;
}) {
  const [tweetUrl, setTweetUrl] = useState("");

  return (
    <div className="post-intake">
      <form
        className="post-form"
        onSubmit={(e) => {
          e.preventDefault();
          const url = tweetUrl.trim();
          if (url && !extracting) onTweet(url);
        }}
      >
        <label className="sr-only" htmlFor="post-url">
          Top9 post URL
        </label>
        <div className="inline-field">
          <input
            id="post-url"
            type="url"
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="Paste a Top9 post: x.com/handle/status/…"
            value={tweetUrl}
            onChange={(e) => setTweetUrl(e.target.value)}
            disabled={extracting}
          />
          <button type="submit" className="btn-primary small" disabled={extracting || !tweetUrl.trim()}>
            {extracting ? "Reading…" : "Extract"}
          </button>
        </div>
      </form>
      <p className="post-alt">
        Or drop the card image below, pick a real card, or{" "}
        <button type="button" className="link-button" onClick={onTypeInstead} disabled={extracting}>
          type nine titles by hand
        </button>
        .
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
