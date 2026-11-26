import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, normType, normDirection, summaryText, logCsv, requestText, sampleLog, SAMPLE_SETTINGS, statusText } from "./waivers.mjs";

const H = "Direction,Party,Type,Through,Amount,Signed,Paid,Paid amount";
const run = (rows, s = {}) => compute([H, ...rows].join("\n"), { asOf: "2026-11-25", ...s });

test("types and directions are read from common wording", () => {
  assert.deepEqual(normType("Conditional Progress"), { condition: "conditional", stage: "progress" });
  assert.deepEqual(normType("Unconditional waiver and release on final payment"), { condition: "unconditional", stage: "final" });
  assert.deepEqual(normType("UP"), { condition: "unconditional", stage: "progress" });
  assert.deepEqual(normType("conditional partial"), { condition: "conditional", stage: "progress" });
  assert.equal(normType("progress"), undefined);
  assert.equal(normType(""), null);
  assert.equal(normDirection("Sent"), "given");
  assert.equal(normDirection("lower tier"), "received");
  assert.equal(normDirection("sideways"), undefined);
});

test("an unconditional waiver given with no cleared payment is flagged high", () => {
  const r = run(["Given,GC,Unconditional progress,2026-10-31,10000,2026-11-01,,"]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /no date the payment cleared/);
  assert.equal(r.totals.riskyGivenCount, 1);
  assert.equal(r.totals.riskyGivenAmount, 1000000);
});

test("signed before the funds cleared, and waiving more than was paid, are both flagged", () => {
  const r = run(["Given,GC,Unconditional progress,2026-10-31,10000,2026-11-01,2026-11-05,9000"]);
  const high = r.findings.filter((f) => f.severity === "high").map((f) => f.title);
  assert.equal(high.length, 2);
  assert.ok(high.some((t) => /before the payment cleared/.test(t)));
  assert.ok(high.some((t) => /gives up \$1,000\.00/.test(t)));
});

test("a clean exchange (conditional, paid, then unconditional after clearing) has no findings", () => {
  const r = run([
    "Given,GC,Conditional progress,2026-10-31,10000,2026-10-30,2026-11-10,10000",
    "Given,GC,Unconditional progress,2026-10-31,10000,2026-11-12,2026-11-10,10000",
    "Received,Supplier A,Conditional progress,2026-10-31,4000,2026-10-29,2026-11-12,4000",
    "Received,Supplier A,Unconditional progress,2026-10-31,4000,2026-11-15,2026-11-12,4000",
  ]);
  assert.deepEqual(r.findings, []);
  assert.equal(r.lines[0].match, r.lines[1]);
  assert.equal(statusText(r.lines[0]), "swapped for unconditional");
});

test("paid a lower tier on a conditional with no unconditional held: high after the chase window, note before", () => {
  const late = run(["Received,Supplier A,Conditional progress,2026-10-31,4000,2026-10-29,2026-11-05,"]);
  assert.equal(late.findings[0].severity, "high");
  assert.match(late.findings[0].title, /20 days ago/);
  assert.equal(late.totals.overdueCount, 1);
  const fresh = run(["Received,Supplier A,Conditional progress,2026-10-31,4000,2026-10-29,2026-11-20,"]);
  assert.equal(fresh.findings[0].severity, "info");
  assert.equal(fresh.toCollect.length, 1);
  assert.equal(fresh.toCollect[0].overdue, false);
});

test("the next pay app's package lists lower tiers without a conditional through that date, skipping finals", () => {
  const r = run([
    "Received,Supplier A,Conditional progress,2026-11-30,4000,2026-11-25,,",
    "Received,Supplier B,Conditional progress,2026-10-31,2000,2026-10-29,,",
    "Received,Sub C,Unconditional final,2026-10-31,3000,2026-11-02,2026-11-01,3000",
  ], { nextThrough: "2026-11-30" });
  assert.deepEqual(r.toCollect.map((c) => c.party), ["Supplier B"]);
  assert.match(requestText(r, { project: "Job" }), /To: Supplier B[\s\S]*conditional progress waiver through 2026-11-30/);
});

test("bad input is named by row; missing columns are named", () => {
  assert.match(compute("Party,Type,Amount\nA,CP,1", {}).errors[0], /direction column/);
  const r = run(["Given,GC,Conditional,2026-10-31,10,,,"]);
  assert.match(r.errors[0], /Row 2 \(GC\): type "Conditional" must say/);
  assert.match(run(["Given,GC,CP,31/10/2026,10,,,"]).errors[0], /through date/);
  assert.match(run(["Given,GC,CP,2026-10-31,-5,,,"]).errors[0], /amount/);
});

test("duplicates, missing through dates, future through dates and progress after final are noted", () => {
  const r = run([
    "Given,GC,CP,2026-10-31,10,2026-10-30,,",
    "Given,GC,CP,2026-10-31,10,2026-10-30,,",
    "Given,GC,CP,,10,2026-10-30,,",
    "Given,GC,UP,2026-11-30,10,2026-11-01,2026-10-31,10",
    "Given,GC,UF,2026-11-01,10,2026-11-02,2026-11-02,10",
    "Given,GC,CP,2026-11-30,10,2026-11-10,,",
  ]);
  const t = r.findings.map((f) => f.title).join("\n");
  assert.match(t, /2 conditional progress waivers given through 2026-10-31 \(rows 2, 3\)/);
  assert.match(t, /no through date/);
  assert.match(t, /waives work not yet done/);
  assert.match(t, /signed after a final waiver/);
});

test("the example gives the findings the page describes", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  assert.equal(r.lines.length, 8);
  assert.equal(r.totals.riskyGivenCount, 1); // pay app 8 unconditional, not paid
  assert.equal(statusText(r.lines[2]), "unconditional given, payment not recorded");
  assert.equal(r.totals.missingUncondCount, 2); // Metro #8 (overdue) and Ridge #8 (fresh)
  assert.equal(r.totals.overdueCount, 1);
  assert.deepEqual(r.toCollect.map((c) => c.party).sort(), ["Metro Electrical Supply", "Metro Electrical Supply", "Ridge Low Voltage LLC", "Ridge Low Voltage LLC"]);
  assert.match(summaryText(r, SAMPLE_SETTINGS), /Unconditional given without cleared payment\s+1 \/ \$51,750\.00/);
  const csv = logCsv(r).split("\n");
  assert.equal(csv.length, 9);
  assert.match(csv[0], /^Direction,Party,Pay app,Type/);
});

test("CSV cells a spreadsheet would run as formulas are neutralised", () => {
  const r = run(["Given,=HYPERLINK(1),CP,2026-10-31,10,,,"]);
  assert.match(logCsv(r), /'=HYPERLINK/);
});

// Red team 2026-11-25: Number() read " " as 0 chase days and "1e1" as 10.
test("chase days must be plain digits; blank or spaces use the default", () => {
  for (const chaseDays of ["1e1", "0xa", "10.0"]) assert.match(compute(sampleLog(), { ...SAMPLE_SETTINGS, chaseDays }).errors.join(" "), /whole number/, chaseDays);
  const spaces = compute(sampleLog(), { ...SAMPLE_SETTINGS, chaseDays: "  " });
  assert.deepEqual(spaces.errors, []);
  assert.deepEqual(spaces.findings, compute(sampleLog(), SAMPLE_SETTINGS).findings);
});

test("a negative paid amount is an error, not a bigger shortfall (red team 2026-11-26)", () => {
  const r = run(["Given,GC,Unconditional progress,2026-10-31,10000,2026-11-12,2026-11-10,-500"]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /paid amount is not a dollar figure of zero or more/);
  assert.equal(run(["Given,GC,Unconditional progress,2026-10-31,10000,2026-11-12,2026-11-10,0"]).errors.length, 0);
});

test("only an unconditional waiver received with no payment date asks for the payment to be recorded", () => {
  const t = (rows) => run(rows).findings.map((f) => f.title).join("\n");
  assert.match(t(["Received,Acme Supply,Unconditional progress,2026-10-31,500,2026-11-01,,"]), /you hold their unconditional progress waiver but no date you paid it/);
  assert.doesNotMatch(t(["Received,Acme Supply,Conditional progress,2026-10-31,500,2026-10-30,,"]), /no date you paid it/);
});

test("a progress waiver signed the same day as the final is not flagged; one signed a day later is", () => {
  const t = (signed) => run([
    "Given,GC,UF,2026-11-01,10,2026-11-02,2026-11-02,10",
    `Given,GC,UP,2026-10-31,10,${signed},2026-10-31,10`,
  ]).findings.map((f) => f.title).join("\n");
  assert.doesNotMatch(t("2026-11-02"), /signed after a final waiver/);
  assert.match(t("2026-11-03"), /signed after a final waiver/);
});

test("conditional waivers given and still unpaid are totalled; paid ones are not", () => {
  const r = run([
    "Given,GC,Conditional progress,2026-10-31,10000,2026-10-30,,",
    "Given,GC,Conditional progress,2026-09-30,2500,2026-09-29,2026-10-10,2500",
    "Given,GC,Unconditional progress,2026-09-30,2500,2026-10-12,2026-10-10,2500",
  ]);
  assert.equal(r.totals.unpaidConditionalGiven, 1000000);
});
