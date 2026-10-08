import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, DEFAULTS, guaranteeFor, indemnityFor, parseCoverage, parseScenarios } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Hand-worked: APH 180, 80% coverage, projected price $4.60 -> 144 bu x 4.60 = $662.40 per acre.
test("RP: drought with a price rise raises the guarantee to the harvest price", () => {
  close(guaranteeFor("RP", 180, 80, 4.6, 5.8), 144 * 5.8); // 835.20
  close(indemnityFor("RP", 180, 80, 4.6, 120, 5.8), 835.2 - 120 * 5.8); // 139.20
});
test("RP: a price fall keeps the guarantee at the projected price", () => {
  close(guaranteeFor("RP", 180, 80, 4.6, 3.9), 662.4);
  close(indemnityFor("RP", 180, 80, 4.6, 205, 3.9), 0);
  close(indemnityFor("RP", 180, 80, 4.6, 140, 3.9), 662.4 - 140 * 3.9); // revenue fell below guarantee
});
test("RP: the harvest price counts only up to 200% of the projected price", () => {
  close(guaranteeFor("RP", 180, 80, 4.6, 10), 144 * 9.2);
  close(indemnityFor("RP", 180, 80, 4.6, 0, 10), 144 * 9.2);
});
test("RP-HPE ignores a price rise; YP pays missing bushels at the projected price", () => {
  close(indemnityFor("RPHPE", 180, 80, 4.6, 120, 5.8), 0); // 662.40 vs 696.00 revenue
  close(indemnityFor("YP", 180, 80, 4.6, 120, 5.8), 24 * 4.6); // 110.40
  close(indemnityFor("YP", 180, 80, 4.6, 150, 2), 0);
});
test("parsers keep labels with commas, sort levels and report skipped lines", () => {
  const c = parseCoverage("85, 26.5\n70, 6.1\nbad\n120, 3");
  assert.deepEqual(c.rows.map((r) => r.level), [70, 85]);
  assert.equal(c.skipped.length, 2);
  const s = parseScenarios("Short crop, prices up, 120, 5.80, 10\nnope");
  assert.equal(s.rows[0].label, "Short crop, prices up");
  assert.equal(s.rows[0].probability, 10);
  assert.equal(s.skipped.length, 1);
});
test("analyze: break-even yield, step cost and expected net for the example", () => {
  const a = analyze(DEFAULTS);
  const l80 = a.levels.find((l) => l.level === 80);
  close(l80.baseGuarantee, 662.4);
  close(l80.breakEvenYield, 144 - 14.8 / 4.6); // 140.7826...
  close(l80.floorAfterPremium, 662.4 - 14.8);
  close(l80.stepPremium, 5.4);
  close(l80.stepGuarantee, 41.4);
  close(l80.stepCostPerDollar, 5.4 / 41.4);
  assert.equal(a.probSum, 100);
  // Only the 120 bu / $5.80 and 160 bu / $4.80 scenarios pay at 80%: 139.20 and max(0, 662.4-768)=0.
  close(l80.outcomes[1].indemnity, 139.2);
  close(l80.outcomes[3].indemnity, 0);
  close(l80.expectedIndemnity, 139.2 * 0.1);
  close(l80.expectedNet, 139.2 * 0.1 - 14.8);
  close(l80.worstNet, -14.8);
  close(l80.totalPremium, 14.8 * 640);
});
test("analyze: no scenarios or zero probability gives no recommendation, not NaN dollars", () => {
  const a = analyze({ ...DEFAULTS, scenarios: "" });
  assert.equal(a.best, null);
  assert.equal(a.levels.length, 4);
});
test("an unknown plan falls back to RP", () => {
  assert.equal(analyze({ ...DEFAULTS, plan: "zzz" }).plan, "RP");
});
