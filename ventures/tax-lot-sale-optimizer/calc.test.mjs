import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, parseLots, parseDate, isLongTerm, daysToLongTerm, yearTax, plan, num, money, toCsv, LOSS_DEDUCTION_CAP } from "./calc.mjs";

const R = { st: 0.37, lt: 0.2, ord: 0.37 };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("holding period: a sale on the anniversary is still short-term", () => {
  const acq = parseDate("2025-03-10");
  assert.equal(isLongTerm(acq, parseDate("2026-03-10")), false);
  assert.equal(isLongTerm(acq, parseDate("2026-03-11")), true);
  assert.equal(daysToLongTerm(acq, parseDate("2026-03-10")), 1);
  assert.equal(daysToLongTerm(acq, parseDate("2026-03-01")), 10);
  assert.equal(daysToLongTerm(acq, parseDate("2027-01-01")), 0);
});

test("dates parse in both formats and reject impossible ones", () => {
  assert.equal(parseDate("3/5/2024"), parseDate("2024-03-05"));
  assert.ok(Number.isNaN(parseDate("2024-02-31")));
  assert.ok(Number.isNaN(parseDate("tomorrow")));
});

test("lot parsing: header skipped, separators mixed, bad lines named", () => {
  const { lots, errors } = parseLots("Date,Shares,Cost\n2024-01-02, 10, $5.50\n1/3/2024\t4\t6\n2024-01-04 2 7\nnope,1,1\n2024-01-05,-1,3\n2024-01-06,1,x");
  assert.equal(lots.length, 3);
  assert.deepEqual(lots.map((l) => l.cost), [5.5, 6, 7]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Line 5/);
});

test("year tax netting: character, cross-netting, loss cap and carryforward", () => {
  near(yearTax(1000, 1000, R).tax, 370 + 200);
  near(yearTax(1000, -400, R).tax, 600 * 0.37); // long loss eats short gain
  near(yearTax(-400, 1000, R).tax, 600 * 0.2); // short loss eats long gain
  const l = yearTax(-2000, -2500, R);
  near(l.tax, -LOSS_DEDUCTION_CAP * 0.37);
  near(l.carry, 4500 - 3000);
  near(yearTax(0, 0, R).tax, 0);
});

test("the example: lowest-tax plan beats FIFO and never loses to the other methods", () => {
  const a = analyze(DEFAULTS);
  assert.deepEqual(a.warnings, []);
  const tax = Object.fromEntries(a.results.map((r) => [r.key, r.tax]));
  for (const k of ["hifo", "fifo", "lifo"]) assert.ok(tax.optimal <= tax[k] + 1e-6, k);
  assert.ok(a.savingVsFifo > 1000);
  near(a.best.proceeds, 20000);
});

test("short-term gain lots are sold last when long-term lots give the same cash cheaper", () => {
  const o = { ...DEFAULTS, ytdShort: 0, lotsText: "2020-01-01, 100, 10\n2026-08-01, 100, 10", target: 5000, wholeShares: 1 };
  const a = analyze(o);
  // both lots have the same $90/share gain; long-term is taxed less, so only lot 1 sells
  assert.deepEqual(a.best.rows.map((r) => r.id), [1]);
  assert.equal(a.best.rows[0].shares, 50);
});

test("a loss lot is used to shelter gains, and total tax matches a hand calculation", () => {
  const o = { ...DEFAULTS, ordinaryRatePct: 30, ltRatePct: 20, stateRatePct: 0, niitPct: 0, ytdShort: 0, ytdLong: 0, price: 50, targetMode: "shares", target: 20, wholeShares: 1,
    lotsText: "2020-01-01, 10, 10\n2021-01-01, 10, 80" };
  const a = analyze(o);
  // selling 10 @ +40 and 10 @ -30 nets +100 long-term => $20; selling only the gain lot is not enough shares
  near(a.best.tax, 0.2 * (400 - 300));
});

test("optimizer equals brute force over every whole-share split on random books", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < 60; t++) {
    const n = 2 + Math.floor(rnd() * 5);
    const lines = [];
    for (let i = 0; i < n; i++) {
      const y = 2024 + Math.floor(rnd() * 3);
      lines.push(`${y}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}, ${1 + Math.floor(rnd() * 20)}, ${(20 + rnd() * 160).toFixed(2)}`);
    }
    const o = { ...DEFAULTS, lotsText: lines.join("\n"), price: 100, targetMode: "shares", wholeShares: 1, ytdShort: Math.round((rnd() - 0.5) * 6000), ytdLong: Math.round((rnd() - 0.5) * 6000), saleDate: "2026-06-15" };
    const { lots } = parseLots(o.lotsText);
    const held = lots.reduce((s, l) => s + l.shares, 0);
    o.target = 1 + Math.floor(rnd() * (held - 1));
    const a = analyze(o);
    const sale = parseDate(o.saleDate);
    const r = { st: 0.32 + 0.05, lt: 0.15 + 0.05, ord: 0.37 };
    const base = { st: o.ytdShort, lt: o.ytdLong };
    // brute force: every lot picked in HIFO order inside each pool, every integer split between pools
    const st = lots.filter((l) => !isLongTerm(l.acquired, sale));
    const lt = lots.filter((l) => isLongTerm(l.acquired, sale));
    const sum = (xs) => xs.reduce((s, l) => s + l.shares, 0);
    let bf = Infinity;
    for (let x = Math.max(0, o.target - sum(lt)); x <= Math.min(o.target, sum(st)); x++) {
      const pool = (ls, k) => { let g = 0; for (const l of [...ls].sort((p, q) => q.cost - p.cost)) { const s = Math.min(k, l.shares); g += s * (100 - l.cost); k -= s; } return g; };
      const tax = yearTax(base.st + pool(st, x), base.lt + pool(lt, o.target - x), r).tax - yearTax(base.st, base.lt, r).tax;
      bf = Math.min(bf, tax);
    }
    assert.ok(a.best.tax <= bf + 1e-6, `trial ${t}: ${a.best.tax} vs brute ${bf}`);
    near(a.best.shares, o.target);
    for (const k of ["fifo", "lifo", "hifo"]) assert.ok(a.best.tax <= a.results.find((x) => x.key === k).tax + 1e-6);
  }
});

test("cash target rounds up to whole shares; fractional mode hits it exactly", () => {
  const o = { ...DEFAULTS, price: 30, target: 1000, lotsText: "2020-01-01, 100, 10" };
  assert.equal(analyze({ ...o, wholeShares: 1 }).best.shares, 34);
  near(analyze({ ...o, wholeShares: 0 }).best.proceeds, 1000);
});

test("asking for more than you hold sells everything and says so", () => {
  const a = analyze({ ...DEFAULTS, target: 10000000 });
  assert.match(a.warnings.join(" "), /you hold/i);
  near(a.best.shares, a.held);
});

test("waiting table: re-runs the optimum when a short-term lot turns long-term", () => {
  const o = { ...DEFAULTS, ytdShort: 0, saleDate: "2026-10-01", targetMode: "shares", target: 10, price: 100, wholeShares: 1, lotsText: "2025-10-10, 10, 20" };
  const a = analyze(o);
  assert.equal(a.waits.length, 1);
  assert.equal(a.waits[0].days, 10);
  assert.ok(a.waits[0].saving > 0);
  near(a.waits[0].saving, 800 * (0.32 - 0.15));
});

test("wash-sale warning when a loss is sold while newer shares stay in the account", () => {
  const o = { ...DEFAULTS, targetMode: "shares", target: 10, price: 50, saleDate: "2026-10-15", ytdShort: 5000, lotsText: "2024-01-01, 10, 90\n2026-10-01, 10, 60" };
  const a = analyze(o);
  assert.ok(a.washLots.length > 0);
});

test("bad input returns warnings, not a throw", () => {
  assert.ok(analyze({ ...DEFAULTS, lotsText: "" }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, price: "" }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, saleDate: "soon" }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, target: 0 }).warnings.length);
});

test("csv lists only the lots to sell", () => {
  const csv = toCsv(analyze(DEFAULTS));
  assert.match(csv, /^lot,purchase_date,shares_to_sell/);
  assert.equal(csv.trim().split("\n").length, 1 + analyze(DEFAULTS).best.rows.length);
});

test("helpers", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.6), "-$1,235");
  assert.ok(plan);
});
