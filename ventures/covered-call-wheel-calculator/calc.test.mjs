import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, parseChain, normCdf, bs, scenarios, toCsv, num } from "./calc.mjs";

const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("normal CDF matches known values", () => {
  near(normCdf(0), 0.5, 1e-7);
  near(normCdf(1.96), 0.9750021, 1e-6);
  near(normCdf(-1), 0.1586553, 1e-6);
});

test("Black-Scholes matches textbook values and put-call parity", () => {
  const c = bs(100, 100, 1, 0.05, 0.2, "call");
  const p = bs(100, 100, 1, 0.05, 0.2, "put");
  near(c.value, 10.4506, 1e-3);
  near(p.value, 5.5735, 1e-3);
  near(c.value - p.value, 100 - 100 * Math.exp(-0.05), 1e-6);
  near(c.probItm + bs(100, 100, 1, 0.05, 0.2, "put").probItm, 1, 1e-9);
});

test("expired options are intrinsic value", () => {
  assert.equal(bs(110, 100, 0, 0.05, 0.2, "call").value, 10);
  assert.equal(bs(90, 100, 0, 0.05, 0.2, "call").probItm, 0);
});

test("chain parsing: header skipped, separators mixed, bad lines named", () => {
  const { rows, errors } = parseChain("Strike,Premium,Days,IV\n105, 0.9, 30, 28\n110\t0.3\t30\n108 0.5 45\nbad,1,2\n100,1,0");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].iv, 28);
  assert.equal(rows[1].iv, undefined);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Line 5/);
});

test("covered call numbers match a hand calculation", () => {
  const o = { ...DEFAULTS, price: 100, shares: 300, costBasis: 80, feePerContract: 0, chainText: "105, 1.50, 30", maxAssignPct: 100 };
  const a = analyze(o);
  const r = a.rows[0];
  assert.equal(a.contracts, 3);
  near(r.income, 450, 1e-9);
  near(r.keepReturn, 0.015, 1e-12);
  near(r.keepAnnual, 0.015 * 365 / 30, 1e-12);
  near(r.assignedReturn, (105 - 100 + 1.5) / 100, 1e-12);
  near(r.breakeven, 98.5, 1e-12);
  near(r.gainIfAssigned, (105 - 80) * 300, 1e-9);
});

test("fees are charged per contract and lower the income", () => {
  const a = analyze({ ...DEFAULTS, shares: 200, feePerContract: 1, chainText: "105, 1.00, 30", maxAssignPct: 100 });
  near(a.rows[0].income, (1 - 0.01) * 200, 1e-9);
});

test("cash-secured put: yield is on strike collateral and breakeven is strike minus premium", () => {
  const a = analyze({ ...DEFAULTS, mode: "put", shares: 2, feePerContract: 0, chainText: "95, 1.90, 30", maxAssignPct: 100, targetPrice: 0 });
  const r = a.rows[0];
  near(r.keepReturn, 1.9 / 95, 1e-12);
  near(r.breakeven, 93.1, 1e-12);
  near(r.income, 380, 1e-9);
  near(r.capital, 19000, 1e-9);
  assert.ok(r.probAssigned > 0 && r.probAssigned < 0.5);
});

test("the income pick respects the assignment-probability cap and beats every other eligible quote", () => {
  const a = analyze(DEFAULTS);
  const cap = DEFAULTS.maxAssignPct / 100;
  const eligible = a.rows.filter((r) => r.probAssigned <= cap);
  assert.ok(eligible.length > 0 && eligible.length < a.rows.length);
  assert.ok(a.picks.income.probAssigned <= cap);
  for (const r of eligible) assert.ok(a.picks.income.keepAnnual >= r.keepAnnual - 1e-12);
});

test("higher strikes are less likely to be called", () => {
  const a = analyze({ ...DEFAULTS, chainText: "102,1,30\n105,1,30\n110,1,30\n120,1,30", maxAssignPct: 100 });
  const bystrike = [...a.rows].sort((x, y) => x.strike - y.strike).map((r) => r.probAssigned);
  for (let i = 1; i < bystrike.length; i++) assert.ok(bystrike[i] < bystrike[i - 1]);
});

test("target pick: calls need strike at or above the sell price; picks the best called-away annual return", () => {
  const a = analyze({ ...DEFAULTS, targetPrice: 108, maxAssignPct: 100 });
  const t = a.picks.target;
  assert.ok(t.strike >= 108);
  for (const r of a.rows.filter((x) => x.strike >= 108)) assert.ok(t.assignedAnnual >= r.assignedAnnual - 1e-12);
});

test("warns when strikes sit below cost basis and when too few shares", () => {
  const a = analyze({ ...DEFAULTS, costBasis: 106, chainText: "103,1.5,30\n110,0.3,30", maxAssignPct: 100 });
  assert.ok(a.warnings.some((w) => /below your cost basis/.test(w)));
  const b = analyze({ ...DEFAULTS, shares: 60 });
  assert.ok(b.warnings.some((w) => /at least 100 shares/.test(w)));
  assert.deepEqual(b.rows, []);
});

test("scenario table: capped upside for a call, capped downside offset for a put", () => {
  const a = analyze({ ...DEFAULTS, feePerContract: 0, shares: 100, chainText: "105,1,30", maxAssignPct: 100 });
  const s = a.scenario;
  const up = s.find((x) => Math.abs(x.move - 0.2) < 1e-9);
  near(up.strategy, (105 - 100 + 1) * 100, 1e-6); // capped at strike
  near(up.plain, 2000, 1e-6);
  const flat = s.find((x) => x.move === 0);
  near(flat.strategy, 100, 1e-6);
  const dn = s.find((x) => Math.abs(x.move + 0.2) < 1e-9);
  near(dn.strategy, (80 - 100 + 1) * 100, 1e-6);
  const p = analyze({ ...DEFAULTS, mode: "put", feePerContract: 0, shares: 1, chainText: "95,2,30", maxAssignPct: 100 });
  const pdn = p.scenario.find((x) => Math.abs(x.move + 0.2) < 1e-9);
  near(pdn.strategy, (2 - (95 - 80)) * 100, 1e-6);
});

test("CSV has one row per quote and a header", () => {
  const a = analyze(DEFAULTS);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, a.rows.length + 1);
  assert.match(lines[0], /^strike,days,premium/);
});

test("num strips symbols", () => {
  assert.equal(num("$1,234.50"), 1234.5);
  assert.ok(Number.isNaN(num("")));
});
