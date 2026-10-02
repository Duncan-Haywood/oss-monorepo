import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWarehouses, analyze, summarize, normalizeSize, smallerSize } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/warehouses.csv", import.meta.url), "utf8");
const by = (r) => Object.fromEntries(r.warehouses.map((w) => [w.name, w]));

test("sizes normalise from short and long forms; unknown sizes are skipped", () => {
  assert.equal(normalizeSize("X-Small"), "XS");
  assert.equal(normalizeSize("2X-Large"), "2XL");
  assert.equal(normalizeSize("xlarge"), "XL");
  assert.equal(normalizeSize("huge"), null);
  assert.equal(smallerSize("L"), "M");
  assert.equal(smallerSize("XS"), null);
});

test("parser maps headers, reads never/blank/0 as 0, skips bad rows", () => {
  const p = parseWarehouses("# c\nsize,warehouse,credits_month,auto_suspend_seconds\nS,A,10,never\nM,B,5,\nM,C,5,300\nhuge,D,1,60\nS,E,x,60\n");
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows.map((r) => r.suspend), [0, 0, 300]);
  assert.equal(p.skipped, 2);
});

test("fixture: long AUTO_SUSPEND saving is resumes x excess seconds x credits/hour x price, capped at 80% of credits", () => {
  const r = analyze(parseWarehouses(text));
  const bi = by(r)["BI_DASHBOARDS"];
  assert.ok(Math.abs(bi.saving - ((520 * 540) / 3600) * 8 * 3) < 1e-6);
  const adhoc = by(r)["ADHOC_ANALYSTS"];
  assert.ok(Math.abs(adhoc.saving - ((120 * 840) / 3600) * 4 * 3) < 1e-6);
  assert.equal(by(r)["ETL_NIGHTLY"].saving, 0);
  const capped = analyze(parseWarehouses("W,M,100,3600,50,5,5000"));
  assert.ok(Math.abs(capped.totals.saving - 100 * 0.8 * 3) < 1e-9);
});

test("idle warehouse (no queries) saves its whole bill and prints the drop command; never-suspend is flagged", () => {
  const r = analyze(parseWarehouses(text));
  const f = r.findings.find((x) => x.rule === "idle-warehouse");
  assert.equal(f.row, "OLD_REPORTING");
  assert.match(f.message, /DROP WAREHOUSE OLD_REPORTING/);
  assert.ok(Math.abs(by(r)["OLD_REPORTING"].saving - 1460 * 3) < 1e-9);
  const busy = analyze(parseWarehouses("W,S,1460,never,900,30,1"));
  assert.ok(busy.findings.some((x) => x.rule === "never-suspends"));
});

test("right-sizing is an upper bound: reported, never in the totals", () => {
  const r = analyze(parseWarehouses(text));
  const f = r.findings.find((x) => x.rule === "oversized-for-short-queries");
  assert.equal(f.row, "BI_DASHBOARDS");
  assert.match(f.message, /WAREHOUSE_SIZE = 'M'/);
  assert.ok(!r.findings.some((x) => x.rule === "oversized-for-short-queries" && x.row === "ETL_NIGHTLY"));
  assert.ok(Math.abs(r.totals.potential - 1400 * 3 * 0.5) < 1e-9);
  assert.ok(Math.abs(r.totals.saving - (by(r)["BI_DASHBOARDS"].saving + by(r)["ADHOC_ANALYSTS"].saving + 1460 * 3)) < 1e-6);
});

test("many tiny warehouses and dominance notes", () => {
  const r = analyze(parseWarehouses("A,XS,5,60,10,2,3\nB,XS,6,60,10,2,3\nC,XS,4,60,10,2,3\nBIG,L,900,60,100,300,10"));
  assert.ok(r.findings.some((f) => f.rule === "many-tiny-warehouses"));
  assert.ok(r.findings.some((f) => f.rule === "one-warehouse-dominates" && f.row === "BIG"));
});

test("a healthy single warehouse is fine; summary and empty input", () => {
  const r = analyze(parseWarehouses("ETL,XL,300,60,400,500,20"));
  assert.equal(r.findings[0].rule, "warehouses-fine");
  assert.equal(summarize(r).status, "ok");
  assert.equal(summarize(analyze(parseWarehouses(text))).status, "warn");
  assert.equal(summarize(analyze(parseWarehouses("nothing"))).status, "none");
});
