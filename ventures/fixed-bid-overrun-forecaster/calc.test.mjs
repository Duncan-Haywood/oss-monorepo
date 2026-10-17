import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast, parseSnapshots, trend, sampleSnapshots, toCsv, money } from "./calc.mjs";

const base = { price: 80000, budget: 62000, percentComplete: 45, actualCost: 55500, plannedPercent: 50 };

test("earned value, CPI and SPI", () => {
  const f = forecast(base);
  assert.equal(Math.round(f.ev), 27900);
  assert.equal(Math.round(f.pv), 31000);
  assert.ok(Math.abs(f.cpi - 27900 / 55500) < 1e-9);
  assert.ok(Math.abs(f.spi - 0.9) < 1e-9);
});

test("three estimates at completion follow the standard formulas", () => {
  const f = forecast(base);
  const [oneOff, trendEac, both] = f.scenarios.map((s) => s.eac);
  assert.ok(Math.abs(oneOff - (55500 + 62000 - 27900)) < 1e-6);
  assert.ok(Math.abs(trendEac - 62000 / (27900 / 55500)) < 1e-6);
  assert.ok(Math.abs(both - (55500 + (62000 - 27900) / ((27900 / 55500) * 0.9))) < 1e-6);
  assert.ok(trendEac > oneOff);
});

test("a job tracking its budget is ok and finishes at budget", () => {
  const f = forecast({ price: 80000, budget: 60000, percentComplete: 50, actualCost: 30000 });
  assert.equal(f.status, "ok");
  assert.ok(Math.abs(f.likely.eac - 60000) < 1e-6);
  assert.equal(f.likely.margin, 20000);
});

test("a losing job names the percent at which spend reaches the price", () => {
  const f = forecast(base);
  assert.equal(f.status, "losing");
  assert.ok(f.priceReachedAt > 0 && f.priceReachedAt < 1);
  assert.match(f.advice.join(" "), /unpaid work/);
});

test("planned percent is optional and drops SPI-based scenario", () => {
  const f = forecast({ ...base, plannedPercent: null });
  assert.equal(f.spi, null);
  assert.equal(f.scenarios.length, 2);
});

test("complete job uses actual cost", () => {
  const f = forecast({ price: 10000, budget: 8000, percentComplete: 100, actualCost: 9000 });
  assert.equal(f.likely.eac, 9000);
  assert.equal(f.likely.margin, 1000);
});

test("errors: nothing started, bad ranges, non-numbers", () => {
  assert.match(forecast({ ...base, percentComplete: 0, actualCost: 0 }).error, /started/);
  assert.match(forecast({ ...base, percentComplete: 120 }).error, /between 0 and 100/);
  assert.match(forecast({ ...base, price: NaN }).error, /price/);
  assert.match(forecast({ ...base, budget: 0 }).error, /above zero/);
  assert.match(forecast({ ...base, actualCost: -1 }).error, /negative/);
});

test("spend with no progress warns and gives no cost forecast", () => {
  const f = forecast({ price: 1000, budget: 800, percentComplete: 0, actualCost: 100 });
  assert.match(f.warnings.join(" "), /nothing is earned/);
  assert.equal(f.cpi, 0);
});

test("trend flags deteriorating CPI and the first loss", () => {
  const p = parseSnapshots(sampleSnapshots());
  const t = trend(p.snapshots, { price: 80000, budget: 62000 });
  assert.equal(t.rows.length, 4);
  assert.match(t.notes.join(" "), /deteriorating/);
  assert.match(t.notes.join(" "), /Latest interval/);
});

test("snapshot parser rejects short or non-numeric input", () => {
  assert.match(parseSnapshots("a,b,c\n1,2,3").error, /two status rows/);
  assert.match(parseSnapshots("p,pc,ac\nW1,x,100\nW2,2,3").error, /Row 2/);
});

test("csv export and money formatting", () => {
  assert.match(toCsv(forecast(base)), /^scenario,estimate_at_completion/);
  assert.equal(money(-1234.4), "-$1,234");
});
