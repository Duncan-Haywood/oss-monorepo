import { test } from "node:test";
import assert from "node:assert/strict";
import { readInputs, payout, bracketCut, unitsForProfit, compareStores, findings, unitsFromWishlists, csvOf, DEFAULTS, STORES } from "./calc.mjs";

const base = (over = {}) => readInputs({ ...DEFAULTS, realizedPct: 100, refundPct: 0, taxPct: 0, price: 10, units: 1000, ...over }).values;
const close = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("Steam takes 30% of adjusted gross below $10M and pays $7 a copy on a $10 game", () => {
  const p = payout("steam", base());
  assert.equal(p.adjustedGross, 10000);
  assert.equal(p.cut, 3000);
  assert.equal(p.received, 7000);
  assert.equal(p.takePct, 30);
});

test("the Steam Direct fee is charged below $1,000 adjusted gross and recouped at it", () => {
  assert.equal(payout("steam", base({ units: 50 })).directFeeNet, 100);
  assert.equal(payout("steam", base({ units: 100 })).directFeeNet, 0);
  assert.equal(payout("steam", base({ units: 100, steamFee: 0 })).directFeeNet, 0);
});

test("tiers apply to the slice above the threshold, not the whole game", () => {
  assert.equal(bracketCut(STORES.steam.brackets, 0, 10_000_000), 3_000_000);
  assert.equal(bracketCut(STORES.steam.brackets, 9_000_000, 2_000_000), 300_000 + 0.25 * 1_000_000);
  assert.equal(bracketCut(STORES.steam.brackets, 12_000_000, 1000), 250);
  assert.equal(bracketCut(STORES.steam.brackets, 0, 0), 0);
});

test("Epic takes nothing on the first million and 12% beyond it, and the free amount is editable", () => {
  assert.equal(payout("epic", base()).cut, 0);
  assert.equal(payout("epic", base({ units: 200_000 })).cut, 120_000);
  assert.equal(payout("epic", base({ epicFreeUpTo: 0 })).cut, 1200);
});

test("itch.io takes the creator's chosen share plus processor fees on the kept sales", () => {
  const p = payout("itch", base({ itchSharePct: 10 }));
  assert.equal(p.cut, 1000);
  assert.equal(p.processor, 290 + 300);
  assert.equal(p.received, 10000 - 1000 - 590);
  assert.equal(payout("itch", base({ itchSharePct: 0 })).cut, 0);
});

test("refunds and tax come out before the cut", () => {
  const p = payout("steam", base({ refundPct: 10, taxPct: 20 }));
  assert.equal(p.refunded, 1000);
  assert.equal(p.tax, 1500);
  assert.equal(p.adjustedGross, 7500);
  assert.equal(p.cut, 2250);
  assert.equal(p.received, 5250);
});

test("regional pricing lowers realised revenue in proportion", () => {
  const p = payout("gog", base({ realizedPct: 50 }));
  assert.equal(p.listGross, 5000);
  assert.equal(p.received, 3500);
});

test("withholding applies to the payout and never to a loss", () => {
  const p = payout("gog", base({ withholdPct: 10 }));
  assert.equal(p.withholding, 700);
  assert.equal(p.received, 6300);
  assert.equal(payout("gog", base({ units: 0, withholdPct: 10 })).withholding, 0);
});

test("profit subtracts development cost and the unrecouped Steam fee", () => {
  const p = payout("steam", base({ units: 50, devCost: 1000 }));
  assert.equal(p.received, 350);
  assert.equal(p.profit, 350 - 100 - 1000);
});

test("break-even copies is the smallest count that reaches zero profit", () => {
  const v = base({ devCost: 7000, steamFee: 0 });
  const n = unitsForProfit("steam", v, 0);
  assert.equal(n, 1000);
  assert.ok(payout("steam", v, n).profit >= 0);
  assert.ok(payout("steam", v, n - 1).profit < 0);
});

test("copies for a target profit, zero when already met, and null when a copy pays nothing", () => {
  const v = base({ devCost: 0, steamFee: 0 });
  assert.equal(unitsForProfit("gog", v, 7000), 1000);
  assert.equal(unitsForProfit("gog", v, 0), 0);
  assert.equal(unitsForProfit("itch", base({ itchSharePct: 100 }), 1), null);
});

test("break-even crosses a tier boundary correctly", () => {
  const v = base({ price: 100, devCost: 12_000_000, steamFee: 0 });
  const n = unitsForProfit("steam", v, 0);
  assert.ok(payout("steam", v, n).profit >= 0 && payout("steam", v, n - 1).profit < 0);
  assert.ok(n < 12_000_000 / 70 && n > 12_000_000 / 100);
});

test("compareStores ranks by profit and carries break-even and target copies", () => {
  const rows = compareStores(base({ devCost: 5000, targetProfit: 2000 }));
  assert.deepEqual(rows.map((r) => r.store), ["epic", "itch", "steam", "gog"].sort((a, b) => rows.find((r) => r.store === b).profit - rows.find((r) => r.store === a).profit));
  assert.ok(rows.every((r) => r.breakEvenUnits > 0 && r.targetUnits >= r.breakEvenUnits));
  assert.equal(rows[0].store, "epic");
});

test("the copies typed reconcile: received equals adjusted gross less cut, processor and withholding", () => {
  for (const id of ["steam", "epic", "itch", "gog"]) {
    const p = payout(id, base({ refundPct: 7, taxPct: 12, withholdPct: 5, units: 2345 }));
    close(p.received, p.adjustedGross - p.cut - p.processor - p.withholding, 0.02);
  }
});

test("readInputs rejects nonsense and fills defaults", () => {
  assert.equal(readInputs({ price: 0 }).ok, false);
  assert.equal(readInputs({ refundPct: 100 }).ok, false);
  assert.equal(readInputs({ units: "abc" }).ok, false);
  assert.equal(readInputs({ itchSharePct: 101 }).ok, false);
  const r = readInputs({});
  assert.equal(r.ok, true);
  assert.equal(r.values.price, 19.99);
  assert.equal(readInputs({ price: "$24.99", units: "5,000" }).values.units, 5000);
});

test("findings warn on zero tax, unreachable and slow break-even", () => {
  const v = base({ devCost: 500000, units: 100 });
  const f = findings(v, compareStores(v));
  assert.ok(f.some((x) => /Tax inside the price is set to zero/.test(x.title)));
  assert.ok(f.some((x) => /does not pay for itself/.test(x.title)));
});

test("wishlist conversion is a plain multiplication and rejects bad input", () => {
  assert.equal(unitsFromWishlists(20000, 10), 2000);
  assert.equal(unitsFromWishlists(-1, 10), null);
  assert.equal(unitsFromWishlists(100, 150), null);
});

test("csv has a header and a row per store", () => {
  const rows = compareStores(base());
  const lines = csvOf(rows).split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^store,copies,/);
});
