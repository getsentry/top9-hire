import assert from "node:assert/strict";
import { test } from "node:test";
import { PROOF_CASES } from "./__fixtures__/proof-cases.ts";
import { JOB_URL_REJECTED, jobUrlProblem, parseJobUrl } from "./job-url.ts";

const ASHBY_ID = "7ed2b263-3873-44c6-a730-2ca96100c58f";
const LEVER_ID = "2193db3f-77c5-43b8-b030-8f92c9882bf1";

const PLATFORMS = "https://boards.greenhouse.io/cloudflare/jobs/8168623";
const LOAD_BALANCING = "https://boards.greenhouse.io/cloudflare/jobs/8212352";

test("proof job URLs lock to Greenhouse API or Ashby", () => {
  const sergiy = parseJobUrl(PROOF_CASES[0]?.jobUrl ?? "");
  assert.equal(sergiy?.source, "ashby");
  assert.equal(
    sergiy?.fetchUrl,
    `https://jobs.ashbyhq.com/sentry/${ASHBY_ID}`,
  );

  const platforms = parseJobUrl(PLATFORMS);
  assert.equal(
    platforms?.fetchUrl,
    "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/8168623",
  );
  const balancing = parseJobUrl(LOAD_BALANCING);
  assert.equal(
    balancing?.fetchUrl,
    "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/8212352",
  );
  assert.equal(JOB_URL_REJECTED, "Paste a public https link to the job posting.");
});

test("greenhouse page hosts and the embed form share one API url", () => {
  const expected = "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/8168623";
  for (const input of [
    "https://boards.greenhouse.io/cloudflare/jobs/8168623?gh_jid=8168623",
    "https://job-boards.greenhouse.io/Cloudflare/jobs/8168623",
    "https://boards.greenhouse.io/embed/job_app?for=cloudflare&token=8168623",
    "https://job-boards.greenhouse.io/embed/job_app?for=cloudflare&token=8168623&gh_jid=1",
  ]) {
    assert.equal(parseJobUrl(input)?.fetchUrl, expected, input);
  }
});

test("ashby application links drop the extra segment", () => {
  const locked = parseJobUrl(
    `https://jobs.ashbyhq.com/Sentry/${ASHBY_ID.toUpperCase()}/application?gh_src=x`,
  );
  assert.equal(locked?.pageUrl, `https://jobs.ashbyhq.com/sentry/${ASHBY_ID}`);
  assert.equal(locked?.fetchUrl, locked?.pageUrl);
});

test("disallowed job URLs are rejected and not fetched", () => {
  const rejected = [
    "http://boards.greenhouse.io/cloudflare/jobs/1",
    "https://user:pass@boards.greenhouse.io/cloudflare/jobs/1",
    "https://boards.greenhouse.io:444/cloudflare/jobs/1",
    "https://boards.greenhouse.io/cloudflare/jobs/1/../../admin",
    "https://boards.greenhouse.io/cloudflare/jobs/8168623%2f..%2fadmin",
    "https://jobs.ashbyhq.com/sentry/../secret",
    "https://jobs.ashbyhq.com/sentry/not-a-uuid",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
  ];
  for (const input of rejected) {
    assert.equal(parseJobUrl(input), null, input);
  }
});

test("lever links normalize to the posting page and the public api", () => {
  for (const input of [
    `https://jobs.lever.co/spotify/${LEVER_ID}`,
    `https://jobs.lever.co/spotify/${LEVER_ID}/apply`,
    `https://jobs.lever.co/spotify/${LEVER_ID}?lever-source=x`,
  ]) {
    const locked = parseJobUrl(input);
    assert.equal(locked?.source, "lever", input);
    assert.equal(locked?.pageUrl, `https://jobs.lever.co/spotify/${LEVER_ID}`, input);
    assert.equal(locked?.fetchUrl, `https://api.lever.co/v0/postings/spotify/${LEVER_ID}`, input);
  }
  assert.equal(parseJobUrl(`https://jobs.lever.co/spotify/${LEVER_ID}/other`), null);
  assert.equal(parseJobUrl("https://jobs.lever.co/spotify"), null);
});

test("any public https dns name is a web job with the hash stripped and the query kept", () => {
  const locked = parseJobUrl("https://careers.example.com/jobs/42?gh_jid=42#apply");
  assert.equal(locked?.source, "web");
  assert.equal(locked?.pageUrl, "https://careers.example.com/jobs/42?gh_jid=42");
  assert.equal(locked?.fetchUrl, locked?.pageUrl);
  for (const input of [
    "https://example.com/jobs/1",
    "https://boards.greenhouse.io.evil.com/cloudflare/jobs/1",
    "https://evil.boards.greenhouse.io/cloudflare/jobs/1",
  ]) {
    assert.equal(parseJobUrl(input)?.source, "web", input);
  }
});

test("generic job URLs refuse non-https, literals, private names, credentials, and ports", () => {
  for (const input of [
    "http://example.com/jobs/1",
    "https://127.0.0.1/",
    "https://10.0.0.1/jobs",
    "https://[::1]/jobs",
    "https://2130706433/",
    "https://localhost/jobs",
    "https://intranet/jobs",
    "https://db.internal/jobs",
    "https://printer.local/jobs",
    "https://app.localhost/jobs",
    "https://site.test/jobs",
    "https://user:pass@example.com/jobs",
    "https://example.com:8443/jobs",
    "https://www.linkedin.com/jobs/view/1",
    "javascript:alert(1)",
  ]) {
    assert.equal(parseJobUrl(input), null, input);
  }
});

test("linkedin and post links get their own message; junk gets none", () => {
  assert.match(jobUrlProblem("https://www.linkedin.com/jobs/view/1") ?? "", /LinkedIn job pages need a login/);
  assert.match(jobUrlProblem("https://linkedin.com/jobs/view/1") ?? "", /LinkedIn/);
  assert.match(jobUrlProblem("https://x.com/someone") ?? "", /post link/);
  assert.equal(jobUrlProblem("https://example.com/jobs/1"), null);
  assert.equal(jobUrlProblem("not a url"), null);
});

test("post links never parse as jobs", () => {
  assert.equal(parseJobUrl("https://x.com/someone/status/123"), null);
  assert.equal(parseJobUrl("https://twitter.com/someone/status/123"), null);
});
