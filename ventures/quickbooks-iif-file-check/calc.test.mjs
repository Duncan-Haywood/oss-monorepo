import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseIif, dateParts, dateOrder, normalizeAmount, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const titles = (r) => r.findings.map((f) => f.title);
const T = (...c) => c.join("\t");
const HDR = [T("!TRNS", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT"), T("!SPL", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT"), "!ENDTRNS"];
const tx = (date, a, b, amt = "10.00", extra = []) => [T("TRNS", "GENERAL JOURNAL", date, a, "", "-" + amt), T("SPL", "GENERAL JOURNAL", date, b, "", amt), ...extra, "ENDTRNS"];

test("the clean sample has no errors or warnings and proves month/day order", () => {
  const r = validate(sampleFile());
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.equal(r.summary.transactions, 2);
  assert.ok(titles(r).includes("2 account names used") || r.findings.length === 0);
});

test("the broken sample reports each planted fault with a line number", () => {
  const r = validate(sampleBrokenFile());
  const by = (t) => r.findings.find((f) => f.title.startsWith(t));
  assert.equal(by("No !ENDTRNS").line, 1);
  assert.equal(by("Unknown ACCNTTYPE").line, 4);
  assert.equal(by("Transaction does not balance").line, 10);
  assert.equal(by("Transaction has no ENDTRNS").line, 13);
  assert.equal(by("Row has more columns").line, 14);
  assert.equal(by("Date is year-first").line, 10);
  assert.equal(by("Account not defined").line, 16);
  assert.ok(by("Looks like a repeat"));
  assert.ok(by("1 row with cells wrapped"));
});

test("spaces or commas instead of tabs are called out, not read as no header", () => {
  const r = validate("!TRNS  TRNSTYPE  DATE  ACCNT  AMOUNT\nTRNS  CHECK  01/05/2024  Checking  -5.00\n");
  assert.equal(r.findings[0].title, "Columns are not separated by tabs");
  assert.equal(validate("hello\nworld\n").findings[0].title, "No ! header rows");
});

test("a transaction must balance to zero, in cents", () => {
  const ok = [...HDR, ...tx("01/15/2024", "Checking", "Rent", "0.10")].join("\n");
  assert.equal(validate(ok).summary.errors, 0);
  const bad = [...HDR, T("TRNS", "CHECK", "01/15/2024", "Checking", "", "-10.00"), T("SPL", "CHECK", "01/15/2024", "Rent", "", "9.99"), "ENDTRNS"].join("\n");
  const f = validate(bad).findings.find((x) => x.title === "Transaction does not balance");
  assert.match(f.detail, /-0\.01/);
});

test("a missing ENDTRNS, stray SPL and missing header column are errors", () => {
  assert.ok(titles(validate([...HDR, T("SPL", "CHECK", "01/15/2024", "Rent", "", "1.00")].join("\n"))).includes("SPL row outside a transaction"));
  const noEnd = [...HDR, T("TRNS", "CHECK", "01/15/2024", "Checking", "", "-1"), T("SPL", "CHECK", "01/15/2024", "Rent", "", "1")].join("\n");
  assert.ok(titles(validate(noEnd)).includes("Transaction has no ENDTRNS"));
  const noAmt = [T("!TRNS", "TRNSTYPE", "DATE", "ACCNT"), T("!SPL", "ACCNT", "AMOUNT"), "!ENDTRNS", T("TRNS", "CHECK", "01/15/2024", "Checking"), "ENDTRNS"].join("\n");
  assert.ok(titles(validate(noAmt)).some((t) => t.startsWith("!TRNS header lacks AMOUNT")));
});

test("dates: year-first is flagged, day-first is proven, mixed is an error, month 13 is impossible", () => {
  assert.equal(dateParts("2024-03-05").kind, "iso");
  assert.equal(dateOrder(parseIif([...HDR, ...tx("13/01/2024", "A", "B")].join("\n")).rows).order, "dmy");
  const mixed = [...HDR, ...tx("13/01/2024", "A", "B"), ...tx("01/13/2024", "A", "B", "11.00")].join("\n");
  assert.ok(titles(validate(mixed)).includes("Dates mix day-first and month-first"));
  const dm = validate([...HDR, ...tx("31/12/2024", "A", "B")].join("\n"));
  assert.ok(titles(dm).includes("Date reads day-first"));
  assert.ok(titles(validate([...HDR, ...tx("2024-13-40", "A", "B")].join("\n"))).includes("Impossible date"));
});

test("an !ACCNT list makes undefined accounts a warning; without one the used accounts are listed", () => {
  const withList = [T("!ACCNT", "NAME", "ACCNTTYPE"), T("ACCNT", "Checking", "BANK"), ...HDR, ...tx("01/15/2024", "Checking", "Rent")].join("\n");
  assert.ok(titles(validate(withList)).includes("Account not defined in this file"));
  const without = [...HDR, ...tx("01/15/2024", "Checking", "Rent")].join("\n");
  assert.ok(titles(validate(without)).includes("2 account names used"));
  const dupes = [T("!ACCNT", "NAME", "ACCNTTYPE"), T("ACCNT", "Cash", "BANK"), T("ACCNT", "cash", "BANK")].join("\n");
  assert.ok(titles(validate(dupes)).includes("Duplicate account in !ACCNT list"));
});

test("repair unquotes, normalises amounts, rewrites year-first dates and closes transactions", () => {
  const src = [...HDR, T("TRNS", "CHECK", '"2024-01-09"', "Checking", "Paper Mart ", "(120.00)"), T("SPL", "CHECK", "2024-01-09", "Rent", "Paper Mart ", "120.00")].join("\r\n");
  const out = repair(src);
  assert.equal(validate(out.text).summary.errors, 0);
  assert.match(out.text, /01\/09\/2024/);
  assert.match(out.text, /-120\.00/);
  assert.match(out.text, /\r\nENDTRNS/);
  assert.ok(out.changes.length >= 4);
  assert.doesNotMatch(out.text, /"/);
});

test("repair rewrites day-first dates only when proven or chosen, and never when mixed", () => {
  const dm = [...HDR, ...tx("31/12/2024", "A", "B"), ...tx("05/03/2024", "A", "B", "12.00")].join("\n");
  assert.match(repair(dm, { fixDates: "dmy" }).text, /12\/31\/2024/);
  assert.match(repair(dm, { fixDates: "dmy" }).text, /03\/05\/2024/);
  assert.doesNotMatch(repair(dm).text, /12\/31\/2024/);
  const unknown = [...HDR, ...tx("05/03/2024", "A", "B")].join("\n");
  assert.doesNotMatch(repair(unknown, { fixDates: "dmy" }).text, /03\/05\/2024/);
  assert.match(repair(unknown, { fixDates: "dmy", order: "dmy" }).text, /03\/05\/2024/);
  const mixed = [...HDR, ...tx("13/01/2024", "A", "B"), ...tx("01/13/2024", "A", "B", "11.00")].join("\n");
  assert.equal(repair(mixed, { fixDates: "dmy" }).text, mixed);
});

test("repair leaves a clean file untouched", () => {
  const r = repair(sampleFile());
  assert.equal(r.changes.length, 0);
  assert.equal(r.text, sampleFile());
});

test("normalizeAmount, findingsCsv and decodeBuffer", () => {
  assert.deepEqual(normalizeAmount("(18.00)"), { value: -18, fixed: "-18.00" });
  assert.equal(normalizeAmount("abc"), null);
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,problem,detail,auto_fixable/);
  assert.equal(decodeBuffer(new TextEncoder().encode("!TRNS\tX")), "!TRNS\tX");
});
