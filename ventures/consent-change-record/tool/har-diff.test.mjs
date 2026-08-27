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

// The signal a consent check actually turns on: not what disappeared, but what
// kept firing across the choice. A tracker that never stopped is invisible in
// added/removed alone, because it is in neither list.
test("reports a tracker that fired in both captures as persisting, despite a rotating cache-buster", () => {
  const before = harOf([
    entry({ url: "https://shop.example/" }),
    entry({ url: "https://www.google-analytics.com/collect?v=1&cid=111&_r=8823" }),
    entry({ url: "https://connect.facebook.net/en_US/fbevents.js" }),
  ]);
  const after = harOf([
    entry({ url: "https://shop.example/" }),
    entry({ url: "https://www.google-analytics.com/collect?v=1&cid=111&_r=99401" }),
  ]);
  const diff = diffHarCaptures(before, after);

  // Facebook genuinely stopped; Google Analytics did not.
  assert.equal(diff.summary.removedRequestCount, 1);
  assert.equal(diff.summary.addedRequestCount, 0);
  assert.equal(diff.summary.persistingThirdPartyRequestCount, 1);
  assert.equal(diff.summary.persistingKnownTrackerRequestCount, 1);
  const [ga] = diff.persistingRequests.filter((r) => r.thirdParty);
  assert.equal(ga.hostname, "www.google-analytics.com");
  assert.equal(ga.classification.known, true);
  assert.equal(ga.thirdParty, true);
});

test("counts the page's own host as first-party so its assets are not reported as persisting trackers", () => {
  const har = harOf([
    entry({ url: "https://shop.example/" }),
    entry({ url: "https://shop.example/app.css" }),
    entry({ url: "https://cdn.tracker.invalid/px.gif" }),
  ]);
  const diff = diffHarCaptures(har, har);
  assert.equal(diff.documentHost, "shop.example");
  assert.equal(diff.summary.persistingRequestCount, 3);
  assert.equal(diff.summary.persistingThirdPartyRequestCount, 1);
  assert.equal(diff.persistingRequests.filter((r) => r.thirdParty)[0].hostname, "cdn.tracker.invalid");
});

test("collapses repeated beacons to the same endpoint into one persisting row", () => {
  const before = harOf([
    entry({ url: "https://shop.example/" }),
    entry({ url: "https://www.google-analytics.com/collect?n=1" }),
  ]);
  const after = harOf([
    entry({ url: "https://shop.example/" }),
    entry({ url: "https://www.google-analytics.com/collect?n=2" }),
    entry({ url: "https://www.google-analytics.com/collect?n=3" }),
    entry({ url: "https://www.google-analytics.com/collect?n=4" }),
  ]);
  const diff = diffHarCaptures(before, after);
  assert.equal(diff.summary.persistingThirdPartyRequestCount, 1);
});

test("keeps an unclassified third-party host in the persisting list rather than hiding it", () => {
  const har = harOf([
    entry({ url: "https://shop.example/" }),
    entry({ url: "https://metrics.unknown-vendor.invalid/beacon" }),
  ]);
  const diff = diffHarCaptures(har, har);
  const [row] = diff.persistingRequests.filter((r) => r.thirdParty);
  assert.equal(row.hostname, "metrics.unknown-vendor.invalid");
  assert.equal(row.classification.known, false);
  assert.equal(row.classification.category, "unclassified");
  assert.equal(diff.summary.persistingKnownTrackerRequestCount, 0);
  assert.equal(diff.summary.persistingThirdPartyRequestCount, 1);
});

test("reports a response cookie set in both captures as still set", () => {
  const har = harOf([
    entry({ url: "https://shop.example/", cookies: [{ name: "_ga", value: "1.2.3" }] }),
  ]);
  const diff = diffHarCaptures(har, har);
  assert.equal(diff.summary.persistingCookieCount, 1);
  assert.equal(diff.persistingCookies[0].name, "_ga");
  assert.equal(diff.summary.addedCookieCount, 0);
});
