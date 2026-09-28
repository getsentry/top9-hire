import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PROOF_CASES } from "./__fixtures__/proof-cases.ts";
import { parsePaste } from "./hire.ts";
import {
  JOB_URL_REJECTED,
  JobFetchError,
  fetchJobPosting,
  htmlToText,
  parseJobUrl,
  postingFromAshby,
  postingFromGreenhouse,
} from "./job.ts";

const ASHBY_ID = "7ed2b263-3873-44c6-a730-2ca96100c58f";
const PLATFORMS = "https://boards.greenhouse.io/cloudflare/jobs/8168623";
const LOAD_BALANCING = "https://boards.greenhouse.io/cloudflare/jobs/8212352";

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
}

test("proof pastes are labeled fixtures with nine titles", () => {
  assert.equal(PROOF_CASES.length, 3);
  for (const proof of PROOF_CASES) {
    assert.equal(proof.fixture, true, proof.id);
    const parsed = parsePaste(proof.paste, proof.who);
    assert.equal(parsed.ok, true, proof.id);
  }
});

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
  assert.equal(JOB_URL_REJECTED.includes("No description was fetched"), true);
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
    "https://example.com/jobs/1",
    "https://boards.greenhouse.io.evil.com/cloudflare/jobs/1",
    "https://evil.boards.greenhouse.io/cloudflare/jobs/1",
    "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/1",
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

test("htmlToText decodes greenhouse entities and drops scripts", () => {
  const text = htmlToText(
    "&lt;h3&gt;About&lt;/h3&gt;&lt;p&gt;Build developer tools for the team and the docs.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
  );
  assert.equal(text.includes("alert"), false);
  assert.equal(text.includes("<"), false);
  assert.match(text, /Build developer tools/);
});

test("greenhouse fixture becomes a posting without the script", () => {
  const body = JSON.parse(fixture("greenhouse-platforms.json"));
  const posting = postingFromGreenhouse(
    body,
    "https://job-boards.greenhouse.io/cloudflare/jobs/8168623",
  );
  assert.equal(posting.title, "Software Engineer - Platforms & Productivity");
  assert.match(posting.text, /Cloudflare/);
  assert.match(posting.text, /Developer Productivity/);
  assert.equal(posting.text.includes("alert"), false);
});

test("ashby fixture reads descriptionHtml and drops the script", () => {
  const posting = postingFromAshby(
    fixture("ashby-sentry-dx.html"),
    `https://jobs.ashbyhq.com/sentry/${ASHBY_ID}`,
    ASHBY_ID,
  );
  assert.equal(posting.title, "Senior Developer Experience Engineer");
  assert.match(posting.text, /developer docs/);
  assert.equal(posting.text.includes("alert"), false);
});

test("ashby json escapes are decoded", () => {
  const html = `{"posting":{"id":"${ASHBY_ID}","title":"Senior \\"DX\\"","descriptionHtml":"<p>Line\\nwith a quote \\"x\\" and a \\u2019 mark in the docs role.</p>"}}`;
  const posting = postingFromAshby(html, "https://jobs.ashbyhq.com/sentry/" + ASHBY_ID, ASHBY_ID);
  assert.equal(posting.title, 'Senior "DX"');
  assert.match(posting.text, /quote "x"/);
  assert.match(posting.text, /\u2019/);
});

test("a short description is refused", () => {
  assert.throws(
    () =>
      postingFromGreenhouse(
        { title: "Role", content: "<p>Hi</p>" },
        "https://job-boards.greenhouse.io/cloudflare/jobs/1",
      ),
    /No description was invented/,
  );
});

test("fetch uses only the locked url and refuses redirects", async () => {
  const locked = parseJobUrl(PLATFORMS);
  assert.ok(locked);
  const calls: string[] = [];
  await assert.rejects(
    () =>
      fetchJobPosting(locked, async (input, init) => {
        const href = input instanceof Request ? input.url : input.toString();
        calls.push(href);
        assert.equal(init?.redirect, "manual");
        assert.equal(new URL(href).hostname, "boards-api.greenhouse.io");
        return new Response("go", {
          status: 302,
          headers: { location: "http://127.0.0.1/" },
        });
      }),
    (error: unknown) => {
      assert.ok(error instanceof JobFetchError);
      assert.match(error.message, /redirected/);
      assert.match(error.message, /No description was fetched/);
      return true;
    },
  );
  assert.deepEqual(calls, [
    "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/8168623",
  ]);
});

test("a 404 does not invent a description", async () => {
  const locked = parseJobUrl(
    `https://jobs.ashbyhq.com/sentry/${ASHBY_ID}`,
  );
  assert.ok(locked);
  await assert.rejects(
    () =>
      fetchJobPosting(locked, async () => new Response("missing", { status: 404 })),
    /returned 404/,
  );
});

test("greenhouse fetch parses the api body", async () => {
  const locked = parseJobUrl("https://job-boards.greenhouse.io/cloudflare/jobs/8168623");
  assert.ok(locked);
  const posting = await fetchJobPosting(locked, async (input) => {
    assert.equal(
      input.toString(),
      "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/8168623",
    );
    return new Response(fixture("greenhouse-platforms.json"), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(posting.source, "greenhouse");
  assert.match(posting.text, /internal tools/);
});
