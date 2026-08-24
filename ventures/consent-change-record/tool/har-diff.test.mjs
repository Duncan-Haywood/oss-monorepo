import test from "node:test";
import assert from "node:assert/strict";
import { diffHarCaptures } from "./har-diff.mjs";

function harOf(entries) {
  return { log: { version: "1.2", entries } };
}

function entry({ url, method = "GET", started = "2026-08-24T10:00:00.000Z", cookies = [] }) {
  return {
    startedDateTime: started,
    request: { method, url, headers: [], cookies: [] },
    response: { status: 200, headers: [], cookies, content: { size: 0, mimeType: "text/plain" } },
  };
}

test("reports no diff when both captures are identical", () => {
  const har = harOf([entry({ url: "https://example.com/" })]);
  const diff = diffHarCaptures(har, har);
  assert.equal(diff.summary.addedRequestCount, 0);
  assert.equal(diff.summary.removedRequestCount, 0);
});

test("flags a request that appears only after the consent choice", () => {
  const before = harOf([entry({ url: "https://example.com/" })]);
  const after = harOf([
    entry({ url: "https://example.com/" }),
    entry({ url: "https://www.google-analytics.com/collect?x=1" }),
  ]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.summary.addedRequestCount, 1);
  assert.equal(diff.addedRequests[0].hostname, "www.google-analytics.com");
  assert.deepEqual(diff.addedRequests[0].classification, { known: true, category: "analytics" });
});

test("flags a request that disappears after the consent choice (e.g. opting out)", () => {
  const before = harOf([
    entry({ url: "https://example.com/" }),
    entry({ url: "https://connect.facebook.net/tr" }),
  ]);
  const after = harOf([entry({ url: "https://example.com/" })]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.summary.removedRequestCount, 1);
  assert.equal(diff.removedRequests[0].hostname, "connect.facebook.net");
});

test("reports an added request to an unlisted domain as unclassified, not omitted", () => {
  const before = harOf([]);
  const after = harOf([entry({ url: "https://tracker.some-vendor.example/pixel" })]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.addedRequests.length, 1);
  assert.deepEqual(diff.addedRequests[0].classification, {
    known: false,
    category: "unclassified",
  });
});

test("treats the same endpoint as unchanged when only query params rotate", () => {
  const before = harOf([
    entry({ url: "https://www.google-analytics.com/g/collect?v=2&tid=G-AAA&cid=111&_z=1" }),
  ]);
  const after = harOf([
    entry({ url: "https://www.google-analytics.com/g/collect?v=2&tid=G-AAA&cid=222&_z=99#n" }),
  ]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.summary.addedRequestCount, 0);
  assert.equal(diff.summary.removedRequestCount, 0);
});

test("distinguishes requests by method as well as URL", () => {
  const before = harOf([entry({ url: "https://example.com/api", method: "GET" })]);
  const after = harOf([
    entry({ url: "https://example.com/api", method: "GET" }),
    entry({ url: "https://example.com/api", method: "POST" }),
  ]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.summary.addedRequestCount, 1);
  assert.equal(diff.addedRequests[0].method, "POST");
});

test("diffs cookies set via Set-Cookie in the response, grouped by hostname", () => {
  const before = harOf([entry({ url: "https://example.com/" })]);
  const after = harOf([
    entry({
      url: "https://example.com/",
      cookies: [{ name: "_ga", value: "1.2.3" }],
    }),
  ]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.addedCookies.length, 1);
  assert.equal(diff.addedCookies[0].name, "_ga");
  assert.equal(diff.addedCookies[0].hostname, "example.com");
});

test("rejects a capture that is not a HAR log", () => {
  assert.throws(() => diffHarCaptures({ not: "a har" }, harOf([])), /Not a HAR file/);
});

test("rejects an entry missing request.url with a clear message", () => {
  const malformed = harOf([{ request: {}, response: {} }]);
  assert.throws(() => diffHarCaptures(malformed, malformed), /missing request\.url/);
});
