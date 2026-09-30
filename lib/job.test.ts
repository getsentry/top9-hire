import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PROOF_CASES } from "./__fixtures__/proof-cases.ts";
import { parsePaste } from "./hire.ts";
import {
  JOB_PAGE_UNREADABLE,
  JobFetchError,
  fetchJobPosting,
  htmlToText,
  postingFromAshby,
  postingFromGreenhouse,
  postingFromLever,
  postingFromWebPage,
} from "./job.ts";
import { parseJobUrl } from "./job-url.ts";

const ASHBY_ID = "7ed2b263-3873-44c6-a730-2ca96100c58f";
const PLATFORMS = "https://boards.greenhouse.io/cloudflare/jobs/8168623";

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
