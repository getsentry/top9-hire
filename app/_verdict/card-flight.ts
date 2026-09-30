/** How long a card takes to fly into its slot, in milliseconds. Callers also use it to delay revoking the image URL. */
export const FLIGHT_MS = 560;
const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.12)";

/** Where a flight starts. Captured before the source unmounts or its dialog closes. */
export type FlySource = { rect: DOMRect; angle: number; width: number; height: number };

/** Measures a card or job tile before it unmounts, so `fly` can start from where it was. */
export function sourceOf(el: HTMLElement): FlySource {
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return {
    rect: el.getBoundingClientRect(),
    angle: (Math.atan2(m.b, m.a) * 180) / Math.PI,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

/**
 * FLIP with a ghost: a fixed-position copy sits at the slot's layout box and is
 * transformed back onto the source rect, then animated to identity.
 */
export function fly(from: FlySource, to: HTMLElement | null, src?: string) {
  if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = from.rect;
  const b = to.getBoundingClientRect();
  const w = to.offsetWidth;
  const h = to.offsetHeight;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const sx = from.width / w;
  const sy = from.height / h;

  const ghost = document.createElement(src ? "img" : "div");
  ghost.className = src ? "dp-ghost" : "dp-ghost dp-ghost-job";
  if (ghost instanceof HTMLImageElement && src) {
    ghost.src = src;
    ghost.alt = "";
  }
  Object.assign(ghost.style, {
    left: `${b.left + b.width / 2 - w / 2}px`,
    top: `${b.top + b.height / 2 - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
  });
  document.body.append(ghost);

  const flight = ghost.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(${from.angle}deg) scale(${sx}, ${sy})` },
      { transform: "translate(0, 0) rotate(0deg) scale(1, 1)" },
    ],
    { duration: FLIGHT_MS, easing: SPRING, fill: "forwards" },
  );
  // The slot fills in underneath once the image is read, so the ghost fades instead of vanishing.
  flight.finished
    .then(() => ghost.animate({ opacity: [1, 0] }, { duration: 240, fill: "forwards" }).finished)
    .catch(() => {})
    .finally(() => ghost.remove());
}
