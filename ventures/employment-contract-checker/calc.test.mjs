import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, periodAfter, extractAmounts, parseMoney, dollars, summaryText, findingsCsv, sampleContract, SAMPLE_SETTINGS } from "./calc.mjs";

const ids = (r) => r.findings.map((g) => g.id);
const GOOD = `OFFER OF EMPLOYMENT. Acme Corp offers you the position of Analyst at an annual base salary of $90,000, paid biweekly. You are eligible for a target bonus of 10 percent of base, paid in March, pro-rated if you are terminated without cause. Your employment is at will; if terminated without cause you will receive eight weeks of severance. You may work on projects of your own on your own time, and Exhibit A lists your prior inventions. Nothing in this agreement prohibits you from reporting to any government agency or discussing your wages.`;

test("money and periods parse", () => {
  assert.equal(parseMoney("$1,234.50"), 123450);
  assert.equal(parseMoney("x"), null);
  assert.equal(dollars(16500000), "$165,000");
  assert.deepEqual(extractAmounts("$20,000 and $150k and $0"), [2000000, 15000000]);
  assert.equal(periodAfter("noncompete for 18 months. also 4 years", /noncompete/g).months, 18);
  assert.equal(periodAfter("noncompete for one (1) year. ok", /noncompete/g).months, 12);
});

test("a clean offer raises no red flags", () => {
  const r = analyze(GOOD, { expectedSalary: "90000" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(ids(r).filter((i) => r.findings.find((g) => g.id === i).severity !== "info"), []);
  assert.equal(r.verdict === "no-red-flags", true);
});

test("salary and signing bonus must match what was promised", () => {
  assert.ok(ids(analyze(GOOD, { expectedSalary: "100000" })).includes("salary-mismatch"));
  assert.ok(!ids(analyze(GOOD, { expectedSalary: "90000" })).includes("salary-mismatch"));
  assert.ok(ids(analyze(GOOD, { expectedSalary: "90000", signingBonus: "15000" })).includes("signing-mismatch"));
  assert.ok(ids(analyze("Offer of employment as analyst, at will, details to follow by email, welcome to the team and good luck.", { expectedSalary: "90000" })).includes("no-amounts"));
});

test("non-compete length and scope set severity; layoff and state notes", () => {
  const long = "You agree that for 18 months after leaving you will not directly or indirectly work for any business that competes with the Company anywhere in the United States, and employment is at will with no other terms stated here.";
  const g = analyze(long, {}).findings.find((x) => x.id === "noncompete");
  assert.equal(g.severity, "high");
  assert.match(g.title, /18 months/);
  const short = "The employee agrees to a non-compete of 6 months limited to named direct competitors, and shall not be enforced if terminated without cause, with salary continued during the restricted period.";
  const s = analyze(short, { state: "CA" });
  assert.equal(s.findings.find((x) => x.id === "noncompete").severity, "medium");
  assert.ok(!ids(s).includes("noncompete-layoff"));
  assert.ok(ids(s).includes("noncompete-state"));
});

test("invention assignment without a carve-out is flagged; with one it is not", () => {
  const t = "You hereby assign to the Company all inventions you conceive during your employment, whether or not during working hours or using company resources.";
  assert.equal(analyze(t, {}).findings.find((x) => x.id === "ip-no-carveout").severity, "high");
  const ok = t + " This does not apply to inventions developed entirely on your own time without company resources and unrelated to the business, and Exhibit A lists prior inventions.";
  assert.ok(!ids(analyze(ok, {})).includes("ip-no-carveout"));
});

test("repayment, bonus forfeiture and commissions", () => {
  const t = "A signing bonus of $20,000 must be repaid in full if you resign within 24 months. The annual bonus is in the sole discretion of the Company and you must be employed on the payment date. Commissions are not earned until collected and you forfeit them upon termination.";
  const r = analyze(t + " Employment is at will, salary $100,000.", {});
  const c = r.findings.find((x) => x.id === "clawback");
  assert.equal(c.severity, "high");
  assert.match(c.title, /24 months/);
  for (const id of ["bonus-conditional", "commission-forfeit", "commission-plan-missing"]) assert.ok(ids(r).includes(id), id);
  const soft = analyze("The $5,000 relocation payment is repayable on a pro rata basis if you resign within 12 months, and not at all if you are laid off. Salary $100,000, at will, severance applies.", {});
  assert.equal(soft.findings.find((x) => x.id === "clawback").severity, "medium");
});

test("equity buyback and short exercise window", () => {
  const t = "You receive 10,000 stock options with four-year vesting. After your employment ends you have 30 days to exercise vested options, and the Company may repurchase vested shares at cost.";
  const r = analyze(t + " Salary $100,000.", {});
  assert.ok(ids(r).includes("equity-repurchase"));
  assert.ok(ids(r).includes("short-exercise-window"));
  assert.ok(!ids(r).includes("equity-terms-missing"));
});

test("arbitration, notice, moonlighting, unilateral change, carve-outs", () => {
  const t = "All disputes go to binding arbitration and you waive any jury trial. You will give 60 days notice of resignation. Outside employment requires prior written consent. The Company may modify your compensation at any time in its sole discretion. Confidential information must be protected. You agree not to disparage the Company. Salary $100,000.";
  const r = analyze(t, {});
  for (const id of ["arbitration", "long-notice", "moonlighting", "unilateral-change", "confidentiality-carveout", "nondisparagement"]) assert.ok(ids(r).includes(id), id);
});

test("governing law outside your state is flagged", () => {
  const t = "This agreement is governed by the laws of Delaware. Employment at will, salary $100,000, and severance is available on request by the employee.";
  assert.ok(ids(analyze(t, { state: "CA" })).includes("foreign-law"));
  assert.ok(!ids(analyze(t, { state: "" })).includes("foreign-law"));
});

test("bad numbers and empty text produce errors, not findings", () => {
  assert.equal(analyze("short").errors.length, 1);
  assert.match(analyze(GOOD, { expectedSalary: "abc" }).errors[0], /not a number/);
  assert.match(analyze(GOOD, { signingBonus: "abc" }).errors[0], /not a number/);
});

test("the sample trips the headline rules and the outputs render", () => {
  const r = analyze(sampleContract(), SAMPLE_SETTINGS);
  assert.equal(r.verdict, "negotiate-before-signing");
  for (const id of ["salary-mismatch", "noncompete", "ip-no-carveout", "clawback", "equity-repurchase", "short-exercise-window", "arbitration", "unilateral-change", "bonus-conditional"]) assert.ok(ids(r).includes(id), id);
  assert.equal(r.findings[0].severity, "high");
  assert.match(summaryText(r, SAMPLE_SETTINGS), /RESULT: Negotiate before you sign/);
  assert.equal(findingsCsv(r).split("\n").length, r.findings.length + 1);
});
