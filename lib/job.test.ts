import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PROOF_CASES } from "./__fixtures__/proof-cases.ts";
import { parsePaste } from "./hire.ts";
import {
  JOB_PAGE_UNREADABLE,
  JOB_URL_REJECTED,
  JobFetchError,
  fetchJobPosting,
  htmlToText,
  jobUrlProblem,
  parseJobUrl,
  postingFromAshby,
  postingFromGreenhouse,
  postingFromLever,
  postingFromWebPage,
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

test("htmlToText drops script end tags that include spaces or attributes", () => {
  const samples = [
    '<script src="foo">alert(1)</script >',
    '<script src="foo">alert(1)</script foo="bar">',
    "<script src=\"foo\">alert(1)</script\t\n bar>",
    "<script \n>alert(1)</script>",
    "<style>alert(2)</style >",
  ];
  for (const sample of samples) {
    const text = htmlToText(
      `<p>Build developer tools for the team and the docs.</p>${sample}`,
    );
    assert.equal(text.includes("alert"), false, sample);
    assert.match(text, /developer tools/);
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

const LEVER_ID = "2193db3f-77c5-43b8-b030-8f92c9882bf1";

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

test("lever api body becomes a posting from text, description, lists, and additional", () => {
  const posting = postingFromLever(
    {
      text: "Android Engineer",
      descriptionPlain: "Build the listening client for millions of people.",
      lists: [{ text: "What You'll Do", content: "<li>Write Kotlin</li><li>Ship weekly</li>" }],
      additionalPlain: "We are an equal opportunity employer.",
    },
    "https://jobs.lever.co/spotify/x",
  );
  assert.equal(posting.source, "lever");
  assert.equal(posting.title, "Android Engineer");
  assert.match(posting.text, /listening client/);
  assert.match(posting.text, /What You'll Do\n+- Write Kotlin/);
  assert.match(posting.text, /equal opportunity/);
  assert.throws(() => postingFromLever({ descriptionPlain: "x".repeat(80) }, "u"), JobFetchError);
});

test("lever fetch calls only the api host", async () => {
  const locked = parseJobUrl(`https://jobs.lever.co/spotify/${LEVER_ID}`);
  assert.ok(locked);
  const posting = await fetchJobPosting(locked, async (input) => {
    assert.equal(input.toString(), `https://api.lever.co/v0/postings/spotify/${LEVER_ID}`);
    return new Response(
      JSON.stringify({ text: "Android Engineer", descriptionPlain: "Build the listening client for everyone." }),
      { status: 200 },
    );
  });
  assert.equal(posting.title, "Android Engineer");
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

const DESCRIPTION = "You will build and run the payments platform for millions of customers.";

test("web page JSON-LD JobPosting supplies title and description", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Payments Engineer",
    description: `<p>${DESCRIPTION}</p>`,
    hiringOrganization: { "@type": "Organization", name: "Acme" },
  })}</script></head><body>nav</body></html>`;
  const posting = postingFromWebPage(html, "https://example.com/j/1");
  assert.equal(posting.source, "web");
  assert.equal(posting.title, "Payments Engineer");
  assert.match(posting.text, /^Payments Engineer\nAcme\n\nYou will build/);
});

test("web page JSON-LD is found in @graph and top-level arrays", () => {
  const job = { "@type": "JobPosting", title: "SRE", description: DESCRIPTION };
  for (const data of [{ "@graph": [{ "@type": "WebSite" }, job] }, [{ "@type": "Organization" }, job]]) {
    const html = `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
    assert.equal(postingFromWebPage(html, "https://example.com/j/2").title, "SRE");
  }
});

test("web page without JSON-LD falls back to og:title and main text", () => {
  const html = `<html><head><title>Ignored</title><meta content="Staff Designer" property="og:title"></head>
    <body><nav>Home Jobs About us and many other links</nav><main><h1>Staff Designer</h1><p>${DESCRIPTION}</p></main><footer>Copyright</footer></body></html>`;
  const posting = postingFromWebPage(html, "https://example.com/j/3");
  assert.equal(posting.title, "Staff Designer");
  assert.match(posting.text, /payments platform/);
  assert.doesNotMatch(posting.text, /Home Jobs/);
});

test("web page fallback uses <title> and the body when there is no main", () => {
  const html = `<title>Data Analyst</title><body><div>${DESCRIPTION}</div></body>`;
  const posting = postingFromWebPage(html, "https://example.com/j/4");
  assert.equal(posting.title, "Data Analyst");
  assert.match(posting.text, /payments platform/);
});

test("a page with too little text throws the unreadable message", () => {
  assert.throws(
    () => postingFromWebPage("<title>Jobs</title><body><div id=root></div></body>", "https://example.com/j/5"),
    (error: unknown) => error instanceof JobFetchError && error.message === JOB_PAGE_UNREADABLE,
  );
});
