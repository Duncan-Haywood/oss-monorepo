import test from "node:test";
import assert from "node:assert/strict";
import { classifyRun, buildTrend, parseRunPayload, trendSummary } from "./report.mjs";
import { TREND_EXAMPLE_NIGHTS } from "./examples.mjs";

test("example nights stay verified while the last night is flagged as shrinking", () => {
  const trend = buildTrend(TREND_EXAMPLE_NIGHTS);
  assert.equal(trend.latest.status, "verified");
  assert.equal(trend.latest.shrinking_vs_previous, true);
  assert.equal(trend.latest.shrinking_vs_median, true);
  assert.ok(trend.alert_count >= 2);
  assert.match(trendSummary(trend), /size-drop/);
});

test("a four-percent wobble does not alert", () => {
  const trend = buildTrend([
    { ...TREND_EXAMPLE_NIGHTS[0], artifact: { ...TREND_EXAMPLE_NIGHTS[0].artifact, size_bytes: 50_000_000 } },
    { ...TREND_EXAMPLE_NIGHTS[1], finished_at: "2026-08-22T03:04:00Z", artifact: { ...TREND_EXAMPLE_NIGHTS[1].artifact, size_bytes: 48_000_000 } },
  ]);
  assert.equal(trend.alert_count, 0);
});

test("status regression is flagged when size is unchanged", () => {
  const trend = buildTrend([
    TREND_EXAMPLE_NIGHTS[0],
    { ...TREND_EXAMPLE_NIGHTS[0], finished_at: "2026-08-22T03:04:00Z", exit_code: 1 },
  ]);
  assert.equal(trend.latest.status_regression, true);
  assert.equal(trend.alerts[0].kind, "status_regression");
});

test("classifyRun matches the Python verified path for a healthy artifact", () => {
  const result = classifyRun(TREND_EXAMPLE_NIGHTS[0]);
  assert.equal(result.status, "verified");
});

test("classifyRun requires an integrity read when asked, even if exit code and size are fine", () => {
  const result = classifyRun(TREND_EXAMPLE_NIGHTS[0], { requireIntegrity: true });
  assert.equal(result.status, "inconclusive");
  assert.match(result.reasons[0], /integrity is required.*no end-to-end integrity check was recorded/);
});

test("classifyRun accepts an intact integrity result under requireIntegrity", () => {
  const record = {
    ...TREND_EXAMPLE_NIGHTS[0],
    artifact: { ...TREND_EXAMPLE_NIGHTS[0].artifact, integrity: { result: "intact", format: "tar" } },
  };
  const result = classifyRun(record, { requireIntegrity: true });
  assert.equal(result.status, "verified");
});

test("classifyRun keeps a corrupt artifact failed under requireIntegrity, not inconclusive", () => {
  const record = {
    ...TREND_EXAMPLE_NIGHTS[0],
    artifact: { ...TREND_EXAMPLE_NIGHTS[0].artifact, integrity: { result: "corrupt", detail: "bad checksum" } },
  };
  const result = classifyRun(record, { requireIntegrity: true });
  assert.equal(result.status, "failed");
});

test("classifyRun names an unsupported format under requireIntegrity", () => {
  const record = {
    ...TREND_EXAMPLE_NIGHTS[0],
    artifact: { ...TREND_EXAMPLE_NIGHTS[0].artifact, integrity: { result: "unsupported", detail: "zstd" } },
  };
  const result = classifyRun(record, { requireIntegrity: true });
  assert.equal(result.status, "inconclusive");
  assert.match(result.reasons[0], /unsupported by this tool/);
});

test("requireIntegrity is off by default so stat-only nights still read verified", () => {
  const result = classifyRun(TREND_EXAMPLE_NIGHTS[0]);
  assert.equal(result.status, "verified");
});

test("buildTrend threads requireIntegrity through every night and records it on the result", () => {
  const trend = buildTrend(TREND_EXAMPLE_NIGHTS, undefined, { requireIntegrity: true });
  assert.equal(trend.require_integrity, true);
  assert.ok(trend.rows.every((row) => row.status === "inconclusive"));
  assert.equal(trend.latest.status, "inconclusive");
  assert.ok(trend.limitations.some((line) => /no end-to-end artifact read/.test(line)));
});

test("buildTrend without requireIntegrity keeps the stat-only limitations line", () => {
  const trend = buildTrend(TREND_EXAMPLE_NIGHTS);
  assert.equal(trend.require_integrity, false);
  assert.ok(trend.limitations.some((line) => /never opens the archive itself/.test(line)));
});

test("orders records by the actual instant, not the raw finished_at string, across mixed UTC offsets", () => {
  // "early" is 2026-08-23T22:00:00Z once its +03:00 offset is applied, one
  // hour before "late" -- but as raw strings "...T01:00:00+03:00" sorts
  // *after* "...T23:00:00Z" because "24" > "23" in the date portion.
  const early = {
    tool: "pg_dump|gzip",
    exit_code: 0,
    finished_at: "2026-08-24T01:00:00+03:00",
    artifact: { exists: true, size_bytes: 50_000_000 },
  };
  const late = {
    tool: "pg_dump|gzip",
    exit_code: 0,
    finished_at: "2026-08-23T23:00:00Z",
    artifact: { exists: true, size_bytes: 10_000_000 },
  };
  const trend = buildTrend([early, late]);
  assert.equal(trend.rows[0].finished_at, early.finished_at);
  assert.equal(trend.rows[1].finished_at, late.finished_at);
  assert.equal(trend.latest.finished_at, late.finished_at);
  assert.equal(trend.latest.shrinking_vs_previous, true);
  assert.equal(trend.alerts.some((alert) => alert.kind === "shrinking_vs_previous"), true);
});

test("parseRunPayload accepts a single record, an array, or a records wrapper", () => {
  assert.equal(parseRunPayload(JSON.stringify(TREND_EXAMPLE_NIGHTS[0])).length, 1);
  assert.equal(parseRunPayload(JSON.stringify(TREND_EXAMPLE_NIGHTS)).length, 4);
  assert.equal(parseRunPayload(JSON.stringify({ records: TREND_EXAMPLE_NIGHTS })).length, 4);
  assert.throws(() => parseRunPayload("{"), /not valid JSON/);
  assert.throws(() => parseRunPayload("{}"), /run record/);
});
