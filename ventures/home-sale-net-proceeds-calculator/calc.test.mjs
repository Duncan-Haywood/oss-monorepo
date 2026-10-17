import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, netFor, priceForTarget, ordinaryTax, sampleInput, money, parseState, serializeState, resultText, resultCsv, validate } from "./calc.mjs";

const base = { salePrice: 400000, mortgagePayoff: 200000, listCommissionPct: 3, buyerCommissionPct: 3, concessions: 0, titleEscrowPct: 1, transferTaxPct: 0, prepCosts: 0, otherCosts: 0, proratedTaxes: 0, purchasePrice: 0, buyingCosts: 0, improvements: 0, depreciation: 0, filing: "single", exclusion: "full", partialMonths: 0, otherIncome: 0, stateRatePct: 0, targetNet: 0, targetBasis: "closing", heldOverYear: true };
const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("cash at closing is hand-checkable", () => {
  const r = netFor(base, 400000);
  assert.equal(r.listC, 12000);
  assert.equal(r.buyC, 12000);
  assert.equal(r.title, 4000);
  assert.equal(r.closingNet, 172000);
  close(r.costPct, 7);
  assert.equal(r.tax, 0);
});

test("concessions, prep and prorations land on the right lines", () => {
  const r = netFor({ ...base, concessions: 5000, prepCosts: 3000, proratedTaxes: 1000, otherCosts: 500 }, 400000);
  assert.equal(r.closingNet, 172000 - 5000 - 1000 - 500);
  assert.equal(r.cashAfterPrep, r.closingNet - 3000);
});

test("long-term gain above the exclusion: brackets, 20% band and NIIT", () => {
  const i = { ...base, salePrice: 1000000, mortgagePayoff: 0, listCommissionPct: 0, buyerCommissionPct: 0, titleEscrowPct: 0, purchasePrice: 200000 };
  const r = netFor(i, 1000000);
  assert.equal(r.gain, 800000);
  assert.equal(r.ltcgGain, 550000);
  close(r.ltcgTax, 496050 * 0.15 + 4500 * 0.2);
  close(r.niit, 350000 * 0.038);
});

test("married filing jointly doubles the exclusion", () => {
  const i = { ...base, salePrice: 700000, mortgagePayoff: 0, listCommissionPct: 0, buyerCommissionPct: 0, titleEscrowPct: 0, purchasePrice: 200000 };
  assert.equal(netFor({ ...i, filing: "mfj" }, 700000).tax, 0);
  assert.ok(netFor({ ...i, filing: "single" }, 700000).tax > 0);
});

test("partial exclusion prorates by months out of 24", () => {
  const i = { ...base, salePrice: 700000, mortgagePayoff: 0, listCommissionPct: 0, buyerCommissionPct: 0, titleEscrowPct: 0, purchasePrice: 400000, exclusion: "partial", partialMonths: 12 };
  const r = netFor(i, 700000);
  assert.equal(r.exclusion, 125000);
  assert.equal(r.ltcgGain, 300000 - 125000);
});

test("depreciation recapture is outside the exclusion and capped at 25%", () => {
  const i = { ...base, salePrice: 500000, mortgagePayoff: 0, listCommissionPct: 0, buyerCommissionPct: 0, titleEscrowPct: 0, purchasePrice: 300000, depreciation: 50000, otherIncome: 100000 };
  const r = netFor(i, 500000);
  assert.equal(r.gain, 250000);
  assert.equal(r.recapture, 50000);
  assert.equal(r.ltcgGain, 0);
  close(r.recaptureTax, (105700 - 83900) * 0.22 + (133900 - 105700) * 0.24);
});

test("owned a year or less is taxed as ordinary income", () => {
  const i = { ...base, salePrice: 600000, mortgagePayoff: 0, listCommissionPct: 0, buyerCommissionPct: 0, titleEscrowPct: 0, purchasePrice: 100000, exclusion: "none", heldOverYear: false, otherIncome: 16100 };
  const r = netFor(i, 600000);
  close(r.federal, ordinaryTax(500000, "single"));
});

test("a loss produces no tax", () => {
  const r = netFor({ ...base, purchasePrice: 500000 }, 400000);
  assert.ok(r.gain < 0);
  assert.equal(r.tax, 0);
});

test("ordinaryTax bracket edges", () => {
  close(ordinaryTax(12400, "single"), 1240);
  close(ordinaryTax(50400, "single"), 1240 + 38000 * 0.12);
  assert.equal(ordinaryTax(0, "mfj"), 0);
});

test("priceForTarget inverts netFor, before and after tax, over random homes", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 300; k++) {
    const i = { ...base, mortgagePayoff: Math.round(rnd() * 400000), listCommissionPct: rnd() * 4, buyerCommissionPct: rnd() * 4, titleEscrowPct: rnd() * 2, transferTaxPct: rnd() * 2, concessions: Math.round(rnd() * 20000), prepCosts: Math.round(rnd() * 10000), proratedTaxes: Math.round(rnd() * 5000), purchasePrice: Math.round(rnd() * 400000), improvements: Math.round(rnd() * 50000), depreciation: Math.round(rnd() * 30000), filing: rnd() > 0.5 ? "mfj" : "single", exclusion: ["full", "partial", "none"][k % 3], partialMonths: Math.round(rnd() * 24), otherIncome: Math.round(rnd() * 300000), stateRatePct: rnd() * 8 };
    for (const basis of ["closing", "aftertax"]) {
      const target = Math.round(rnd() * 500000);
      const p = priceForTarget(i, target, basis);
      const r = netFor(i, p);
      close(basis === "aftertax" ? r.afterTax : r.closingNet, target, 0.01);
    }
  }
});

test("net is non-decreasing in price", () => {
  const i = { ...sampleInput(), offers: [] };
  let prev = -Infinity;
  for (let p = 100000; p <= 2000000; p += 25000) { const a = netFor(i, p).afterTax; assert.ok(a >= prev - 1e-6); prev = a; }
});

test("solve: sample, notes, levers, grid and offers", () => {
  const R = solve(sampleInput());
  assert.ok(R.ok);
  assert.ok(R.r.gain > 250000 && R.r.tax > 0);
  assert.equal(R.grid.length, 6);
  assert.equal(R.offers.length, 3);
  assert.equal(R.offers.filter((o) => o.best).length, 1);
  assert.ok(R.target > 0);
  close(R.levers.perHalfPointCommission, 2250);
  const bad = solve({ ...sampleInput(), salePrice: "" });
  assert.equal(bad.ok, false);
});

test("a big concession can beat a higher headline price", () => {
  const R = solve({ ...base, offers: [{ label: "High", price: 420000, concessions: 25000 }, { label: "Low", price: 405000, concessions: 0 }] });
  const low = R.offers.find((o) => o.label === "Low");
  assert.ok(low.best);
});

test("validation rejects negatives, silly percents and bad choices", () => {
  assert.ok(validate({ ...base, listCommissionPct: -1 }).length);
  assert.ok(validate({ ...base, listCommissionPct: 30, buyerCommissionPct: 30 }).length);
  assert.ok(validate({ ...base, filing: "x" }).length);
  assert.equal(validate(base).length, 0);
});

test("save/load round-trips and rejects foreign files", () => {
  const s = parseState(serializeState(sampleInput()));
  assert.equal(s.state.salePrice, 450000);
  assert.ok(parseState("nope").error);
  assert.ok(parseState('{"kind":"other"}').error);
});

test("text and CSV carry the headline lines", () => {
  const R = solve(sampleInput());
  assert.match(resultText(R), /Estimated net after tax: /);
  assert.match(resultCsv(R), /Net after tax,/);
  assert.equal(money(-5), "-$5.00");
});
