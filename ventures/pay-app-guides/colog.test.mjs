import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, sampleLog, SAMPLE_SETTINGS, sovRows, logCsv, summaryText, waiverExceptions, parseDate, parseMoney, normStatus, sovItem, csvCell } from "./colog.mjs";
import { existsSync } from "node:fs";

// The sibling pay application generator is the tool these SOV lines are pasted into. Skip if this venture is used on its own.
const GEN = new URL("../pay-application-generator/calc.mjs", import.meta.url);
const generator = existsSync(GEN) ? await import(GEN.href) : null;

const S = { originalContract: "100000", asOf: "2026-11-25" };
const log = (...rows) => ["Number,Description,Status,Amount,Days,Submitted,Approved,Billed", ...rows].join("\n");

test("sample: totals match a hand calculation", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  const t = r.totals;
  assert.equal(t.approvedAdd, 2025000); // 7,800 + 12,450
  assert.equal(t.approvedDeduct, -350000);
  assert.equal(t.revisedContract, 52800000 + 1675000);
  assert.equal(t.pendingNet, 218000 + 960000 + 315000);
  assert.equal(t.potentialContract, 52800000 + 1675000 + 1493000);
  assert.equal(t.rejectedNet, 430000);
  assert.deepEqual(t.counts, { approved: 3, pending: 3, rejected: 1, void: 0 });
  assert.equal(t.approvedDays, 5);
  // CO-4 submitted 10-08 (48 days), CO-7 10-15 (41 days) are stale at 30; CO-5 11-12 (13 days) is not.
  assert.equal(t.staleCount, 2);
  assert.equal(t.staleAmount, 218000 + 315000);
  assert.equal(t.oldestPending, 48);
  assert.equal(t.avgTurnaround, Math.round((14 + 20 + 19) / 3));
  assert.ok(r.findings.some((f) => f.severity === "high" && /still pending/.test(f.title) && /\$1,500\.00/.test(f.title)));
});

test("approved change orders paste into the pay application generator and give the same net change", { skip: !generator && "pay-application-generator not present" }, () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  const sov = ["Item,Description,Scheduled value,Previous,This period,Stored", "1,Base contract,528000,100000,0,0", ...sovRows(r).split("\n").slice(1)].join("\n");
  const g = generator.compute(sov, { retainagePct: "10" });
  assert.deepEqual(g.errors, []);
  assert.equal(g.summary.original, r.totals.original);
  assert.equal(g.summary.changes, r.totals.approvedNet);
  assert.equal(g.summary.contractToDate, r.totals.revisedContract);
  // Pending and rejected change orders never reach the SOV.
  assert.doesNotMatch(sovRows(r), /blocking|LED/);
});

test("status words, dates and money parse; bad input is an error, not a guess", () => {
  assert.equal(normStatus("Executed"), "approved");
  assert.equal(normStatus("PCO"), "pending");
  assert.equal(normStatus("Denied"), "rejected");
  assert.equal(normStatus("withdrawn"), "void");
  assert.equal(normStatus("maybe"), undefined);
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("11/25/2026"), parseDate("2026-11-25"));
  assert.equal(parseMoney("(1,250.50)"), -125050);
  assert.equal(parseMoney("12.345"), null);
  assert.equal(parseMoney("$12,450.00"), 1245000);
  assert.equal(parseMoney("-$3,500"), -350000);
  assert.equal(parseMoney("29,99"), 2999); // decimal comma, not 2,999
  assert.equal(parseMoney("1.234,56"), 123456);
  assert.equal(parseMoney("12,34,5"), null);
  assert.match(compute(log("1,x,maybe,100,,,,"), S).errors[0], /not one of approved/);
  assert.match(compute(log("1,x,Approved,abc,,,,"), S).errors[0], /amount is not/);
  assert.match(compute(log("1,x,Pending,100,,2026-13-01,,"), S).errors[0], /submitted date/);
  assert.match(compute("Number,Amount\n1,100", S).errors[0], /status column/);
  assert.match(compute(log("1,x,Pending,100,,,,"), { ...S, staleDays: "0" }).errors[0], /whole number/);
});

test("over-billing an approved CO, billing a rejected one, and a deductive CO billed the wrong way are flagged", () => {
  const r = compute(log("1,a,Approved,1000,,2026-11-01,2026-11-02,1200", "2,b,Rejected,500,,2026-11-01,,100", "3,c,Approved,-800,,2026-11-01,2026-11-03,200", "4,d,Approved,-800,,2026-11-01,2026-11-03,-800"), S);
  const high = r.findings.filter((f) => f.severity === "high").map((f) => f.title).join("\n");
  assert.match(high, /^1 \(a\): billed \$1,200\.00/m);
  assert.match(high, /2 \(b\): \$100\.00 billed on a change order marked rejected/);
  assert.match(high, /3 \(c\): billed \$200\.00 against an approved amount of -\$800\.00/);
  assert.doesNotMatch(high, /4 \(d\)/);
});

test("duplicates, missing approval dates, pending at risk and a fresh pending CO", () => {
  const r = compute(log("7,a,Approved,100,,2026-11-01,,0", "7,b,Pending,20000,,2026-11-20,,0"), S);
  const all = r.findings.map((f) => f.title).join("\n");
  assert.match(all, /"7" appears 2 times/);
  assert.match(all, /no approval date/);
  assert.match(all, /20\.0% of the original contract/);
  assert.doesNotMatch(all, /waited more than/);
});

test("stale threshold is configurable", () => {
  const rows = log("1,a,Pending,100,,2026-11-01,,0");
  assert.equal(compute(rows, S).totals.staleCount, 0); // 24 days
  assert.equal(compute(rows, { ...S, staleDays: "14" }).totals.staleCount, 1);
});

test("CO numbers normalise for the SOV so the generator counts them as change orders", () => {
  assert.equal(sovItem("3"), "CO-3");
  assert.equal(sovItem("CO 3"), "CO-3");
  assert.equal(sovItem("co#12"), "CO-12");
  assert.equal(sovItem("Change Order 4"), "CO-4");
  assert.equal(sovItem("", 2), "CO-2");
});

test("exports: CSV neutralises formulas, waiver wording lists only pending COs", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(csvCell("-3500.00"), "-3500.00");
  assert.equal(csvCell("-cmd"), `"'-cmd"`);
  const r = compute(log('1,"=cmd|x",Approved,100,,2026-11-01,2026-11-02,0', "2,Extra,Pending,250,,2026-11-01,,0"), S);
  assert.match(logCsv(r), /"'=cmd\|x"/);
  assert.match(sovRows(r), /"'=cmd\|x"/);
  assert.equal(waiverExceptions(r), "Excepted from this waiver: pending change orders not yet approved or paid (CO-2, Extra: $250.00; total $250.00), and retainage held to date.");
  assert.match(summaryText(r, { project: "Job" }), /Revised contract sum\s+\$100,100\.00/);
  assert.equal(waiverExceptions(compute(log("1,a,Approved,100,,,2026-11-02,0"), S)), "");
});

test("tab-separated paste from a spreadsheet works", () => {
  const r = compute("CO\tDescription\tStatus\tAmount\n1\tx\tSigned\t$1,000.00", S);
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.revisedContract, 10100000);
});
