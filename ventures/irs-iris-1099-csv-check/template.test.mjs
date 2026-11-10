// The IRS IRIS template layout (TEMPLATE_NEC / TEMPLATE_MISC), added 2026-11-10. Column names are
// cross-checked in open-source copies of the template (calc.mjs, note above TEMPLATE_NEC), not on irs.gov.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, toCsv, parseCsv, sampleFile, sampleLegacyFile, sampleLegacyBrokenFile, TEMPLATE_NEC, TEMPLATE_MISC, isTemplateHeader } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const base = { "Form Type": "1099-NEC", "Tax Year": "2025", "Payer TIN Type": "EIN", "Payer Taxpayer ID Number": "123456780", "Payer Name Type": "B",
  "Payer Business or Entity Name Line 1": "Acme", "Payer Country": "US", "Payer Address Line 1": "1 A St", "Payer City/Town": "Austin", "Payer State/Province/Territory": "TX",
  "Payer ZIP/Postal Code": "78701", "Recipient TIN Type": "SSN", "Recipient Taxpayer ID Number": "412345678", "Recipient Name Type": "I", "Recipient First Name": "Jo",
  "Recipient Last Name (Surname)": "Doe", "Recipient Country": "US", "Recipient Address Line 1": "2 B St", "Recipient City/Town": "Dallas",
  "Recipient State/Province/Territory": "TX", "Recipient ZIP/Postal Code": "75201", "Box 1 - Nonemployee Compensation": "1000.00" };
const file = (cols, ...os) => toCsv([cols, ...os.map((o) => cols.map((c) => ({ ...base, ...o })[c] ?? ""))]);
const nec = (...os) => validate(file(TEMPLATE_NEC, ...os));
const loud = (r) => r.findings.filter((f) => f.severity !== "info").map((f) => f.code);

test("the template has the column counts the guidelines give: A-BB (54) and A-BL (64)", () => {
  assert.equal(TEMPLATE_NEC.length, 54);
  assert.equal(TEMPLATE_MISC.length, 64);
  assert.equal(TEMPLATE_NEC[37], "Box 1 - Nonemployee Compensation"); // column AL
});

test("a clean template row raises nothing; the old layout is still read", () => {
  const r = nec({});
  assert.deepEqual(loud(r), []);
  assert.equal(r.summary.layout, "iris-template");
  assert.equal(r.summary.recipients[0].name, "Jo Doe");
  assert.equal(validate(sampleLegacyFile()).summary.layout, "legacy");
  assert.deepEqual(loud(validate(sampleLegacyFile())), []);
  assert.ok(codes(validate(sampleLegacyBrokenFile())).includes("recipient-ssn"));
});

test("before this change a correct template file failed with ten missing columns", () => {
  // The old checker's REQUIRED list is not asked of a template file any more.
  assert.ok(!codes(validate(sampleFile())).includes("missing-column"));
  assert.ok(isTemplateHeader(TEMPLATE_NEC) && isTemplateHeader(TEMPLATE_MISC));
});

test("spellings the sources differ on are accepted without a warning", () => {
  const cols = TEMPLATE_NEC.map((c) => c.replace(" (Surname)", "")).map((c) => (c === "Form Type" || c === "Tax Year" ? c + "*" : c));
  const rows = parseCsv(file(TEMPLATE_NEC, {})).rows.map((x) => x.cells);
  rows[0] = cols;
  const r2 = validate(toCsv(rows));
  assert.deepEqual(loud(r2), []);
});

test("name type: B needs the business line, I needs first and last", () => {
  assert.ok(codes(nec({ "Recipient Name Type": "B" })).includes("name-type"));
  assert.ok(codes(nec({ "Recipient Last Name (Surname)": "" })).includes("name-type"));
  assert.ok(codes(nec({ "Recipient Name Type": "" })).includes("name-type"));
  assert.ok(codes(nec({ "Recipient Name Type": "Z" })).includes("name-type"));
  const biz = nec({ "Recipient Name Type": "B", "Recipient First Name": "", "Recipient Last Name (Surname)": "", "Recipient Business or Entity Name Line 1": "Blue Door LLC" });
  assert.deepEqual(loud(biz), []);
  assert.equal(biz.summary.recipients[0].name, "Blue Door LLC");
});

test("TIN types are required in the template", () => {
  assert.ok(codes(nec({ "Recipient TIN Type": "" })).includes("tin-type"));
  assert.ok(codes(nec({ "Payer TIN Type": "" })).includes("payer-tin-type"));
});

test("findings name the template's columns, not the old ones", () => {
  const r = nec({ "Recipient Taxpayer ID Number": "666123456", "Recipient ZIP/Postal Code": "" });
  const text = r.findings.map((f) => f.title + " " + f.detail).join("\n");
  assert.match(text, /Recipient Taxpayer ID Number starts with 666/);
  assert.match(text, /Recipient ZIP\/Postal Code is blank/);
  assert.doesNotMatch(text, /Recipient TIN starts/);
});

test("a missing template column warns; a missing core column is an error", () => {
  const cols = TEMPLATE_NEC.filter((c) => c !== "Office Code" && c !== "Recipient City/Town");
  const c = codes(validate(file(cols, {})));
  assert.ok(c.includes("template-columns"));
  assert.ok(c.includes("missing-column"));
});

test("1099-MISC template: rents read, NEC box flagged, and mixing forms in one file is an error", () => {
  const misc = { "Form Type": "1099-MISC", "Box 1 - Nonemployee Compensation": "", "Box 1 - Rents": "9600.00", "FATCA Filing Requirements": "N" };
  const r = validate(file(TEMPLATE_MISC, misc));
  assert.deepEqual(loud(r), []);
  assert.equal(r.summary.recipients[0].amount, 9600);
  assert.ok(codes(validate(file(TEMPLATE_NEC, {}, { "Form Type": "1099-MISC" }))).includes("template-mixed"));
  assert.ok(codes(validate(file([...TEMPLATE_NEC, "Box 1 - Rents"], {}))).includes("template-mixed"));
});

test("a foreign recipient is not held to US state and ZIP rules", () => {
  const r = nec({ "Recipient Country": "CA", "Recipient State/Province/Territory": "ON", "Recipient ZIP/Postal Code": "M5V 2T6" });
  assert.deepEqual(loud(r).filter((c) => c === "state" || c === "zip"), []);
});

test("check-box columns take yes or no; State 1 is a state code", () => {
  assert.ok(codes(nec({ "2nd TIN Notice": "maybe" })).includes("flag-value"));
  assert.ok(codes(nec({ "State 1": "Texas" })).includes("state"));
});

test("more than 100 records warns", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ "Recipient Taxpayer ID Number": String(412345000 + i).padStart(9, "0") }));
  assert.ok(codes(nec(...rows)).includes("record-limit"));
  assert.ok(!codes(nec(...rows.slice(0, 100))).includes("record-limit"));
});

test("safe fixes rename to the template's spelling and keep its labels", () => {
  const cols = TEMPLATE_NEC.map((c) => (c === "Recipient City/Town" ? "recipient city/town" : c));
  const rows = parseCsv(file(TEMPLATE_NEC, { "Recipient Taxpayer ID Number": "412-34-5678", "State 1": "tx" })).rows.map((x) => x.cells);
  rows[0] = cols;
  const out = repair(toCsv(rows));
  assert.ok(out.changes.some((c) => c.includes('renamed header "recipient city/town" to "Recipient City/Town"')));
  assert.ok(out.changes.some((c) => c.startsWith("Line 2: Recipient Taxpayer ID Number")));
  assert.ok(out.changes.some((c) => c.startsWith("Line 2: State 1")));
  assert.deepEqual(loud(validate(out.text)), []);
});
