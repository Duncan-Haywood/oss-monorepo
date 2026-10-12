import test from "node:test";
import assert from "node:assert/strict";
import { errorRate, buildPolicy, budgetTable, detectionTime, lint, generateRules, fmtDuration, promDuration, validateInputs, summarize } from "./engine.mjs";

test("error rate has no float noise", () => {
  assert.equal(errorRate(99.9), 0.001);
  assert.equal(errorRate(99.99), 0.0001);
  assert.equal(errorRate(99), 0.01);
});

test("default policy reproduces the SRE Workbook burn rates for 30 days", () => {
  const p = buildPolicy(99.9, 30);
  assert.deepEqual(p.map((r) => r.burnRate), [14.4, 6, 3, 1]);
  assert.equal(p[0].errorRatioThreshold, 0.0144);
  assert.equal(p[3].errorRatioThreshold, 0.001);
});

test("burn rates scale with the period", () => {
  assert.equal(buildPolicy(99.9, 28)[0].burnRate, 13.44);
  assert.equal(buildPolicy(99.9, 7)[0].burnRate, 3.36);
});

test("downtime budget: 99.9% over 30 days is 43m 12s", () => {
  const t = budgetTable(99.9, 30);
  assert.equal(fmtDuration(t.rows[2].allowedDowntime), "43m 12s");
  assert.equal(fmtDuration(t.rows[1].allowedDowntime), "10m 5s");
});

test("time to exhaust at the page burn rate is 50 hours", () => {
  assert.equal(buildPolicy(99.9, 30)[0].timeToExhaust / 3600, 50);
});

test("a total outage trips the 1h alert after 14.4 * 0.001 * 1h = 51.84s", () => {
  const p = buildPolicy(99.9, 30)[0];
  assert.ok(Math.abs(detectionTime(p, 1) - 51.84) < 1e-6);
});

test("an error ratio below the threshold never fires", () => {
  const p = buildPolicy(99.9, 30)[0];
  assert.equal(detectionTime(p, 0.01), Infinity);
  assert.equal(detectionTime(p, 0), Infinity);
});

test("a 90% SLO makes the page threshold unreachable and is an error", () => {
  const f = lint(90, 30);
  assert.ok(f.some((x) => x.rule === "unreachable-threshold" && x.severity === "error"));
  assert.equal(summarize(90, 30).status, "error");
  assert.equal(lint(99.9, 30).length, 0);
});

test("low traffic warns when the short window expects under one error", () => {
  const f = lint(99.9, 30, { rps: 0.05 });
  assert.ok(f.some((x) => x.rule === "low-traffic"));
  assert.ok(!lint(99.9, 30, { rps: 500 }).some((x) => x.rule === "low-traffic"));
});

test("durations render for Prometheus", () => {
  assert.equal(promDuration(300), "5m");
  assert.equal(promDuration(7200), "2h");
  assert.equal(promDuration(259200), "3d");
  assert.equal(promDuration(90), "90s");
});

test("generated rules contain 7 recordings, 4 alerts and the right thresholds", () => {
  const y = generateRules({ name: "api", slo: 99.9, errors: 'http_requests_total{job="api",code=~"5.."}', total: 'http_requests_total{job="api"}' });
  assert.equal((y.match(/- record:/g) || []).length, 7);
  assert.equal((y.match(/- alert:/g) || []).length, 4);
  assert.match(y, /14\.4 \* 0\.001/);
  assert.match(y, /severity: page/);
  assert.match(y, /severity: ticket/);
  assert.match(y, /sum\(rate\(http_requests_total\{job=\\"api\\",code=~\\"5\.\.\\"\}\[1h\]\)\)/);
});

test("rules are valid YAML double-quoted strings (round-trip through JSON.parse)", () => {
  const y = generateRules({ name: "api", slo: 99.5, errors: 'e{a="b"}', total: 't{a="b"}' });
  const exprs = [...y.matchAll(/expr: (".*")$/gm)].map((m) => JSON.parse(m[1]));
  assert.equal(exprs.length, 11);
  assert.ok(exprs[0].startsWith("sum(rate(e{a=\"b\"}["));
});

test("bad input is rejected, not turned into rules", () => {
  assert.throws(() => generateRules({ name: "9bad", slo: 99.9, errors: "a", total: "b" }), /name/);
  assert.throws(() => generateRules({ name: "ok", slo: 100, errors: "a", total: "b" }), /SLO/);
  assert.throws(() => generateRules({ name: "ok", slo: 99.9, errors: "a\nb", total: "b" }), /single-line/);
  assert.deepEqual(validateInputs({ slo: 99.9, periodDays: 30 }), []);
  assert.equal(validateInputs({ slo: 0, periodDays: 0 }).length, 2);
});
