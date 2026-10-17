import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, expectedFills, sampleInput, validateInput, resultText, resultCsv, serializeState, parseState, MAX_SERVICES } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("expected fills is the capped geometric sum", () => {
  near(expectedFills(0.5, 2), 0.5 + 0.25);
  near(expectedFills(0, 10), 0);
  near(expectedFills(0.9, 0), 0);
  near(expectedFills(0.75, 10), [...Array(10)].reduce((a, _, k) => a + 0.75 ** (k + 1), 0));
});

test("profit for a hand-worked service", () => {
  const i = { ...sampleInput(), cardFeePct: 3, cardFixedFee: 0, noShowPct: 0, depositPct: 0, monthlyOverhead: 0, turnoverMinutes: 0, services: [{ name: "x", kind: "fill", price: 100, minutes: 60, supply: 10, perWeek: 1 }] };
  const r = solve(i).rows[0];
  near(r.profit, 100 * 0.97 - 10);
  near(r.perHour, 87);
  near(r.cardFees, 3);
});

test("overhead is spread over the booked hours", () => {
  const i = { ...sampleInput(), monthlyOverhead: 1400, hoursOpenPerWeek: 36, utilizationPct: 70 };
  near(solve(i).overheadPerHour, 1400 / (36 * 52 / 12 * 0.7));
});

test("no-shows lose the price but a deposit is kept", () => {
  const base = { ...sampleInput(), cardFixedFee: 0, noShowPct: 10, monthlyOverhead: 0, turnoverMinutes: 0, services: [{ kind: "fill", price: 100, minutes: 60, supply: 0, perWeek: 1 }] };
  near(solve({ ...base, depositPct: 0 }).rows[0].collected, 90);
  near(solve({ ...base, depositPct: 50 }).rows[0].collected, 95);
  near(solve({ ...base, depositPct: 100 }).rows[0].collected, 100);
});

test("the price for the target hourly earns exactly the target hourly", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 300; t++) {
    const i = {
      ...sampleInput(), cardFeePct: rnd() * 6, cardFixedFee: rnd() * 0.5, noShowPct: rnd() * 30, depositPct: rnd() * 100,
      monthlyOverhead: rnd() * 4000, hoursOpenPerWeek: 10 + rnd() * 50, utilizationPct: 30 + rnd() * 70, turnoverMinutes: rnd() * 30, targetHourly: 10 + rnd() * 90,
      services: [{ kind: "fill", price: 20 + rnd() * 200, minutes: 20 + rnd() * 160, supply: rnd() * 30, perWeek: 2 }],
    };
    const r = solve(i).rows[0];
    const tie = solve({ ...i, services: [{ ...i.services[0], price: r.targetPrice }] }).rows[0];
    near(tie.perHour, i.targetHourly, 1e-6);
    assert.equal(r.meets, r.price >= r.targetPrice - 1e-9);
  }
});

test("the set price floor makes the client's lifetime earn exactly the target hourly", () => {
  const i = sampleInput();
  const r = solve(i);
  const set = i.services[0];
  const tie = solve({ ...i, services: [{ ...set, price: r.client.setPriceFloor }, ...i.services.slice(1)] });
  near(tie.client.lifetimePerHour, i.targetHourly, 1e-6);
});

test("higher rebooking raises client lifetime profit and lowers the needed set price", () => {
  // fills earn above a $20 target here, so more of them let the set be cheaper
  const a = solve({ ...sampleInput(), targetHourly: 20, rebookPct: 50 }).client;
  const b = solve({ ...sampleInput(), targetHourly: 20, rebookPct: 90 }).client;
  assert.ok(b.lifetimeProfit > a.lifetimeProfit);
  assert.ok(b.setPriceFloor < a.setPriceFloor);
  // fills that earn below target need a dearer set the more often they are booked
  const c = solve({ ...sampleInput(), rebookPct: 50 }).client;
  const d = solve({ ...sampleInput(), rebookPct: 90 }).client;
  assert.ok(d.setPriceFloor > c.setPriceFloor);
});

test("no client lifetime without both a set and a fill", () => {
  const i = sampleInput();
  assert.equal(solve({ ...i, services: i.services.filter((s) => s.kind !== "fill") }).client, null);
});

test("an overbooked schedule is flagged", () => {
  const i = sampleInput();
  const r = solve({ ...i, services: i.services.map((s) => ({ ...s, perWeek: 20 })) });
  assert.ok(r.weekly.impliedUtilPct > 100);
  assert.ok(r.notes.some((n) => /does not fit/.test(n)));
});

test("validation rejects bad input", () => {
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.ok(validateInput({ ...sampleInput(), services: [] }).length);
  assert.ok(validateInput({ ...sampleInput(), hoursOpenPerWeek: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), rebookPct: 100 }).length);
  assert.ok(validateInput({ ...sampleInput(), services: Array(MAX_SERVICES + 1).fill(sampleInput().services[0]) }).length);
  assert.ok(validateInput({ ...sampleInput(), services: [{ kind: "fill", price: -1, minutes: 60, supply: 0, perWeek: 1 }] }).length);
  assert.equal(solve({ ...sampleInput(), services: [] }).ok, false);
});

test("exports and save/load round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Classic full set/);
  assert.equal(resultCsv(r).split("\n").length, 1 + r.rows.length);
  const back = parseState(serializeState(r.input));
  assert.deepEqual(back.state, r.input);
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
});
