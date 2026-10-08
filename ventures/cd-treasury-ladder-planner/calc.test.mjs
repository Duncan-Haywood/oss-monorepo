import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, parseQuotes, afterTax, curveAt, scenario, money, num, toCsv } from "./calc.mjs";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("treasury interest escapes state tax, cd interest does not", () => {
  near(afterTax(0.05, "cd", 0.24, 0.05), 0.05 * 0.71);
  near(afterTax(0.05, "treasury", 0.24, 0.05), 0.05 * 0.76);
});

test("quotes parse with kinds and report bad lines", () => {
  const { quotes, problems } = parseQuotes("12, 4.5, CD\n6,4.0,T-bill\n\nbad line\n24, x");
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].months, 6);
  assert.equal(quotes[0].kind, "treasury");
  assert.equal(problems.length, 2);
});

test("the curve interpolates linearly and is flat beyond the ends", () => {
  const pts = [{ months: 12, y: 0.04 }, { months: 36, y: 0.06 }];
  near(curveAt(pts, 24), 0.05);
  near(curveAt(pts, 1), 0.04);
  near(curveAt(pts, 99), 0.06);
});

test("on a flat curve with no shift every strategy ends with the same money", () => {
  const o = { ...DEFAULTS, rungs: 4, spacingMonths: 6 };
  const pts = [{ months: 3, y: 0.03 }, { months: 60, y: 0.03 }];
  const s = scenario(pts, o, 0);
  near(s.ladder, s.longest, 1e-6);
  near(s.ladder, s.shortest, 1e-6);
  near(s.longest, o.amount * Math.pow(1.03, 2), 1e-6);
});

test("a rate rise favors rolling short, a rate fall favors locking long", () => {
  const a = analyze(DEFAULTS);
  const up = a.rows.find((r) => r.shift === 2), down = a.rows.find((r) => r.shift === -2);
  assert.ok(up.shortest > up.longest);
  assert.ok(down.longest > down.shortest);
});

test("the ladder sits between the extremes when rates are unchanged", () => {
  const a = analyze({ ...DEFAULTS, quotesText: "12,3,cd\n24,3.5,cd\n36,4,cd\n48,4.5,cd\n60,5,cd" });
  const t = a.rows.find((r) => r.shift === 0);
  assert.ok(t.longest > t.ladder && t.ladder > t.shortest);
});

test("ladder rungs are equally spaced and equally funded", () => {
  const a = analyze(DEFAULTS);
  assert.deepEqual(a.rungs.map((r) => r.months), [12, 24, 36, 48, 60]);
  assert.ok(a.rungs.every((r) => r.amount === 20000));
  assert.equal(a.horizon, 60);
});

test("treasuries beat cds after tax in a taxed state when the rates are close", () => {
  const a = analyze({ ...DEFAULTS, statePct: 9 });
  const row = a.compare.find((c) => c.months === 36);
  assert.equal(row.winner, "Treasury");
  const none = analyze({ ...DEFAULTS, statePct: 0 });
  assert.equal(none.compare.find((c) => c.months === 12).winner, "CD");
});

test("missing quotes, bad inputs and short curves are reported", () => {
  assert.equal(analyze({ ...DEFAULTS, quotesText: "12,4,treasury", kind: "cd" }).ok, false);
  assert.equal(analyze({ ...DEFAULTS, amount: 0 }).ok, false);
  assert.equal(analyze({ ...DEFAULTS, rungs: 1 }).ok, false);
  assert.equal(analyze({ ...DEFAULTS, fedPct: 60, statePct: 40 }).ok, false);
  assert.ok(analyze({ ...DEFAULTS, rungs: 10 }).warnings.some((w) => /longest/.test(w)));
});

test("formatters and csv", () => {
  assert.equal(num("4.5%"), 4.5);
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(toCsv(analyze(DEFAULTS)).trim().split("\n").length, 6);
});
