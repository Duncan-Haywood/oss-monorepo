import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, sampleInput, validateInput, resultText, resultCsv, serializeState, parseState, MAX_BANDS, SCENARIO_PCTS } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("sample: gross, aid, net and discount rate are the plain arithmetic", () => {
  const r = solve(sampleInput());
  assert.equal(r.students, 300);
  assert.equal(r.gross, 300 * 24000);
  assert.equal(r.aid, 60 * 6000 + 50 * 12000 + 40 * 18000 + 20 * 22000);
  assert.equal(r.net, r.gross - r.aid);
  near(r.discountRate, r.aid / r.gross);
  near(r.netPerStudent * 300, r.net);
  assert.equal(r.fullPay, 130);
});

test("surplus is net minus per-student cost minus fixed cost", () => {
  const r = solve(sampleInput());
  near(r.surplus, r.net - 300 * 2500 - 4300000);
});

test("a full-pay school has a zero discount rate", () => {
  const r = solve({ ...sampleInput(), bands: [{ label: "All", students: 200, aid: 0 }] });
  assert.equal(r.discountRate, 0);
  near(r.equivalentFullPay, 200);
});

test("equivalent full-pay students equal net divided by sticker", () => {
  const r = solve(sampleInput());
  near(r.equivalentFullPay, r.net / 24000);
});

test("break-even enrolment covers fixed costs exactly at the same aid mix", () => {
  const i = sampleInput();
  const r = solve(i);
  const unit = r.netPerStudent - i.variableCost;
  near(r.breakEvenStudents * unit, i.fixedCosts, 1e-3);
});

test("a student whose award exceeds sticker minus cost loses money; below it adds money", () => {
  const i = sampleInput();
  const r = solve(i);
  near(r.maxProfitableAward, 24000 - 2500);
  assert.ok(r.groups.every((g) => (g.aid < r.maxProfitableAward) === (g.contribution > 0)));
});

test("holding aid in dollars beats scaling it when nobody leaves", () => {
  const r = solve({ ...sampleInput(), lossPer1Pct: 0 });
  for (const pct of SCENARIO_PCTS.filter((p) => p > 0)) {
    const hold = r.scenarios.find((s) => s.pct === pct && s.policy === "hold");
    const scale = r.scenarios.find((s) => s.pct === pct && s.policy === "scale");
    assert.ok(hold.surplus > scale.surplus);
    assert.ok(hold.discountRate < r.discountRate + 1e-12);
    near(scale.discountRate, r.discountRate, 1e-9);
  }
});

test("scaled aid with no attrition raises surplus by the net revenue times the increase", () => {
  const r = solve({ ...sampleInput(), lossPer1Pct: 0 });
  const s = r.scenarios.find((x) => x.pct === 4 && x.policy === "scale");
  near(s.change, r.net * 0.04, 1e-3);
});

test("the 0% scenario reproduces today's surplus", () => {
  const r = solve(sampleInput());
  for (const s of r.scenarios.filter((x) => x.pct === 0)) near(s.change, 0, 1e-6);
});

test("attrition lowers a scenario's surplus and students", () => {
  const a = solve({ ...sampleInput(), lossPer1Pct: 0 }).scenarios.find((x) => x.pct === 6 && x.policy === "hold");
  const b = solve({ ...sampleInput(), lossPer1Pct: 1 }).scenarios.find((x) => x.pct === 6 && x.policy === "hold");
  assert.ok(b.students < a.students);
  assert.ok(b.surplus < a.surplus);
  near(b.lost, 300 * 0.06, 1e-9);
});

test("the sticker increase that hits the target, aid held and nobody leaving, does hit it", () => {
  const i = { ...sampleInput(), lossPer1Pct: 0, targetSurplus: 1500000 };
  const r = solve(i);
  const p = r.neededPctHold;
  assert.ok(p > 0);
  const check = solve({ ...i, sticker: i.sticker * (1 + p / 100), bands: i.bands });
  near(check.surplus, 1500000, 1e-3);
});

test("no increase is needed when the target is already met", () => {
  assert.equal(solve({ ...sampleInput(), targetSurplus: -1e9 }).neededPctHold, 0);
});

test("validation rejects the usual mistakes", () => {
  const i = sampleInput();
  assert.ok(validateInput({ ...i, sticker: 0 }).length);
  assert.ok(validateInput({ ...i, bands: [{ students: 10, aid: 99999 }] }).some((m) => /more than the sticker/.test(m)));
  assert.ok(validateInput({ ...i, capacity: 100 }).some((m) => /seats/.test(m)));
  assert.ok(validateInput({ ...i, bands: [] }).length);
  assert.ok(validateInput({ ...i, bands: Array.from({ length: MAX_BANDS + 1 }, () => ({ students: 1, aid: 0 })) }).length);
  assert.ok(validateInput({ ...i, lossPer1Pct: -1 }).length);
  assert.equal(validateInput(i).length, 0);
  assert.equal(solve({ ...i, sticker: NaN }).ok, false);
});

test("text, CSV and save/load round-trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /discount rate 22\.\d%|discount rate 2\d\.\d%/);
  assert.match(resultText(r), /not financial advice/);
  assert.equal(resultCsv(r).split("\n").length, 1 + 5 + 1 + 1 + 10);
  const back = parseState(serializeState(sampleInput()));
  assert.deepEqual(back.state, sampleInput());
  assert.ok(parseState("{").error);
  assert.ok(parseState('{"app":"other","input":{}}').error);
});

test("random schools: net never exceeds gross and discount stays in 0..1", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 300; t++) {
    const sticker = 5000 + rnd() * 50000;
    const bands = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ students: 1 + Math.floor(rnd() * 80), aid: rnd() * sticker }));
    const n = bands.reduce((s, b) => s + b.students, 0);
    const r = solve({ sticker, fixedCosts: rnd() * 5e6, variableCost: rnd() * 5000, capacity: n + 10, lossPer1Pct: rnd(), targetSurplus: 0, bands });
    assert.ok(r.ok);
    assert.ok(r.net <= r.gross + 1e-6 && r.net >= 0);
    assert.ok(r.discountRate >= 0 && r.discountRate <= 1);
    for (const s of r.scenarios) assert.ok(s.discountRate >= 0 && s.discountRate <= 1 + 1e-12);
  }
});
