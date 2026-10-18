import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStock, orderPlan, qnorm, parseDate, dayToIso, parseSales, bucketSales, backtest, methodSet, analyze, reportCsv, sampleText } from "./calc.mjs";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("qnorm matches the standard normal table", () => {
  near(qnorm(0.5), 0, 1e-9);
  near(qnorm(0.95), 1.644854, 1e-5);
  near(qnorm(0.975), 1.959964, 1e-5);
  near(qnorm(0.01), -2.326348, 1e-5);
  near(qnorm(0.999), 3.090232, 1e-5);
  assert.equal(qnorm(0), -Infinity);
});

test("parseDate reads ISO, month-only and slash dates and rejects nonsense", () => {
  assert.equal(dayToIso(parseDate("2025-03-14")), "2025-03-14");
  assert.equal(dayToIso(parseDate("2025-03-14T10:22:00Z")), "2025-03-14");
  assert.equal(dayToIso(parseDate("2025-03")), "2025-03-01");
  assert.equal(dayToIso(parseDate("3/14/2025")), "2025-03-14");
  assert.equal(dayToIso(parseDate("14/3/2025")), "2025-03-14");
  assert.equal(parseDate("2025-02-30"), null);
  assert.equal(parseDate("hello"), null);
  assert.equal(parseDate(""), null);
});

test("parseSales finds columns by header, handles quotes, nets returns and reports bad lines", () => {
  const p = parseSales('Created at;Lineitem sku;Lineitem quantity\n2025-01-02;"A, big";3\n2025-01-03;"A, big";-1\nbad;row;x\n2025-01-04;B;2\n');
  assert.equal(p.rows.length, 3);
  assert.equal(p.rows[0].sku, "A, big");
  assert.equal(p.returns, 1);
  assert.equal(p.skipped, 1);
  assert.deepEqual(p.skippedLines, [4]);
});

test("parseSales works headerless and with only a date and a quantity", () => {
  const three = parseSales("2025-01-02,A,3\n2025-01-03,B,4");
  assert.deepEqual(three.rows.map((r) => r.sku), ["A", "B"]);
  const two = parseSales("2025-01-02,3\n2025-01-03,4");
  assert.deepEqual(two.rows.map((r) => r.sku), ["All products", "All products"]);
  assert.match(parseSales("").error, /No data/);
  assert.match(parseSales("name,price\nx,1").error, /date column/);
});

test("bucketSales sums by week and month without losing units", () => {
  const rows = [];
  for (let d = parseDate("2025-01-06"); d < parseDate("2025-03-03"); d++) rows.push({ sku: "A", day: d, qty: 1 });
  const wk = bucketSales(rows, "week", "keep");
  assert.equal(wk.periods, 8);
  assert.deepEqual(wk.series.get("A"), new Array(8).fill(7));
  const mo = bucketSales(rows, "month", "keep");
  assert.equal(mo.series.get("A").reduce((a, b) => a + b), rows.length);
  assert.deepEqual(mo.series.get("A").slice(0, 2), [26, 28]);
});

test("a part-filled last week is dropped from daily data, and kept on request", () => {
  const rows = [];
  for (let d = parseDate("2025-01-06"); d <= parseDate("2025-02-05"); d++) rows.push({ sku: "A", day: d, qty: 2 }); // ends on a Wednesday
  const auto = bucketSales(rows, "week", "auto");
  assert.equal(auto.periods, 4);
  assert.equal(auto.dropped.length, 1);
  assert.equal(bucketSales(rows, "week", "keep").periods, 5);
});

test("rows already stamped on one day of the period are not treated as partial", () => {
  const rows = Array.from({ length: 24 }, (_, i) => ({ sku: "A", day: parseDate(`${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`), qty: 5 }));
  const b = bucketSales(rows, "month", "auto");
  assert.equal(b.periods, 24);
  assert.equal(b.dropped.length, 0);
});

test("each method does the obvious thing on a series where the answer is known", () => {
  const flat = new Array(30).fill(10);
  const m = methodSet("month", true);
  for (const id of ["naive", "ma", "ses", "holt"]) near(m[id](flat, 3)[0], 10, 1e-6);
  const cycle = Array.from({ length: 36 }, (_, i) => [5, 9, 20, 8, 3, 1, 0, 2, 6, 12, 15, 7][i % 12]);
  assert.deepEqual(m.snaive(cycle, 12), cycle.slice(0, 12));
  const hw = m.hw(cycle, 12);
  hw.forEach((v, i) => near(v, cycle[i], 0.5));
  const ramp = Array.from({ length: 30 }, (_, i) => 10 + 2 * i);
  assert.ok(m.holt(ramp, 3)[2] > m.ses(ramp, 3)[2] + 3, "damped trend should extrapolate above a flat level");
  assert.ok(m.holt(ramp, 3)[2] > ramp[29]);
  const lumpy = [0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10];
  const c = m.croston(lumpy, 2)[0];
  assert.ok(c > 0.8 && c < 4, String(c));
  assert.deepEqual(m.croston([0, 0, 0], 2), [0, 0]);
  for (const id of Object.keys(m)) assert.ok(m[id](ramp.map((x) => -x), 2).every((v) => v >= 0), id + " must not forecast negative demand");
});

test("the back-test never lets a method see the period it is forecasting", () => {
  const y = Array.from({ length: 40 }, (_, i) => 10 + (i === 30 ? 1000 : 0));
  const bt = backtest(y, 1, "week");
  const at = bt.origins.indexOf(30);
  assert.ok(at >= 0);
  assert.equal(bt.methods.naive.forecast[at], 10, "naive forecast made before the spike must not include it");
  assert.equal(bt.methods.naive.error[at], 10 - 1010);
  assert.equal(bt.methods.naive.forecast[bt.origins.indexOf(31)], 1010);
});

test("on a perfectly seasonal series a seasonal method wins and beats repeating last period", () => {
  const cyc = [5, 9, 20, 8, 3, 1, 0, 2, 6, 12, 15, 7];
  const rows = [];
  for (let i = 0; i < 48; i++) rows.push({ sku: "S", day: parseDate(`${2022 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`), qty: cyc[i % 12] * 10 });
  const r = analyze(rows, { period: "month", leadDays: 30 });
  const s = r.skus[0];
  assert.ok(["snaive", "hw"].includes(s.method), s.method);
  assert.ok(s.wape < 0.02, String(s.wape));
  assert.ok(s.naiveWape > 0.4);
  assert.ok(s.gain > 0.9);
  assert.ok(s.safetyStock < 5);
});

test("analyze on the example is finite, ordered, and keeps the arithmetic consistent", () => {
  const p = parseSales(sampleText());
  const r = analyze(p.rows, { period: "month", leadDays: 60, serviceLevel: 0.95 });
  assert.equal(r.skus.length, 20);
  for (const s of r.skus) {
    assert.ok(Number.isFinite(s.leadDemand) && s.leadDemand >= 0, s.sku);
    if (s.reorderPoint !== null) near(s.reorderPoint, s.leadDemand + s.safetyStock, 1e-9);
    assert.ok(s.safetyStock === null || s.safetyStock >= 0);
    assert.ok(["A", "B", "C"].includes(s.abc) && ["X", "Y", "Z"].includes(s.xyz));
  }
  for (let i = 1; i < r.skus.length; i++) assert.ok(r.skus[i - 1].total >= r.skus[i].total);
  near(r.summary.classes.reduce((a, c) => a + c.share, 0), 1, 1e-9);
  assert.ok(r.skus.slice(0, 3).every((s) => s.abc === "A"));
  assert.equal(JSON.stringify(analyze(p.rows, { period: "month", leadDays: 60 })), JSON.stringify(analyze(p.rows, { period: "month", leadDays: 60 })));
});

test("the new product is back-tested from its first sale, not from the start of the file", () => {
  const p = parseSales(sampleText());
  const r = analyze(p.rows, { period: "month", leadDays: 60 });
  const s = r.skus.find((x) => x.sku === "SKU-020");
  assert.equal(s.periods, 18);
});

test("the winner is chosen on older points and scored on newer ones", () => {
  const p = parseSales(sampleText());
  const r = analyze(p.rows, { period: "month", leadDays: 60 });
  const s = r.skus.find((x) => x.sku === "SKU-013");
  assert.equal(s.verified, true);
  assert.ok(s.origins >= 9);
  const short = analyze(parseSales(sampleText().split("\n").filter((l, i) => i === 0 || l.slice(0, 7) >= "2025-07").join("\n")).rows, { period: "month", leadDays: 60 });
  assert.match(short.error ?? "", /at least 12/);
});

test("a short history gets a plain fallback and no invented safety stock", () => {
  const monday = parseDate("2025-01-06");
  const rows = Array.from({ length: 13 }, (_, i) => ({ sku: "N", day: monday + 7 * i, qty: 10 + (i % 2) }));
  const r = analyze(rows, { period: "week", leadDays: 14, partial: "keep" });
  const s = r.skus[0];
  assert.equal(s.verified, false);
  assert.equal(s.safetyStock, null);
  assert.equal(s.method, "ma");
  assert.match(s.flags[0], /Too little history/);
});

test("reportCsv has a header, one row per SKU and quotes awkward names", () => {
  const rows = [];
  for (let i = 0; i < 36; i++) rows.push({ sku: 'Widget, "large"', day: parseDate(`${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`), qty: 20 + (i % 3) });
  const r = analyze(rows, { period: "month", leadDays: 30 });
  const csv = reportCsv(r).trim().split("\n");
  assert.equal(csv.length, 2);
  assert.match(csv[1], /^"Widget, ""large"""/);
});

test("parseStock finds columns, sums duplicate SKUs and reports bad rows", () => {
  const r = parseStock("Item,Qty on hand,Open PO,MOQ,Case size\nA-1,10,5,20,6\na-1,2,0,,\nB,x,0,,\n,3,0,,\n");
  assert.equal(r.stock.size, 1);
  assert.deepEqual(r.stock.get("a-1"), { sku: "A-1", onHand: 12, onOrder: 5, moq: 20, pack: 6 });
  assert.equal(r.skipped, 2);
  assert.ok(parseStock("sku,price\nA,3").error);
  assert.ok(parseStock("sku,on_hand").error);
});

test("orderPlan orders up to target only at or below the reorder point, honours MOQ and packs, and flags gaps and excess", () => {
  const res = analyze(parseSales(sampleText()).rows, { period: "month", leadDays: 60 });
  const [a, b, c] = res.skus.filter((s) => s.safetyStock !== null);
  const stock = parseStock(
    `sku,on_hand,on_order,moq,pack_size\n${a.sku},0,0,1000,12\n${b.sku},${Math.ceil(b.reorderPoint + 1)},0,,\n${c.sku},${Math.ceil(c.leadDemand * 10)},0,,\nGHOST,1,0,,\n`,
  ).stock;
  const plan = orderPlan(res, stock);
  assert.equal(a.order.status, "order");
  assert.ok(a.order.qty >= 1000 && a.order.qty % 12 === 0, "MOQ then whole packs");
  assert.equal(b.order.status, "ok");
  assert.equal(b.order.qty, 0);
  assert.equal(c.order.status, "excess");
  assert.equal(plan.ordered, 1);
  assert.equal(plan.units, a.order.qty);
  assert.deepEqual(plan.unmatchedStock, ["GHOST"]);
  assert.ok(a.order.notes.some((n) => /expedite/.test(n)), "empty shelf cannot cover the lead time");
  // Stock already on order counts toward the position.
  const covered = orderPlan(res, parseStock(`sku,on_hand,on_order\n${a.sku},0,${Math.ceil(a.orderUpTo ?? a.reorderPoint * 3)}\n`).stock);
  assert.equal(a.order.qty, 0);
  assert.equal(covered.ordered, 0);
});

test("reportCsv adds order columns only when a stock file was planned", () => {
  const res = analyze(parseSales(sampleText()).rows, { period: "month", leadDays: 60 });
  assert.ok(!reportCsv(res).split("\n")[0].includes("order_qty"));
  orderPlan(res, parseStock(`sku,on_hand\n${res.skus[0].sku},0\n`).stock);
  const lines = reportCsv(res).trim().split("\n");
  assert.ok(lines[0].includes("order_qty"));
  assert.equal(lines[2].split(",").length, lines[0].split(",").length);
});
