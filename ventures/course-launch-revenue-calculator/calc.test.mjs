import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, perBuyer, sampleJob, reportCsv, money, money2, DEFAULTS } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const job = (o = {}) => ({ listSize: 1000, visitPct: 10, convPct: 5, price: 100, refundPct: 0, processorPct: 0, processorFixed: 0, platformPct: 0, affiliateSalesPct: 0, ...o });

test("hand-calculated: 1000 list x 10% visit x 5% buy = 5 buyers at $100 = $500, no costs", () => {
  const r = analyze(job());
  near(r.totals.buyers, 5);
  near(r.totals.grossRevenue, 500);
  near(r.totals.net, 500);
});

test("refunds return the price but processor fees stay; platform fee and affiliate apply to kept sales only", () => {
  const pb = perBuyer({ ...DEFAULTS, price: 200, refundPct: 10, processorPct: 3, processorFixed: 0.5, platformPct: 10, affiliateSalesPct: 50, affiliateCommissionPct: 40 });
  near(pb.refunds, 20);
  near(pb.processor, 6.5);
  near(pb.platform, 200 * 0.1 * 0.9);
  near(pb.affiliate, 200 * 0.5 * 0.4 * 0.9);
  near(pb.net, 200 - 20 - 6.5 - 18 - 36);
});

test("ad spend buys visitors at the CPC and they convert at the paid rate", () => {
  const r = analyze(job({ listSize: 0, adSpend: 1000, cpc: 2, paidConvPct: 2 }));
  near(r.totals.paidVisitors, 500);
  near(r.totals.paidBuyers, 10);
  near(r.totals.net, 10 * 100 - 1000);
  near(r.totals.roas, 1);
});

test("break-even buyers, visit-to-sale rate and list size follow from the costs", () => {
  const r = analyze(job({ fixedCosts: 1000 }));
  near(r.totals.beBuyers, 10);
  near(r.totals.beConvPct, 10 / 100 * 100);
  near(r.totals.beListSize, 10 / (0.1 * 0.05));
});

test("a launch already above break-even needs no extra list", () => {
  const r = analyze(job({ fixedCosts: 100 }));
  assert.ok(r.totals.net > 0);
  assert.ok(r.totals.beListSize < 1000);
});

test("conversion scenarios scale buyers linearly and the 1x row equals the base case", () => {
  const r = analyze(job());
  const one = r.conv.find((c) => c.scale === 1);
  near(one.net, r.totals.net);
  near(r.conv.find((c) => c.scale === 0.5).buyers, r.totals.buyers / 2);
});

test("price ladder: buyers needed to match today's profit rises when net per buyer falls", () => {
  const r = analyze(job({ fixedCosts: 100 }));
  const half = r.prices.find((p) => p.price === 50);
  near(half.buyersToMatch, (r.totals.net + 100) / 50);
  const same = r.prices.find((p) => p.price === 100);
  near(same.buyersToMatch, r.totals.buyers);
});

test("validation: missing price, no traffic, impossible percentages, ads without a CPC", () => {
  assert.match(analyze(job({ price: 0 })).error, /price/);
  assert.match(analyze({ price: 100 }).error, /traffic/);
  assert.match(analyze(job({ refundPct: 100 })).error, /refund/i);
  assert.match(analyze(job({ convPct: 120 })).error, /cannot be above 100/);
  assert.match(analyze(job({ adSpend: 500 })).error, /CPC/);
  assert.match(analyze(job({ price: -5 })).error, /Check the number/);
});

test("warnings: fees that eat the price, ads that lose on the first sale, optimistic conversion", () => {
  assert.match(analyze(job({ platformPct: 60, affiliateSalesPct: 100, affiliateCommissionPct: 60 })).warnings.join(" "), /keeps nothing/);
  assert.match(analyze(job({ adSpend: 1000, cpc: 1, paidConvPct: 0.5 })).warnings.join(" "), /ads alone lose money/);
  assert.match(analyze(job({ convPct: 12 })).warnings.join(" "), /unusual/);
});

test("sample job runs clean and is profitable on its own numbers", () => {
  const r = analyze(sampleJob().settings);
  assert.equal(r.error, undefined);
  assert.ok(r.totals.net > 0);
  assert.match(r.verdict, /clears/);
});

test("CSV has the break-even lines and escapes nothing odd", () => {
  const csv = reportCsv(analyze(sampleJob().settings));
  assert.match(csv, /Net profit,/);
  assert.match(csv, /Break-even list size,/);
  assert.match(csv, /Conversion scenario %,Buyers,Net profit/);
});

test("money formatting", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
