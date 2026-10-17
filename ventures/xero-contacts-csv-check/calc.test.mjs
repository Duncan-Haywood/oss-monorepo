import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, splitContacts, sampleFile, sampleBrokenFile, findingsCsv, parseCsv, toCsv, decodeBuffer, COLUMNS } from "./calc.mjs";

const HEAD = "*ContactName,EmailAddress,PhoneNumber,Discount,DueDateBillDay,DueDateBillTerm";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean sample has no errors or warnings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(r.summary.contacts, 3);
  assert.equal(r.summary.withEmail, 2);
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /Unknown column "Websit"/, /scientific notation/, /more than one address/, /spelled 2 ways/, /Discount 150/, /DueDateBillDay 45/, /not a term/, /mailto/, /does not look like an address/, /four digits for a US/, /appears 2 times/]) assert.ok(has(r, re), String(re));
});

test("typo heading names the column it looks like", () => {
  const r = validate("*ContactName,EmailAdress\nA,a@b.example\n");
  assert.match(r.findings.find((f) => /Unknown column/.test(f.title)).detail, /EmailAddress/);
});

test("missing and duplicated columns are errors", () => {
  assert.ok(has(validate("Name,EmailAddress\nA,a@b.example\n"), /Required column "\*ContactName" is missing/, "error"));
  assert.ok(has(validate("*ContactName,EmailAddress,EmailAddress\nA,a@b.example,a@b.example\n"), /appears twice/, "error"));
});

test("empty and over-long contact names", () => {
  const r = validate(file(",x@y.example,,,,", `${"A".repeat(256)},,,,,`));
  assert.ok(has(r, /ContactName is empty/, "error"));
  assert.ok(has(r, /256 characters/, "error"));
});

test("names that differ only by case or spacing collide", () => {
  const r = validate(file("Acme Ltd,,,,,", "ACME  ltd,,,,,"));
  assert.ok(has(r, /spelled 2 ways/, "error"));
});

test("identical rows are a copy warning, not a second name error", () => {
  const r = validate(file("Acme Ltd,a@b.example,,,,", "Acme Ltd,a@b.example,,,,"));
  assert.ok(has(r, /Exact copy/, "warning"));
  assert.ok(!has(r, /appears 2 times/));
  assert.equal(r.summary.duplicates, 1);
});

test("same name with different details is an error", () => {
  const r = validate(file("Acme Ltd,a@b.example,,,,", "Acme Ltd,c@d.example,,,,"));
  assert.ok(has(r, /Contact name "Acme Ltd" appears 2 times/, "error"));
});

test("email problems", () => {
  const r = validate(file("A,a@b,,,,", "B,\"a@b.example, c@d.example\",,,,", "C,mailto:c@d.example,,,,", "D,fine@d.example,,,,"));
  assert.ok(has(r, /does not look like/));
  assert.ok(has(r, /more than one address/, "error"));
  assert.ok(has(r, /mailto/));
  assert.ok(!r.findings.some((f) => /fine@d/.test(f.title)));
});

test("shared email is only a note", () => {
  const r = validate(file("A,x@y.example,,,,", "B,X@y.example,,,,"));
  assert.ok(has(r, /is on 2 contacts/, "info"));
});

test("scientific notation in phone and bank columns", () => {
  const r = validate("*ContactName,PhoneNumber,BankAccountNumber\nA,4.41175E+11,1.2E+9\n");
  assert.equal(r.findings.filter((f) => /scientific/.test(f.title)).length, 2);
});

test("postcode that lost its zero", () => {
  const r = validate("*ContactName,POPostalCode,POCountry\nA,2108,US\nB,2108,France\n");
  assert.equal(r.findings.filter((f) => /four digits for a US/.test(f.title)).length, 1);
});

test("payment term fields", () => {
  const r = validate(file("A,,,,30,", "B,,,,40,OFFOLLOWINGMONTH", "C,,,,10,daysafterbilldate", "D,,,,x,OFCURRENTMONTH"));
  assert.ok(has(r, /a day but no term/));
  assert.ok(has(r, /above 31/, "error"));
  assert.ok(has(r, /not in capitals/));
  assert.ok(has(r, /not a whole number/, "error"));
});

test("discount forms", () => {
  const r = validate(file("A,,,10%,,", "B,,,0.15,,", "C,,,abc,,", "D,,,101,,"));
  assert.ok(has(r, /carries a % sign/));
  assert.ok(has(r, /may be a fraction/, "info"));
  assert.ok(has(r, /not a percentage/, "error"));
  assert.ok(has(r, /above 100/, "error"));
});

test("wrong cell counts, quotes and excel errors", () => {
  assert.ok(has(validate(file("A,b,,,,,,")), /has 8 cells/));
  assert.ok(has(validate(file("\"A,,,,,")), /never closed/, "error"));
  assert.ok(has(validate(file("#REF!,,,,,")), /Spreadsheet error/, "error"));
});

test("formula characters and email-as-name", () => {
  const r = validate(file("=SUM(A1),,,,,", "bob@x.example,,,,,", "-5 Club,,,,,", "-Dash Co,,,,,"));
  assert.equal(r.findings.filter((f) => /formula character/.test(f.title)).length, 2);
  assert.ok(has(r, /is an email address/));
});

test("empty input and header only", () => {
  assert.ok(has(validate(""), /empty/, "error"));
  assert.ok(has(validate(HEAD + "\n"), /no contacts/, "error"));
});

test("repair cleans only what has one reading and lists it", () => {
  const f = file(" Acme Ltd ,mailto:a@b.example,0113 496 0456,10%,30,DAYSAFTERBILLDATE", "Acme Ltd,mailto:a@b.example,0113 496 0456,10%,30,DAYSAFTERBILLDATE");
  const r = repair(f);
  assert.equal(r.error, "");
  assert.ok(r.changes.some((c) => /Exact duplicate rows removed \(1\)/.test(c)));
  const rows = parseCsv(r.text).rows.map((x) => x.cells);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ["Acme Ltd", "a@b.example", "0113 496 0456", "10", "30", "DAYSAFTERBILLDATE"]);
});

test("repair never touches phone digits, postcodes or names", () => {
  const f = "*ContactName,PhoneNumber,POPostalCode\nAcme,4.41175E+11,2108\n";
  const rows = parseCsv(repair(f).text).rows.map((x) => x.cells);
  assert.deepEqual(rows[1], ["Acme", "4.41175E+11", "2108"]);
});

test("repair rewrites semicolons and heading spelling, and refuses an unclosed quote", () => {
  const r = repair("ContactName;EmailAddress\nA;a@b.example\n");
  assert.ok(r.text.startsWith("*ContactName,EmailAddress"));
  assert.match(r.changes.join("|"), /Separator semicolon/);
  assert.match(repair("*ContactName\n\"A\n").error, /never closed/);
  assert.match(repair("").error, /empty/);
});

test("a repaired broken sample has fewer warnings than the original", () => {
  const n = (text) => validate(text).findings.filter((f) => f.severity === "warning").length;
  assert.ok(n(repair(sampleBrokenFile()).text) < n(sampleBrokenFile()));
});

test("splitContacts keeps the heading on every part", () => {
  const rows = Array.from({ length: 5 }, (_, i) => `C${i},,,,,`);
  const r = splitContacts(file(...rows), 2);
  assert.deepEqual(r.parts.map((p) => p.contacts), [2, 2, 1]);
  for (const p of r.parts) assert.ok(p.text.startsWith(HEAD));
  assert.match(splitContacts("").error, /Nothing/);
});

test("csv round trip, findings csv and decode", () => {
  const rows = [["a", "b,c", 'd"e']];
  assert.deepEqual(parseCsv(toCsv(rows)).rows[0].cells, rows[0]);
  assert.match(findingsCsv(validate("")), /^severity,line,title,detail/);
  assert.equal(decodeBuffer(new TextEncoder().encode("Müller")), "Müller");
  assert.ok(COLUMNS.includes("*ContactName"));
});
