import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, sampleInput, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const item = (r, name) => r.items.find((x) => x.name === name);

test("hand-worked item: Chiavari chairs, every line", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  const c = item(r, "Chiavari chairs");
  near(c.invested, 150 * 48); // 7200
  near(c.revenue, 150 * 14 * 6.5); // 13650
  near(c.handling, 150 * 14 * 0.6); // 1260
  near(c.processing, 0.03 * 13650);
  near(c.losses, 7200 * 0.02);
  near(c.storage, 150 * 1.1);
  near(c.cash, 13650 - 1260 - 409.5 - 144 - 165);
  near(c.depreciation, 7200 / 8);
  near(c.profit, c.cash - 900);
  near(c.roi, c.cash / 7200);
  near(c.paybackYears, 7200 / c.cash);
});

test("break-even rentals makes profit exactly zero", () => {
  const input = sampleInput();
  const r = solve(input);
  for (const [n, x] of r.items.entries()) {
    const it = input.items[n];
    const probe = solve({ ...input, items: [{ ...it, rentals: x.breakevenRentals }] });
    near(probe.items[0].profit, 0, 1e-6);
  }
});

test("renting at the lowest price pays back in exactly the target years, for random items", () => {
  let seed = 11;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  for (let k = 0; k < 400; k++) {
    const it = { name: "x", units: 1 + Math.floor(rnd(0, 500)), unitCost: rnd(1, 2000), price: 5, rentals: rnd(1, 120), handling: rnd(0, 20), lossPct: rnd(0, 30), storage: rnd(0, 40), lifeYears: rnd(1, 20) };
    const g = { processPct: rnd(0, 8), targetYears: rnd(0.5, 6) };
    const first = solve({ ...g, items: [it] });
    const again = solve({ ...g, items: [{ ...it, price: first.items[0].minPrice }] });
    near(again.items[0].paybackYears, g.targetYears, 1e-7);
    assert.ok(again.items[0].meetsTarget);
  }
});

test("ranking is by return on money tied up, and the best item is named", () => {
  const r = solve(sampleInput());
  assert.deepEqual(r.ranked.map((x) => x.name), ["Chiavari chairs", "Folding chairs", "60-inch round tables", "Linen tablecloths", "Dance floor panels"]);
  assert.equal(r.best.name, "Chiavari chairs");
  assert.equal(r.worst.name, "Dance floor panels");
  r.ranked.forEach((x, n) => assert.equal(x.rank, n + 1));
  for (let n = 1; n < r.ranked.length; n++) assert.ok(r.ranked[n - 1].roi >= r.ranked[n].roi);
});

test("totals add up and notes flag the slow item", () => {
  const r = solve(sampleInput());
  near(r.totals.invested, r.items.reduce((s, x) => s + x.invested, 0));
  near(r.totals.cash, r.items.reduce((s, x) => s + x.cash, 0));
  near(r.totals.paybackYears, r.totals.invested / r.totals.cash);
  assert.ok(r.notes.some((n) => /Dance floor panels pays back in 3\.5 years, past your 2-year target/.test(n)));
  assert.equal(item(r, "Dance floor panels").meetsTarget, false);
  assert.equal(item(r, "Folding chairs").meetsTarget, true);
});

test("an item that loses money never pays back", () => {
  const s = sampleInput();
  s.items[0] = { ...s.items[0], price: 0.1 };
  const r = solve(s);
  assert.equal(item(r, "Folding chairs").paybackYears, null);
  assert.ok(r.notes.some((n) => /Folding chairs never pays for itself/.test(n)));
  const csv = resultCsv(r);
  assert.match(csv, /Folding chairs/);
});

test("validation rejects bad rows and bad globals", () => {
  const ok = sampleInput();
  assert.deepEqual(validateInput(ok), []);
  assert.ok(validateInput({ ...ok, items: [] }).length);
  assert.match(validateInput({ ...ok, items: [{ ...ok.items[0], units: 1.5 }] })[0], /Item 1: Units owned/);
  assert.match(validateInput({ ...ok, items: [{ ...ok.items[0], name: " " }] })[0], /name/);
  assert.match(validateInput({ ...ok, items: [{ ...ok.items[0], price: 0 }] })[0], /Price per unit/);
  assert.match(validateInput({ ...ok, processPct: 20 })[0], /Card fees/);
  assert.match(validateInput({ ...ok, targetYears: 0 })[0], /Target payback/);
  assert.equal(solve({ ...ok, targetYears: NaN }).ok, false);
});

test("exports and saved scenarios round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /not tax, legal, insurance or financial advice/);
  const lines = resultCsv(r).split("\n");
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^rank,item,units/);
  assert.deepEqual(parseState(serializeState(sampleInput())).state, sampleInput());
  assert.match(parseState("nope").error, /not valid JSON/);
  assert.match(parseState(JSON.stringify({ app: "other", input: {} })).error, /not a saved/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(2.5), "$2.50");
});
