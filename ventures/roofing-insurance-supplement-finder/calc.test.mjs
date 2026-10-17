import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, LINES, num, money, money2, neededSquares, shingleGap, lineGaps, supplement,
  depreciationPct, claimPayments, netAfterFee, supplementShare, sensitivity,
} from "./calc.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// Round numbers so every figure is hand-checkable: a 20-square roof, 10% waste needed,
// the adjuster paid 21 squares (20 x 1.05), one missing line, no O&P, no tax.
const zero = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, 0]));
const simple = {
  ...zero, netSquares: 20, estimateSquares: 21, neededWastePct: 10, paidSqPrice: 400, yourSqPrice: 400,
  dripEdgeMeasured: 200, dripEdgePaid: 0, dripEdgePrice: 3, originalRcv: 10000, deductible: 1000,
  roofAge: 10, roofLife: 20, maxDepPct: 100, depRecoverable: 1, acceptPct: 100,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("8%"), 8);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});

test("squares needed are net area times one plus waste", () => {
  close(neededSquares(simple), 22);
  close(neededSquares({ ...simple, neededWastePct: 0 }), 20);
});

test("missing squares are priced at your price, price gap at the difference on paid squares", () => {
  const g = shingleGap(simple);
  close(g.missingSquares, 1);
  close(g.quantityGap, 400);
  close(g.priceGap, 0);
  const p = shingleGap({ ...simple, yourSqPrice: 450 });
  close(p.quantityGap, 450); // the missing square at your price
  close(p.quantityGapAtTheirPrice, 400);
  close(p.priceGap, 21 * 50);
  close(p.total, 450 + 1050);
});

test("an estimate with enough squares has no shingle gap, and a lower price of yours is not a gap", () => {
  const g = shingleGap({ ...simple, estimateSquares: 24, yourSqPrice: 350 });
  close(g.missingSquares, 0);
  close(g.total, 0);
});

test("line gaps split missing from over-included and mark status", () => {
  const rows = lineGaps({ ...simple, ridgeCapMeasured: 50, ridgeCapPaid: 80, ridgeCapPrice: 10, permitMeasured: 1, permitPaid: 1, permitPrice: 200 });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(rows.length, LINES.length);
  assert.equal(by.dripEdge.status, "missing");
  close(by.dripEdge.missing, 600);
  assert.equal(by.ridgeCap.status, "over");
  close(by.ridgeCap.over, 300);
  close(by.ridgeCap.missing, 0);
  assert.equal(by.permit.status, "matches");
  assert.equal(by.starter.status, "unused");
});

test("supplement adds shingle gap and missing lines, and leaves over-included lines out", () => {
  const s = supplement({ ...simple, ridgeCapMeasured: 50, ridgeCapPaid: 80, ridgeCapPrice: 10 });
  close(s.shingle.total, 400);
  close(s.linesMissing, 600);
  close(s.linesOver, 300);
  close(s.subtotal, 1000);
  close(s.rcv, 1000);
});

test("overhead and profit add up on the subtotal only when switched on, tax only on the material share", () => {
  const base = { ...simple, overheadPct: 10, profitPct: 10, materialSharePct: 50, taxPct: 8 };
  const on = supplement({ ...base, opApplies: 1 });
  close(on.opPct, 20);
  close(on.op, 200);
  close(on.tax, 1000 * 0.5 * 0.08);
  close(on.rcv, 1000 + 200 + 40);
  const off = supplement({ ...base, opApplies: 0 });
  close(off.op, 0);
  close(off.rcv, 1040);
});

test("depreciation is age over life, capped at the maximum, and zero without a life", () => {
  close(depreciationPct(simple), 0.5);
  close(depreciationPct({ ...simple, roofAge: 30 }), 1);
  close(depreciationPct({ ...simple, maxDepPct: 80 }), 0.4);
  close(depreciationPct({ ...simple, roofLife: 0 }), 0);
});

test("claim payments: ACV now, the rest on completion when recoverable", () => {
  const c = claimPayments(simple);
  // original: RCV 10000, dep 50% -> ACV 5000, less 1000 deductible = 4000 now; 9000 on completion.
  close(c.before.acvNow, 4000);
  close(c.before.held, 5000);
  close(c.before.onCompletion, 9000);
  // supplement 1000 at 100% accepted -> RCV 11000 -> ACV 5500 - 1000 = 4500; 10000 on completion.
  close(c.accepted, 1000);
  close(c.after.acvNow, 4500);
  close(c.after.onCompletion, 10000);
  close(c.extraNow, 500);
  close(c.extraOnCompletion, 1000);
});

test("non-recoverable depreciation never pays out on completion; a deductible never makes a payment negative", () => {
  const c = claimPayments({ ...simple, depRecoverable: 0 });
  close(c.before.onCompletion, c.before.acvNow);
  close(c.extraOnCompletion, c.extraNow);
  const big = claimPayments({ ...simple, deductible: 50000 });
  close(big.before.acvNow, 0);
  close(big.after.onCompletion, 0);
});

test("acceptance scales the supplement and a fee takes its share of what is recovered", () => {
  close(claimPayments({ ...simple, acceptPct: 50 }).accepted, 500);
  close(netAfterFee(simple, 50, 20), 1000 * 0.5 * 0.8);
  close(netAfterFee(simple, 150, 0), 1000); // percent is capped at 100
});

test("supplement share of the original estimate, null without an estimate", () => {
  close(supplementShare(simple), 0.1);
  assert.equal(supplementShare({ ...simple, originalRcv: 0 }), null);
});

test("sensitivity grid has one row per acceptance level and agrees with netAfterFee", () => {
  const g = sensitivity(simple);
  assert.equal(g.length, 4);
  assert.equal(g[0].cells.length, 4);
  for (const row of g) for (const c of row.cells) close(c.net, netAfterFee(simple, row.acceptPct, c.feePct));
});

test("default example matches the worked hand calculation", () => {
  const s = supplement(DEFAULTS);
  close(s.shingle.total, 3600); // 3 sq x 465 + 31.5 sq x 70
  close(s.linesMissing, 3761.5);
  close(s.subtotal, 7361.5);
  close(s.op, 1472.3);
  close(s.rcv, 9010.48);
  close(depreciationPct(DEFAULTS), 0.48);
});

test("garbage input never throws or produces NaN", () => {
  const bad = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, NaN]));
  const s = supplement(bad);
  assert.equal(s.rcv, 0);
  const c = claimPayments(bad);
  for (const v of [c.dep, c.accepted, c.before.acvNow, c.after.onCompletion]) assert.ok(Number.isFinite(v));
  assert.equal(supplementShare(bad), null);
});
