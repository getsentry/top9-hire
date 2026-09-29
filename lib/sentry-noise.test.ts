import assert from "node:assert/strict";
import test from "node:test";
import { BROWSER_TIMING_SPAN_OPS, NEXT_INTERNAL_SPAN_NAMES } from "./sentry-noise.ts";

const dropped = (name: string) => NEXT_INTERNAL_SPAN_NAMES.some((pattern) => pattern.test(name));

test("Next internal span names match", () => {
  for (const name of [
    "start response",
    "build component tree",
    "resolve page components",
    "render route (app) /",
    "executing api route (app) /api/extract",
    "NextNodeServer.findPageComponents",
    "resolve root layout server component",
    "resolve page server component /",
    "Layout",
    "Page",
  ]) {
    assert.ok(dropped(name), name);
  }
});

test("product spans do not match", () => {
  for (const name of [
    "POST /",
    "top9.games",
    "invoke_agent top9.breakdown.job",
    "GET https://boards-api.greenhouse.io/v1/boards/x/jobs/1",
  ]) {
    assert.ok(!dropped(name), name);
  }
});

test("browser timing ops match, kept ops do not", () => {
  for (const op of ["browser.dns", "browser.tls_ssl", "browser.paint", "ui.long_animation_frame", "ui.long_task"]) {
    assert.ok(BROWSER_TIMING_SPAN_OPS.test(op), op);
  }
  for (const op of ["pageload", "navigation", "ui.interaction.click", "http.client", "ui.webvital.lcp"]) {
    assert.ok(!BROWSER_TIMING_SPAN_OPS.test(op), op);
  }
});
