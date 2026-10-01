import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepairs, parseFeeTiers, buyerFee, economics, maxBid, breakEvenBid, analyze, reportCsv, sampleRepairs, sampleFeeTiers, DEFAULTS } from "./calc.mjs";

const near = (a, b, e = 0.011) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("parseRepairs reads lines, skips a header and bad rows", () => {
  const r = parseRepairs("item,cost\nBumper,640\nPaint, blend,720\nbad,abc\n300");
  assert.equal(r.rows.length, 3);
  assert.equal(r.total, 1660);
  assert.equal(r.rows[1].name, "Paint, blend");
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(parseRepairs("").rows, []);
});

test("parseFeeTiers sorts tiers and understands dollars and percent", () => {
  const t = parseFeeTiers("bid up to,fee\n1999.99,8%\n499.99,60");
  assert.equal(t.tiers.length, 2);
  assert.equal(t.tiers[0].upTo, 499.99);
  assert.equal(t.tiers[1].pct, true);
  assert.equal(parseFeeTiers("100,150%").tiers.length, 0);
});

test("buyerFee picks the first tier that covers the bid, the last tier above the table, zero with no tiers", () => {
  const { tiers } = parseFeeTiers("499.99,60\n1999.99,8%");
  assert.equal(buyerFee(300, tiers), 60);
  assert.equal(buyerFee(1000, tiers), 80);
  assert.equal(buyerFee(5000, tiers), 400);
  assert.equal(buyerFee(500, []), 0);
  assert.equal(buyerFee(0, tiers), 0);
});

test("economics by hand: bid 3000, 10% fee, 6% tax on bid+fees, repairs 1000, resale 6500", () => {
  const { tiers } = parseFeeTiers("999999,10%");
  const o = { ...DEFAULTS, resale: 6500, transport: 300, titleFees: 100, taxRatePct: 6, holdingDays: 20, holdingPerDay: 5, sellPct: 3, sellFixed: 50 };
  const e = economics(3000, 1000, tiers, o);
  assert.equal(e.fee, 300);
  near(e.tax, 198);
  near(e.acquisition, 3498);
  near(e.carry, 100);
  near(e.selling, 245);
  near(e.landed, 3498 + 300 + 100 + 1000 + 100 + 245);
  near(e.profit, 6500 - 5243);
});

test("tax base 'bid' and 'none' change what is taxed", () => {
  const { tiers } = parseFeeTiers("999999,10%");
  const base = { ...DEFAULTS, resale: 6500, taxRatePct: 10 };
  near(economics(1000, 0, tiers, { ...base, taxBase: "bid" }).tax, 100);
  near(economics(1000, 0, tiers, { ...base, taxBase: "bid-and-fees", flatFees: 100 }).tax, 120);
  assert.equal(economics(1000, 0, tiers, { ...base, taxBase: "none" }).tax, 0);
});

test("financing interest grows with days held", () => {
  const o = { ...DEFAULTS, resale: 10000, aprPct: 12, holdingDays: 73 };
  near(economics(4000, 1000, [], o).interest, 5000 * 0.12 * 73 / 365);
});

test("maxBid is the largest bid that still earns the required profit", () => {
  const { tiers } = parseFeeTiers("499.99,60\n999999,10%");
  const o = { ...DEFAULTS, resale: 6500, transport: 300, repairsPlaceholder: 0, targetProfit: 1000, taxRatePct: 6 };
  const m = maxBid(1000, tiers, o);
  assert.ok(economics(m, 1000, tiers, o).profit >= 1000 - 1e-6);
  assert.ok(economics(m + 0.05, 1000, tiers, o).profit < 1000);
  const be = breakEvenBid(1000, tiers, o);
  assert.ok(be > m);
  near(economics(be, 1000, tiers, o).profit, 0, 0.1);
});

test("maxBid is null when fixed costs already eat the margin", () => {
  assert.equal(maxBid(9000, [], { ...DEFAULTS, resale: 6000, targetProfit: 500 }), null);
});

test("a percent target of resale beats a smaller dollar target", () => {
  const a = analyze(1000, [], { resale: 10000, targetProfit: 500, targetPct: 20 });
  near(a.required, 2000);
  const b = analyze(1000, [], { resale: 10000, targetProfit: 500, targetPct: 0 });
  assert.ok(b.maxBid > a.maxBid);
});

test("analyze builds a ladder, a stress grid that tightens, and plan-bid verdicts", () => {
  const { tiers } = parseFeeTiers(sampleFeeTiers());
  const r = analyze(parseRepairs(sampleRepairs()).total, tiers, { resale: 9500, transport: 350, titleFees: 120, taxRatePct: 6, holdingDays: 30, holdingPerDay: 8, sellPct: 2, targetProfit: 1500 }, "3200");
  assert.equal(r.ladder.length, 8);
  assert.ok(r.maxBid > 0);
  const row0 = r.stress[0].cells, row3 = r.stress[3].cells;
  for (let i = 1; i < row0.length; i++) assert.ok(row0[i].maxBid < row0[i - 1].maxBid);
  assert.ok(row3[0].maxBid < row0[0].maxBid);
  near(row0[0].maxBid, r.maxBid);
  assert.equal(typeof r.plan.meetsTarget, "boolean");
  assert.ok(r.plan.meetsTarget === (r.plan.profit >= r.required - 1e-9));
  assert.match(r.verdict, /Bid up to/);
});

test("analyze rejects bad input and warns about missing fees", () => {
  assert.match(analyze(0, [], { resale: 0 }).error, /resale/);
  assert.match(analyze(0, [], { resale: 5000, taxRatePct: 120 }).error, /under 100/);
  assert.match(analyze(-5, [], { resale: 5000 }).error, /Repairs/);
  assert.match(analyze(0, [], { resale: 5000, transport: "abc" }).error, /transport/);
  assert.ok(analyze(500, [], { resale: 5000 }).warnings.some((w) => /No buyer fee tiers/.test(w)));
  assert.match(analyze(0, [], { resale: 5000 }, "x").error, /bid you plan/);
});

test("a no-win car says so", () => {
  const r = analyze(9000, [], { resale: 6000, targetProfit: 500 });
  assert.equal(r.maxBid, null);
  assert.match(r.verdict, /No bid works/);
  assert.equal(r.ladder.length, 8);
});

test("CSV has the ladder, the max bid row and the stress grid", () => {
  const r = analyze(1000, [], { resale: 8000 });
  const csv = reportCsv(r);
  assert.match(csv, /Bid,Buyer fee/);
  assert.match(csv, /Max bid,Break-even bid/);
  assert.match(csv, /\+100% repairs/);
});
