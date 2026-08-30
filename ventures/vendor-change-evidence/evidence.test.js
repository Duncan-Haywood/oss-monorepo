const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSnapshot, compare, buildReport, toMarkdown, toJson } = require("./evidence.js");

const BEFORE = { url: "https://x/p", captured_at: "2026-08-23T00:00:00Z", fetch_status: "ok", text: "old" };

test("content change requires review", () => {
  const after = { ...BEFORE, captured_at: "2026-08-24T00:00:00Z", text: "new" };
  const report = compare(BEFORE, after);
  assert.equal(report.status, "changed");
  assert.equal(report.changes[0].kind, "content_changed");
  assert.equal(report.review_required, true);
});

test("identical snapshots are unchanged", () => {
  const after = { ...BEFORE, captured_at: "2026-08-24T00:00:00Z" };
  const report = compare(BEFORE, after);
  assert.equal(report.status, "unchanged");
  assert.equal(report.review_required, false);
});

test("failed fetch is inconclusive", () => {
  const before = { ...BEFORE, fetch_status: "timeout" };
  const after = { ...BEFORE, captured_at: "2026-08-24T00:00:00Z" };
  assert.equal(compare(before, after).status, "inconclusive");
});

test("out-of-order captures are inconclusive", () => {
  const after = { ...BEFORE, captured_at: "2026-08-22T00:00:00Z" };
  const report = compare(BEFORE, after);
  assert.equal(report.status, "inconclusive");
  assert.ok(report.changes.some((c) => c.kind === "capture_order_invalid"));
});

test("source URL change is flagged", () => {
  const after = { ...BEFORE, url: "https://x/other", captured_at: "2026-08-24T00:00:00Z" };
  const report = compare(BEFORE, after);
  assert.ok(report.changes.some((c) => c.kind === "source_changed"));
});

test("parseSnapshot rejects invalid JSON", () => {
  assert.throws(() => parseSnapshot("not json", "before"), /not valid JSON/);
});

test("parseSnapshot rejects missing fields", () => {
  assert.throws(() => parseSnapshot(JSON.stringify({ url: "x" }), "before"), /missing/);
});

test("parseSnapshot rejects a bad timestamp", () => {
  const bad = { ...BEFORE, captured_at: "not-a-date" };
  assert.throws(() => parseSnapshot(JSON.stringify(bad), "before"), /ISO 8601/);
});

test("buildReport ports the CLI's example fixtures to a changed verdict", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const beforeText = fs.readFileSync(path.join(__dirname, "examples/before.json"), "utf8");
  const afterText = fs.readFileSync(path.join(__dirname, "examples/after.json"), "utf8");
  const report = buildReport(beforeText, afterText);
  assert.equal(report.status, "changed");
  assert.equal(report.changes[0].kind, "content_changed");
});

test("toMarkdown and toJson render the report without throwing", () => {
  const after = { ...BEFORE, captured_at: "2026-08-24T00:00:00Z", text: "new" };
  const report = compare(BEFORE, after);
  assert.match(toMarkdown(report), /Vendor snapshot review/);
  assert.match(toMarkdown(report), /No warranty/);
  assert.deepEqual(JSON.parse(toJson(report)).status, "changed");
});
