import { test } from "node:test";
import assert from "node:assert/strict";
import { outcome, normalise, feeCost, scenarioProfit, fullRecoverySurcharge, breakEvenLost } from "./calc.mjs";

const base = { monthlySales: 100000, cardShare: 0.8, avgTicket: 50, rate: 0.029, fee: 0.3, margin: 0.4, surcharge: 0.03, cashDiscount: 0.03, shift: 0.2, lost: 0.02 };
const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const I = (o = {}) => normalise({ ...base, ...o });

test("fees by hand: 80k card at 2.9% + 1600 txns at $0.30", () => {
  close(feeCost(I()), 80000 * 0.029 + 1600 * 0.3);
});

test("absorb profit by hand", () => {
  const i = I();
  close(scenarioProfit(i, "absorb", { lost: 0, shift: 0 }), 100000 * 0.4 - 2320 - 480);
});

test("surcharge with no behaviour change nets surcharge minus the fee on it", () => {
  const i = I({ shift: 0, lost: 0 });
  const delta = scenarioProfit(i, "surcharge") - scenarioProfit(i, "absorb");
  close(delta, 80000 * 0.03 - 80000 * 0.03 * 0.029);
});

test("full-recovery surcharge zeroes the fee cost with no behaviour change", () => {
  const i = I({ shift: 0, lost: 0 });
  const s = fullRecoverySurcharge(i);
  // Profit equals the no-fee profit: total sales x margin.
  close(scenarioProfit(i, "surcharge", { surcharge: s }), 100000 * 0.4, 1e-6);
});

test("shifted cash customers avoid fees; lost customers cost margin", () => {
  const i = I({ surcharge: 0, shift: 0.5, lost: 0 });
  assert.ok(scenarioProfit(i, "surcharge") > scenarioProfit(i, "absorb", { shift: 0 }));
  const j = I({ surcharge: 0, shift: 0, lost: 0.5 });
  assert.ok(scenarioProfit(j, "surcharge") < scenarioProfit(j, "absorb", { lost: 0 }));
});

test("break-even lost share makes the surcharge exactly equal to absorbing", () => {
  const i = I({ shift: 0.1 });
  const be = breakEvenLost(i, "surcharge");
  assert.equal(be.reason, "ok");
  close(scenarioProfit(i, "surcharge", { lost: be.lost }), scenarioProfit(i, "absorb", { lost: 0 }), 1e-6);
});

test("cash discount with no shift never beats absorbing", () => {
  const i = I({ shift: 0, lost: 0 });
  close(scenarioProfit(i, "cash"), scenarioProfit(i, "absorb"));
  close(breakEvenLost(i, "cash").lost, 0);
});

test("validation", () => {
  assert.ok(normalise({ ...base, monthlySales: 0 }).invalid);
  assert.ok(normalise({ ...base, cardShare: 1.2 }).invalid);
  assert.ok(normalise({ ...base, shift: 0.7, lost: 0.5 }).invalid);
  assert.ok(normalise({ ...base, rate: -0.01 }).invalid);
  assert.ok(outcome({ ...base, avgTicket: 0 }).invalid);
});

test("findings warn about surcharge caps and losing scenarios", () => {
  const r = outcome({ ...base, surcharge: 0.05 });
  assert.ok(r.findings.some((f) => /above 3%/.test(f.title)));
  const r2 = outcome({ ...base, surcharge: 0.01, lost: 0.3, shift: 0 });
  assert.ok(r2.findings.some((f) => /Surcharge loses money/.test(f.title)));
});

test("sensitivity grid is surcharge by lost share, zero cell is zero delta at s=0,l=0", () => {
  const r = outcome(base);
  close(r.sensitivity.rows[0].cells[0], scenarioProfit(r.input, "surcharge", { surcharge: 0, lost: 0 }) - r.baseProfit);
  assert.equal(r.sensitivity.rows.length, 4);
});
