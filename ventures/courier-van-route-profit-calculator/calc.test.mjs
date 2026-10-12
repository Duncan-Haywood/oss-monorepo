import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareOffers, sampleInput, sampleOffer, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked route: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.pay, 90 + 1.1 * 120 + 0.4 * 160); // 286
  near(r.fuel, (95 / 15) * 3.7);
  near(r.maintenance, 9.5);
  near(r.depreciation, 11.4);
  near(r.fixed, (950 * 12) / (5 * 48)); // 47.50
  near(r.costs, 23.433333333 + 9.5 + 11.4 + 6 + 8 + 47.5, 1e-6);
  near(r.profit, 286 - r.costs);
  near(r.setAside, r.profit * 0.25);
  near(r.takeHome, r.profit * 0.75);
  near(r.profitPerHour, r.profit / 10);
  near(r.profitPerStop, r.profit / 120);
  near(r.costPerMile, r.costs / 95);
  near(r.weeklyTakeHome, r.takeHome * 5);
  near(r.annualTakeHome, r.takeHome * 240);
});

test("fixed costs are spread over the routes actually driven", () => {
  const few = solve({ ...sampleInput(), routesPerWeek: 2 });
  const many = solve({ ...sampleInput(), routesPerWeek: 5 });
  near(few.fixed / many.fixed, 2.5);
  const shortYear = solve({ ...sampleInput(), weeksPerYear: 24 });
  near(shortYear.fixed / many.fixed, 2);
});

test("paying exactly the minimum pay earns exactly the target after set-aside", () => {
  let seed = 7;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  for (let n = 0; n < 300; n++) {
    const i = { ...sampleInput(), stops: Math.round(rnd(20, 300)), packages: Math.round(rnd(0, 500)), hours: rnd(4, 14), miles: rnd(20, 250), mpg: rnd(8, 30), fuelPrice: rnd(2, 6), taxPct: rnd(0, 45), targetHourly: rnd(5, 60), routesPerWeek: rnd(1, 6.5) };
    const base = solve(i);
    const flat = solve({ ...i, payRoute: base.minPay, payStop: 0, payPackage: 0 });
    near(flat.takeHomePerHour, i.targetHourly, 1e-7);
  }
});

test("break-even stops make profit zero when pay scales with stops and packages", () => {
  const i = { ...sampleInput() };
  const r = solve(i);
  const perStop = i.payStop + i.payPackage * (i.packages / i.stops);
  near(r.breakevenStops, (r.costs - i.payRoute) / perStop);
  near(i.payRoute + perStop * r.breakevenStops - r.costs, 0);
});

test("flat route pay that already covers costs breaks even at zero stops; no stop pay gives null", () => {
  assert.equal(solve({ ...sampleInput(), payRoute: 400 }).breakevenStops, 0);
  assert.equal(solve({ ...sampleInput(), payRoute: 200, payStop: 0, payPackage: 0 }).breakevenStops, null);
});

test("a losing route has no tax set-aside and says so", () => {
  const r = solve({ ...sampleInput(), payRoute: 0, payStop: 0.2, payPackage: 0 });
  assert.ok(r.profit < 0);
  assert.equal(r.setAside, 0);
  near(r.takeHome, r.profit);
  assert.match(r.notes[0], /loses/);
});

test("meets flag matches the target", () => {
  assert.equal(solve(sampleInput()).meets, false);
  assert.equal(solve({ ...sampleInput(), targetHourly: 10 }).meets, true);
});

test("validation rejects bad input", () => {
  const bad = (patch, re) => { const e = validateInput({ ...sampleInput(), ...patch }); assert.ok(e.some((x) => re.test(x)), JSON.stringify(e)); };
  bad({ stops: 0 }, /Stops/);
  bad({ stops: 10.5 }, /Stops/);
  bad({ hours: 0 }, /hours/i);
  bad({ miles: 0 }, /Miles per route/);
  bad({ mpg: 0 }, /gallon/);
  bad({ taxPct: 70 }, /Tax/);
  bad({ weeksPerYear: 53 }, /Weeks/);
  bad({ routesPerWeek: 0 }, /Routes/);
  bad({ payRoute: 0, payStop: 0, payPackage: 0 }, /at least one pay/);
  bad({ payStop: NaN }, /per stop/);
  assert.deepEqual(validateInput(sampleInput()), []);
  assert.equal(solve({ ...sampleInput(), miles: -1 }).ok, false);
});

test("compare: sample offers disagree on hourly vs yearly, and the note says so", () => {
  const c = compareOffers(sampleInput(), sampleOffer());
  assert.ok(c.ok);
  assert.equal(c.winnerAnnual, "A");
  assert.equal(c.winnerHourly, "B");
  near(c.a.annualTakeHome, 32430, 1e-6);
  near(c.b.annualTakeHome, 30570, 1e-6);
  near(c.annualDifference, -1860, 1e-6);
  assert.ok(c.notes.some((n) => /pays more per hour/.test(n)));
  // hand-check offer B: fuel 70/15*3.7, 0.22*70 per-mile, 2 tolls, 8 reserve, 47.50 fixed
  near(c.b.costs, (70 / 15) * 3.7 + 0.22 * 70 + 2 + 8 + 47.5, 1e-6);
});

test("compare: identical offers tie; bad offer reports errors", () => {
  const same = compareOffers(sampleInput(), {});
  assert.equal(same.winnerAnnual, "tie");
  const bad = compareOffers(sampleInput(), { hours: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Offer B/);
});

test("different routes per week change the fixed share in a comparison", () => {
  const c = compareOffers(sampleInput(), { routesPerWeek: 3 });
  near(c.b.fixed / c.a.fixed, 5 / 3);
});

test("text, CSV and save/load round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Not tax|not tax/i);
  assert.match(resultText(r), /\$345\.83/);
  assert.match(resultCsv(r), /^item,amount\npay,286\n/);
  const out = parseState(serializeState(sampleInput(), sampleOffer()));
  assert.deepEqual(out.state, sampleInput());
  assert.deepEqual(out.offer, sampleOffer());
  assert.match(parseState("nope").error, /JSON/);
  assert.match(parseState(JSON.stringify({ app: "other", input: {} })).error, /not a saved/);
  assert.ok(parseState(serializeState({ ...sampleInput(), hours: 0 })).error);
});

test("formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(3.456), "$3.46");
});
