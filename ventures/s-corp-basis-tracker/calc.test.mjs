import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, parseYears, step, run, SAMPLE, csv, packetHtml, fmt } from "./calc.mjs";

const Z = { year: 2024, contributions: 0, loansMade: 0, loansRepaid: 0, income: 0, taxExempt: 0, distributions: 0, nondeductible: 0, losses: 0 };
const open = (o = {}) => ({ stock: 0, debtBasis: 0, debtFace: 0, suspended: 0, ndCarry: 0, ...o });

test("parseMoney reads the shapes a K-1 or spreadsheet gives", () => {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(2,000)"), -2000);
  assert.equal(parseMoney("-300"), -300);
  assert.equal(parseMoney("1.5k"), 1500);
  assert.equal(parseMoney(""), 0);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("the worked sample: loss limited by stock then debt, restored by later income", () => {
  const p = parseYears(SAMPLE.text);
  assert.deepEqual(p.errors, []);
  const r = run(SAMPLE.opening, p.years);
  const [a, b, c] = r.rows;
  // 2022: 1,500 nondeductible, then 70,000 of loss meets 18,500 of stock and 30,000 of debt.
  assert.equal(a.lines.lossAgainstStock, 18500);
  assert.equal(a.lines.lossAgainstDebt, 30000);
  assert.equal(a.close.suspended, 21500);
  assert.equal(a.close.stock, 0);
  // 2023: 30,000 net increase restores debt basis first; the suspended loss then uses it.
  assert.equal(b.lines.debtRestored, 30000);
  assert.equal(b.close.suspended, 0);
  assert.equal(b.close.debtBasis, 8500);
  assert.equal(b.close.stock, 0);
  // 2024
  assert.equal(c.lines.debtRestored, 21500);
  assert.equal(c.close.stock, 7000);
  assert.equal(c.close.debtBasis, 15000);
  assert.equal(c.close.debtFace, 15000);
});

test("distributions above stock basis are taxable excess; basis never goes negative", () => {
  const r = step(open({ stock: 10000 }), { ...Z, distributions: 25000 });
  assert.equal(r.lines.nonTaxableDistributions, 10000);
  assert.equal(r.lines.excessDistributions, 15000);
  assert.equal(r.close.stock, 0);
  assert.match(r.notes.join(" "), /generally treated as gain/);
});

test("income in the same year lifts the distribution ceiling", () => {
  const r = step(open({ stock: 10000 }), { ...Z, income: 20000, distributions: 25000 });
  assert.equal(r.lines.excessDistributions, 0);
  assert.equal(r.close.stock, 5000);
});

test("distributions come before losses: the same year's loss cannot shelter a distribution", () => {
  const r = step(open({ stock: 10000 }), { ...Z, distributions: 10000, losses: 5000 });
  assert.equal(r.lines.excessDistributions, 0);
  assert.equal(r.close.stock, 0);
  assert.equal(r.close.suspended, 5000);
});

test("nondeductible expenses beyond basis carry forward and hit before losses next year", () => {
  const r1 = step(open({ stock: 1000 }), { ...Z, nondeductible: 4000 });
  assert.equal(r1.close.stock, 0);
  assert.equal(r1.close.ndCarry, 3000);
  const r2 = step(r1.close, { ...Z, year: 2025, income: 5000, losses: 1000 });
  assert.equal(r2.lines.nondeductibleUsed, 3000);
  assert.equal(r2.close.stock, 1000);
  assert.equal(r2.close.suspended, 0);
});

test("a new direct loan makes same-year losses deductible", () => {
  const r = step(open(), { ...Z, loansMade: 8000, losses: 12000 });
  assert.equal(r.lines.lossAgainstDebt, 8000);
  assert.equal(r.close.suspended, 4000);
  assert.equal(r.basisNeededToDeductAll, 4000);
});

test("repaying a loan whose basis was reduced produces gain on the reduced share", () => {
  const r = step(open({ debtFace: 10000, debtBasis: 4000 }), { ...Z, loansRepaid: 10000 });
  assert.equal(r.lines.repaymentGain, 6000);
  assert.equal(r.close.debtFace, 0);
  assert.equal(r.close.debtBasis, 0);
  const half = step(open({ debtFace: 10000, debtBasis: 4000 }), { ...Z, loansRepaid: 5000 });
  assert.equal(half.lines.repaymentGain, 3000);
  assert.equal(half.close.debtBasis, 2000);
});

test("negative income on the K-1 line is treated as a loss", () => {
  const p = parseYears("2024,0,0,0,-5000,0,0,0,0");
  assert.equal(p.years[0].income, 0);
  assert.equal(p.years[0].losses, 5000);
});

test("bad input is reported, not guessed", () => {
  assert.equal(parseYears("year,x\nfoo").errors.length, 1);
  assert.equal(parseYears("2024,0,0,0,xx").errors.length, 1);
  assert.match(run(open(), [{ ...Z }, { ...Z }]).problems[0], /twice/);
});

// Independent check: basis is conserved on every step across thousands of random years.
test("conservation and bounds hold on random inputs", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const amt = () => (rnd() < 0.3 ? 0 : Math.round(rnd() * 50000));
  let cur = open({ stock: 5000 });
  for (let i = 0; i < 4000; i++) {
    const y = { year: 2000 + (i % 90), contributions: amt(), loansMade: amt() / 2, loansRepaid: amt() / 2, income: amt(), taxExempt: amt() / 10, distributions: amt(), nondeductible: amt() / 10, losses: amt() };
    const r = step(cur, y);
    const L = r.lines;
    const before = cur.stock + cur.debtBasis;
    const after = r.close.stock + r.close.debtBasis;
    const expected = before + L.contributions + L.loansMade + L.income + L.taxExempt - L.nonTaxableDistributions - L.nondeductibleUsed - L.lossAgainstStock - L.lossAgainstDebt - (L.loansRepaid - L.repaymentGain);
    assert.ok(Math.abs(after - expected) < 0.05, `year ${i}: ${after} vs ${expected}`);
    assert.ok(r.close.stock >= 0 && r.close.debtBasis >= -0.005 && r.close.suspended >= 0 && r.close.ndCarry >= 0);
    assert.ok(r.close.debtBasis <= r.close.debtFace + 0.05);
    cur = r.close;
  }
});

test("csv and packet carry the figures", () => {
  const r = run(SAMPLE.opening, parseYears(SAMPLE.text).years);
  assert.equal(csv(r).trim().split("\n").length, 4);
  const html = packetHtml(r);
  assert.match(html, /Stock basis at end of year/);
  assert.match(html, /No warranty/);
  assert.equal(fmt(-1234.5), "-$1,234.50");
});

import { plan } from "./calc.mjs";

test("planner: distribution ceiling is exact and one cent more is taxable", () => {
  const r = run({ stock: 10000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, income: 5000, distributions: 20000 }]);
  const p = plan(r);
  assert.equal(p.maxTaxFreeDistribution, 15000);
  assert.equal(step(r.rows[0].open, { ...Z, income: 5000, distributions: 15000 }).lines.excessDistributions, 0);
  assert.ok(step(r.rows[0].open, { ...Z, income: 5000, distributions: 15000.01 }).lines.excessDistributions > 0);
  assert.equal(p.contributionToCoverExcess, 5000);
});

test("planner: a contribution or a loan unlocks exactly the suspended loss", () => {
  const r = run({ stock: 5000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, losses: 20000 }]);
  const p = plan(r);
  assert.equal(r.closing.suspended, 15000);
  assert.equal(p.contributionToDeductAll, 15000);
  assert.equal(p.loanToDeductAll, 15000);
  const loan = p.scenarios.find((s) => s.label.startsWith("Lend"));
  assert.equal(loan.suspended, 0);
  assert.equal(loan.debtBasis, 0);
});

test("planner: distributions cost loss deduction, and the keep-losses ceiling is where that starts", () => {
  const r = run({ stock: 10000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, losses: 6000, distributions: 8000 }]);
  const p = plan(r);
  // 10,000 stock: 8,000 out leaves 2,000 for a 6,000 loss.
  assert.equal(r.closing.suspended, 4000);
  assert.equal(p.maxDistributionKeepingLosses, 4000);
  assert.equal(p.maxTaxFreeDistribution, 10000);
  assert.match(p.advice.join(" "), /suspends \$4,000.00 more loss/);
});

test("planner: a loan does not cover an excess distribution, a contribution does", () => {
  const r = run({ stock: 1000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, distributions: 4000 }]);
  const p = plan(r);
  assert.equal(p.contributionToCoverExcess, 3000);
  assert.equal(p.loanToDeductAll, 0);
});

import { parseBatch, runBatch, batchSummary, batchCsv, batchPacketHtml, BATCH_SAMPLE, run as runOne, parseYears as parseOne } from "./calc.mjs";

test("batch: each shareholder matches the single-shareholder roll-forward", () => {
  const b = runBatch(BATCH_SAMPLE);
  assert.deepEqual(b.errors, []);
  assert.equal(b.holders.length, 3);
  const avery = b.holders.find((h) => h.name === "Avery Example");
  const solo = runOne({ stock: 20000, debtBasis: 0, debtFace: 0, suspended: 0 }, parseOne(SAMPLE.text).years);
  assert.deepEqual(avery.result.rows.map((r) => r.close), solo.rows.map((r) => r.close));
});

test("batch: shareholders with problems sort first and are flagged", () => {
  const s = batchSummary(runBatch(BATCH_SAMPLE));
  assert.equal(s[0].name, "Blake Example");
  assert.deepEqual(s[0].flags, ["excess distributions"]);
  assert.equal(s[0].excessDistributions, 13000);
  assert.deepEqual(s.at(-1).flags, []);
});

test("batch: bad rows are reported by shareholder, not dropped silently", () => {
  const b = runBatch("Dana,opening,x,0,0,0\nDana,2024,0,0,0,abc,0,0,0,0\n,2024,0,0,0,0,0,0,0,0\nEli,opening,100,0,0,0");
  assert.ok(b.errors.some((e) => /not an amount of zero or more/.test(e)));
  assert.ok(b.errors.some((e) => /^Dana: Line 1/.test(e)));
  assert.ok(b.errors.some((e) => /name the shareholder/.test(e)));
  assert.ok(b.errors.some((e) => /^Eli: no year rows/.test(e)));
});

test("batch: CSV has one row per shareholder-year and quotes commas in names; worksheet escapes markup", () => {
  const b = runBatch('"Doe, Jane",opening,1000,0,0,0\n"Doe, Jane",2024,0,0,0,500,0,0,0,0\n<b>X</b>,2024,0,0,0,1,0,0,0,0');
  const rows = batchCsv(b).trim().split("\n");
  assert.equal(rows.length, 3);
  assert.ok(rows[1].startsWith('"Doe, Jane",2024,1000'));
  const html = batchPacketHtml(b);
  assert.ok(!html.includes("<b>X</b>"));
  assert.ok(html.includes("&lt;b&gt;X&lt;/b&gt;"));
  assert.equal(parseBatch("").holders.length, 0);
});

import { saleOutlook } from "./calc.mjs";

test("sale: gain is net proceeds over year-adjusted stock basis", () => {
  const r = run({ stock: 20000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, income: 10000, distributions: 4000 }]);
  const s = saleOutlook(r, { proceeds: 50000, expenses: 2000 });
  assert.equal(s.stockBasis, 26000);
  assert.equal(s.netProceeds, 48000);
  assert.equal(s.gain, 22000);
  assert.equal(s.suspendedLost, 0);
  assert.equal(s.contributionToUseLosses, 0);
});

test("sale: a loss over basis is lost on a full sale, and the contribution that saves it leaves the gain unchanged", () => {
  const r = run({ stock: 5000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, losses: 20000 }]);
  const s = saleOutlook(r, { proceeds: 3000 });
  assert.equal(s.suspendedLost, 15000);
  assert.equal(s.contributionToUseLosses, 15000);
  assert.equal(s.gain, 3000);
  const after = run({ stock: 5000, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, contributions: 15000, losses: 20000 }]);
  assert.equal(after.closing.suspended, 0);
  assert.equal(saleOutlook(after, { proceeds: 3000 }).gain, 3000);
  assert.match(s.advice.join(" "), /lost, not carried/);
});

test("sale: loan above basis is flagged and bad input is refused", () => {
  const r = run({ stock: 0, debtBasis: 0, debtFace: 0, suspended: 0 }, [{ ...Z, loansMade: 10000, losses: 6000 }]);
  const s = saleOutlook(r, { proceeds: 1000 });
  assert.equal(s.loanAboveBasis, 6000);
  assert.equal(saleOutlook(r, { proceeds: "x" }), null);
  assert.equal(saleOutlook(r, { proceeds: -1 }), null);
});
