import {
  ASHBY_HOST,
  GREENHOUSE_API_HOST,
  LEVER_API_HOST,
  isLockedHttps,
  type LockedJob,
} from "./job-url.ts";

export const JOB_PAGE_UNREADABLE =
  "We couldn't read a job description on that page. Try the posting's direct link.";

export const MAX_JOB_BYTES = 1_000_000;
const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 12_000;

export class JobFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFetchError";
  }
}

export type JobPosting = {
  source: "greenhouse" | "ashby" | "lever" | "web";
  title: string;
  pageUrl: string;
  text: string;
};


function lockedHttps(url: URL, host: string): void {
  if (!isLockedHttps(url, host)) {
    throw new JobFetchError("Refusing to call an unexpected job host.");
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return entity;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? entity;
  });
}

export function htmlToText(html: string): string {
  let decoded = html;
  for (let i = 0; i < 2; i++) decoded = decodeEntities(decoded);
  const stripped = decoded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");
  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function clipDescription(description: string): string {
  if (description.length < MIN_DESCRIPTION) {
    throw new JobFetchError(
      "That job page had no description. No description was invented.",
    );
  }
  if (description.length <= MAX_DESCRIPTION) return description;
  return `${description.slice(0, MAX_DESCRIPTION)}\n\n[truncated]`;
}

export function postingFromGreenhouse(body: unknown, pageUrl: string): JobPosting {
  if (!body || typeof body !== "object") {
    throw new JobFetchError(
      "That job page did not include a description. No description was invented.",
    );
  }
  const record = body as { title?: unknown; company_name?: unknown; content?: unknown };
  if (typeof record.title !== "string" || typeof record.content !== "string") {
    throw new JobFetchError(
      "That job page did not include a description. No description was invented.",
    );
  }
  const title = record.title.trim();
  if (!title) {
    throw new JobFetchError(
      "That job page did not include a description. No description was invented.",
    );
  }
  const description = clipDescription(htmlToText(record.content));
  const company = typeof record.company_name === "string" ? record.company_name.trim() : "";
  const text = company ? `${title}\n${company}\n\n${description}` : `${title}\n\n${description}`;
  return { source: "greenhouse", title, pageUrl, text };
}

function decodeJsonString(source: string, start: number): string | null {
  let out = "";
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === undefined) return null;
    if (char === '"') return out;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = source[i + 1];
    if (next === undefined) return null;
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "u") {
      const hex = source.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 4;
    } else {
      out += next;
    }
  }
  return null;
}

function readKeyedString(source: string, key: string): string | null {
  const marker = `"${key}":"`;
  const at = source.indexOf(marker);
  if (at < 0) return null;
  return decodeJsonString(source, at + marker.length);
}

export function postingFromAshby(html: string, pageUrl: string, id: string): JobPosting {
  const marker = new RegExp(`"posting"\\s*:\\s*\\{\\s*"id"\\s*:\\s*"${id}"`);
  const match = marker.exec(html);
  if (!match) {
    throw new JobFetchError(
      "That job page did not include a description. No description was invented.",
    );
  }
  const slice = html.slice(match.index, match.index + 200_000);
  const title = readKeyedString(slice, "title")?.trim() ?? "";
  const descriptionHtml = readKeyedString(slice, "descriptionHtml");
  if (!title || descriptionHtml == null) {
    throw new JobFetchError(
      "That job page did not include a description. No description was invented.",
    );
  }
  const description = clipDescription(htmlToText(descriptionHtml));
  return {
    source: "ashby",
    title,
    pageUrl,
    text: `${title}\n\n${description}`,
  };
}

export function postingFromLever(body: unknown, pageUrl: string): JobPosting {
  const empty = () =>
    new JobFetchError("That job page did not include a description. No description was invented.");
  if (!body || typeof body !== "object") throw empty();
  const record = body as {
    text?: unknown;
    descriptionPlain?: unknown;
    lists?: unknown;
    additionalPlain?: unknown;
  };
  const title = typeof record.text === "string" ? record.text.trim() : "";
  if (!title) throw empty();
  const sections: string[] = [];
  if (typeof record.descriptionPlain === "string") sections.push(record.descriptionPlain.trim());
  if (Array.isArray(record.lists)) {
    for (const list of record.lists as { text?: unknown; content?: unknown }[]) {
      if (!list || typeof list.content !== "string") continue;
      const heading = typeof list.text === "string" ? list.text.trim() : "";
      const items = htmlToText(list.content);
      if (items) sections.push(heading ? `${heading}\n${items}` : items);
    }
  }
  if (typeof record.additionalPlain === "string") sections.push(record.additionalPlain.trim());
  const description = clipDescription(sections.filter(Boolean).join("\n\n"));
  return { source: "lever", title, pageUrl, text: `${title}\n\n${description}` };
}

function jobPostingNodes(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) jobPostingNodes(item, out);
  } else if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    const type = node["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) out.push(node);
    jobPostingNodes(node["@graph"], out);
  }
  return out;
}

function metaContent(html: string, property: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key?.toLowerCase() !== property) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (value) return value;
  }
  return null;
}

/** Reads a generic careers page: schema.org JobPosting JSON-LD first, then the page's own title and main text. */
export function postingFromWebPage(html: string, pageUrl: string): JobPosting {
  const unreadable = () => new JobFetchError(JOB_PAGE_UNREADABLE);
  const blocks = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\b[^>]*>/gi,
  );
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1] ?? "");
    } catch {
      continue;
    }
    for (const node of jobPostingNodes(data)) {
      const title = typeof node.title === "string" ? htmlToText(node.title) : "";
      const description = typeof node.description === "string" ? htmlToText(node.description) : "";
      if (!title || description.length < MIN_DESCRIPTION) continue;
      const org = node.hiringOrganization;
      const company =
        org && typeof org === "object" && typeof (org as { name?: unknown }).name === "string"
          ? ((org as { name: string }).name).trim()
          : "";
      const clipped = clipDescription(description);
      return {
        source: "web",
        title,
        pageUrl,
        text: company ? `${title}\n${company}\n\n${clipped}` : `${title}\n\n${clipped}`,
      };
    }
  }

  const rawTitle =
    metaContent(html, "og:title") ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const title = htmlToText(rawTitle).replace(/\s+/g, " ");
  const region =
    /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ??
    /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] ??
    /<body\b[\s\S]*?(?:<\/body>|$)/i.exec(html)?.[0] ??
    "";
  const description = htmlToText(
    region.replace(/<(noscript|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " "),
  );
  if (!title || description.length < MIN_DESCRIPTION) throw unreadable();
  return { source: "web", title, pageUrl, text: `${title}\n\n${clipDescription(description)}` };
}

/** Reads a job page or ATS API body, throwing JobFetchError once it passes MAX_JOB_BYTES (byte cap). */
export async function readJobBodyCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_JOB_BYTES) {
    throw new JobFetchError("That job page was too large to read. No description was invented.");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MAX_JOB_BYTES) {
      await reader.cancel();
      throw new JobFetchError("That job page was too large to read. No description was invented.");
    }
    chunks.push(part.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function fetchJobPosting(
  job: LockedJob,
  fetcher: typeof fetch = fetch,
): Promise<JobPosting> {
  const url = new URL(job.fetchUrl);
  if (job.source === "web") {
    throw new JobFetchError("Refusing to call an unexpected job host.");
  }
  const host =
    job.source === "greenhouse"
      ? GREENHOUSE_API_HOST
      : job.source === "lever"
        ? LEVER_API_HOST
        : ASHBY_HOST;
  lockedHttps(url, host);
  const expectedPath =
    job.source === "greenhouse"
      ? `/v1/boards/${job.board}/jobs/${job.id}`
      : job.source === "lever"
        ? `/v0/postings/${job.org}/${job.id}`
        : `/${job.org}/${job.id}`;
  if (url.pathname !== expectedPath) {
    throw new JobFetchError("Refusing to call an unexpected job host.");
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      redirect: "manual",
      headers: {
        accept: job.source === "ashby" ? "text/html" : "application/json",
        "user-agent": "top9-hire/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (error instanceof JobFetchError) throw error;
    throw new JobFetchError("That job page could not be reached. No description was invented.");
  }

  if (response.status >= 300 && response.status < 400) {
    throw new JobFetchError("That job page redirected. No description was fetched.");
  }
  if (response.status === 404) {
    throw new JobFetchError("That job page returned 404. No description was invented.");
  }
  if (response.status !== 200) {
    throw new JobFetchError(
      `That job page could not be loaded (HTTP ${response.status}). No description was invented.`,
    );
  }

  const bytes = await readJobBodyCapped(response);
  const raw = new TextDecoder().decode(bytes);
  if (job.source === "greenhouse" || job.source === "lever") {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new JobFetchError(
        "That job page did not include a description. No description was invented.",
      );
    }
    return job.source === "lever"
      ? postingFromLever(body, job.pageUrl)
      : postingFromGreenhouse(body, job.pageUrl);
  }
  return postingFromAshby(raw, job.pageUrl, job.id);
}
