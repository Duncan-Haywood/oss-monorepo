import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReport,
  extractSections,
  extractSectionsFromHtml,
  extractSectionsFromText,
  looksLikeHtml,
  makeSnapshot,
  markdownReport,
  normalize,
  summarize,
  wordDiff,
} from "./diff.mjs";
import { EXAMPLE_AFTER, EXAMPLE_BEFORE, EXAMPLE_TYPE, EXAMPLE_URL, EXAMPLE_VENDOR } from "./examples.mjs";

const snap = (content, overrides = {}) =>
  makeSnapshot({
    vendor: "Acme SaaS",
    pageUrl: "https://acme.example/legal/terms",
    pageType: "terms",
    capturedAt: "2026-09-01T00:00:00Z",
    content,
    ...overrides,
  });

test("collapses whitespace so a reflow is not a content change", () => {
  const before = snap("Retention\n\nWe keep data for 30 days.");
  const after = snap("Retention\n\nWe   keep data\n   for 30 days.");
  const report = buildReport(before, after);
  assert.equal(report.status, "observed");
  assert.deepEqual(report.changes, []);
  assert.equal(normalize("  a   b \n c "), "a b c");
});

test("a failed capture on either side is inconclusive, never unchanged", () => {
  const ok = snap("Terms\n\nSomething.");
  const failed = snap("", { fetchStatus: "timeout" });

  const beforeFailed = buildReport(failed, ok);
  assert.equal(beforeFailed.status, "inconclusive");
  assert.match(beforeFailed.reason, /before snapshot fetch did not succeed \(timeout\)/);

  const afterFailed = buildReport(ok, failed);
  assert.equal(afterFailed.status, "inconclusive");
  assert.match(afterFailed.reason, /after snapshot fetch did not succeed/);

  // The point of the status: it must not be mistakable for stability.
  assert.notEqual(beforeFailed.status, "observed");
  assert.match(summarize(beforeFailed), /^Inconclusive/);
});

test("a mismatched pair is unknown rather than a diff of two different pages", () => {
  const before = snap("Terms\n\nA.");
  const after = snap("Privacy\n\nB.", { pageType: "privacy" });
  const report = buildReport(before, after);
  assert.equal(report.status, "unknown");
  assert.equal(report.reason, "snapshot contexts differ");
  assert.equal(report.context.page_type, "privacy");
});

test("reports added, removed and changed sections by heading", () => {
  const before = snap("Retention\n\nWe keep data for 30 days.\n\nNotice\n\nWe give 30 days notice.");
  const after = snap("Retention\n\nWe keep data for 180 days.\n\nSubprocessors\n\nNimbus Model Labs.");

  const report = buildReport(before, after);
  assert.equal(report.status, "observed");
  const byHeading = Object.fromEntries(report.changes.map((c) => [c.heading, c]));

  assert.equal(byHeading.Retention.change, "changed");
  assert.match(byHeading.Retention.after, /180 days/);
  assert.equal(byHeading.Notice.change, "removed");
  assert.equal(byHeading.Subprocessors.change, "added");
  assert.match(byHeading.Subprocessors.after, /Nimbus Model Labs/);
});

test("carries the source URL, both timestamps and the limitations", () => {
  const report = buildReport(
    snap("Terms\n\nA.", { capturedAt: "2026-08-01T00:00:00Z" }),
    snap("Terms\n\nB.", { capturedAt: "2026-09-01T00:00:00Z" }),
  );
  assert.equal(report.source_url, "https://acme.example/legal/terms");
  assert.equal(report.before_captured_at, "2026-08-01T00:00:00Z");
  assert.equal(report.after_captured_at, "2026-09-01T00:00:00Z");
  assert.equal(report.limitations.length, 3);
  assert.ok(report.limitations.some((l) => /not legal advice/i.test(l)));
  assert.ok(report.limitations.some((l) => /not proof the page never changed/i.test(l)));
});

test("parses HTML headings and skips script and style text", () => {
  const sections = extractSectionsFromHtml(`
    <html><head><style>h1 { color: red }</style></head>
    <body><p>Intro text.</p>
    <h2>Retention</h2><p>We keep data for 30&nbsp;days.</p>
    <script>var leak = "should not appear";</script>
    <h3>Notice</h3><div>Thirty days &mdash; in writing.</div></body></html>`);

  const byHeading = Object.fromEntries(sections.map((s) => [s.heading, s.text]));
  assert.equal(byHeading["(page)"], "Intro text.");
  assert.equal(byHeading.Retention, "We keep data for 30 days.");
  assert.equal(byHeading.Notice, "Thirty days — in writing.");
  assert.ok(!JSON.stringify(sections).includes("should not appear"));
});

test("detects markup and routes the paste to the matching parser", () => {
  assert.equal(looksLikeHtml("<h2>Terms</h2><p>hi</p>"), true);
  assert.equal(looksLikeHtml("Terms\n\nWe reserve the right to < 30 days notice."), false);
  assert.deepEqual(extractSections("<h2>T</h2><p>body</p>"), extractSectionsFromHtml("<h2>T</h2><p>body</p>"));
  assert.deepEqual(extractSections("T\n\nbody here"), extractSectionsFromText("T\n\nbody here"));
});

test("treats a short standalone line above a paragraph as a heading", () => {
  const sections = extractSectionsFromText(
    "Preamble sentence here.\n\nData retention\n\nWe keep customer content for 30 days.\n\n" +
      "This is a long sentence that ends with a full stop and so is body text, not a heading.",
  );
  const headings = sections.map((s) => s.heading);
  assert.ok(headings.includes("Data retention"));
  assert.ok(headings.includes("(page)"));
  assert.ok(!headings.some((h) => h.startsWith("This is a long sentence")));
});

test("word diff marks only what moved", () => {
  const parts = wordDiff("We keep data for 30 days.", "We keep data for 180 days.");
  assert.deepEqual(parts.filter((p) => p.kind === "removed").map((p) => p.text), ["30"]);
  assert.deepEqual(parts.filter((p) => p.kind === "added").map((p) => p.text), ["180"]);
  assert.ok(parts.some((p) => p.kind === "same" && p.text.includes("We keep data")));
});

test("word diff degrades instead of hanging on two very large sections", () => {
  const big = (word) => Array.from({ length: 2100 }, (_, i) => `${word}${i}`).join(" ");
  const parts = wordDiff(big("a"), big("b"));
  assert.deepEqual(parts.map((p) => p.kind), ["removed", "added"]);
});

test("the worked example produces the three changes it promises", () => {
  const before = makeSnapshot({
    vendor: EXAMPLE_VENDOR, pageUrl: EXAMPLE_URL, pageType: EXAMPLE_TYPE,
    content: EXAMPLE_BEFORE, capturedAt: "2026-08-01T00:00:00Z",
  });
  const after = makeSnapshot({
    vendor: EXAMPLE_VENDOR, pageUrl: EXAMPLE_URL, pageType: EXAMPLE_TYPE,
    content: EXAMPLE_AFTER, capturedAt: "2026-09-01T00:00:00Z",
  });

  const report = buildReport(before, after);
  assert.equal(report.status, "observed");
  const byHeading = Object.fromEntries(report.changes.map((c) => [c.heading, c]));

  // The added subprocessor.
  assert.equal(byHeading["Analytics and support"].change, "changed");
  assert.match(byHeading["Analytics and support"].after, /Nimbus Model Labs/);
  // The stretched retention window.
  assert.match(byHeading["Data retention"].after, /180 days/);
  assert.match(byHeading["Data retention"].before, /30 days/);
  // The shortened notice period. It sits under the page's own first heading
  // rather than under `(page)`: the example opens with a real "Subprocessors"
  // heading, so nothing precedes the first section.
  assert.equal(byHeading.Subprocessors.change, "changed");
  assert.match(byHeading.Subprocessors.before, /30 days before adding/);
  assert.match(byHeading.Subprocessors.after, /10 days before adding/);
  // The wholly new clause.
  assert.equal(byHeading["Onward transfers"].change, "added");
  assert.match(byHeading["Onward transfers"].after, /outside your selected region/);

  // All four, and nothing spurious: an unchanged section must not be reported.
  assert.deepEqual(
    report.changes.map((c) => c.heading).sort(),
    ["Analytics and support", "Data retention", "Onward transfers", "Subprocessors"],
  );
});

test("summarize never calls an incomplete check unchanged", () => {
  const unchanged = buildReport(snap("Terms\n\nA."), snap("Terms\n\nA."));
  assert.match(summarize(unchanged), /No text changes/);

  const inconclusive = buildReport(snap("", { fetchStatus: "blocked" }), snap("Terms\n\nA."));
  assert.ok(!/no.*change/i.test(summarize(inconclusive)));
});

test("markdown report carries the evidence and the disclaimer", () => {
  const report = buildReport(
    snap("Retention\n\nWe keep data for 30 days.", { capturedAt: "2026-08-01T00:00:00Z" }),
    snap("Retention\n\nWe keep data for 180 days.", { capturedAt: "2026-09-01T00:00:00Z" }),
  );
  const markdown = markdownReport(report);
  assert.match(markdown, /https:\/\/acme\.example\/legal\/terms/);
  assert.match(markdown, /2026-08-01T00:00:00Z → 2026-09-01T00:00:00Z/);
  assert.match(markdown, /## Retention — changed/);
  assert.match(markdown, /not legal advice/i);
});

test("markdown for an inconclusive report says so and still disclaims", () => {
  const markdown = markdownReport(buildReport(snap("", { fetchStatus: "timeout" }), snap("Terms\n\nA.")));
  assert.match(markdown, /\*\*Status:\*\* inconclusive/);
  assert.match(markdown, /not legal advice/i);
  assert.ok(!/No section-level differences/.test(markdown));
});
