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

test("parseRunPayload accepts a single record, an array, or a records wrapper", () => {
  assert.equal(parseRunPayload(JSON.stringify(TREND_EXAMPLE_NIGHTS[0])).length, 1);
  assert.equal(parseRunPayload(JSON.stringify(TREND_EXAMPLE_NIGHTS)).length, 4);
  assert.equal(parseRunPayload(JSON.stringify({ records: TREND_EXAMPLE_NIGHTS })).length, 4);
  assert.throws(() => parseRunPayload("{"), /not valid JSON/);
  assert.throws(() => parseRunPayload("{}"), /run record/);
});
