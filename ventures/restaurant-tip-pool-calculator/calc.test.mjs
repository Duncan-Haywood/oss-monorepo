import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, allocate, parseCents, parseHours, parseCsv, parseShifts, parseRoles, money, reportCsv, payrollCsv, sampleList, DEFAULT_ROLES } from "./calc.mjs";

const H = "Name,Role,Hours,Card tips,Cash tips,Sales\n";
const run = (rows, o, roles) => calculate(H + rows, roles, o);
const pay = (r) => Object.fromEntries(r.rows.map((x) => [x.name, x.payout]));

test("parsing money, hours and csv", () => {
  assert.equal(parseCents("$1,250.50"), 125050);
  assert.equal(parseCents(""), 0);
  assert.equal(parseCents("1.234"), null);
  assert.equal(parseHours("6:30"), 6.5);
  assert.equal(parseHours("0"), null);
  assert.equal(parseHours("25"), null);
  assert.deepEqual(parseCsv('﻿a,b\n"x, y",2'), [["a", "b"], ["x, y", "2"]]);
  assert.equal(money(-12345), "-$123.45");
});

test("allocate splits exactly by largest remainder", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(1001, [3, 5, 7, 11]).reduce((a, b) => a + b, 0), 1001);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(50, [0, 0]), [0, 0]);
});

test("missing columns and bad rows are reported", () => {
  assert.match(parseShifts("Name,Hours\nA,5").errors[0], /role/);
  const r = parseShifts(H + "A,Server,5,10,,\n,Server,5,,,\nB,Server,x,,,\nC,Server,5,1.234,,");
  assert.equal(r.shifts.length, 1);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /Row 3/);
});

test("role list errors are reported", () => {
  assert.equal(parseRoles("server,front,1\nbad line").errors.length, 1);
  assert.equal(parseRoles(DEFAULT_ROLES).errors.length, 0);
});

test("hours method shares the pool by hours and balances to the cent", () => {
  const r = run("A,Server,6,100,0,\nB,Server,3,50,0,\nC,Busser,3,,,", { method: "hours" });
  assert.deepEqual(pay(r), { A: 7500, B: 3750, C: 3750 });
  assert.equal(r.summary.pool, 15000);
  assert.equal(r.summary.balanced, true);
});

test("points weight roles", () => {
  // server 1 pt x 4h = 4; busser 0.5 x 4h = 2 -> 2:1 split of $90.
  const r = run("A,Server,4,90,0,\nB,Busser,4,,,", { method: "points" });
  assert.deepEqual(pay(r), { A: 6000, B: 3000 });
  assert.equal(r.rows.find((x) => x.name === "A").delta, -3000);
});

test("card fee is taken from card tips only", () => {
  const r = run("A,Server,4,100,50,", { method: "hours", cardFeePct: 3 });
  assert.equal(r.summary.fee, 300);
  assert.equal(r.summary.pool, 14700);
});

test("managers and owners receive nothing and their tips go to staff", () => {
  const r = run("A,Server,4,0,0,\nM,Manager,8,40,0,", { method: "hours" });
  assert.deepEqual(pay(r), { A: 4000 });
  assert.ok(r.warnings.some((w) => /excluded role/.test(w)));
  assert.equal(r.summary.balanced, true);
});

test("kitchen staff are flagged, and flagged harder with a tip credit", () => {
  const a = run("A,Server,4,40,0,\nG,Cook,4,,,", { method: "hours" });
  assert.ok(a.warnings.some((w) => /kitchen/.test(w)));
  const b = run("A,Server,4,40,0,\nG,Cook,4,,,", { method: "hours", tipCredit: true });
  assert.ok(b.warnings.some((w) => /tip credit/.test(w)));
});

test("unknown roles are treated as tipped at one point, with a warning", () => {
  const r = run("A,Sommelier,4,40,0,", { method: "points" });
  assert.equal(r.rows[0].payout, 4000);
  assert.ok(r.warnings.some((w) => /Sommelier/.test(w)));
});

test("tip-out: servers keep tips less a share of sales, support share by weighted hours", () => {
  // A: $200 tips, $2000 sales, 3% = $60 out. Busser 0.5x4h, host 0.3x... equal-hours busser vs host: 5:3.
  const r = run("A,Server,6,200,0,2000\nB,Busser,4,,,\nC,Host,4,,,", { method: "tipout", tipOutPct: 3 });
  assert.equal(pay(r).A, 14000);
  assert.equal(pay(r).B + pay(r).C, 6000);
  assert.equal(pay(r).B, 3750);
  assert.equal(r.summary.balanced, true);
});

test("tip-out never exceeds the tips a server took in, and needs sales and support staff", () => {
  const small = run("A,Server,6,10,0,2000\nB,Busser,4,,,", { method: "tipout", tipOutPct: 3 });
  assert.equal(pay(small).A, 0);
  assert.equal(pay(small).B, 1000);
  const none = run("A,Server,6,100,0,2000", { method: "tipout", tipOutPct: 3 });
  assert.equal(pay(none).A, 10000);
  assert.ok(none.warnings.some((w) => /no support staff/.test(w)));
  const nosales = run("A,Server,6,100,0,\nB,Busser,4,,,", { method: "tipout" });
  assert.ok(nosales.warnings.some((w) => /no sales/.test(w)));
});

test("tip-out with a card fee still balances", () => {
  const r = run("A,Server,6,333.33,17.77,2500\nB,Server,5,201.01,0,1700\nC,Busser,6,,,\nD,Host,3,,,", { method: "tipout", cardFeePct: 2.9, tipOutPct: 3.5 });
  assert.equal(r.summary.balanced, true);
});

test("same person on several days is one row", () => {
  const r = run("A,Server,4,40,0,\nA,Server,4,40,0,", { method: "hours" });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].hours, 8);
});

test("empty pool pays nothing and the sample balances under every method", () => {
  assert.equal(run("A,Server,4,,,", {}).summary.pool, 0);
  for (const method of ["points", "hours", "tipout"]) assert.equal(calculate(sampleList(), undefined, { method, cardFeePct: 3 }).summary.balanced, true);
});

test("csv outputs", () => {
  const r = calculate(sampleList(), undefined, { method: "hours" });
  assert.match(reportCsv(r), /^Name,Role,Hours/);
  assert.match(reportCsv(r), /Total,,37\.00/);
  assert.match(payrollCsv(r), /^Name,Tips to add to payroll\n/);
});
