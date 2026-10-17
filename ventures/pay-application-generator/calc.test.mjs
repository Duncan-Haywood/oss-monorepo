import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseMoney, parsePercent, summaryText, scheduleCsv, sampleList, SAMPLE_SETTINGS, dollars } from "./calc.mjs";

const S = (o = {}) => ({ retainagePct: "10", ...o });

test("money parsing handles dollars, commas, parentheses and negatives", () => {
  assert.equal(parseMoney("$1,234.50"), 123450);
  assert.equal(parseMoney("(500)"), -50000);
  assert.equal(parseMoney("-12.5"), -1250);
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parsePercent("10%"), 1000);
  assert.equal(parsePercent("5.5"), 550);
  assert.equal(parsePercent("101"), null);
});

test("one line: completed, retainage, payment due and balance by hand", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Stored\nFraming,100000,30000,20000,10000", S({ previousCertificates: "27000" }));
  const m = r.summary;
  assert.equal(m.completed, 6000000);
  assert.equal(m.retainage, 600000);
  assert.equal(m.earnedLess, 5400000);
  assert.equal(m.due, 2700000);
  assert.equal(m.balanceToFinish, 4600000);
  assert.equal(r.lines[0].pct, 6000);
});

test("previous certificates default to previous work less retainage", () => {
  const r = compute("Description,Scheduled value,Previous,This period\nA,100000,40000,10000", S());
  assert.equal(r.summary.previous, 3600000);
  assert.equal(r.summary.previousEstimated, true);
  assert.equal(r.summary.due, 900000);
  assert.ok(r.findings.some((f) => /estimated/.test(f.title)));
});

test("change orders, including a deductive one, are split from the original sum", () => {
  const r = compute(sampleList(), SAMPLE_SETTINGS);
  assert.equal(r.summary.changes, 430000);
  assert.equal(r.summary.original + r.summary.changes, r.summary.contractToDate);
  assert.equal(r.summary.original, 528000 * 100);
  assert.ok(!r.findings.some((f) => /negative/.test(f.title)), "a fully billed deductive change order is not suspicious");
});

test("retainage on stored materials can use its own rate", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Stored\nHVAC,100000,0,0,50000", S({ retainagePct: "10", storedRetainagePct: "0" }));
  assert.equal(r.summary.retStored, 0);
  assert.equal(r.summary.retainage, 0);
});

test("reduction at a completion threshold lowers the rate on the whole application", () => {
  const csv = "Description,Scheduled value,Previous,This period\nA,100000,40000,20000";
  const before = compute(csv, S({ reduceAtPct: "50", reducedPct: "5" }));
  assert.equal(before.summary.reduced, true);
  assert.equal(before.summary.retainage, 300000);
  const notYet = compute(csv, S({ reduceAtPct: "75", reducedPct: "5" }));
  assert.equal(notYet.summary.retainage, 600000);
});

test("a per-line retainage column overrides the global rate", () => {
  const r = compute("Description,Scheduled value,Previous,This period,Retainage\nA,100000,0,10000,0\nB,100000,0,10000,", S());
  assert.equal(r.lines[0].ret, 0);
  assert.equal(r.lines[1].ret, 100000);
});

test("findings: overbilled line, negative payment due, front loading", () => {
  const over = compute("Description,Scheduled value,Previous,This period\nA,1000,900,200", S());
  assert.ok(over.findings.some((f) => f.severity === "high" && /over/.test(f.title)));
  const neg = compute("Description,Scheduled value,Previous,This period\nA,1000,500,0", S({ previousCertificates: "900" }));
  assert.ok(neg.findings.some((f) => /negative/.test(f.title)));
  const front = compute("Description,Scheduled value,Previous,This period\nMobilization,10000,8000,1500\nBig,990000,0,0", S());
  assert.ok(front.findings.some((f) => /Front-loading/.test(f.title)));
});

test("bad input is reported rather than guessed", () => {
  assert.ok(compute("", S()).errors.length);
  assert.ok(compute("Description,Foo\nA,1", S()).errors[0].match(/Scheduled value/));
  assert.ok(compute("Description,Scheduled value\nA,ten", S()).errors[0].match(/Row 2/));
  assert.ok(compute("Description,Scheduled value\nA,1", S({ retainagePct: "x" })).errors[0].match(/Retainage/));
});

test("column names from other templates are recognised", () => {
  const r = compute("Item No,Description of Work,Scheduled Value,Work Completed Previous,Work Completed This Period,Materials Presently Stored\n1,Site,1000,100,200,50", S());
  assert.equal(r.summary.completed, 35000);
});

test("outputs: summary text and CSV carry the totals; delimiter and quoting survive", () => {
  const r = compute('Description,Scheduled value,Previous,This period\n"Paint, interior",1000,0,100', S());
  assert.match(summaryText(r, { applicationNo: "2", project: "X" }), /CURRENT PAYMENT DUE/);
  const csv = scheduleCsv(r);
  assert.match(csv, /"Paint, interior"/);
  assert.match(csv, /TOTAL/);
  assert.equal(dollars(-150), "-$1.50");
});

test("tab-separated spreadsheet pastes work", () => {
  const r = compute("Description\tScheduled value\tPrevious\tThis period\nA\t1000\t0\t100", S());
  assert.equal(r.summary.completed, 10000);
});
