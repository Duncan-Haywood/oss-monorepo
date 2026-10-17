import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, annualPayment, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

// Hand-worked from SAMPLE. 10% of open days are lost to weather, so open days are 0.9 x days.
// Peak 88 x 0.9 = 79.2 days x 115 rounds = 9108 at $11; shoulder 79.2 x 55 = 4356 at $10; off 31.5 x 20 = 630 at $8.
const ROUNDS = 9108 + 4356 + 630;
const OPEN = 79.2 + 79.2 + 31.5;
const ROUNDS_REV = 9108 * 11 + 4356 * 10 + 630 * 8;
const CONC = ROUNDS * 4;
const PARTY = 90 * 180;
const REVENUE = ROUNDS_REV + CONC + PARTY;
const COSTS = CONC * 0.45 + PARTY * 0.3 + REVENUE * 0.025 + OPEN * 22 * 17 + 60000 + 18 * 12000 * 0.03;
const NOI = REVENUE - COSTS;
const INVEST = 18 * 12000 + 220000;
const DEBT = (INVEST * 0.65 * 0.085) / (1 - Math.pow(1.085, -15));

test("rounds, revenue and operating income follow the stated rules on the sample", () => {
  const r = compute(raw());
  near(r.base.rounds, ROUNDS);
  near(r.base.openDays, OPEN);
  near(r.totals.roundsRevenue, ROUNDS_REV);
  near(r.totals.concessions, CONC);
  near(r.totals.concessionCost, CONC * 0.45);
  near(r.totals.partyRevenue, PARTY);
  near(r.totals.partyCost, PARTY * 0.3);
  near(r.totals.revenue, REVENUE);
  near(r.totals.cardFees, REVENUE * 0.025);
  near(r.totals.labor, OPEN * 22 * 17);
  near(r.totals.reserve, 18 * 12000 * 0.03);
  near(r.totals.noi, NOI);
});

test("loan payment, coverage and both paybacks", () => {
  const r = compute(raw());
  near(r.totals.investment, INVEST);
  near(r.totals.loan, INVEST * 0.65);
  near(r.totals.equity, INVEST * 0.35);
  near(r.totals.debt, DEBT);
  near(r.dscr, NOI / DEBT, 1e-4);
  near(r.totals.cashFlow, NOI - DEBT);
  near(r.paybackAll, INVEST / NOI, 1e-4);
  near(r.paybackEquity, INVEST * 0.35 / (NOI - DEBT), 1e-4);
  near(r.yieldOnCost, NOI / INVEST, 1e-6);
  near(r.perHoleInvestment, INVEST / 18, 1e-6);
});

test("a zero rate loan is straight-line and no loan means no debt", () => {
  near(annualPayment(100000, 0, 20), 5000);
  assert.equal(annualPayment(0, 8, 20), 0);
  const r = compute(raw({ loanPct: "0" }));
  assert.equal(r.dscr, null);
  near(r.totals.cashFlow, NOI);
  near(r.paybackEquity, INVEST / NOI, 1e-4);
});

test("running at the break-even rounds per day leaves zero cash after the loan", () => {
  const r = compute(raw());
  const scale = r.breakEvenRoundsPerDay / r.perOpenDay;
  const sweepAtScale = compute(raw({ peakRounds: String(115 * scale), shoulderRounds: String(55 * scale), offRounds: String(20 * scale) }));
  near(sweepAtScale.totals.cashFlow, 0, 0.05);
  near(r.breakEvenRoundsYear, ROUNDS * scale, 1e-6);
  assert.ok(r.breakEvenRoundsPerDay < r.perOpenDay);
});

test("pricing at the break-even and target multipliers hits zero and the target cash", () => {
  const r = compute(raw());
  const at = (k) => compute(raw({ peakPrice: String(11 * k), shoulderPrice: String(10 * k), offPrice: String(8 * k) }));
  near(at(r.bePriceScale).totals.cashFlow, 0, 0.05);
  near(at(r.targetPriceScale).totals.cashFlow, r.totals.equity / 8, 0.05);
});

test("price scale is null with no round revenue and a break-even is null when volume cannot pay", () => {
  const free = compute(raw({ peakPrice: "0", shoulderPrice: "0", offPrice: "0", concSpend: "0" }));
  assert.equal(free.bePriceScale, null);
  assert.equal(free.breakEvenRoundsPerDay, null);
  assert.ok(free.findings.some((f) => f.severity === "high" && /more visitors lose more/.test(f.title)));
});

test("weather: more lost days lower rounds, staff and income in step; the table includes the entered value", () => {
  const r = compute(raw());
  assert.deepEqual(r.rainSweep.map((x) => x.rain), [0, 5, 10, 15, 20, 30]);
  const dry = r.rainSweep[0];
  near(dry.rounds, ROUNDS / 0.9, 1e-6);
  near(dry.openDays, OPEN / 0.9, 1e-6);
  assert.ok(r.rainSweep.every((x, i, a) => i === 0 || x.cashFlow < a[i - 1].cashFlow));
  const r12 = compute(raw({ rainPct: "12" }));
  assert.deepEqual(r12.rainSweep.map((x) => x.rain), [0, 5, 10, 12, 15, 20, 30]);
  near(r12.rainSweep.find((x) => x.rain === 12).cashFlow, r12.totals.cashFlow);
  near(compute(raw({ rainPct: "" })).base.openDays, 88 + 88 + 35);
});

test("attendance sweep and the price by attendance grid agree with the base case", () => {
  const r = compute(raw());
  const at100 = r.sweep.find((x) => x.scale === 1);
  near(at100.cashFlow, r.totals.cashFlow);
  assert.deepEqual(r.sweep.map((x) => Math.round(x.scale * 100)), [60, 70, 80, 90, 100, 110, 120]);
  assert.ok(r.sweep.every((x, i, a) => i === 0 || x.noi > a[i - 1].noi));
  const row0 = r.grid.find((g) => g.priceChange === 0);
  near(row0.cells.find((c) => c.scale === 1).cashFlow, r.totals.cashFlow);
  const up = r.grid.find((g) => g.priceChange === 10).cells.find((c) => c.scale === 1).cashFlow;
  near(up - r.totals.cashFlow, 0.1 * ROUNDS_REV * 0.975, 0.05);
  // attendance moves rounds and concessions but not staff or parties
  const low = r.sweep.find((x) => x.scale === 0.8);
  near(low.noi - r.totals.noi, -0.2 * (ROUNDS_REV * 0.975 + CONC * (0.55 - 0.025)), 0.05);
});

test("no concessions or parties still computes, and the party note is omitted", () => {
  const r = compute(raw({ parties: "0", concSpend: "" }));
  assert.equal(r.totals.partyRevenue, 0);
  assert.equal(r.totals.concessions, 0);
  assert.ok(!r.findings.some((f) => /parties at/.test(f.title)));
});

test("a loss-making course says so and offers a price change that fixes it", () => {
  const r = compute(raw({ fixedYear: "160000" }));
  assert.ok(r.totals.cashFlow < 0);
  assert.ok(r.findings.some((f) => f.severity === "high" && /loses about/.test(f.title) && /higher across the board/.test(f.title)));
  assert.equal(r.paybackEquity, null);
});

test("low debt coverage is reported as a ratio and does not assert a lender rule", () => {
  const r = compute(raw({ fixedYear: "75000" }));
  assert.ok(r.dscr < 1.25);
  const f = r.findings.find((x) => /Debt coverage is/.test(x.title));
  assert.ok(f && /ask yours what it requires/.test(f.title));
});

test("a wet-year warning appears only when 20% weather loss flips a positive cash flow", () => {
  assert.ok(compute(raw({ fixedYear: "70000" })).findings.some((f) => /turns negative/.test(f.title)));
  assert.ok(!compute(raw()).findings.some((f) => /turns negative/.test(f.title)));
  assert.ok(!compute(raw({ fixedYear: "20000" })).findings.some((f) => /turns negative/.test(f.title)));
});

test("bad input is rejected with a message, never clamped", () => {
  const bad = [
    ["holes", "0"], ["holes", "2.5"], ["holes", "abc"], ["holes", ""], ["holes", "201"], ["holeCost", "0"], ["holeCost", "-5"], ["sharedCost", "-1"],
    ["peakDays", "400"], ["peakDays", "-3"], ["peakRounds", ""], ["peakPrice", "-2"], ["rainPct", "95"], ["rainPct", "-1"], ["rainPct", "x"],
    ["parties", "-1"], ["partyPrice", "-1"], ["partyCostPct", "101"], ["concSpend", "-1"], ["concMargin", "120"], ["laborHours", "-2"], ["wage", "-1"],
    ["cardPct", "11"], ["fixedYear", "-1"], ["maintPct", "21"], ["loanPct", "101"], ["rate", "41"], ["loanYears", "0"], ["loanYears", "41"], ["targetYears", "0"], ["targetYears", "51"],
  ];
  for (const [k, v] of bad) {
    const r = compute(raw({ [k]: v }));
    assert.ok(r.errors.length > 0, `${k}=${v} should be rejected`);
    assert.equal(r.base, undefined);
  }
  assert.ok(compute(raw({ peakDays: "200", shoulderDays: "200" })).errors.some((e) => /more than a year/.test(e)));
  assert.ok(compute(raw({ peakDays: "0", shoulderDays: "0", offDays: "0" })).errors.some((e) => /at least one season/.test(e)));
});

test("a season with zero days needs no rounds or price, and one season is enough", () => {
  const r = compute(raw({ shoulderDays: "0", shoulderRounds: "", shoulderPrice: "", offDays: "", offRounds: "", offPrice: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.seasons.length, 1);
  near(r.base.rounds, 88 * 0.9 * 115);
  assert.equal(r.peakShare, 1);
});

test("currency symbols, commas and percent signs in inputs are accepted", () => {
  const a = compute(raw({ holeCost: "$12,000", rainPct: "10%", cardPct: "2.5 %" }));
  near(a.totals.noi, NOI);
});

test("parse returns every error, not just the first", () => {
  assert.ok(parse(raw({ holes: "0", holeCost: "0", rate: "99" })).errors.length >= 3);
});

test("compute is deterministic", () => {
  assert.deepEqual(compute(raw()), compute(raw()));
});

test("summary and CSV carry the numbers the page shows", () => {
  const r = compute(raw());
  const s = summaryText(r);
  assert.match(s, /Mini-golf: 18 hole/);
  assert.match(s, /Debt coverage: /);
  assert.match(s, /rounds per open day/);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines.length, 8);
  assert.match(lines[0], /^attendance_vs_plan_pct,/);
  assert.equal(dollars(-1234.5), "-$1,234.50");
});
