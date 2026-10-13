import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, sweepCsv } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// Round numbers so every line can be checked by hand.
const base = {
  dcPieces: "1000", dcPrice: "8", shirtPieces: "500", shirtPrice: "3", supplies: "0.50", claimsPct: "1", cardShare: "50", feePct: "2",
  hours: "300", wage: "12", burdenPct: "10", rent: "1500", utilities: "800", insurance: "150", equipment: "600", route: "300", otherFixed: "100", debt: "400",
};

test("revenue, variable costs and contribution", () => {
  const r = compute(base);
  assert.deepEqual(r.errors, []);
  close(r.revenue, 9500); // 8,000 + 1,500
  close(r.supplies, 750); // 1,500 pieces * 0.50
  close(r.claims, 95);
  close(r.cardFees, 95); // 9,500 * 50% * 2%
  close(r.contribution, 8560);
  close(r.contributionPerPiece, 8560 / 1500);
  close(r.avgRevPerPiece, 9500 / 1500);
});

test("labor, fixed costs, operating profit and debt coverage", () => {
  const r = compute(base);
  close(r.labor, 3960); // 300 * 12 * 1.10
  close(r.fixed, 3450);
  close(r.opProfit, 1150);
  close(r.netAfterDebt, 750);
  close(r.dscr, 2.875);
  close(r.laborPct, 3960 / 9500);
  close(r.revenuePerLaborHour, 9500 / 300);
});

test("break-even volume is where profit after loan payments is zero", () => {
  const r = compute(base);
  close(r.beMultiplier, 7810 / 8560);
  close(r.bePieces, (7810 / 8560) * 1500);
  const scale = r.beMultiplier;
  const at = compute({ ...base, dcPieces: String(1000 * scale), shirtPieces: String(500 * scale), supplies: base.supplies });
  close(at.contribution, 7810, 1e-6);
});

test("required price change zeroes profit at current volume", () => {
  const r = compute({ ...base, rent: "6000" });
  assert.ok(r.netAfterDebt < 0);
  const d = r.requiredPriceChange;
  assert.ok(d > 0);
  const lifted = compute({ ...base, rent: "6000", dcPrice: String(8 + d), shirtPrice: String(3 + d) });
  close(lifted.netAfterDebt, 0, 1e-6);
});

test("sweeps start from base profit and move by the stated amounts", () => {
  const r = compute(base);
  close(r.priceSweep.find((x) => x.dollars === 0).profit, 750);
  close(r.priceSweep.find((x) => x.dollars === 0.25).profit - 750, 0.25 * 1500 * 0.98); // 367.5
  close(r.volumeSweep.find((x) => x.pct === 10).profit - 750, 856);
  close(r.volumeSweep.find((x) => x.pct === 0).profit, 750);
});

test("a loss is a high finding and weak coverage is flagged", () => {
  const loss = compute({ ...base, rent: "6000" });
  assert.ok(loss.findings.some((f) => f.severity === "high" && /loses/.test(f.title)));
  const thin = compute({ ...base, debt: "1000" });
  assert.ok(thin.findings.some((f) => /Debt coverage is 1\.15x/.test(f.title)));
});

test("no contribution means no break-even", () => {
  const r = compute({ ...base, supplies: "10" });
  assert.equal(r.bePieces, null);
  assert.ok(r.findings.some((f) => /no volume breaks even/.test(f.title)));
});

test("bad input is rejected, not clamped", () => {
  assert.match(compute({ ...base, dcPieces: "" }).errors[0], /Dry-clean pieces/);
  assert.match(compute({ ...base, dcPrice: "x" }).errors[0], /number/);
  assert.match(compute({ ...base, cardShare: "150" }).errors[0], /above/);
  assert.match(compute({ ...base, wage: "-1" }).errors[0], /below/);
  assert.match(compute({ ...base, dcPieces: "0", shirtPieces: "0" }).errors[0], /at least one piece/);
});

test("the sample loads and the exports render", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(Number.isFinite(r.netAfterDebt));
  assert.match(summaryText(r), /Dry cleaner profit/);
  assert.equal(sweepCsv(r).trim().split("\n").length, 15);
});
