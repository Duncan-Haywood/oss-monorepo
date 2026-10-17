import { test } from "node:test";
import assert from "node:assert/strict";
import { gamma, failureChance, typicalLife, parseRows, analyze, reportCsv, sampleText, DEFAULTS } from "./calc.mjs";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("gamma matches known values", () => {
  near(gamma(5), 24, 1e-9);
  near(gamma(1.5), Math.sqrt(Math.PI) / 2, 1e-12);
  near(gamma(1), 1, 1e-12);
});

test("shape 1 is memoryless: constant chance 1 - exp(-1/life)", () => {
  const q = 1 - Math.exp(-1 / 10);
  for (const age of [0, 3, 12]) near(failureChance(age, 10, 1), q, 1e-12);
});

test("wear-out: the yearly chance rises with age and stays in [0,1]", () => {
  let prev = -1;
  for (let age = 0; age <= 40; age += 2) {
    const q = failureChance(age, 12, 3);
    assert.ok(q >= prev && q >= 0 && q <= 1);
    prev = q;
  }
  assert.equal(failureChance(400, 12, 3), 1);
});

test("typical lives match by type or name; unknown falls back and says so", () => {
  assert.equal(typicalLife("Unit 2 water heater").life, 12);
  assert.equal(typicalLife("tankless").life, 20);
  assert.equal(typicalLife("Elm St furnace").life, 18);
  assert.equal(typicalLife("widget").guessed, true);
});

test("age zero, shape 1, no savings: break-even quote is exactly the replacement cost", () => {
  const r = analyze([{ name: "x", age: 0, repair: 100, replace: 1000, savings: 0, life: 10, failureExtra: null }], { shape: 1, discount: 0, horizon: 8 });
  near(r.rows[0].breakEven, 1000, 1e-9);
});

test("one-year horizon, hand-computed", () => {
  // age 2, life 10, shape 3, r=0, extra 0, no savings. Fail: pay C, receive a new asset worth C => 0.
  // Survive: asset at age 3 is worth C*(1-3/10) => -700. Repair path = R + (1-q)*(-700). Replace path = C - C = 0 at year end
  // for a new asset at age 1 (if it survives) or 0 net if it fails: C + [q1*(C-C) + (1-q1)*(-C*(1-1/10))].
  const q = failureChance(2, 10, 3), q1 = failureChance(0, 10, 3);
  const r = analyze([{ name: "x", age: 2, repair: 50, replace: 1000, savings: 0, life: 10, failureExtra: null }], { shape: 3, discount: 0, horizon: 1, failureExtra: 0 });
  near(r.rows[0].repairNpv, 50 + (1 - q) * -700, 1e-9);
  near(r.rows[0].replaceNpv, 1000 + (1 - q1) * -900, 1e-9);
});

test("older units are worth repairing less: break-even quote falls with age", () => {
  const mk = (age) => ({ name: "wh", age, repair: 300, replace: 1450, savings: 0, life: 12, failureExtra: null });
  const young = analyze([mk(4)]).rows[0].breakEven;
  const old = analyze([mk(12)]).rows[0].breakEven;
  assert.ok(old < young, `${old} < ${young}`);
});

test("a costlier failure and yearly savings both push toward replacing", () => {
  const base = { name: "f", age: 12, repair: 800, replace: 5200, savings: 0, life: 18, failureExtra: null };
  const a = analyze([base], { failureExtra: 0 }).rows[0].advantage;
  const b = analyze([base], { failureExtra: 1500 }).rows[0].advantage;
  const c = analyze([{ ...base, savings: 300 }], { failureExtra: 0 }).rows[0].advantage;
  assert.ok(b > a);
  assert.ok(c > a);
});

test("a cheap repair on a young unit is repair; a dear repair on an old one is replace", () => {
  const cheap = analyze([{ name: "a", age: 3, repair: 150, replace: 1450, savings: 0, life: 12, failureExtra: null }]).rows[0];
  const dear = analyze([{ name: "b", age: 15, repair: 900, replace: 1450, savings: 0, life: 12, failureExtra: null }]).rows[0];
  assert.equal(cheap.action, "repair");
  assert.equal(dear.action, "replace");
  assert.ok(dear.overLife);
});

test("parseRows: header reordering, blank quote, bad rows skipped with a warning", () => {
  const p = parseRows("replacement cost,asset,age,repair quote,type\n1450,Unit 1,7,,water heater\n900,Unit 2,abc,200,fridge\n700,Unit 3,9,\"1,200\",dryer");
  assert.equal(p.assets.length, 2);
  assert.equal(p.assets[0].name, "Unit 1");
  assert.equal(p.assets[0].repairBlank, true);
  assert.equal(p.assets[0].replace, 1450);
  assert.equal(p.assets[1].repair, 1200);
  assert.match(p.warnings.join(" "), /Skipped "Unit 2"/);
});

test("parseRows: life override and errors", () => {
  assert.equal(parseRows("Main,boiler,30,500,9000,0,40").assets[0].life, 40);
  assert.match(parseRows("").error, /one row per asset/);
  assert.match(parseRows("a,b,c,d,e").error, /No usable rows/);
});

test("analyze refuses out-of-range options", () => {
  const a = [{ name: "x", age: 1, repair: 1, replace: 100, savings: 0, life: 10, failureExtra: null }];
  assert.match(analyze(a, { horizon: 0 }).error, /Horizon/);
  assert.match(analyze(a, { discount: 0.9 }).error, /Discount/);
  assert.match(analyze(a, { shape: 0.5 }).error, /sharpness/);
  assert.match(analyze([]).error, /at least one/);
});

test("budget plan picks best advantage per dollar within the budget", () => {
  const p = parseRows(sampleText());
  const r = analyze(p.assets, { budget: 2000 });
  assert.ok(r.planSpent <= 2000);
  assert.ok(r.plan.length >= 1);
  for (const row of r.rows) if (row.inPlan) assert.equal(row.action, "replace");
});

test("sample runs end to end and the CSV has a row per asset", () => {
  const p = parseRows(sampleText());
  assert.equal(p.assets.length, 10);
  const r = analyze(p.assets);
  assert.equal(r.n, 10);
  assert.equal(r.replaceCount + r.repairCount + r.closeCount, 10);
  assert.ok(r.replaceCount >= 1 && r.repairCount >= 1);
  const csv = reportCsv(r).trim().split("\n");
  assert.equal(csv.length, 11);
  assert.equal(DEFAULTS.horizon, 10);
});
