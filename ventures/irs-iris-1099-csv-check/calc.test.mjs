import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, sampleFile, sampleBrokenFile, ssnProblem, itinProblem, tinShape, maskTin, necThreshold, closestColumn, findingsCsv, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const base = { "Form Type": "1099-NEC", "Tax Year": "2025", "Payer TIN": "123456780", "Payer Name": "Acme", "Payer Address": "1 A St", "Payer City": "Austin", "Payer State": "TX", "Payer ZIP": "78701",
  "Recipient TIN": "412345678", "Recipient TIN Type": "SSN", "Recipient Name": "Jo Doe", "Recipient Address": "2 B St", "Recipient City": "Dallas", "Recipient State": "TX", "Recipient ZIP": "75201", "NEC Box 1 Nonemployee Compensation": "1000.00" };
const file = (...os) => toCsv([COLUMNS, ...os.map((o) => COLUMNS.map((c) => ({ ...base, ...o })[c] ?? ""))]);
const one = (o) => validate(file(o));

test("the clean sample has no errors or warnings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info").map((f) => f.code), []);
  assert.equal(r.summary.records, 3);
  assert.equal(r.summary.byForm["1099-NEC"], 2);
});

test("the broken sample trips the headline faults", () => {
  const c = codes(validate(sampleBrokenFile()));
  for (const want of ["recipient-ssn", "recipient-tin", "recipient-name", "state", "money-format", "zip-zero", "name-chars", "dup-recipient", "below-threshold"]) assert.ok(c.includes(want), want);
});

test("parseCsv handles quotes and tracks start lines", () => {
  const { rows } = parseCsv('a,b\n"x, y","he said ""hi""\nmore"\nz,1\n');
  assert.equal(rows[1].cells[0], "x, y");
  assert.equal(rows[2].line, 4);
});

test("SSN rules: 000, 666, 9xx, group 00, serial 0000", () => {
  assert.match(ssnProblem("000123456"), /000/);
  assert.match(ssnProblem("666123456"), /666/);
  assert.match(ssnProblem("912345678"), /ITIN/);
  assert.match(ssnProblem("123003456"), /group/);
  assert.match(ssnProblem("123450000"), /serial/);
  assert.equal(ssnProblem("412345678"), null);
});

test("ITIN rules", () => {
  assert.equal(itinProblem("912701234"), null);
  assert.match(itinProblem("912491234"), /outside/);
  assert.match(itinProblem("412701234"), /does not start with 9/);
});

test("TIN shape: dashes allowed, short and lost-zero and scientific noted", () => {
  assert.equal(tinShape("412-34-5678").problem, null);
  assert.match(tinShape("12345678").problem, /leading zero/);
  assert.match(tinShape("1.2E+8").problem, /scientific/);
  assert.match(tinShape("12345").problem, /5 digits/);
  assert.match(tinShape("12a456789").problem, /characters/);
  assert.match(tinShape("").problem, /blank/);
  assert.equal(maskTin("412-34-5678"), "***-**-5678");
});

test("all-same-digit and sample TINs are errors, and the TIN is never printed in full", () => {
  const r = validate(file({ "Recipient TIN": "111-11-1111" }, { "Recipient TIN": "123456789", "Recipient Name": "B" }));
  assert.equal(r.findings.filter((f) => f.code === "recipient-tin").length, 2);
  assert.ok(!JSON.stringify(r.findings).includes("111111111"));
  assert.ok(!JSON.stringify(r.findings).includes("123456789"));
});

test("EIN typed recipient with a bad prefix warns; SSN rules do not apply to it", () => {
  assert.ok(codes(one({ "Recipient TIN Type": "EIN", "Recipient TIN": "07-1234567" })).includes("recipient-ein-prefix"));
  assert.ok(!codes(one({ "Recipient TIN Type": "EIN", "Recipient TIN": "45-1234567" })).includes("recipient-ssn"));
});

test("blank TIN type is inferred from dashes", () => {
  assert.ok(codes(one({ "Recipient TIN Type": "", "Recipient TIN": "45-1234567" })).includes("tin-dashes"));
  assert.ok(codes(one({ "Recipient TIN Type": "", "Recipient TIN": "666-12-3456" })).includes("recipient-ssn"));
});

test("NEC threshold is 600 through 2025 and 2000 from 2026", () => {
  assert.equal(necThreshold(2025), 600);
  assert.equal(necThreshold(2026), 2000);
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "599.99" })).includes("below-threshold"));
  assert.ok(!codes(one({ "NEC Box 1 Nonemployee Compensation": "600.00" })).includes("below-threshold"));
  assert.ok(codes(one({ "Tax Year": "2026", "NEC Box 1 Nonemployee Compensation": "1500.00" })).includes("below-threshold"));
});

test("below threshold with withholding is not flagged", () => {
  assert.ok(!codes(one({ "NEC Box 1 Nonemployee Compensation": "100.00", "Box 4 Federal Income Tax Withheld": "24.00" })).includes("below-threshold"));
});

test("MISC: royalties from 10, rents from 600; NEC box on a MISC row is wrong-form", () => {
  const m = { "Form Type": "1099-MISC", "NEC Box 1 Nonemployee Compensation": "" };
  assert.ok(!codes(one({ ...m, "MISC Box 2 Royalties": "10.00" })).includes("below-threshold"));
  assert.ok(codes(one({ ...m, "MISC Box 1 Rents": "599.00" })).includes("below-threshold"));
  assert.ok(codes(one({ "Form Type": "1099-MISC", "MISC Box 1 Rents": "700.00" })).includes("wrong-form-box"));
});

test("withheld more than paid, and no amount, are errors", () => {
  assert.ok(codes(one({ "Box 4 Federal Income Tax Withheld": "2000.00" })).includes("withheld-exceeds"));
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "" })).includes("no-amount"));
});

test("money formats: symbol, negative, three decimals, text", () => {
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "$1,000.00" })).includes("money-format"));
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "-5.00" })).includes("money-negative"));
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "(5.00)" })).includes("money-negative"));
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "10.005" })).includes("money-decimals"));
  assert.ok(codes(one({ "NEC Box 1 Nonemployee Compensation": "ten" })).includes("money-format"));
});

test("state, ZIP, name and address checks", () => {
  assert.ok(codes(one({ "Recipient State": "Texas" })).includes("state"));
  assert.ok(codes(one({ "Recipient ZIP": "7520" })).includes("zip"));
  assert.ok(codes(one({ "Recipient State": "NJ", "Recipient ZIP": "7101" })).includes("zip-zero"));
  assert.ok(codes(one({ "Recipient Name": "" })).includes("recipient-name"));
  assert.ok(codes(one({ "Recipient Name": "A".repeat(41) })).includes("name-length"));
  assert.ok(codes(one({ "Recipient Name": "Jo @ Doe" })).includes("name-chars"));
  assert.ok(codes(one({ "Recipient Address": "" })).includes("address"));
});

test("tax year checks and mixed years", () => {
  assert.ok(codes(one({ "Tax Year": "25" })).includes("tax-year"));
  assert.ok(codes(validate(file({}, { "Tax Year": "2024", "Recipient TIN": "412345679" }))).includes("mixed-years"));
});

test("duplicates: identical rows, same TIN, same TIN different names", () => {
  assert.ok(codes(validate(file({}, {}))).includes("dup-row"));
  const c = codes(validate(file({}, { "NEC Box 1 Nonemployee Compensation": "700.00" })));
  assert.ok(c.includes("dup-recipient") && !c.includes("dup-row"));
  assert.ok(codes(validate(file({}, { "Recipient Name": "Other Name", "NEC Box 1 Nonemployee Compensation": "700.00" }))).includes("tin-two-names"));
});

test("header problems: missing column, duplicate, typo", () => {
  const bad = file({}).replace("Recipient ZIP", "Recipient Zipp");
  const r = validate(bad);
  assert.ok(codes(r).includes("missing-column"));
  assert.ok(codes(r).includes("unknown-header"));
  assert.equal(closestColumn("Recipient Zipp"), "Recipient ZIP");
});

test("short rows, totals rows and unterminated quotes", () => {
  assert.ok(codes(validate(file({}) + "1099-NEC,2025\n")).includes("cell-count"));
  assert.ok(codes(validate(file({}) + "Total,,,\n")).includes("total-row"));
  assert.ok(codes(validate('a,"b\nc')).includes("quote"));
  assert.ok(codes(validate("")).includes("empty"));
});

test("record count and total checks use the numbers the filer types", () => {
  const f = file({}, { "Recipient TIN": "412345679", "NEC Box 1 Nonemployee Compensation": "500.00" });
  assert.ok(!codes(validate(f, { expectedRecords: 2, expectedTotal: "1,500.00" })).includes("record-count"));
  assert.ok(!codes(validate(f, { expectedRecords: 2, expectedTotal: "1,500.00" })).includes("total-mismatch"));
  assert.ok(codes(validate(f, { expectedRecords: 3 })).includes("record-count"));
  assert.ok(codes(validate(f, { expectedTotal: "1400" })).includes("total-mismatch"));
  const t = validate(f).summary.totals["1099-NEC|2025"];
  assert.equal(t.records, 2);
  assert.equal(t.sums["NEC Box 1 Nonemployee Compensation"], 1500);
});

test("semicolon files are flagged and repaired", () => {
  const semi = file({}).split("\r\n").map((l) => l.replace(/,/g, ";")).join("\n");
  assert.ok(codes(validate(semi)).includes("delimiter"));
  const r = repair(semi);
  assert.ok(r.changes[0].includes("semicolon"));
  assert.ok(!codes(validate(r.text)).includes("delimiter"));
});

test("repair: strips $ and commas, dashes, pads ZIP, trims, lists every change", () => {
  const f = file({ "Recipient TIN": "412-34-5678", "NEC Box 1 Nonemployee Compensation": "$1,200.00", "Recipient State": "NJ", "Recipient ZIP": "7101", "Recipient City": " Newark " });
  const r = repair(f);
  const out = parseCsv(r.text).rows[1].cells;
  const at = (c) => out[COLUMNS.indexOf(c)];
  assert.equal(at("Recipient TIN"), "412345678");
  assert.equal(at("NEC Box 1 Nonemployee Compensation"), "1200.00");
  assert.equal(at("Recipient ZIP"), "07101");
  assert.equal(at("Recipient City"), "Newark");
  assert.equal(r.changes.length, 4);
});

test("repair never changes a name, an address, an amount's value, or a 4-digit ZIP outside the zero-ZIP states", () => {
  const f = file({ "Recipient Name": "jo  doe #1", "Recipient Address": "2 b st", "NEC Box 1 Nonemployee Compensation": "1200.5", "Recipient ZIP": "7520" });
  const r = repair(f);
  assert.deepEqual(r.changes, []);
  assert.equal(r.text, f);
});

test("repair does not guess at negatives, text amounts or short TINs", () => {
  const f = file({ "NEC Box 1 Nonemployee Compensation": "(5.00)", "Recipient TIN": "12345678" });
  assert.deepEqual(repair(f).changes, []);
});

test("repair refuses a file with no Form Type column and an unterminated quote", () => {
  assert.ok(repair("a,b\n1,2").error);
  assert.ok(repair('a,"b').error);
});

test("findingsCsv round-trips", () => {
  const r = validate(sampleBrokenFile());
  const rows = parseCsv(findingsCsv(r)).rows;
  assert.equal(rows.length, r.findings.length + 1);
});
