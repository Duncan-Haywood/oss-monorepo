import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, sizeCircuit, voltageDrop, price, COPPER, SAMPLE, summaryText, sweepCsv } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("circuit sizing: 32 A continuous is 40 A, so a 40 A breaker and 8 AWG", () => {
  const s = sizeCircuit(32);
  assert.equal(s.need, 40);
  assert.equal(s.breaker, 40);
  assert.equal(s.minWire.awg, "8");
});

test("48 A charger needs 60 A of circuit and 6 AWG", () => {
  const s = sizeCircuit(48);
  assert.equal(s.breaker, 60);
  assert.equal(s.minWire.awg, "6");
});

test("voltage drop by hand: 2 x 12.9 x 32 x 60 / 16510 = 3.0003 V", () => {
  const vd = voltageDrop(COPPER.find((c) => c.awg === "8"), 32, 60, 240);
  near(vd.volts, 3.0003, 0.001);
  near(vd.pct, 1.25, 0.001);
});

test("price at margin: cost 700 at 30% is 1000", () => near(price(700, 30), 1000, 1e-9));

test("sample quote, worked by hand", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  // wire 3.40 x 60 = 204; labor (3.5 + 1.2) x 95 = 446.5; direct 0 + 204 + 180 + 120 + 446.5 = 950.5; x1.12 = 1064.56
  near(r.quote.direct, 950.5);
  near(r.quote.cost, 1064.56);
  near(r.quote.price, 1064.56 / 0.7);
  near(r.quote.profit, r.quote.price - r.quote.cost);
  // panel: 200 - 135 - 40 = 25
  near(r.headroom, 25);
  assert.equal(r.sizing.chosen.awg, "8");
  assert.equal(r.sizing.stepped, false);
});

test("a long run steps the conductor up until drop is within 3%", () => {
  const r = compute({ ...SAMPLE, runFt: "200" });
  assert.equal(r.sizing.nominal.awg, "8");
  assert.equal(r.sizing.stepped, true);
  assert.ok(r.sizing.vd.pct <= 3);
  assert.ok(r.sizing.nominalVd.pct > 3);
  assert.ok(r.findings.some((x) => /AWG/.test(x.title) && x.severity === "medium"));
});

test("negative panel headroom is a high finding", () => {
  const r = compute({ ...SAMPLE, existingAmps: "175" });
  assert.ok(r.headroom < 0);
  assert.ok(r.findings.some((x) => x.severity === "high" && /Panel/.test(x.title)));
});

test("margin sweep rises with margin; run sweep rises with run", () => {
  const r = compute(SAMPLE);
  for (let i = 1; i < r.marginSweep.length; i++) assert.ok(r.marginSweep[i].price > r.marginSweep[i - 1].price);
  for (let i = 1; i < r.runSweep.length; i++) assert.ok(r.runSweep[i].price > r.runSweep[i - 1].price);
  assert.equal(r.runSweep[0].run, 60);
});

test("bad input is rejected, not clamped", () => {
  assert.match(compute({ ...SAMPLE, chargerAmps: "" }).errors[0], /required/);
  assert.match(compute({ ...SAMPLE, marginPct: "95" }).errors[0], /between 0 and 90/);
  assert.match(compute({ ...SAMPLE, chargerAmps: "200" }).errors[0], /between 8 and 80/);
  assert.match(compute({ ...SAMPLE, laborRate: "-5" }).errors[0], /at least 0/);
});

test("summary and csv carry the figures", () => {
  const r = compute(SAMPLE);
  assert.match(summaryText(r), /40 A breaker.*8 AWG copper/);
  assert.match(sweepCsv(r), /^margin_pct,price\n20,/);
});
