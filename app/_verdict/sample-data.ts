export type SampleCard = { handle: string; src: string; avatar: string; name?: string };
export type SampleJob = { url: string; org: string; title: string };

/** Names and avatars come from each public X profile (fxtwitter, 2026-09-29); @bentlegen 404s there, so it has no name. */
export const SAMPLE_CARDS: readonly SampleCard[] = [
  { handle: "bentlegen", src: "/top9/bentlegen.jpg", avatar: "/top9/avatars/bentlegen.jpg" },
  { handle: "dorryspears", src: "/top9/dorryspears.jpg", avatar: "/top9/avatars/dorryspears.jpg", name: "Dorry" },
  { handle: "grichadev", src: "/top9/grichadev.jpg", avatar: "/top9/avatars/grichadev.jpg", name: "Greg Pstrucha" },
  { handle: "theo", src: "/top9/theo.jpg", avatar: "/top9/avatars/theo.jpg", name: "Theo - t3.gg" },
  { handle: "sergical", src: "/top9/sergical.jpg", avatar: "/top9/avatars/sergical.jpg", name: "Serge" },
  { handle: "justalexoki", src: "/top9/justalexoki.jpg", avatar: "/top9/avatars/justalexoki.jpg", name: "taoki" },
  { handle: "linkofsunshine", src: "/top9/linkofsunshine.jpg", avatar: "/top9/avatars/linkofsunshine.jpg", name: "Basil🧡" },
];

/** Live postings, checked against the Ashby and Greenhouse board APIs on 2026-09-29. */
export const SAMPLE_JOBS: readonly SampleJob[] = [
  { url: "https://jobs.ashbyhq.com/sentry/7ed2b263-3873-44c6-a730-2ca96100c58f", org: "Sentry", title: "Senior Developer Experience Engineer" },
  { url: "https://jobs.ashbyhq.com/linear/069c4628-88d7-4e4d-b393-c996fc7f3076", org: "Linear", title: "Senior / Staff Product Engineer" },
  { url: "https://job-boards.greenhouse.io/roblox/jobs/7826363", org: "Roblox", title: "Design Engineer" },
  { url: "https://jobs.ashbyhq.com/sentry/af7fab29-5d68-4041-9794-de4de3f41953", org: "Sentry", title: "Senior Staff Software Engineer, Platform" },
  { url: "https://job-boards.greenhouse.io/cloudflare/jobs/8168623", org: "Cloudflare", title: "Software Engineer, Platforms & Productivity" },
  { url: "https://jobs.ashbyhq.com/sentry/95d2eeab-291d-40ad-97a2-86b104f3c7ad", org: "Sentry", title: "Senior Software Engineer, AI Evals" },
  { url: "https://jobs.ashbyhq.com/sentry/ac1cb3c4-5408-4912-8591-eea2a84480b7", org: "Sentry", title: "Security Engineer, Detection & Response" },
  { url: "https://jobs.ashbyhq.com/sentry/c3ed6481-f031-4fe9-a456-775b7b3d2eda", org: "Sentry", title: "Staff Software Engineer, Issues" },
  { url: "https://jobs.ashbyhq.com/sentry/ee90f315-6ff3-4e63-a11d-1dcfa2a863b4", org: "Sentry", title: "Senior Software Engineer (iOS), SDK" },
  { url: "https://jobs.ashbyhq.com/sentry/c796cd46-d80c-4ea8-9b0d-0eecbfc1353e", org: "Sentry", title: "Senior Software Engineer, Agent Tracing" },
];

export function sampleJobFor(url: string): SampleJob | undefined {
  return SAMPLE_JOBS.find((job) => job.url === url.trim());
}
