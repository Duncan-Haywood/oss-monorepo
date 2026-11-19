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

// Quality audit 2026-11-19 (round 75): `and` -> `or` between the windows and sub-1x burns both passed every test.
test("alert requires BOTH windows: long and short joined by and", () => {
  const rules = generateRules({ name: "api", slo: 99.9, errors: "e", total: "t" });
  assert.match(rules, /ratio_rate1h\{slo=\\"api\\"\} > \(14\.4 \* 0\.001\) and slo:sli_error:ratio_rate5m\{slo=\\"api\\"\} > \(14\.4 \* 0\.001\)/);
  assert.doesNotMatch(rules, /\) or /);
});

test("burn rates under 1x are flagged: warn for pages, info for tickets", () => {
  const day = lint(99.9, 1).filter((f) => f.rule === "sub-unit-burn");
  assert.ok(day.some((f) => f.severity === "warn" && f.window === "1h"));
  const week = lint(99.9, 7).filter((f) => f.rule === "sub-unit-burn");
  assert.deepEqual(week.map((f) => [f.window, f.severity]), [["1d", "info"], ["3d", "info"]]);
  assert.equal(lint(99.9, 30).filter((f) => f.rule === "sub-unit-burn").length, 0);
});

// Red-team 2026-11-19: boundaries and outputs that mutants changed without a test noticing.
test("an error ratio exactly at the threshold never fires: the alert compares with a strict >", () => {
  const p = buildPolicy(99.9, 30)[0];
  assert.equal(detectionTime(p, p.errorRatioThreshold), Infinity);
  assert.ok(Number.isFinite(detectionTime(p, p.errorRatioThreshold * 1.01)));
  // 90% over 50 days: the 6h page needs exactly 10x * 10% = 100%, so even a total outage never trips it.
  const six = buildPolicy(90, 50)[1];
  assert.equal(six.errorRatioThreshold, 1);
  assert.equal(six.reachable, false);
  assert.equal(detectionTime(six, 1), Infinity);
});

test("period accepts 1..366 days and nothing outside", () => {
  assert.deepEqual(validateInputs({ slo: 99.9, periodDays: 366 }), []);
  assert.deepEqual(validateInputs({ slo: 99.9, periodDays: 1 }), []);
  assert.equal(validateInputs({ slo: 99.9, periodDays: 367 }).length, 1);
  assert.equal(validateInputs({ slo: 99.9, periodDays: 0.5 }).length, 1);
});

test("the per-year budget row is 365 days", () => {
  const year = budgetTable(99.9, 30).rows.find((r) => r.label === "Per year");
  assert.equal(year.seconds, 365 * 86400);
  assert.ok(Math.abs(year.allowedDowntime - 31536) < 1e-6);
});

test("low-traffic is only reported for alerts that can fire and with a positive request rate", () => {
  assert.ok(!lint(99.9, 30, { rps: 0 }).some((x) => x.rule === "low-traffic"));
  // At 90% the 1h and 6h pages are unreachable; only the reachable rows may be low-traffic.
  const f = lint(90, 30, { rps: 0.0001 }).filter((x) => x.rule === "low-traffic");
  const reachableShorts = buildPolicy(90, 30).filter((p) => p.reachable).map((p) => promDuration(p.short));
  assert.ok(f.length > 0);
  assert.deepEqual(f.map((x) => x.window).sort(), reachableShorts.sort());
});

test("a one-letter SLO name is a valid name", () => {
  const out = generateRules({ name: "a", slo: 99.9, errors: "e_total", total: "t_total" });
  assert.match(out, /slo: "a"/);
});

test("alert descriptions state the budget fraction as a whole percent", () => {
  const out = generateRules({ name: "api", slo: 99.9, errors: "e_total", total: "t_total" });
  assert.match(out, /At this rate 2% of the 30-day budget is spent in 1h; the whole budget lasts 2d 2h/);
  assert.match(out, /At this rate 10% of the 30-day budget is spent in 3d/);
});

test("sweep: an alert shows a finite outage detection time exactly when it is reachable", () => {
  // The page and CLI print both numbers side by side; they must never disagree.
  for (const slo of [50, 80, 85, 90, 95, 99, 99.5, 99.9, 99.99, 99.999]) {
    for (let periodDays = 1; periodDays <= 366; periodDays += 1) {
      for (const p of buildPolicy(slo, periodDays)) {
        assert.equal(Number.isFinite(detectionTime(p, 1)), p.reachable, `${slo}% over ${periodDays}d, ${promDuration(p.long)} window`);
      }
    }
  }
});
