/** Job-link parsing only. Client-safe: must not import server code or node:*. */

/** Message for any pasted link that is not a public https job page. */
export const JOB_URL_REJECTED = "Paste a public https link to the job posting.";
/** Message for LinkedIn job links, which sit behind a login. */
export const JOB_URL_LINKEDIN =
  "LinkedIn job pages need a login. Paste the company's own careers link instead.";
/** Message for X or Twitter post links pasted as a job. */
export const JOB_URL_POST =
  "That is a post link, not a job posting. Paste the company's careers link.";

const GREENHOUSE_PAGE_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
]);
/** The only hosts the server may fetch ATS postings from. */
export const GREENHOUSE_API_HOST = "boards-api.greenhouse.io";
export const ASHBY_HOST = "jobs.ashbyhq.com";
const LEVER_PAGE_HOST = "jobs.lever.co";
export const LEVER_API_HOST = "api.lever.co";

const BOARD_TOKEN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const JOB_ID = /^[0-9]{1,15}$/;
const ASHBY_ORG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ASHBY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LEVER_ORG = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const LEVER_ID = ASHBY_ID;

// Hosts that can never serve a public posting; the first two never resolve to a public address.
const PRIVATE_SUFFIXES = [".local", ".internal", ".localhost", ".test"];
const LINKEDIN = /(^|\.)linkedin\.com$/;
const POST_HOSTS = /(^|\.)(x|twitter)\.com$/;

/** The exact shape a pasted job link locks to; `fetchUrl` is the only address the server may call. */
export type LockedJob =
  | {
      source: "greenhouse";
      board: string;
      id: string;
      pageUrl: string;
      fetchUrl: string;
    }
  | {
      source: "ashby";
      org: string;
      id: string;
      pageUrl: string;
      fetchUrl: string;
    }
  | {
      source: "lever";
      org: string;
      id: string;
      pageUrl: string;
      fetchUrl: string;
    }
  | {
      source: "web";
      pageUrl: string;
      fetchUrl: string;
    };

function segment(raw: string, pattern: RegExp): string | null {
  if (raw.includes("%") || raw.includes("\\") || raw.includes("/") || raw.includes(".")) {
    return null;
  }
  const value = raw.toLowerCase();
  if (!pattern.test(value)) return null;
  return value;
}

/** True when the URL is https on exactly this host, with no port or credentials. */
export function isLockedHttps(url: URL, host: string): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname === host &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function isDnsName(host: string): boolean {
  if (host.includes(":") || host.includes("[") || host.endsWith(".")) return false;
  if (host === "localhost" || !host.includes(".")) return false;
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  // A numeric last label means an IPv4 literal, in any spelling the URL parser leaves alone.
  return /[a-z]/.test(host.slice(host.lastIndexOf(".") + 1));
}

/** The specific reason a pasted link cannot be a job, when there is one. Null means the generic rejection applies. */
export function jobUrlProblem(input: string): string | null {
  let host: string;
  try {
    host = new URL(input.trim()).hostname;
  } catch {
    return null;
  }
  if (LINKEDIN.test(host)) return JOB_URL_LINKEDIN;
  if (POST_HOSTS.test(host)) return JOB_URL_POST;
  return null;
}

/** Locks a pasted link to a known ATS API or a public web page. Null when it is unsafe or unsupported; never throws. */
export function parseJobUrl(input: string): LockedJob | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);

  if (GREENHOUSE_PAGE_HOSTS.has(host)) {
    let board: string | null = null;
    let id: string | null = null;
    if (parts.length === 3 && parts[1] === "jobs") {
      board = segment(parts[0] ?? "", BOARD_TOKEN);
      id = segment(parts[2] ?? "", JOB_ID);
    } else if (parts.length === 2 && parts[0] === "embed" && parts[1] === "job_app") {
      board = segment(url.searchParams.get("for") ?? "", BOARD_TOKEN);
      id = segment(url.searchParams.get("token") ?? "", JOB_ID);
    }
    if (!board || !id) return null;
    const fetchUrl = new URL(
      `/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}`,
      `https://${GREENHOUSE_API_HOST}`,
    );
    if (!isLockedHttps(fetchUrl, GREENHOUSE_API_HOST)) return null;
    if (fetchUrl.pathname !== `/v1/boards/${board}/jobs/${id}` || fetchUrl.search !== "") {
      return null;
    }
    return {
      source: "greenhouse",
      board,
      id,
      pageUrl: `https://job-boards.greenhouse.io/${board}/jobs/${id}`,
      fetchUrl: fetchUrl.toString(),
    };
  }

  if (host === ASHBY_HOST) {
    const org = segment(parts[0] ?? "", ASHBY_ORG);
    const id = segment(parts[1] ?? "", ASHBY_ID);
    const tail = parts[2];
    if (!org || !id) return null;
    if (parts.length === 3 && tail !== "application") return null;
    if (parts.length > 3) return null;
    const fetchUrl = new URL(
      `/${encodeURIComponent(org)}/${encodeURIComponent(id)}`,
      `https://${ASHBY_HOST}`,
    );
    if (!isLockedHttps(fetchUrl, ASHBY_HOST)) return null;
    if (fetchUrl.pathname !== `/${org}/${id}` || fetchUrl.search !== "") return null;
    return {
      source: "ashby",
      org,
      id,
      pageUrl: fetchUrl.toString(),
      fetchUrl: fetchUrl.toString(),
    };
  }

  if (host === LEVER_PAGE_HOST) {
    const org = segment(parts[0] ?? "", LEVER_ORG);
    const id = segment(parts[1] ?? "", LEVER_ID);
    if (!org || !id) return null;
    if (parts.length > 3 || (parts.length === 3 && parts[2] !== "apply")) return null;
    const fetchUrl = new URL(
      `/v0/postings/${encodeURIComponent(org)}/${encodeURIComponent(id)}`,
      `https://${LEVER_API_HOST}`,
    );
    if (!isLockedHttps(fetchUrl, LEVER_API_HOST)) return null;
    if (fetchUrl.pathname !== `/v0/postings/${org}/${id}` || fetchUrl.search !== "") return null;
    return {
      source: "lever",
      org,
      id,
      pageUrl: `https://${LEVER_PAGE_HOST}/${org}/${id}`,
      fetchUrl: fetchUrl.toString(),
    };
  }

  if (!isDnsName(host)) return null;
  if (LINKEDIN.test(host) || POST_HOSTS.test(host)) return null;
  url.hash = "";
  const pageUrl = url.toString();
  return { source: "web", pageUrl, fetchUrl: pageUrl };
}
