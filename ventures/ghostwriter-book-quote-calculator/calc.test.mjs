import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, hours, priceFor, effectiveHourly, schedule, analyze, num, toCsv } from "./calc.mjs";

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("hours add drafting, interviews with overhead, research, revisions and management", () => {
  const h = hours({ ...DEFAULTS, wordCount: 35000, draftWordsPerHour: 350, interviewHours: 10, interviewOverhead: 1, researchHours: 5, revisionRounds: 2, revisionShare: 0.1, managementHours: 5 });
  close(h.draft, 100);
  close(h.interviews, 20);
  close(h.revisions, 20);
  close(h.total, 100 + 20 + 5 + 20 + 5);
});

test("the quoted fee nets the target hourly when the job runs to plan and no premium applies", () => {
  const o = { ...DEFAULTS, confidentialityPremium: 0, rushPremium: 0, platformFee: 0.1 };
  const a = analyze(o);
  close(effectiveHourly(o, a.invoice, a.hours.total), o.targetHourly);
});

test("a platform fee grosses the invoice up so the writer still keeps the target", () => {
  const o = { ...DEFAULTS, confidentialityPremium: 0, platformFee: 0.2, expenses: 0 };
  const h = hours(o);
  const { invoice, labour } = priceFor(o, h, o.targetHourly);
  close(invoice * 0.8, labour);
});

test("expenses pass through at cost and are not marked up by premiums", () => {
  const base = analyze({ ...DEFAULTS, expenses: 0 });
  const withExp = analyze({ ...DEFAULTS, expenses: 1000 });
  close(withExp.invoice - base.invoice, 1000);
});

test("confidentiality and rush premiums raise the fee multiplicatively on labour", () => {
  const plain = analyze({ ...DEFAULTS, confidentialityPremium: 0, rushPremium: 0, expenses: 0 });
  const both = analyze({ ...DEFAULTS, confidentialityPremium: 0.25, rushPremium: 0.2, expenses: 0 });
  close(both.invoice / plain.invoice, 1.25 * 1.2);
  assert.ok(both.confidentialityValue > 0);
});

test("a 25% overrun cuts the effective hourly to the plan rate over 1.25 when there is no premium or fee", () => {
  const a = analyze({ ...DEFAULTS, confidentialityPremium: 0, platformFee: 0, expenses: 0, overrun: 0.25 });
  close(a.atRisk, DEFAULTS.targetHourly / 1.25);
});

test("a client budget below the quote reports the gap, the hourly it implies and the words it buys", () => {
  const a = analyze({ ...DEFAULTS, clientBudget: 10000 });
  assert.ok(a.budgetGap > 0);
  assert.ok(a.atBudget < DEFAULTS.targetHourly);
  assert.ok(a.budgetWords > 0 && a.budgetWords < DEFAULTS.wordCount);
  const full = analyze({ ...DEFAULTS, clientBudget: 0 });
  assert.equal(full.atBudget, null);
});

test("the words a budget buys, quoted again, come back to that budget", () => {
  const a = analyze({ ...DEFAULTS, clientBudget: 20000 });
  const again = analyze({ ...DEFAULTS, wordCount: a.budgetWords });
  assert.ok(Math.abs(again.invoice - 20000) < 25, `${again.invoice}`);
});

test("payment schedule sums to the invoice", () => {
  const s = schedule({ ...DEFAULTS, deposit: 0.3, milestones: 3 }, 30000);
  close(s.reduce((t, r) => t + r[1], 0), 30000);
  assert.equal(s.length, 4);
  close(s[0][1], 9000);
});

test("the size grid scales roughly with word count", () => {
  const a = analyze(DEFAULTS);
  assert.equal(a.grid.length, 5);
  assert.ok(a.grid[0].invoice < a.grid[2].invoice && a.grid[2].invoice < a.grid[4].invoice);
  close(a.grid[2].invoice, a.invoice);
});

test("bad input is reported instead of producing a number", () => {
  assert.equal(analyze({ ...DEFAULTS, wordCount: NaN }).result, null);
  assert.equal(analyze({ ...DEFAULTS, wordCount: -5 }).result, null);
  assert.equal(analyze({ ...DEFAULTS, wordCount: 0 }).result, null);
  assert.equal(analyze({ ...DEFAULTS, platformFee: 1 }).result, null);
  assert.equal(analyze({ ...DEFAULTS, draftWordsPerHour: 0 }).result, null);
});

test("an implausible drafting speed or missing interviews draws a warning but still computes", () => {
  assert.ok(analyze({ ...DEFAULTS, draftWordsPerHour: 1200 }).warnings.length > 0);
  const a = analyze({ ...DEFAULTS, interviewHours: 0 });
  assert.ok(a.warnings.length > 0 && a.result);
});

test("num parses currency and percent text; csv has a header and one row per line", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  const csv = toCsv(analyze(DEFAULTS)).trim().split("\n");
  assert.equal(csv[0], "line,value");
  assert.equal(csv.length, 11);
});

test("defaults produce a plausible book fee", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.invoice > 15000 && a.invoice < 60000, String(a.invoice));
  assert.ok(a.perWord > 0.2 && a.perWord < 1.5);
});
