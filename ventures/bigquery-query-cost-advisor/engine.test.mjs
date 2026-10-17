import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQueries, analyze, summarize, onDemandGross, editionsCost } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/queries.csv", import.meta.url), "utf8");

test("parser maps headers, keeps blank slot hours as unknown, skips bad rows", () => {
  const p = parseQueries("# c\nslot_hours,query_group,runs,gb_billed\n");
  assert.equal(p.rows.length, 0);
  const q = parseQueries("query_group,runs_per_month,gb_billed_per_run\na,10,5\nb,x,1\nc,1,-2\n");
  assert.equal(q.rows.length, 1);
  assert.equal(q.rows[0].slotHoursPerRun, null);
  assert.equal(q.skipped, 2);
  assert.equal(parseQueries("a,10,5,x").skipped, 1);
});

test("on-demand and Editions costs are exact products of the price table", () => {
  const r = { runs: 100, gbPerRun: 1024, slotHoursPerRun: 10 };
  assert.ok(Math.abs(onDemandGross(r) - 625) < 1e-9);
  assert.ok(Math.abs(editionsCost(r) - 60) < 1e-9);
  assert.equal(editionsCost({ ...r, slotHoursPerRun: null }), null);
});

test("the free TiB is applied once, to the total", () => {
  const r = analyze(parseQueries("a,1,1024,1"));
  assert.ok(Math.abs(r.totals.onDemand - 0) < 1e-9);
  const two = analyze(parseQueries("a,1,2048,1"));
  assert.ok(Math.abs(two.totals.onDemand - 6.25) < 1e-9);
});

test("fixture: Editions is flagged cheaper with a capped-reservation command, never a bare switch", () => {
  const r = analyze(parseQueries(text));
  const f = r.findings.find((x) => x.rule === "editions-cheaper");
  assert.ok(f);
  assert.match(f.message, /autoscale_max_slots/);
  assert.ok(r.totals.saving > 0);
});

test("on-demand wins when slot-hours are heavy", () => {
  const r = analyze(parseQueries("a,10,1024,5000"));
  assert.ok(r.findings.some((f) => f.rule === "on-demand-cheaper"));
  assert.equal(r.totals.saving, 0);
});

test("missing slot hours skip the Editions comparison honestly", () => {
  const r = analyze(parseQueries("a,10,500\nb,10,500,3"));
  assert.ok(r.findings.some((f) => f.rule === "slot-hours-missing"));
  assert.equal(r.totals.editions, null);
});

test("expensive single runs get a maximum_bytes_billed cap 25% above the run", () => {
  const r = analyze(parseQueries(text));
  const f = r.findings.find((x) => x.rule === "expensive-single-run" && x.row === "nightly-events-rollup");
  assert.match(f.message, /--maximum_bytes_billed=7750000000000/);
  assert.ok(!r.findings.some((x) => x.rule === "expensive-single-run" && x.row === "tiny-lookup"));
});

test("dominance and repeated-scan findings fire on the dashboard group", () => {
  const r = analyze(parseQueries(text));
  assert.ok(r.findings.some((f) => f.rule === "group-dominates" && f.row === "dashboard-revenue-refresh"));
  assert.ok(r.findings.some((f) => f.rule === "repeated-large-scan" && f.row === "dashboard-revenue-refresh"));
});

test("summary and empty input", () => {
  assert.equal(summarize(analyze(parseQueries(text))).status, "warn");
  assert.equal(summarize(analyze(parseQueries("nothing"))).status, "none");
  const ok = analyze(parseQueries("a,10,1,5000"));
  assert.equal(summarize(ok).status, "ok");
  assert.ok(ok.findings.some((f) => f.rule === "bigquery-bill-fine" || f.rule === "bigquery-fine"));
});
