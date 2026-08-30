const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseSnapshot, compare, buildReport, toMarkdown, toJson } = require("./evidence.js");

const BEFORE = {
  authorized: true,
  register: "state-license-board",
  source_url: "https://example.test/register",
  captured_at: "2026-08-24T12:00:00Z",
  records: [
    { id: "license-100", status: "active", expires: "2027-01-01" },
    { id: "license-200", status: "active", expires: "2026-12-01" },
  ],
};

test("added, removed, and changed records are all detected", () => {
  const after = {
    ...BEFORE,
    captured_at: "2026-08-25T12:00:00Z",
    records: [
      { id: "license-100", status: "restricted", expires: "2027-01-01" },
      { id: "license-300", status: "active", expires: "2027-04-01" },
    ],
  };
  const report = compare(BEFORE, after);
  const byId = Object.fromEntries(report.findings.map((f) => [f.id, f.status]));
  assert.equal(byId["license-100"], "changed");
  assert.equal(byId["license-200"], "removed");
  assert.equal(byId["license-300"], "added");
  assert.equal(report.review_required, true);
});

test("compare rejects snapshots from different source_url values", () => {
  const after = { ...BEFORE, source_url: "https://other.test/register" };
  assert.throws(() => compare(BEFORE, after), /same source_url/);
});

test("identical records are unchanged and do not require review", () => {
  const after = { ...BEFORE, captured_at: "2026-08-25T12:00:00Z" };
  const report = compare(BEFORE, after);
  assert.ok(report.findings.every((f) => f.status === "unchanged"));
  assert.equal(report.review_required, false);
});

test("mismatched registers are rejected", () => {
  const after = { ...BEFORE, register: "other-board" };
  assert.throws(() => compare(BEFORE, after), /same register/);
});

test("parseSnapshot rejects invalid JSON", () => {
  assert.throws(() => parseSnapshot("not json", "before"), /not valid JSON/);
});

test("parseSnapshot requires authorized: true", () => {
  const unauthorized = { ...BEFORE, authorized: false };
  assert.throws(() => parseSnapshot(JSON.stringify(unauthorized), "before"), /authorized/);
});

test("parseSnapshot requires an http(s) source_url", () => {
  const bad = { ...BEFORE, source_url: "not-a-url" };
  assert.throws(() => parseSnapshot(JSON.stringify(bad), "before"), /http\(s\)/);
});

test("parseSnapshot rejects duplicate record ids", () => {
  const dup = { ...BEFORE, records: [...BEFORE.records, BEFORE.records[0]] };
  assert.throws(() => parseSnapshot(JSON.stringify(dup), "before"), /duplicate/);
});

test("buildReport ports the CLI's example fixtures to a review-required verdict", () => {
  const beforeText = fs.readFileSync(path.join(__dirname, "examples/before.json"), "utf8");
  const afterText = fs.readFileSync(path.join(__dirname, "examples/after.json"), "utf8");
  const report = buildReport(beforeText, afterText);
  assert.equal(report.review_required, true);
  assert.equal(report.register, "state-license-board");
});

test("toMarkdown and toJson render the report without throwing", () => {
  const after = { ...BEFORE, captured_at: "2026-08-25T12:00:00Z", records: [{ id: "license-100", status: "restricted", expires: "2027-01-01" }] };
  const report = compare(BEFORE, after);
  assert.match(toMarkdown(report), /Public-record changes/);
  assert.match(toMarkdown(report), /No warranty/);
  assert.deepEqual(JSON.parse(toJson(report)).register, "state-license-board");
});
