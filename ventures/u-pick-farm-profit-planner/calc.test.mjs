import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, seasonFixed, effectiveDays, perVisitor, project, visitorsForProfit, admissionForProfit, rainoutRisk, sensitivity, analyze, num } from "./calc.mjs";

const base = { ...DEFAULTS, openDays: 20, rainoutPct: 0, visitors: 100, admission: 10, pickLbs: 0, pickPrice: 0, cropCostPerLb: 0, addonSpend: 0, addonMarginPct: 0, laborPerDay: 500, rent: 1000, insurance: 1000, marketing: 500, setup: 500, feePct: 0, targetProfit: 5000 };

test("num parses money and percent strings", () => { assert.equal(num("$1,250"), 1250); assert.ok(Number.isNaN(num("x"))); });

test("season costs and effective days", () => {
  assert.equal(seasonFixed(base), 3000);
  assert.equal(effectiveDays({ openDays: 20, rainoutPct: 0.25 }), 15);
  assert.equal(effectiveDays({ openDays: 20, rainoutPct: 2 }), 0);
});

test("project: admission only", () => {
  const p = project(base);
  assert.equal(p.visits, 2000);
  assert.equal(p.gross, 20000);
  assert.equal(p.labor, 10000);
  assert.equal(p.profit, 20000 - 10000 - 3000);
});

test("project: crop and extras use their own margins, fees come off billed revenue", () => {
  const o = { ...base, admission: 0, pickLbs: 5, pickPrice: 2, cropCostPerLb: 1, addonSpend: 10, addonMarginPct: 0.5, feePct: 0.1 };
  const pv = perVisitor(o);
  assert.ok(Math.abs(pv.gross - 20) < 1e-9);
  assert.ok(Math.abs(pv.cost - 10) < 1e-9);
  assert.ok(Math.abs(pv.net - (20 * 0.9 - 10)) < 1e-9);
  const p = project(o);
  assert.ok(Math.abs(p.profit - (2000 * 8 - 10000 - 3000)) < 1e-6);
});

test("visitorsForProfit solves exactly and project agrees", () => {
  const v = visitorsForProfit(base, 0);
  assert.ok(Math.abs(v - 65) < 1e-9); // (10000+3000)/(20*10)
  assert.ok(Math.abs(project(base, { visitors: v }).profit) < 1e-6);
  assert.equal(visitorsForProfit({ ...base, admission: 0 }, 0), null);
});

test("admissionForProfit solves exactly and floors at zero", () => {
  const a = admissionForProfit(base, 0);
  assert.ok(Math.abs(a - 6.5) < 1e-9);
  assert.ok(Math.abs(project(base, { admission: a }).profit) < 1e-6);
  assert.equal(admissionForProfit({ ...base, laborPerDay: 0, rent: 0, insurance: 0, marketing: 0, setup: 0 }, 0), 0);
});

test("rainout risk falls as days are lost, labor stays committed per open day", () => {
  const r = rainoutRisk(base);
  assert.equal(r[0].profit, 7000);
  assert.ok(r.every((x, i) => i === 0 || x.profit < r[i - 1].profit));
});

test("sensitivity grid is visitors by admission and is monotone", () => {
  const s = sensitivity(base);
  assert.equal(s.rows.length, 5);
  assert.equal(s.admissions.length, 5);
  for (const row of s.rows) for (let i = 1; i < row.cells.length; i++) assert.ok(row.cells[i] >= row.cells[i - 1]);
});

test("analyze flags a loss and names the break-even attendance", () => {
  const a = analyze({ ...base, visitors: 40 });
  assert.ok(a.now.profit < 0);
  assert.equal(a.findings[0].level, "high");
  assert.match(a.findings[0].text, /65 visitors/);
});

test("analyze warns when a washed-out season turns a profit into a loss", () => {
  const a = analyze({ ...base, visitors: 75, rainoutPct: 0.1 });
  assert.ok(a.now.profit > 0);
  assert.ok(a.findings.some((f) => /washed-out/.test(f.title)));
});

test("analyze flags a visitor who loses money before labor", () => {
  const a = analyze({ ...base, admission: 0, pickLbs: 5, pickPrice: 1, cropCostPerLb: 2 });
  assert.match(a.findings[0].title, /loses you money/);
});
