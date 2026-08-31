import test from "node:test";
import assert from "node:assert/strict";
import { classifyDomain, KNOWN_TRACKER_DOMAIN_COUNT } from "./trackers.mjs";

test("classifies an exact known domain", () => {
  assert.deepEqual(classifyDomain("doubleclick.net"), { known: true, category: "advertising" });
});

test("classifies a subdomain of a known domain by suffix", () => {
  assert.deepEqual(classifyDomain("www.google-analytics.com"), {
    known: true,
    category: "analytics",
  });
  assert.deepEqual(classifyDomain("script.hotjar.com"), {
    known: true,
    category: "session-recording",
  });
});

test("does not match an unrelated domain that merely contains a known name", () => {
  // "notgoogle-analytics.com" is not a subdomain of google-analytics.com —
  // suffix matching must check for a dot boundary, not substring containment.
  assert.deepEqual(classifyDomain("notgoogle-analytics.com"), {
    known: false,
    category: "unclassified",
  });
});

test("reports an unmatched domain as unclassified, not silently absent", () => {
  const result = classifyDomain("some-vendor-nobody-has-heard-of.example");
  assert.equal(result.known, false);
  assert.equal(result.category, "unclassified");
});

test("handles a missing hostname without throwing", () => {
  assert.deepEqual(classifyDomain(null), { known: false, category: "unclassified" });
  assert.deepEqual(classifyDomain(""), { known: false, category: "unclassified" });
});

test("the curated list is non-empty and its size is exposed for the UI disclosure", () => {
  assert.ok(KNOWN_TRACKER_DOMAIN_COUNT > 0);
});
