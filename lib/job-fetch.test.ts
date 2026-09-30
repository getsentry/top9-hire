import assert from "node:assert/strict";
import { test } from "node:test";
import { PrivateAddressError, fetchAnyJob, fetchWebPosting, guardedLookup, isPublicAddress, type Lookup } from "./job-fetch.ts";
import { JOB_PAGE_UNREADABLE, JobFetchError } from "./job.ts";
import { parseJobUrl } from "./job-url.ts";

const PAGE =
  "<html><head><title>Payments Engineer</title></head><body><main>You will build and run the payments platform for millions.</main></body></html>";

const publicLookup: Lookup = async () => [{ address: "93.184.216.34" }];

function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
}

test("isPublicAddress refuses private, loopback, link-local, CGNAT, multicast, and unspecified ranges", () => {
  for (const address of [
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "not an address",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("isPublicAddress accepts public addresses", () => {
  for (const address of [
    "93.184.216.34",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:2800:220:1:248:1893:25c8:1946",
    "::ffff:8.8.8.8",
  ]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test("a page is read with a manual redirect, an html accept header, and a plain user agent", async () => {
  const posting = await fetchWebPosting("https://example.com/j/1", {
    lookup: publicLookup,
    fetcher: async (_input, init) => {
      assert.equal(init?.redirect, "manual");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("accept"), "text/html");
      assert.match(headers.get("user-agent") ?? "", /^top9-hire/);
      return html(PAGE);
    },
  });
  assert.equal(posting.title, "Payments Engineer");
  assert.equal(posting.pageUrl, "https://example.com/j/1");
});

test("a host that resolves to a private address is refused before any fetch", async () => {
  let fetched = false;
  await assert.rejects(
    () =>
      fetchWebPosting("https://example.com/j/1", {
        lookup: async () => [{ address: "93.184.216.34" }, { address: "10.0.0.5" }],
        fetcher: async () => {
          fetched = true;
          return html(PAGE);
        },
      }),
    /private address/,
  );
  assert.equal(fetched, false);
});

test("a redirect to a private address is refused on the second hop", async () => {
  const seen: string[] = [];
  await assert.rejects(
    () =>
      fetchWebPosting("https://example.com/j/1", {
        lookup: async (host) => [{ address: host === "internal-app.example.org" ? "192.168.0.9" : "93.184.216.34" }],
        fetcher: async (input) => {
          seen.push(input.toString());
          return new Response(null, { status: 302, headers: { location: "https://internal-app.example.org/x" } });
        },
      }),
    /private address/,
  );
  assert.deepEqual(seen, ["https://example.com/j/1"]);
});

test("a redirect to an IP literal or plain http is refused", async () => {
  for (const location of ["https://127.0.0.1/", "http://example.com/j/1"]) {
    await assert.rejects(
      () =>
        fetchWebPosting("https://example.com/j/1", {
          lookup: publicLookup,
          fetcher: async () => new Response(null, { status: 301, headers: { location } }),
        }),
      /redirected somewhere/,
      location,
    );
  }
});

test("at most three redirects are followed", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchWebPosting("https://example.com/j/0", {
        lookup: publicLookup,
        fetcher: async () => {
          calls += 1;
          return new Response(null, { status: 302, headers: { location: `/j/${calls}` } });
        },
      }),
    /too many times/,
  );
  assert.equal(calls, 4);
  const posting = await fetchWebPosting("https://example.com/j/0", {
    lookup: publicLookup,
    fetcher: async (input) =>
      input.toString().endsWith("/j/3")
        ? html(PAGE)
        : new Response(null, { status: 302, headers: { location: `/j/${Number(input.toString().slice(-1)) + 1}` } }),
  });
  assert.equal(posting.pageUrl, "https://example.com/j/0");
});

test("non-html content and oversized bodies are refused", async () => {
  await assert.rejects(
    () =>
      fetchWebPosting("https://example.com/a.pdf", {
        lookup: publicLookup,
        fetcher: async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }),
      }),
    /not a web page/,
  );
  await assert.rejects(
    () =>
      fetchWebPosting("https://example.com/big", {
        lookup: publicLookup,
        fetcher: async () => html("a".repeat(1_000_001)),
      }),
    /too large/,
  );
});

test("a page with no readable description throws the unreadable message", async () => {
  await assert.rejects(
    () =>
      fetchWebPosting("https://example.com/spa", {
        lookup: publicLookup,
        fetcher: async () => html("<title>Jobs</title><body><div id=root></div></body>"),
      }),
    (error: unknown) => error instanceof JobFetchError && error.message === JOB_PAGE_UNREADABLE,
  );
});

test("fetchAnyJob sends ATS jobs to their fixed host and web jobs through the checks", async () => {
  const lever = parseJobUrl("https://jobs.lever.co/spotify/2193db3f-77c5-43b8-b030-8f92c9882bf1");
  assert.ok(lever);
  const seen: string[] = [];
  await fetchAnyJob(lever, {
    lookup: async () => {
      throw new Error("ATS hosts skip the lookup");
    },
    fetcher: async (input) => {
      seen.push(new URL(input.toString()).hostname);
      return new Response(JSON.stringify({ text: "Engineer", descriptionPlain: "Build the listening client for millions of people." }));
    },
  });
  assert.deepEqual(seen, ["api.lever.co"]);

  const web = parseJobUrl("https://localhost.example.com/j/1");
  assert.ok(web);
  await assert.rejects(
    () => fetchAnyJob(web, { lookup: async () => [{ address: "127.0.0.1" }], fetcher: async () => html(PAGE) }),
    /private address/,
  );
});

test("a host that answers public for the check and private at connect is refused", async () => {
  let calls = 0;
  const lookup: Lookup = async () => [{ address: ++calls === 1 ? "93.184.216.34" : "10.0.0.5" }];
  await assert.rejects(() => fetchWebPosting("https://example.com/j/1", { lookup }), /private address/);
  assert.ok(calls >= 2);
});

test("guardedLookup passes public answers through and marks private ones", async () => {
  const answer = (lookup: Lookup, all: boolean) =>
    new Promise<{ error: unknown; address: unknown; family: unknown }>((resolve) => {
      guardedLookup(lookup)("example.com", { all }, (error, address, family) => resolve({ error, address, family }));
    });
  const publicLookup: Lookup = async () => [{ address: "93.184.216.34" }, { address: "2606:2800:220:1::1" }];
  const many = await answer(publicLookup, true);
  assert.equal(many.error, null);
  assert.deepEqual(many.address, [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1::1", family: 6 },
  ]);
  const one = await answer(publicLookup, false);
  assert.equal(one.address, "93.184.216.34");
  assert.equal(one.family, 4);
  const refused = await answer(async () => [{ address: "93.184.216.34" }, { address: "10.0.0.5" }], true);
  assert.ok(refused.error instanceof PrivateAddressError);
  const empty = await answer(async () => [], false);
  assert.ok(empty.error instanceof PrivateAddressError);
});
