import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, normalizeOrders, analyze, breakEvenShare, codesCsv, sampleCsv, money, pct } from "./calc.mjs";

const load = (csv) => {
  const n = normalizeOrders(parseCsv(csv, detectDelimiter(csv)));
  assert.equal(n.error, undefined);
  return n;
};

const H = "Name,Email,Financial Status,Subtotal,Total,Discount Code,Discount Amount,Created at,Lineitem quantity,Lineitem price,Refunded Amount,Cancelled at";

test("multi-line orders count once, using the first row's order fields", () => {
  const n = load([H, "#1,a@x.com,paid,90.00,96.00,SAVE10,10.00,2026-08-01 10:00:00 -0500,1,100,0.00,", "#1,,,,,,,,2,0,,"].join("\n"));
  assert.equal(n.orders.length, 1);
  assert.equal(n.orders[0].gross, 100);
  assert.equal(n.orders[0].discount, 10);
  assert.deepEqual(n.orders[0].codes, ["SAVE10"]);
});

test("cancelled and voided orders are excluded and counted", () => {
  const n = load([H, "#1,a@x.com,paid,50,56,,0,,1,50,0,", "#2,b@x.com,voided,50,56,,0,,1,50,0,", "#3,c@x.com,paid,50,56,,0,,1,50,0,2026-08-02"].join("\n"));
  assert.equal(n.orders.length, 1);
  assert.equal(n.cancelled, 2);
});

test("a file with no discount columns is refused with a reason", () => {
  const n = normalizeOrders(parseCsv("Name,Total\n#1,10", ","));
  assert.match(n.error, /Discount/);
});

test("break-even share: d(1-fee)/m, unbounded when the discount exceeds the margin", () => {
  assert.ok(Math.abs(breakEvenShare(0.2, 0.5, 0) - 0.4) < 1e-12);
  assert.ok(Math.abs(breakEvenShare(0.2, 0.5, 0.03) - 0.388) < 1e-12);
  assert.equal(breakEvenShare(0.6, 0.5, 0), Infinity);
  assert.equal(breakEvenShare(0.2, 0, 0), null);
});

test("break-even share really is where the incremental and lost margin cancel", () => {
  const cogs = 0.4, f = 0.029, d = 0.25, m = 1 - cogs - f;
  const s = breakEvenShare(d, m, f);
  const gain = m - d * (1 - f), loss = d * (1 - f);
  assert.ok(Math.abs(s * gain - (1 - s) * loss) < 1e-12);
});

test("by-code totals reconcile with the summary", () => {
  const { orders } = load(sampleCsv());
  const r = analyze(orders, { cogsPct: 0.35 });
  const d = r.byCode.reduce((a, c) => a + c.discount, 0);
  const n = r.byCode.reduce((a, c) => a + c.orders, 0);
  assert.ok(Math.abs(d - r.summary.discount) < 1e-6);
  assert.equal(n, r.summary.orders);
  assert.equal(r.byBand.reduce((a, b) => a + b.orders, 0), r.summary.orders);
});

test("synthetic store: the 40% influencer code is the flagged one", () => {
  const { orders } = load(sampleCsv());
  const r = analyze(orders, { cogsPct: 0.35 });
  const inf = r.byCode.find((c) => c.key === "INFLUENCER40");
  assert.ok(inf.rate > 0.39 && inf.rate < 0.41);
  assert.ok(inf.refundRate > r.noCode.refundRate);
  assert.ok(r.findings.some((f) => f.title.includes("INFLUENCER40")));
});

test("without a cost percentage no margin claims are made", () => {
  const { orders } = load(sampleCsv());
  const r = analyze(orders, {});
  assert.equal(r.summary.hasCogs, false);
  assert.ok(r.byCode.every((c) => c.breakEven === null));
  assert.equal(r.summary.contribution, null);
});

test("returning-customer discount only counts repeat within the file", () => {
  const csv = [H, "#1,a@x.com,paid,90,96,X,10,2026-08-01 10:00:00 -0500,1,100,0,", "#2,a@x.com,paid,90,96,X,10,2026-08-05 10:00:00 -0500,1,100,0,"].join("\n");
  const r = analyze(load(csv).orders, {});
  assert.equal(r.summary.returningDiscount, 10);
  assert.equal(r.summary.newDiscount, 10);
  assert.equal(r.summary.returningShare, 0.5);
});

test("a deep code on a thin margin is reported as losing money outright", () => {
  const rows = [H];
  for (let i = 0; i < 6; i++) rows.push(`#${i},b${i}@x.com,paid,40,46,DEEP60,60,2026-08-0${i + 1} 10:00:00 -0500,1,100,0,`);
  const r = analyze(load(rows.join("\n")).orders, { cogsPct: 0.5 });
  assert.equal(r.byCode[0].breakEven, Infinity);
  assert.ok(r.findings.some((f) => f.severity === "high" && /more than the margin/.test(f.detail + f.title)));
  assert.equal(r.summary.losing, 6);
});

test("stacked codes are split and counted", () => {
  const csv = [H, '#1,a@x.com,paid,80,86,"A, B",20,2026-08-01 10:00:00 -0500,1,100,0,'].join("\n");
  const r = analyze(load(csv).orders, {});
  assert.equal(r.summary.stacked, 1);
  assert.deepEqual(r.byCode.map((c) => c.key).sort(), ["A", "B"]);
});

test("codesCsv quotes and includes every code", () => {
  const { orders } = load(sampleCsv());
  const csv = codesCsv(analyze(orders, { cogsPct: 0.3 }));
  assert.match(csv.split("\n")[0], /^code,orders/);
  assert.ok(csv.includes('"WELCOME10"'));
});

test("formatters", () => {
  assert.equal(money(1234.5), "1,234.50");
  assert.equal(pct(0.1234), "12.3%");
  assert.equal(pct(null), "–");
});
