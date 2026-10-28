import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { scorpCompare, scorpFromBooks } from "./scorp.mjs";
import { BRACKETS, bracketTax } from "./estimatedtax.mjs";

const D = (n) => n * 100;
const opt = { year: 2026, wageBase: D(184500) };
const near = (a, b, tol = 2) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("$100,000 profit, $50,000 salary: every line ties out by hand", () => {
  const r = scorpCompare(D(100000), { ...opt, salary: D(50000) });
  // sole proprietor: SE tax 14,129.55; AGI 92,935.22; QBI 15,367.04; taxable 61,468.18
  assert.equal(r.sole.selfEmploymentTax, 1145140 + 267815);
  near(r.sole.qbiDeduction, 1536704);
  near(r.sole.incomeTax, 123400 * 0 + 124000 + 456000 + 0.22 * (6146818 - 5040000));
  // S corporation: employer FICA 3,825, FUTA 42, extra 1,500 -> K-1 44,633; QBI 8,926.60
  assert.equal(r.scorp.employerFica, 382500);
  assert.equal(r.scorp.futa, 4200);
  assert.equal(r.scorp.k1, D(100000) - D(50000) - 382500 - 4200 - D(1500));
  near(r.scorp.qbiDeduction, 892660);
  near(r.scorp.incomeTax, 124000 + 456000 + 0.22 * (6960640 - 5040000));
  assert.equal(r.scorp.payrollTax, 382500 * 2 + 4200);
  near(r.savings, r.sole.allIn - r.scorp.allIn, 0);
  assert.ok(r.savings > D(3000) && r.savings < D(3300), `saving ${r.savings}`);
});

test("a salary equal to the whole profit saves nothing and costs the extra overhead", () => {
  const r = scorpCompare(D(60000), { ...opt, salary: D(60000), extraCost: 0 });
  // FICA 15.3% on 60,000 either way, less the SE rule's 92.35% factor: the sole proprietor pays less
  assert.ok(r.savings < 0);
  assert.equal(r.scorp.k1, D(60000) - 459000 - 4200 + 0 - D(60000));
});

test("small profits do not benefit once the yearly cost is counted; large ones do", () => {
  assert.ok(scorpCompare(D(20000), opt).savings < 0);
  assert.ok(scorpCompare(D(150000), opt).savings > D(4000));
  const r = scorpCompare(D(100000), opt);
  assert.ok(r.breakEven > D(10000) && r.breakEven < D(40000), `break-even ${r.breakEven}`);
});

test("above the Social Security wage base the savings come from the 2.9% Medicare only", () => {
  const r = scorpCompare(D(400000), { ...opt, salary: D(250000) });
  assert.equal(r.scorp.employerFica, Math.round(D(184500) * 0.062) + Math.round(D(250000) * 0.0145));
  assert.ok(r.savings > 0);
});

test("loss and zero profit owe nothing and warn", () => {
  const r = scorpCompare(0, opt);
  assert.equal(r.sole.total, 0);
  assert.ok(r.warnings.some((w) => /No profit/.test(w)));
});

test("unknown year throws, a missing wage base is named", () => {
  assert.throws(() => scorpCompare(D(1), { year: 2031 }), /brackets/);
  assert.throws(() => scorpCompare(D(1), { year: 2026, brackets: [[Infinity, 0.1]], wageBase: undefined, filing: "single" }) && scorpCompare(D(1), { year: 2040, brackets: [[Infinity, 0.1]] }), /wage base/);
});

test("from the books: the annualised Schedule C profit feeds the comparison", () => {
  const { books: b } = importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,CLIENT PAYMENT ACME,50000.00\n", "1000");
  const bk = confirm(b, { [b.transactions[0].id]: "4000" });
  const r = scorpFromBooks(bk, { ...opt, monthsElapsed: 6 });
  assert.equal(r.profit, D(100000));
  assert.equal(r.profitToDate, D(50000));
});

test("the sweep is monotone in the sense that FICA grows with the salary", () => {
  const r = scorpCompare(D(120000), opt);
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].salary > r.sweep[i - 1].salary);
  const lowest = r.sweep[0], highest = r.sweep.at(-1);
  assert.ok(lowest.savings > highest.savings);
});

test("above the QBI range a sole proprietor with no staff gets no deduction; the S corporation gets 50% of its W-2 wages at most", () => {
  const r = scorpCompare(D(400000), { ...opt, salary: D(100000) });
  assert.equal(r.sole.qbiDeduction, 0);
  // K-1 = 400,000 - 100,000 - 7,650 - 42 - 1,500 = 290,808; 20% = 58,161.60 but 50% of 100,000 wages caps it
  assert.equal(r.scorp.qbiDeduction, D(50000));
  assert.ok(r.warnings.some((w) => /above the QBI threshold/.test(w)));
});

test("a service business loses the deduction entirely above the range", () => {
  const r = scorpCompare(D(400000), { ...opt, salary: D(100000), service: true });
  assert.equal(r.scorp.qbiDeduction, 0);
  assert.equal(r.sole.qbiDeduction, 0);
});

test("inside the phase-in the deduction falls linearly toward the wage limit", () => {
  // taxable before QBI just over the threshold: almost the full 20%
  const lo = scorpCompare(D(240000), { ...opt, salary: D(60000) });
  const hi = scorpCompare(D(300000), { ...opt, salary: D(60000) });
  assert.ok(lo.scorp.qbiDeduction > hi.scorp.qbiDeduction);
  assert.ok(hi.scorp.qbiDeduction >= D(30000));
});

test("the CLI prints the table, the sweep and the break-even from a books file", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { books: b } = importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,CLIENT PAYMENT ACME,100000.00\n", "1000");
  const bk = confirm(b, { [b.transactions[0].id]: "4000" });
  const f = join(mkdtempSync(join(tmpdir(), "scorp-")), "books.json");
  writeFileSync(f, JSON.stringify(bk));
  const out = execFileSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--books", f, "scorp", "--year", "2026", "--salary", "50000"], { encoding: "utf8" });
  assert.match(out, /S-CORPORATION ELECTION 2026 \(single\), profit annualised 100,000\.00, salary 50,000\.00/);
  assert.match(out, /S corporation saves 3,14\d\.\d\d at this salary; break-even profit /);
  assert.match(out, /Salary sweep/);
  const j = JSON.parse(execFileSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--books", f, "scorp", "--year", "2026", "--json"], { encoding: "utf8" }));
  assert.equal(j.salary, 5000000);
});
