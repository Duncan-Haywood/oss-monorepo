import test from "node:test";
import assert from "node:assert/strict";
import { classifyRun, buildTrend, parseRunPayload, trendSummary, markdownTrend, formatBytes } from "./report.mjs";
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

test("classifyRun formats undersized-artifact reasons with human-readable sizes", () => {
  // Same regression as the Python suite: the shrink-alert / markdown paths
  // already called formatBytes, but the undersized-artifact reason still
  // dumped raw integers into the string an operator copies into a ticket.
  const result = classifyRun({
    tool: "pg_dump",
    exit_code: 0,
    started_at: "2026-08-24T03:00:00Z",
    finished_at: "2026-08-24T03:04:00Z",
    artifact: {
      exists: true,
      size_bytes: 51_200_000_000,
      modified_at: "2026-08-24T03:03:59Z",
    },
    expected: { min_size_bytes: 60_000_000_000 },
  });
  assert.equal(result.status, "suspicious");
  assert.match(result.reasons[0], /51\.2 GB/);
  assert.match(result.reasons[0], /60\.0 GB/);
  assert.equal(result.reasons[0].includes("51200000000"), false);
  assert.equal(result.reasons[0].includes("60000000000"), false);
});

test("classifyRun keeps plain wording when the artifact size is unknown", () => {
  const result = classifyRun({
    tool: "pg_dump",
    exit_code: 0,
    started_at: "2026-08-24T03:00:00Z",
    finished_at: "2026-08-24T03:04:00Z",
    artifact: {
      exists: true,
      size_bytes: null,
      modified_at: "2026-08-24T03:03:59Z",
    },
    expected: { min_size_bytes: 1_000_000 },
  });
  assert.equal(result.status, "suspicious");
  assert.match(result.reasons[0], /an unknown number of bytes/);
  assert.match(result.reasons[0], /1\.0 MB/);
  assert.equal(result.reasons[0].includes("1000000"), false);
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

test("markdownTrend renders each row's size the same human-readable way the on-page table does, not raw bytes", () => {
  const trend = buildTrend(TREND_EXAMPLE_NIGHTS);
  const markdown = markdownTrend(trend);
  for (const row of trend.rows) {
    assert.equal(markdown.includes(`${row.size_bytes} bytes`), false, `markdown report should not contain the raw byte count ${row.size_bytes}`);
    assert.ok(markdown.includes(formatBytes(row.size_bytes)), `markdown report should contain ${formatBytes(row.size_bytes)}`);
  }
});

test("shrink alert details are human-readable, not raw byte counts (shared by the page and the copied markdown)", () => {
  const trend = buildTrend(TREND_EXAMPLE_NIGHTS);
  assert.ok(trend.alerts.length > 0);
  for (const alert of trend.alerts) {
    if (alert.kind === "status_regression") continue;
    assert.doesNotMatch(alert.detail, /\d+ bytes to \d+ bytes/, `alert detail should not carry raw byte counts: ${alert.detail}`);
    assert.match(alert.detail, /\d+(\.\d+)? (bytes|KB|MB|GB) to \d+(\.\d+)? (bytes|KB|MB|GB)/);
  }
});

test("formatBytes handles null and each unit boundary", () => {
  assert.equal(formatBytes(null), "unknown");
  assert.equal(formatBytes(500), "500 bytes");
  assert.equal(formatBytes(1_500), "1.5 KB");
  assert.equal(formatBytes(1_500_000), "1.5 MB");
  assert.equal(formatBytes(51_200_000_000), "51.2 GB");
});

test("parseRunPayload accepts a single record, an array, or a records wrapper", () => {
  assert.equal(parseRunPayload(JSON.stringify(TREND_EXAMPLE_NIGHTS[0])).length, 1);
  assert.equal(parseRunPayload(JSON.stringify(TREND_EXAMPLE_NIGHTS)).length, 4);
  assert.equal(parseRunPayload(JSON.stringify({ records: TREND_EXAMPLE_NIGHTS })).length, 4);
  assert.throws(() => parseRunPayload("{"), /not valid JSON/);
  assert.throws(() => parseRunPayload("{}"), /run record/);
});
