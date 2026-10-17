import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, costToServe, revenue, offerResult, requiredPrices, pctBeatsClaimAbove, breakEvenClaims, flatCeiling, sensitivity, num, money, toCsv } from "./calc.mjs";

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("cost to serve adds handling, denial rework, software and amortised onboarding", () => {
  const c = costToServe(DEFAULTS);
  close(c.handling, 600 * (6 * 28 / 60 + 0.35));
  close(c.rework, 54 * 22 * 28 / 60);
  close(c.onboarding, 14 * 28 / 24);
  close(c.total, c.handling + c.rework + 180 + c.onboarding);
  close(c.denied, 54);
});

test("each offer earns what it says: percent of collections, fee per claim, flat fee", () => {
  const r = revenue(DEFAULTS);
  close(r.collections, 57000);
  close(r.pct, 3420);
  close(r.claim, 3900);
  close(r.flat, 3200);
});

test("margin, margin percent and effective percent of collections follow from income and cost", () => {
  const r = offerResult(DEFAULTS, "claim");
  close(r.margin, 3900 - costToServe(DEFAULTS).total);
  close(r.marginPct, r.margin / 3900 * 100);
  close(r.effectivePct, 3900 / 57000 * 100);
  close(r.perClaim, 6.5);
});

test("percent pricing beats the per-claim fee only above fee / rate collected per claim", () => {
  close(pctBeatsClaimAbove(DEFAULTS), 6.5 / 0.06);
  const o = { ...DEFAULTS, avgCollected: 6.5 / 0.06 };
  close(revenue(o).pct, revenue(o).claim);
  assert.ok(revenue({ ...o, avgCollected: 150 }).pct > revenue({ ...o, avgCollected: 150 }).claim);
});

test("required prices hit the target margin exactly", () => {
  const q = requiredPrices(DEFAULTS);
  const cost = costToServe(DEFAULTS).total;
  close(q.revNeeded * 0.7, cost);
  const o = { ...DEFAULTS, claimFee: q.claimFee };
  close(offerResult(o, "claim").marginPct, 30, 1e-6);
  const p = { ...DEFAULTS, pctRate: q.pctRate };
  close(offerResult(p, "pct").marginPct, 30, 1e-6);
});

test("break-even volume is the first volume that covers cost; flat has a ceiling instead", () => {
  const n = breakEvenClaims(DEFAULTS, "claim");
  assert.ok(offerResult(DEFAULTS, "claim", n).margin >= 0);
  assert.ok(offerResult(DEFAULTS, "claim", n - 1).margin < 0);
  const ceil = flatCeiling(DEFAULTS);
  assert.ok(offerResult(DEFAULTS, "flat", ceil).margin >= 0);
  assert.ok(offerResult(DEFAULTS, "flat", ceil + 1).margin < 0);
  assert.ok(flatCeiling(DEFAULTS, 30) < ceil);
});

test("a margin target a percent rate can never reach returns null", () => {
  assert.equal(breakEvenClaims({ ...DEFAULTS, pctRate: 3 }, "pct", 30), null);
});

test("sensitivity moves percent revenue with collections and leaves the other offers' income alone", () => {
  const rows = sensitivity(DEFAULTS);
  const lo = rows[0], base = rows[2], hi = rows[5];
  assert.ok(lo.pct < base.pct && base.pct < hi.pct);
  close(lo.claim, base.claim);
  close(lo.flat, hi.flat);
  assert.equal(base.mult, 1);
});

test("analyze picks the best offer, warns on a loser, and rejects bad input", () => {
  const a = analyze({});
  assert.equal(a.result.best.key, "claim");
  assert.ok(a.warnings.some((w) => /percent pricing earns less per claim/.test(w)));
  const loser = analyze({ flatFee: 1000 });
  assert.ok(loser.warnings.some((w) => /Flat monthly fee loses money/.test(w)));
  assert.equal(analyze({ claims: 0 }).result, null);
  assert.equal(analyze({ denialRate: 140 }).result, null);
  assert.equal(analyze({ targetMargin: 100 }).result, null);
  assert.equal(analyze({ hourly: -5 }).result, null);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("csv has one row per sensitivity step", () => {
  const a = analyze({});
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 1 + a.rows.length);
  assert.equal(toCsv({ rows: [] }), "");
});
