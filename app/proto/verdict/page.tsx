"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import "./picker.css";
import "./skin-codex.css";
import { DealDialog } from "./deal-dialog";
import { DialogBadge } from "./dialog-badge";
import { DialogFaces } from "./dialog-faces";
import { DialogPosts } from "./dialog-posts";

const VARIANTS: { name: string; Component: ComponentType }[] = [
  { name: "Dialog", Component: DealDialog },
  { name: "Posts", Component: DialogPosts },
  { name: "Faces", Component: DialogFaces },
  { name: "Badge", Component: DialogBadge },
];

export default function ProtoVerdict() {
  const [current, setCurrent] = useState(0);
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [codex, setCodex] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const highlightRef = useRef<HTMLSpanElement>(null);

  const moveHighlight = useCallback(() => {
    const el = itemRefs.current[current];
    const hl = highlightRef.current;
    if (!el || !hl) return;
    hl.style.width = `${el.offsetWidth}px`;
    hl.style.transform = `translateX(${el.offsetLeft}px)`;
  }, [current]);

  const setActive = useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return;
    setCurrent(i);
    setMountKey((k) => k + 1);
    const url = new URL(location.href);
    url.searchParams.set("v", String(i + 1));
    history.replaceState(null, "", url);
  }, []);

  const toggleSkin = useCallback(() => {
    setCodex((on) => {
      const url = new URL(location.href);
      if (on) url.searchParams.delete("s");
      else url.searchParams.set("s", "codex");
      history.replaceState(null, "", url);
      return !on;
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const v = Number.parseInt(params.get("v") ?? "", 10);
    if (v >= 1 && v <= VARIANTS.length) setCurrent(v - 1);
    setCodex(params.get("s") === "codex");
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  }, []);

  useLayoutEffect(() => {
    moveHighlight();
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [moveHighlight]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= VARIANTS.length) setActive(num - 1);
      else if (e.key === "ArrowRight") setActive((current + 1) % VARIANTS.length);
      else if (e.key === "ArrowLeft") setActive((current - 1 + VARIANTS.length) % VARIANTS.length);
      else if (e.key === "r" || e.key === "R") setMountKey((k) => k + 1);
      else if (e.key === "s" || e.key === "S") toggleSkin();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, setActive, toggleSkin]);

  const { Component } = VARIANTS[current]!;

  return (
    <>
      <div id="stage" data-skin={codex ? "codex" : undefined}>
        <Component key={mountKey} />
      </div>
      <nav className="proto-picker" aria-label="Prototype variants" data-ready={ready || undefined}>
        <span className="proto-picker-highlight" aria-hidden="true" ref={highlightRef} />
        {VARIANTS.map((variant, i) => (
          <button
            key={variant.name}
            type="button"
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="proto-picker-item"
            data-active={i === current || undefined}
            aria-current={i === current ? "true" : undefined}
            onClick={() => setActive(i)}
          >
            {variant.name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          type="button"
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={() => setMountKey((k) => k + 1)}
        >
          ↻
        </button>
        <button
          type="button"
          className="proto-picker-item"
          aria-pressed={codex}
          aria-label="Codex skin (S)"
          data-active={codex || undefined}
          onClick={toggleSkin}
        >
          Codex
        </button>
      </nav>
    </>
  );
}
