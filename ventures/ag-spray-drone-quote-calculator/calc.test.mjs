import { test } from "node:test";
import assert from "node:assert/strict";
import { num, parseFields, buildSpec, validateSpec, machine, startOfSortie, solve, verifyPlan, planCsv, money0, money2, fmt, pct, SAMPLE_FIELDS, SAMPLE_ECON } from "./calc.mjs";

const base = (over = {}) => buildSpec({ ...SAMPLE_ECON, fields: SAMPLE_FIELDS, ...over }).spec;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("num strips $ , % and spaces and rejects junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("85 %"), 85);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.ok(Number.isNaN(num(undefined)));
});

test("field lines parse, comments and blanks are skipped, bad lines are named", () => {
  const ok = parseFields("# note\n\nA | 40 | 5\nB | 10 | 2 | 25");
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.fields, [{ name: "A", acres: 40, miles: 5, extra: 0 }, { name: "B", acres: 10, miles: 2, extra: 25 }]);
  const bad = parseFields("A | 0 | 5\nB | 10\nC | 10 | -1\n | 5 | 5\nD | 5 | 5 | 900");
  assert.equal(bad.fields.length, 0);
  assert.equal(bad.errors.length, 5);
  assert.match(bad.errors[0], /Field line 1 \(A\)/);
});

test("machine: 24 ft swath at 15 mph, 85% efficiency, matches the hand arithmetic", () => {
  const m = machine(base());
  // 24 ft * 15 mph * 88 ft/min per mph / 43,560 sq ft per acre = 0.72727 acres/min
  close(m.apm, (24 * 15 * 88) / 43560 * 0.85);
  assert.equal(m.speedLimit, "top speed");
  close(m.tankAcres, 10.5 / 2);
});

test("a small pump slows the drone to the speed that delivers the rate", () => {
  const m = machine(base({ pump: 1 }));
  assert.equal(m.speedLimit, "pump flow");
  close(m.speed, 1 / (2 * (24 * 88) / 43560));
  assert.ok(m.speed < 15);
  // gallons per minute at that speed equal the pump, to rounding
  close(m.speed * (24 * 88 / 43560) * 2, 1);
});

test("sortie ends at the smaller of tank and battery", () => {
  assert.equal(solve(base()).sortieLimit, "tank size");
  assert.equal(solve(base({ battMin: 3 })).sortieLimit, "battery flight time");
  const r = solve(base({ battMin: 3 }));
  close(r.rows[0].sortieAcres, 3 * r.machine.apm);
});

test("sortie start times: turnaround-limited with many sets, charge-limited with few", () => {
  const s = base();
  // many sets: every sortie waits only for the crew turnaround (a = flight + refill + swap)
  const many = { ...s, sets: 10 };
  close(startOfSortie(4, 8, many), 4 * (8 + 3.5 + 1.5));
  // one set: must charge between flights
  const one = { ...s, sets: 1 };
  close(startOfSortie(3, 8, one), 3 * (8 + 16));
  // the longest-path form handles the uneven start of a charge-limited rotation
  const three = { ...s, sets: 3, charge: 40, refill: 1, swap: 1 };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((k) => startOfSortie(k, 10, three)), [0, 12, 24, 50, 62, 74, 100]);
});

test("replay and closed form agree across a spread of settings", () => {
  for (const over of [{}, { sets: 1 }, { sets: 2, charge: 40 }, { battMin: 2 }, { pump: 0.8, tank: 3 }, { sets: 6, charge: 5, refill: 0, swap: 0 }, { rate: 5, tank: 20 }]) {
    const spec = base(over);
    assert.deepEqual(validateSpec(spec), [], JSON.stringify(over));
    const res = solve(spec);
    assert.deepEqual(verifyPlan(spec, res), [], JSON.stringify(over));
  }
});

test("verifyPlan notices a tampered result", () => {
  const spec = base();
  const res = solve(spec);
  res.rows[0].sprayMin += 5;
  assert.ok(verifyPlan(spec, res).some((p) => /replay time/.test(p)));
});

test("costs: lines add up and match the formulas for one field", () => {
  const spec = base({ fields: "A | 80 | 10 | 0" });
  const r = solve(spec).rows[0];
  close(r.droneWear, (r.flightMin / 60) * (26000 * 0.75) / 1500);
  close(r.battery, r.sorties * 1400 / 1500);
  close(r.truck, 2 * 10 * 0.7);
  close(r.labor, ((r.sprayMin + 12 + (2 * 10 / 45) * 60) / 60) * 2 * 28);
  close(r.overhead, 80 * 7500 / 5000);
  close(r.cost, r.droneWear + r.battery + r.labor + r.truck + r.overhead);
  close(r.recommended, Math.max(150, r.cost / 0.7));
});

test("extra % slows the field and costs more", () => {
  const plain = solve(base({ fields: "A | 40 | 5 | 0" })).rows[0];
  const hard = solve(base({ fields: "A | 40 | 5 | 50" })).rows[0];
  close(hard.flightMin, plain.flightMin * 1.5, 1e-6);
  assert.ok(hard.cost > plain.cost);
});

test("minimum charge binds on a tiny field and is flagged", () => {
  const r = solve(base({ fields: "Tiny | 4 | 10" })).rows[0];
  assert.equal(r.quote, 150);
  assert.equal(r.minChargeBinds, true);
  const big = solve(base({ fields: "Big | 200 | 10" })).rows[0];
  assert.equal(big.minChargeBinds, false);
  close(big.quote, 1800);
});

test("totals, break-even and the price ladder are consistent", () => {
  const spec = base();
  const res = solve(spec);
  close(res.revenue - res.cost, res.profit);
  close(res.totalAcres, 80 + 22 + 160 + 35 + 12 + 240 + 4);
  close(res.breakEvenAcres * res.contributionPerAcre, spec.fixed, 1e-6);
  assert.equal(res.ladder.length, 7);
  for (let i = 1; i < res.ladder.length; i++) assert.ok(res.ladder[i].seasonProfit >= res.ladder[i - 1].seasonProfit);
  // at the baseline price the mix margin is about the target (min charges lift it slightly)
  assert.ok(res.ladder[3].margin >= spec.margin / 100 - 0.005);
  assert.equal(res.bestFirst.length, 7);
});

test("charge limit is named when few batteries serve a fast tank", () => {
  assert.equal(solve(base({ sets: 1 })).gapLimit, "battery charging");
  assert.equal(solve(base({ sets: 8, charge: 5 })).gapLimit, "refill and battery swap");
});

test("validation catches out-of-range inputs and missing fields", () => {
  assert.ok(validateSpec(base({ swath: 0 })).some((e) => /Swath/.test(e)));
  assert.ok(validateSpec(base({ margin: 95 })).some((e) => /margin/i.test(e)));
  assert.ok(validateSpec(base({ fields: "" })).some((e) => /at least one field/.test(e)));
  const { errors } = buildSpec({ ...SAMPLE_ECON, swath: "x", fields: SAMPLE_FIELDS });
  assert.ok(errors.some((e) => /swath/.test(e)));
});

test("CSV has a header, one row per field, and neutralises formula-looking names", () => {
  const spec = base({ fields: '=HYPERLINK("x") | 10 | 1\nPlain, with comma | 10 | 1' });
  const csv = planCsv(spec, solve(spec)).trim().split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[1], /^"'=HYPERLINK\(""x""\)"/);
  assert.match(csv[2], /^"Plain, with comma"/);
});

test("formatters", () => {
  assert.equal(money0(1234.6), "$1,235");
  assert.equal(money0(-5), "-$5");
  assert.equal(money2(3), "$3.00");
  assert.equal(fmt(2.345, 1), "2.3");
  assert.equal(pct(0.456, 1), "45.6%");
});
