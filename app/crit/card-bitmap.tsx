import { useEffect, useRef } from "react";

/** Draws an uploaded card from its bytes, so no object URL ever reaches the DOM. */
export function CardBitmap({ file, className, label }: { file: File; className?: string; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | undefined;
    createImageBitmap(file)
      .then((next) => {
        if (cancelled || !canvas.current) {
          next.close();
          return;
        }
        bitmap = next;
        canvas.current.width = next.width;
        canvas.current.height = next.height;
        canvas.current.getContext("2d")?.drawImage(next, 0, 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [file]);

  return label ? (
    <canvas ref={canvas} className={className} role="img" aria-label={label} />
  ) : (
    <canvas ref={canvas} className={className} aria-hidden />
  );
}
