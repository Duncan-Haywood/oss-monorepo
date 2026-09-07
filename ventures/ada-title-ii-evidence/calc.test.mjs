import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, reportAsText, countByImpact, formatImpact } from "./calc.mjs";

test("buildReport rejects a non-object input rather than silently producing an empty report", () => {
  assert.throws(() => buildReport(null), /valid axe-core JSON object/);
  assert.throws(() => buildReport("not json"), /valid axe-core JSON object/);
});

test("buildReport separates WCAG 2.1 AA required violations from beyond-minimum ones", () => {
  const report = buildReport({
    url: "https://example.gov",
    violations: [
      { id: "color-contrast", impact: "serious", tags: ["wcag2aa", "wcag143"], nodes: [{}, {}] },
      { id: "region", impact: "moderate", tags: ["best-practice"], nodes: [{}] },
      { id: "target-size", impact: "minor", tags: ["wcag22aa"], nodes: [{}] },
    ],
    passes: [{ id: "html-has-lang" }],
    incomplete: [],
  }, "2026-09-07");

  assert.equal(report.counts.violations, 3);
  assert.equal(report.counts.requiredViolations, 1, "only the wcag2aa-tagged rule is within the Title II standard");
  assert.equal(report.items[0].requiredByTitleII, true);
  assert.equal(report.items[1].requiredByTitleII, false);
  assert.equal(report.items[2].requiredByTitleII, false, "WCAG 2.2 is not the standard the rule adopted");
});

test("reportAsText names the standard and separates required from extra findings", () => {
  const report = buildReport({
    url: "https://cityhall.example.gov",
    violations: [{ id: "color-contrast", impact: "serious", tags: ["wcag2aa"], nodes: [{}] }],
    passes: [],
    incomplete: [],
  }, "2026-09-07");
  const text = reportAsText(report);
  assert.match(text, /WCAG 2\.1 Level AA/);
  assert.match(text, /within the WCAG 2\.1 AA required set: 1/);
  assert.match(text, /not a determination that this entity meets or fails its ADA Title II obligation/);
  assert.match(text, /\[serious\] color-contrast.*\(WCAG 2\.1 AA\)/);
});

test("reportAsText says so plainly when a supplied result has no violations", () => {
  const report = buildReport({ url: "https://example.gov", violations: [], passes: [{ id: "x" }], incomplete: [] });
  assert.match(reportAsText(report), /No violations were present in this supplied result\. Manual review is still required\./);
});

test("countByImpact and formatImpact tally and render impact buckets", () => {
  const counts = countByImpact([{ impact: "critical" }, { impact: "critical" }, { impact: "minor" }, { impact: "nonsense" }]);
  assert.deepEqual(counts, { critical: 2, serious: 0, moderate: 0, minor: 1, unknown: 1 });
  assert.equal(formatImpact(counts), "2 critical, 1 minor, 1 unknown");
  assert.equal(formatImpact({ critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }), "none");
});
