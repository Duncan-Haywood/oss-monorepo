import test from "node:test";
import assert from "node:assert/strict";
import { splitSale, priceForPayout, settle, statementCsv, checkTerms } from "./commission.mjs";

test("hand check: 60 EUR, 22% VAT, 20% commission, shop carries the card fee", () => {
  const r = splitSale(61, { vatPct: 22, commissionPct: 20 });
  assert.equal(r.net, 50);
  assert.equal(r.commission, 10);
  assert.equal(r.cardFee, 2.13);      // 61*3% + 0.30
  assert.equal(r.brandPayout, 40);
  assert.equal(r.shopKeeps, 7.87);
});

test("brand carrying the fee lowers the payout, not the shop's take", () => {
  const a = splitSale(61, { vatPct: 22, feeBearer: "brand" });
  assert.equal(a.brandPayout, 37.87);
  assert.equal(a.shopKeeps, 10);
  const s = splitSale(61, { vatPct: 22, feeBearer: "split" });
  assert.equal(s.brandPayout, 38.94);
});

test("bad terms are refused", () => {
  assert.ok(checkTerms({ commissionPct: 80 }).errors.length);
  assert.ok(splitSale(50, { feeBearer: "nobody" }).error);
  assert.ok(splitSale(0).error);
});

test("priceForPayout round-trips for every fee bearer", () => {
  for (const feeBearer of ["shop", "brand", "split"]) {
    const r = priceForPayout(30, { vatPct: 21, commissionPct: 25, feeBearer });
    assert.ok(Math.abs(r.brandPayout - 30) <= 0.02, `${feeBearer}: ${r.brandPayout}`);
  }
});

test("a shop that loses money on a cheap sale is warned", () => {
  const r = splitSale(2, { commissionPct: 5 });
  assert.ok(r.warnings.some(w => /lose money/.test(w)));
});

test("settlement: refunds reverse commission, fee stays, partners totalled", () => {
  const t = { vatPct: 20, commissionPct: 20, paymentFixed: 0, paymentFeePct: 0 };
  const r = settle([
    { partner: "Aurea", sku: "tee", qty: 2, gross: 120 },
    { partner: "Aurea", sku: "hood", qty: 1, gross: 90, refunded: 90 },
    { partner: "Nord", sku: "cap", qty: 1, gross: 36 },
  ], t);
  const a = r.partners.find(p => p.partner === "Aurea");
  assert.equal(a.units, 3);
  assert.equal(a.net, 100);
  assert.equal(a.commission, 20);
  assert.equal(a.brandOwed, 80);
  assert.equal(r.totals.brandOwed, 104);   // Nord: 30 net, 24 owed
  assert.equal(r.totals.shopKeeps, 26);
});

test("a fully refunded sale with a card fee leaves the fee with its bearer", () => {
  const r = settle([{ partner: "X", qty: 1, gross: 100, refunded: 100 }], { feeBearer: "brand", commissionPct: 20, vatPct: 0 });
  assert.equal(r.partners[0].brandOwed, -3.3);
  assert.ok(r.notes[0].includes("carry it forward"));
});

test("per-partner terms override; bad rows are reported, not guessed", () => {
  const r = settle([
    { partner: "A", gross: 100 }, { partner: "B", gross: 100 },
    { partner: "", gross: 5 }, { partner: "C", gross: 10, refunded: 20 }, { partner: "D", gross: 10, qty: 1.5 },
  ], { vatPct: 0, paymentFeePct: 0, paymentFixed: 0 }, { B: { commissionPct: 40 } });
  assert.equal(r.partners.find(p => p.partner === "A").brandOwed, 80);
  assert.equal(r.partners.find(p => p.partner === "B").brandOwed, 60);
  assert.equal(r.problems.length, 3);
});

test("csv escapes formula-looking partner names", () => {
  const r = settle([{ partner: "=cmd()", gross: 10 }], {});
  assert.match(statementCsv(r), /^partner,.*\n'=cmd\(\)/);
});
