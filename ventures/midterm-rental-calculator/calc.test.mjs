import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, normalise, midTerm, shortTerm, longTerm, gapGrid, rateLadder, breakEvenGapDays, summaryText, comparisonCsv, money, DAYS_PER_MONTH } from "./calc.mjs";

test("long-term lease: rent less vacancy, management and maintenance", () => {
  const l = longTerm(normalise({ ltrRent: 2000, ltrVacancyPct: 10, ltrMgmtPct: 10, ltrMaintMonthly: 100, fixedMonthly: 1000 }));
  assert.equal(l.revenue, 1800);
  assert.equal(l.beforeFixed, 1800 - 180 - 100);
  assert.equal(l.cash, 1520 - 1000);
});

test("mid-term: occupancy is stay over stay plus gap, revenue follows it", () => {
  const m = midTerm(normalise({ mtrStayMonths: 3, mtrGapDays: 0, mtrRate: 3000, mtrFeePct: 0, mtrUtilities: 0, mtrSupplies: 0, mtrTurnCost: 0, mtrInsuranceExtra: 0, mtrMaintMonthly: 0, furnishingCost: 0 }));
  assert.equal(m.occupancyPct, 100);
  assert.equal(m.revenue, 3000);
  const g = midTerm(normalise({ mtrStayMonths: 3, mtrGapDays: DAYS_PER_MONTH * 3, mtrRate: 3000, mtrFeePct: 0, mtrUtilities: 0, mtrSupplies: 0, mtrTurnCost: 0, mtrInsuranceExtra: 0, mtrMaintMonthly: 0, furnishingCost: 0 }));
  assert.equal(g.occupancyPct, 50);
  assert.equal(g.revenue, 1500);
});

test("mid-term: turnovers are charged per cycle and furnishing is spread over its life", () => {
  const m = midTerm(normalise({ mtrStayMonths: 1, mtrGapDays: 0, mtrTurnCost: 200, furnishingCost: 8400, furnishingYears: 7 }));
  assert.equal(m.turnsPerMonth, 1);
  assert.equal(m.detail.turn, 200);
  assert.equal(m.furnishing, 100);
});

test("short-term: nights, stays, cleaning fee in revenue and cleaning cost out", () => {
  const s = shortTerm(normalise({ strAdr: 100, strOccPct: 50, strStayNights: 2, strCleanFeeCharged: 80, strCleanCost: 70, strFeePct: 0, strMgmtPct: 0, strUtilities: 0, strSupplies: 0, strInsuranceExtra: 0, strMaintMonthly: 0, furnishingCost: 0 }));
  const nights = DAYS_PER_MONTH / 2;
  assert.equal(s.revenue, Math.round((nights * 100 + (nights / 2) * 80) * 100) / 100);
  assert.equal(s.detail.turn, Math.round((nights / 2) * 70 * 100) / 100);
});

test("rate to match the lease makes the mid-term net equal the lease net", () => {
  const r = compare({});
  const at = midTerm({ ...r.inputs, mtrRate: r.rateToMatch }).beforeFixed;
  assert.ok(Math.abs(at - r.strategies[0].beforeFixed) < 0.5);
});

test("break-even gap days: still level with the lease there, behind just past it", () => {
  const i = normalise({});
  const target = longTerm(i).beforeFixed;
  const g = breakEvenGapDays(i, target);
  assert.ok(g > i.mtrGapDays);
  assert.ok(midTerm({ ...i, mtrGapDays: g }).beforeFixed >= target - 0.01);
  assert.ok(midTerm({ ...i, mtrGapDays: g + 1 }).beforeFixed < target);
});

test("a mid-term rate below the lease is reported as losing, with the rate needed", () => {
  const r = compare({ mtrRate: 1900 });
  assert.ok(r.advantage < 0);
  assert.equal(r.findings[0].level, "high");
  assert.match(r.findings[0].text, /needs a monthly rate of about/);
  assert.equal(r.payback, null);
  assert.match(r.findings.map((f) => f.text).join(" "), /never pays back/);
});

test("with no gap and no costs the break-even gap is null when the mid-term loses even then", () => {
  const i = normalise({ mtrRate: 1000 });
  assert.equal(breakEvenGapDays(i, longTerm(i).beforeFixed), null);
});

test("best strategy is the highest net after fixed costs", () => {
  const r = compare({ strAdr: 400 });
  assert.equal(r.best, "str");
  const q = compare({ strAdr: 60, mtrRate: 3600 });
  assert.equal(q.best, "mtr");
});

test("guest stipend: over budget is flagged with the price that fits", () => {
  const r = compare({ guestStipend: 2800 });
  assert.ok(r.findings.some((f) => f.level === "high" && /over the guest's \$2,800/.test(f.text)));
  const ok = compare({ guestStipend: 4000 });
  assert.ok(ok.findings.some((f) => /fits/.test(f.text)));
  assert.ok(!compare({}).findings.some((f) => /housing budget/.test(f.text)));
});

test("grid: more empty days never raise the mid-term result; rate ladder rises with the gap", () => {
  const g = gapGrid({});
  for (const row of g.cells) for (let k = 1; k < row.length; k++) assert.ok(row[k] <= row[k - 1]);
  const ladder = rateLadder({});
  for (let k = 1; k < ladder.length; k++) assert.ok(ladder[k].rate > ladder[k - 1].rate);
});

test("bad or blank inputs fall back to defaults instead of NaN", () => {
  const r = compare({ mtrRate: "abc", ltrRent: "", strOccPct: "250" });
  for (const s of r.strategies) assert.ok(Number.isFinite(s.cash));
  assert.equal(r.inputs.strOccPct, 100);
});

test("exports", () => {
  const r = compare({});
  assert.match(summaryText(r), /Mid-term rental: revenue/);
  assert.match(summaryText(r), /Not tax, legal or financial advice/);
  const csv = comparisonCsv(r).trim().split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^strategy,/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money(null), "n/a");
});
