import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseQif, dateOrder, qifDateParts, normalizeAmount, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const NOW = { now: new Date("2024-06-01T00:00:00Z") };
const titles = (r) => r.findings.map((f) => f.title);

test("the clean sample has no errors or warnings and proves month/day order", () => {
  const r = validate(sampleFile(), NOW);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.equal(r.summary.transactions, 3);
  assert.deepEqual(r.summary.types, ["Bank"]);
  assert.ok(titles(r).includes("Dates are month/day/year"));
});

test("the broken sample reports each planted fault with a line number", () => {
  const r = validate(sampleBrokenFile(), NOW);
  const by = (t) => r.findings.find((f) => f.title.startsWith(t));
  assert.equal(by("No !Type").line, 1);
  assert.equal(by("Dates mix").severity, "error");
  assert.equal(by("Amount not readable").line, 26);
  assert.equal(by("Last record has no closing").line, 29);
  assert.equal(r.findings.filter((f) => f.title.startsWith("Split amounts")).length, 2);
  assert.ok(by("Looks like a repeat"));
});

test("date order is proven only by dates that can be read one way", () => {
  const rec = (d) => ({ fields: { D: d } });
  assert.equal(dateOrder([rec("13/01/2024"), rec("02/03/2024")]).order, "dmy");
  assert.equal(dateOrder([rec("01/13/2024")]).order, "mdy");
  assert.equal(dateOrder([rec("03/04/2024")]).order, "unknown");
  assert.equal(dateOrder([rec("13/01/2024"), rec("01/13/2024")]).order, "mixed");
});

test("all-ambiguous dates warn instead of guessing", () => {
  const r = validate("!Type:Bank\nD03/04/2024\nT-1\nPA\n^\n", NOW);
  assert.ok(titles(r).includes("Date order cannot be told from the file"));
});

test("date formats: slashes, dots, apostrophe years", () => {
  assert.deepEqual(qifDateParts("31.12.2024"), { a: 31, b: 12, y: 2024, twoDigit: false });
  assert.equal(qifDateParts("1/ 5'24").y, 2024);
  assert.equal(qifDateParts("1/5/99").y, 1999);
  assert.equal(qifDateParts("2024-01-05"), null);
});

test("amount normalisation never guesses", () => {
  assert.equal(normalizeAmount("-42,10").fixed, "-42.10");
  assert.equal(normalizeAmount("(18.00)").fixed, "-18.00");
  assert.equal(normalizeAmount("1,234.50").fixed, "1234.50");
  assert.equal(normalizeAmount("1.234,56").fixed, "1234.56");
  assert.equal(normalizeAmount("12,5,0"), null);
});

test("US thousands commas are legal QIF and are not flagged or rewritten", () => {
  const q = "!Type:Bank\nD01/13/2024\nT1,200.00\nPA\n^\n";
  assert.ok(!titles(validate(q, NOW)).includes("Amount is not a plain decimal"));
  assert.ok(!repair(q).changes.length);
});

test("an OFX file is sent to the OFX tool, not misread", () => {
  const r = validate("OFXHEADER:100\n<OFX>\n</OFX>", NOW);
  assert.match(r.findings[0].title, /OFX/);
  assert.equal(r.summary.errors, 1);
  assert.equal(repair("<OFX></OFX>").changes.length, 0);
});

test("splits that add up are fine; splits that do not are an error", () => {
  const ok = "!Type:Bank\nD01/13/2024\nT-100.00\nPA\nSX\n$-60.00\nSY\n$-40.00\n^\n";
  assert.ok(!titles(validate(ok, NOW)).some((t) => /Split/.test(t)));
  const bad = ok.replace("$-40.00", "$-30.00");
  assert.ok(titles(validate(bad, NOW)).includes("Split amounts do not add up to the total"));
});

test("repair adds the closing ^, fixes amounts, and leaves unprovable things named", () => {
  const r = repair(sampleBrokenFile(), { assumeType: "Bank" });
  const after = validate(r.text, NOW);
  assert.ok(!titles(after).includes("Last record has no closing ^"));
  assert.ok(!titles(after).includes("No !Type: header"));
  assert.ok(!titles(after).includes("Amount is not a plain decimal"));
  assert.ok(titles(after).includes("Amount not readable"), "a garbage amount is not guessed");
  assert.ok(titles(after).includes("Dates mix day-first and month-first"), "mixed dates are not resolved");
});

test("repair does not add a !Type header unless asked", () => {
  assert.ok(!repair("D01/13/2024\nT-1\nPA\n^\n").text.startsWith("!Type"));
});

test("convertDates rewrites to a four-digit year only when the order is proven or chosen", () => {
  const q = "!Type:Bank\nD13/01/24\nT-1\nPA\n^\nD02/03/24\nT-2\nPB\n^\n";
  const r = repair(q, { convertDates: "mdy" });
  assert.match(r.text, /D01\/13\/2024/);
  assert.match(r.text, /D03\/02\/2024/);
  const amb = "!Type:Bank\nD03/04/24\nT-1\nPA\n^\n";
  assert.equal(repair(amb, { convertDates: "mdy" }).text, amb, "unprovable order is left alone");
  assert.match(repair(amb, { convertDates: "dmy", order: "mdy" }).text, /D04\/03\/2024/);
  const mixed = "!Type:Bank\nD13/01/2024\nT-1\nPA\n^\nD01/13/2024\nT-1\nPA\n^\n";
  assert.equal(repair(mixed, { convertDates: "mdy", order: "mdy" }).text, mixed);
});

test("repair keeps CRLF and is idempotent on a clean file", () => {
  const crlf = sampleBrokenFile().replace(/\n/g, "\r\n");
  assert.ok(!/[^\r]\n/.test(repair(crlf, { assumeType: "Bank" }).text));
  assert.equal(repair(sampleFile()).text, sampleFile());
  assert.deepEqual(repair(sampleFile()).changes, []);
});

test("a final record with no ^ is still counted", () => {
  assert.equal(parseQif("!Type:Bank\nD1/2/2024\nT-5\nPA").records.length, 1);
});

test("findings export as CSV with quoting", () => {
  const csv = findingsCsv(validate(sampleBrokenFile(), NOW));
  assert.match(csv, /^severity,line,problem,detail,auto_fixable\r\n/);
  assert.match(csv, /"No !Type: header"/);
});

test("Windows-1252 bytes decode instead of becoming replacement characters", () => {
  assert.equal(decodeBuffer(new Uint8Array([0x43, 0x61, 0x66, 0xe9]).buffer), "Café");
});

test("a full Quicken export: list sections are not checked as transactions", () => {
  // !Type:Cat and !Account records have N/D/T lines that mean name, description and account type,
  // not payee, date and amount. Before the fix this file gave 4 errors and 3 "transactions"
  // (audit portfolio/quality/audits/2026-11-13-qif-file-check.json).
  const text = "!Type:Cat\nNGroceries\nDFood and household\nE\n^\n!Option:AutoSwitch\n!Account\nNChecking\nTBank\n^\n!Type:Bank\nD01/13/2024\nT-42.10\nPCORNER GROCERY\n^\n";
  const r = validate(text, { now: new Date("2024-06-01") });
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.transactions, 1);
  const p = parseQif(text);
  assert.equal(p.lists.length, 2);
  assert.equal(repair(text).changes.length, 0);
});

test("normalizeAmount never strips stray letters as if they were a currency", () => {
  assert.equal(normalizeAmount("l2.50"), null); // a lower-case L typed for 1 is not 2.50
  assert.equal(normalizeAmount("DR12.50"), null); // a debit marker must not silently drop the sign
  assert.equal(normalizeAmount("USD 12.50").value, 12.5);
});

test("an impossible calendar day such as 02/30/2026 is flagged, and date conversion leaves it alone", () => {
  const text = "!Type:Bank\nD01/15/2026\nT-1.00\n^\nD02/30/2026\nT-2.00\n^\nD03/31/2026\nT-3.00\n^\nD12/25/2025\nT-1\n^\n";
  const r = validate(text);
  const bad = r.findings.filter((f) => f.title === "Impossible date");
  assert.equal(bad.length, 1);
  assert.equal(bad[0].line, 5);
  const out = repair(text, { convertDates: "dmy" }).text;
  assert.match(out, /^D02\/30\/2026$/m);
  assert.match(out, /^D31\/03\/2026$/m);
});

// Re-audit 2026-11-24 (portfolio/quality/audits/2026-11-24-qif-file-check.json): investment records,
// date-rewrite line numbers, and the three seeded mutants the 2026-11-13 audit named that still survived.
const INVST = "!Type:Invst\nD01/15/2024\nNShrsIn\nYACME CORP\nI10.00\nQ5\n^\nD01/16/2024\nNBuy\nYACME CORP\nI10.00\nQ5\nT50.00\n^\nD01/17/2024\nNDiv\nYACME CORP\nT1.25\n^\n";

test("investment records: a share transfer needs no T, the security in Y counts as the description", () => {
  const r = validate(INVST, NOW);
  assert.equal(r.summary.errors, 0, titles(r).join("; "));
  assert.equal(r.summary.warnings, 0, titles(r).join("; "));
  assert.equal(r.summary.transactions, 3);
});

test("investment records: a cash action with no T is an error; a missing action or security warns", () => {
  const r = validate("!Type:Invst\nD01/15/2024\nNSell\nYACME CORP\nQ5\n^\nD01/16/2024\nYACME CORP\nT9.00\n^\nD01/17/2024\nNBuy\nT9.00\n^\nD01/18/2024\nNBuyy\nYX\nT9.00\n^\n", NOW);
  const t = titles(r);
  assert.ok(t.includes("Investment record has no amount (T)"));
  assert.ok(t.includes("Investment record has no action (N)"));
  assert.ok(t.includes("No security (Y)"));
  assert.ok(t.includes('Unrecognised investment action "Buyy"'));
  assert.ok(!t.includes("No payee or memo"));
});

test("investment records: a sale and a purchase of one security on one day are not repeats", () => {
  const r = validate("!Type:Invst\nD01/15/2024\nNBuy\nYACME\nQ5\nT50.00\n^\nD01/15/2024\nNSell\nYACME\nQ5\nT50.00\n^\n", NOW);
  assert.ok(!titles(r).includes("Looks like a repeat of an earlier record"));
});

test("repair lists the line of every date it rewrites", () => {
  const { changes } = repair("!Type:Bank\nD13/01/2024\nT-1.50\nPX\n^\nD14/01/2024\nT-2.00\nPY\n^\n", { convertDates: "mdy" });
  assert.ok(changes.some((c) => c.startsWith("2 dates on lines 2, 6 rewritten as MM/DD/YYYY")), changes.join("|"));
});

test("a split one cent off the total is an error (cent precision, not dimes)", () => {
  const r = validate("!Type:Bank\nD01/13/2024\nT-100.00\nPX\nSA\n$-60.00\nSB\n$-39.99\n^\n", NOW);
  assert.ok(titles(r).includes("Split amounts do not add up to the total"));
  const ok = validate("!Type:Bank\nD01/13/2024\nT-100.00\nPX\nSA\n$-60.01\nSB\n$-39.99\n^\n", NOW);
  assert.ok(!titles(ok).includes("Split amounts do not add up to the total"));
});

test("two-digit years pivot at 70: '69 is 2069, '70 is 1970", () => {
  assert.equal(qifDateParts("1/5/69").y, 2069);
  assert.equal(qifDateParts("1/5/70").y, 1970);
  assert.equal(qifDateParts("1/5/50").y, 2050);
});

test("same date and amount with different payees is not flagged as a repeat", () => {
  const r = validate("!Type:Bank\nD01/13/2024\nT-5.00\nPCAFE\n^\nD01/13/2024\nT-5.00\nPPARKING\n^\n", NOW);
  assert.ok(!titles(r).includes("Looks like a repeat of an earlier record"));
});
