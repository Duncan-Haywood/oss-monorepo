import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, sampleInput, adjustedCashFlow, annualDebtService, maxPriceByDebt, validateInput, resultText, resultCsv, serializeState, parseState, money, MAX_OFFERS } from "./calc.mjs";

// deterministic pseudo-random so a failure reproduces
let seed = 7;
const rnd = (a, b) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return a + (seed / 4294967296) * (b - a); };

test("adjusted cash flow subtracts every cost, manager and reserve", () => {
  assert.equal(adjustedCashFlow(sampleInput()), 77000);
});

test("loan at the debt-limit price is covered at exactly the required coverage", () => {
  for (let n = 0; n < 300; n++) {
    const i = { ...sampleInput(), revenue: rnd(150000, 900000), utilities: rnd(20000, 120000), rent: rnd(20000, 100000), labor: rnd(10000, 90000),
      ratePct: rnd(0, 14), years: Math.round(rnd(3, 25)), downPct: rnd(0, 60), dscr: rnd(1, 2.2) };
    const cf = adjustedCashFlow(i);
    if (cf <= 0) { assert.equal(maxPriceByDebt(i), 0); continue; }
    const p = maxPriceByDebt(i);
    assert.ok(Math.abs(cf / annualDebtService(i, p) - i.dscr) < 1e-9, JSON.stringify(i));
  }
});

test("zero-interest loan is straight-line", () => {
  const i = { ...sampleInput(), ratePct: 0, years: 10, downPct: 0 };
  assert.equal(annualDebtService(i, 120000), 12000);
});

test("walk-away is the lower of the multiple and the loan, and binding names it", () => {
  const r = solve(sampleInput());
  assert.equal(r.walkAway, Math.min(r.byMultiple, r.byDebt));
  assert.equal(r.binding, "multiple");
  const tight = solve({ ...sampleInput(), years: 3, ratePct: 14, dscr: 1.6 });
  assert.equal(tight.binding, "debt");
  assert.ok(tight.walkAway < tight.byMultiple);
});

test("offers clear only at or under the walk-away price", () => {
  const r = solve(sampleInput());
  assert.deepEqual(r.offers.map((o) => o.clears), [false, false, true]);
  const at = solve({ ...sampleInput(), offers: [{ label: "at", price: r.walkAway }] });
  assert.equal(at.offers[0].clears, true);
});

test("coverage falls under stress and utilities flex with revenue", () => {
  const i = sampleInput();
  const r = solve(i);
  const o = r.offers[2];
  assert.ok(o.dscr > o.dscr10 && o.dscr10 > o.dscr20);
  const expected = (r.cashFlow - 0.1 * (i.revenue - i.utilities)) / o.debtService;
  assert.ok(Math.abs(o.dscr10 - expected) < 1e-9);
});

test("break-even drop takes coverage to 1.0x at the walk-away price", () => {
  const i = sampleInput();
  const r = solve(i);
  const ds = annualDebtService(i, r.walkAway);
  const cf = r.cashFlow - (r.breakEvenDropPct / 100) * (i.revenue - i.utilities);
  assert.ok(Math.abs(cf / ds - 1) < 1e-9);
});

test("no cash flow means a zero walk-away price and a clear note", () => {
  const r = solve({ ...sampleInput(), revenue: 100000 });
  assert.equal(r.walkAway, 0);
  assert.match(r.notes[0], /no cash flow left/);
  assert.ok(r.offers.every((o) => !o.clears));
});

test("validation rejects bad input", () => {
  assert.ok(validateInput({ ...sampleInput(), revenue: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), dscr: 0.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), downPct: 100 }).length);
  assert.ok(validateInput({ ...sampleInput(), offers: [] }).length);
  assert.ok(validateInput({ ...sampleInput(), offers: Array.from({ length: MAX_OFFERS + 1 }, () => ({ price: 1 })) }).length);
  assert.equal(solve({ ...sampleInput(), rent: -1 }).ok, false);
});

test("absentee notes appear when manager or reserve are zero", () => {
  const r = solve({ ...sampleInput(), manager: 0, reserve: 0 });
  assert.ok(r.notes.some((n) => /manager/.test(n)));
  assert.ok(r.notes.some((n) => /reserve/.test(n)));
});

test("text, CSV and saved state round-trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Walk-away price \$269,500/);
  const csv = resultCsv(r).split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[1], /^"Asking price",340000,/);
  const back = parseState(serializeState(r.input));
  assert.deepEqual(back.state, r.input);
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234), "-$1,234");
});
