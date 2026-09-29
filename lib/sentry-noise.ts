/** Spans that only show framework or browser plumbing. The trace is the product's explainer, so they are dropped. */
export const NEXT_INTERNAL_SPAN_NAMES: RegExp[] = [
  /^start response$/,
  /^build component tree$/,
  /^resolve page components$/,
  /^resolve root layout server component$/,
  /^resolve page server component\b/,
  /^render route \(app\)/,
  /^executing api route \(app\)/,
  /^NextNodeServer\./,
  /^(Layout|Page)$/,
];

/** Resource ops the browser tracing integration drops through `ignoreResourceSpans`. */
export const BROWSER_RESOURCE_OPS = [
  "resource.script",
  "resource.css",
  "resource.img",
  "resource.link",
  "resource.iframe",
  "resource.other",
];

/** Performance API timing spans that `browserTracingIntegration` has no option for. */
export const BROWSER_TIMING_SPAN_OPS: RegExp =
  /^(browser\.(dns|tls_ssl|cache|connect|request|response|redirect|paint|dom_content_loaded_event|load_event|unload_event)|ui\.long_animation_frame|ui\.long_task)$/;
