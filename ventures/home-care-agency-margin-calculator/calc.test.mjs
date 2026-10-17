import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, reportCsv, sampleText, isPrivatePay, costPerBilledHour, DEFAULTS } from "./calc.mjs";

const run = (text, opts) => {
  const p = parseRows(text);
  assert.ok(p.rows, p.error);
  return analyze(p.rows, opts);
};
// wage 20, 10% tax + 10% comp -> loaded 24; overhead 4 -> cost 28 per billed hour
const settings = { employerTaxPct: 10, workersCompPct: 10, overheadPerHour: 4 };
const two = "payer,rate,hours,wage,paid,days,visit,travel\nProgram,40,100,20,100%,50,4,0\nPrivate pay,50,40,20,100%,5,4,0";

test("parses a header, quoted names, percent and fraction paid shares, and blanks", () => {
  const p = parseRows('payer,rate,hours,wage\n"Smith, Jones & Co",$31.50,120,17.5,95,10,3,20\nPrivate,40,10,18');
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { payer: "Smith, Jones & Co", rate: 31.5, hours: 120, wage: 17.5, collect: 0.95, days: 10, visitHours: 3, travel: 20 });
  assert.deepEqual(p.rows[1], { payer: "Private", rate: 40, hours: 10, wage: 18, collect: 1, days: 30, visitHours: 4, travel: 0 });
  assert.equal(parseRows("A\t30\t5\t17\t0.9\nB\t40\t5\t18").rows[0].collect, 0.9);
});

test("refuses empty input, a single payer, zero hours, and counts bad rows", () => {
  assert.ok(parseRows("").error);
  assert.match(parseRows("A,30,5,17").error, /at least two/);
  assert.match(parseRows("A,30,0,17\nB,40,0,18").error, /zero billed hours/);
  const p = parseRows("A,30,5,17\nB,40,5,18\nC,abc,5,17\nD,30,5,17,150%\nE,30,5,17,100,30,0");
  assert.equal(p.rows.length, 2);
  assert.match(p.warnings.join(" "), /3 row\(s\) skipped/);
});

test("loaded cost per billed hour matches a hand calculation", () => {
  const o = { ...DEFAULTS, ...settings };
  assert.equal(costPerBilledHour({ wage: 20, travel: 0, visitHours: 4 }, o), 28);
  // 30 unpaid minutes over a 3-hour visit = +1/6 on the loaded wage: 24 x (1 + 1/6) + 4 = 32
  assert.equal(costPerBilledHour({ wage: 20, travel: 30, visitHours: 3 }, o), 32);
  // a quarter of the hours at time and a half lifts the wage 12.5%: 20 x 1.125 x 1.2 + 4 = 31
  assert.equal(costPerBilledHour({ wage: 20, travel: 0, visitHours: 4 }, { ...o, overtimeSharePct: 25 }), 31);
});

test("margin per hour, percent and monthly figures", () => {
  const r = run(two, settings);
  const prog = r.rows.find((x) => x.payer === "Program");
  assert.equal(prog.costPerHour, 28);
  assert.equal(prog.marginPerHour, 12);
  assert.equal(prog.marginPct, 0.3);
  assert.equal(prog.monthlyMargin, 1200);
  assert.equal(prog.receivables, 6666.67);
  const priv = r.rows.find((x) => x.payer === "Private pay");
  assert.equal(priv.marginPerHour, 22);
  assert.equal(r.best, "Private pay");
});

test("share paid scales collected money", () => {
  const r = run("Slow,40,100,20,90%\nPrivate pay,50,40,20", settings);
  assert.equal(r.rows.find((x) => x.payer === "Slow").collectedPerHour, 36);
  assert.equal(r.rows.find((x) => x.payer === "Slow").marginPerHour, 8);
});

test("the bill rate for a target margin is solved exactly", () => {
  const r = run(two, { ...settings, targetMarginPct: 25 });
  // 28 / (1 x 0.75) = 37.33
  assert.equal(r.scenarios.find((s) => s.payer === "Program").targetRate, 37.33);
  assert.equal(r.scenarios.find((s) => s.payer === "Program").rateGap, -2.67);
  const slow = run("Slow,40,100,20,80%\nPrivate pay,50,40,20", { ...settings, targetMarginPct: 20 });
  // 28 / (0.8 x 0.8) = 43.75
  assert.equal(slow.scenarios.find((s) => s.payer === "Slow").targetRate, 43.75);
});

test("a wage raise is priced through the whole loaded cost", () => {
  const r = run(two, settings);
  // +$1 wage -> +1.20 loaded per hour x 100 hours
  assert.equal(r.rows.find((x) => x.payer === "Program").wageRaiseCost, 120);
  assert.equal(r.totals.wageRaiseCost, 120 + 48);
});

test("break-even refill share and annual result at a refill rate", () => {
  const r = run(two, settings);
  const s = r.scenarios.find((x) => x.payer === "Program");
  assert.equal(s.breakEvenRefill, round4(12 / 22));
  // 100 hours a month freed; refill half at 22 vs 12 kept: 12 x 100 x (11 - 12) = -1200
  assert.equal(s.annual[0.5], -1200);
  assert.equal(s.annual[1], 12 * 100 * (22 - 12));
  assert.equal(r.scenarios.find((x) => x.payer === "Private pay").breakEvenRefill, null);
});

test("a payer billing under the loaded cost is flagged and warned about", () => {
  const r = run("Low,26,100,20,100%\nPrivate pay,50,40,20", settings);
  assert.equal(r.rows.find((x) => x.payer === "Low").marginPerHour, -2);
  assert.equal(r.scenarios.find((x) => x.payer === "Low").verdict, "loses money per hour");
  assert.match(r.warnings.join(" "), /Low bill less than the loaded cost/);
});

test("without a private-pay row there is no refill comparison, only a warning", () => {
  const r = run("A,40,10,20\nB,38,10,20", settings);
  assert.equal(r.scenarios[0].breakEvenRefill, null);
  assert.match(r.warnings.join(" "), /No private-pay row/);
  assert.ok(r.scenarios[0].targetRate > 0);
});

test("slow payers are named, totals add up, and private-pay names are detected", () => {
  const r = run(two, settings);
  assert.match(r.warnings.join(" "), /Program pay in 45 days or more/);
  assert.equal(r.totals.hours, 140);
  assert.equal(r.totals.monthlyMargin, 1200 + 880);
  assert.equal(r.totals.blendedMarginPerHour, round2(2080 / 140));
  assert.ok(isPrivatePay("Private pay") && isPrivatePay("Self-pay") && isPrivatePay("Family") && !isPrivatePay("State waiver"));
});

test("bad settings are refused and the sample runs with a sensible order", () => {
  const p = parseRows(two);
  assert.ok(analyze(p.rows, { targetMarginPct: 100 }).error);
  assert.ok(analyze(p.rows, { overtimeSharePct: 150 }).error);
  assert.ok(analyze(p.rows, { workersCompPct: -1 }).error);
  const s = run(sampleText());
  assert.equal(s.rows.length, 4);
  assert.equal(s.rows[0].payer, "Private pay");
});

test("csv export lists every payer", () => {
  const lines = reportCsv(run(two, settings)).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^payer,bill_rate/);
});

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
