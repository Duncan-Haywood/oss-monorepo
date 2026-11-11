import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQueries, analyze, summarize, onDemandGross, editionsCost, GB_PER_TIB } from "./engine.mjs";

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
  const r = { runs: 100, gbPerRun: GB_PER_TIB, slotHoursPerRun: 10 };
  assert.ok(Math.abs(onDemandGross(r) - 625) < 1e-9);
  assert.ok(Math.abs(editionsCost(r) - 60) < 1e-9);
  assert.equal(editionsCost({ ...r, slotHoursPerRun: null }), null);
});

test("the free TiB is applied once, to the total", () => {
  const r = analyze(parseQueries(`a,1,${GB_PER_TIB},1`));
  assert.ok(Math.abs(r.totals.onDemand - 0) < 1e-9);
  const two = analyze(parseQueries(`a,1,${2 * GB_PER_TIB},1`));
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

test("GB means bytes/1e9 (as the page tells users to compute it) and BigQuery bills per TiB of 2^40 bytes", () => {
  // 2^40 bytes billed, entered the documented way: AVG(total_bytes_billed)/1e9
  const oneTibInGb = 2 ** 40 / 1e9;
  assert.ok(Math.abs(onDemandGross({ runs: 1, gbPerRun: oneTibInGb, slotHoursPerRun: null }) - 6.25) < 1e-9);
  // 1000 runs of 1e12 bytes = 909.49 TiB, not 976.56 (the GiB reading)
  const r = analyze(parseQueries("a,1000,1000"));
  assert.ok(Math.abs(r.totals.tib - 1e15 / 2 ** 40) < 1e-9);
  assert.ok(Math.abs(r.totals.onDemand - (1e15 / 2 ** 40 - 1) * 6.25) < 1e-6);
});

test("a header can put any column first, and the columns follow it", () => {
  const p = parseQueries("runs_per_month,gb_billed_per_run,query_group\n10,5,a\n");
  assert.deepEqual(p.rows, [{ name: "a", runs: 10, gbPerRun: 5, slotHoursPerRun: null }]);
});

test("annual saving is twelve months of the monthly saving, and the summary prints both", () => {
  const r = analyze(parseQueries(text));
  assert.ok(r.totals.saving > 0);
  assert.ok(Math.abs(r.totals.annual - r.totals.saving * 12) < 1e-9);
  const s = summarize(r).text;
  assert.ok(s.includes(`$${r.totals.annual.toFixed(0)}/year`));
  assert.ok(s.includes(`scanning ${r.totals.tib.toFixed(2)} TiB/month`));
  assert.ok(s.includes(`On-demand $${r.totals.onDemand.toFixed(2)}/month`));
  assert.ok(s.startsWith(`${r.count} query group(s)`));
  assert.ok(s.includes(`; Editions slot-hours $${r.totals.editions.toFixed(2)}/month;`));
  assert.ok(s.includes(`save up to about $${r.totals.saving.toFixed(2)}/month`));
});
