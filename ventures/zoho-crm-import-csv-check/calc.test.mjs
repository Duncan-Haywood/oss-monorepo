import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, sampleDealsFile, findingsCsv, parseCsv, toCsv, classifyDate, decodeBuffer, NOT_CHECKED } from "./calc.mjs";

const HEAD = "Deal Name,Account Name,Stage,Amount,Closing Date,Probability (%),Currency";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean samples have no errors or warnings", () => {
  for (const f of [sampleFile(), sampleDealsFile()]) {
    assert.deepEqual(validate(f).findings.filter((x) => x.severity !== "info"), []);
  }
  assert.equal(validate(sampleFile()).summary.records, 3);
  assert.equal(validate(sampleFile()).summary.kind, "leads");
  assert.equal(validate(sampleDealsFile()).summary.kind, "deals");
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /is not a plain number/, /Stage is empty/, /3-letter code/, /not a number from 0 to 100/, /looks like a fraction/, /scientific notation/, /spells out the month/, /uses dashes or dots/, /mixes day-first/, /appears 2 times/, /Blank row/, /lower case/]) assert.ok(has(r, re), String(re));
});

test("required fields depend on the module", () => {
  assert.ok(has(validate("Last Name,First Name\nA,B\n", { kind: "leads" }), /No Company column/, "error"));
  assert.ok(!has(validate("Last Name,First Name\nA,B\n", { kind: "contacts" }), /No .* column/));
  assert.ok(has(validate("First Name,Company\nA,B\n", { kind: "leads" }), /No Last Name column/, "error"));
  assert.ok(has(validate("Last Name,Company\n,Acme\nB,\n", { kind: "leads" }), /Last Name is empty/, "error"));
  assert.ok(has(validate("Last Name,Company\n,Acme\nB,\n", { kind: "leads" }), /Company is empty/, "error"));
  assert.ok(has(validate("Phone\n1\n", { kind: "accounts" }), /No Account Name column/, "error"));
  assert.ok(has(validate("Deal Name,Amount\nA,1\n", { kind: "deals" }), /No Stage column/, "error"));
  assert.ok(has(validate("Deal Name,Amount\nA,1\n", { kind: "deals" }), /No Closing Date column/, "error"));
  assert.ok(has(validate(file("A,Acme,,100,2026-01-02,50,USD")), /Stage is empty/, "error"));
  assert.ok(has(validate(file(",Acme,Qualification,100,2026-01-02,50,USD")), /Deal Name is empty/, "error"));
  assert.ok(has(validate(file("A,Acme,Qualification,100,,50,USD")), /Closing Date is empty/, "error"));
});

test("kind detection", () => {
  assert.equal(validate("Last Name,Company,Email\nA,B,a@b.example\n").summary.kind, "leads");
  assert.equal(validate("Last Name,Account Name,Email\nA,B,a@b.example\n").summary.kind, "contacts");
  assert.equal(validate("Account Name,Website\nA,a.example\n").summary.kind, "accounts");
  assert.equal(validate("Deal Name,Stage\nA,B\n").summary.kind, "deals");
});

test("amount and currency", () => {
  const r = validate(file("A,Acme,S,$1200,2026-01-02,,USD", "B,Acme,S,1.200,50,2026-01-02,,EUR", "C,Acme,S,500,2026-01-02,,US dollars", "D,Acme,S,1200.50,2026-01-02,,gbp"));
  assert.ok(has(r, /Amount "\$1200" is not a plain number/, "error"));
  assert.ok(has(r, /Currency "US dollars" is not a 3-letter code/, "error"));
  assert.ok(has(r, /Currency "gbp" is lower case/, "info"));
  assert.ok(!has(validate(file("D,Acme,S,1200.50,2026-01-02,,GBP")), /Amount|Currency/));
  assert.ok(has(validate(file("A,Acme,S,1,2026-01-02,,USD", "B,Acme,S,1,2026-01-02,,EUR")), /2 currencies in one file/, "info"));
});

test("probability", () => {
  const r = validate(file("A,x,S,1,2026-01-02,60,", "B,x,S,1,2026-01-02,0.6,", "C,x,S,1,2026-01-02,150,", "D,x,S,1,2026-01-02,sixty,", "E,x,S,1,2026-01-02,60%,", "F,x,S,1,2026-01-02,0,"));
  assert.ok(has(r, /Probability 0\.6 looks like a fraction/, "warning"));
  assert.equal(r.findings.filter((f) => /not a number from 0 to 100/.test(f.title)).length, 2);
});

test("duplicates: emails, accounts, deals", () => {
  const p = validate("Last Name,Company,Email\nA,X,A@x.example\nB,X,a@X.example\nC,X,c@x.example\n", { kind: "leads" });
  assert.ok(has(p, /appears 2 times/, "warning"));
  assert.equal(p.summary.duplicates, 1);
  assert.ok(has(validate("Account Name\nAcme Ltd\nacme  ltd\nOther\n", { kind: "accounts" }), /Account "Acme Ltd" appears 2 times/));
  assert.ok(has(validate(file("A,Acme,S,1,2026-01-02,,", "A,Acme,S,1,2026-01-02,,")), /Deal "A" appears 2 times/));
  assert.ok(!has(validate(file("A,Acme,S,1,2026-01-02,,", "A,Acme,S,2,2026-01-02,,")), /appears/));
});

test("invalid emails, secondary email, phone and ZIP damage", () => {
  const r = validate("Last Name,Company,Email,Secondary Email,Phone,Mobile,Zip Code\nA,X,nobody,ok@x.example,4.41175E+11,'0113,02134\nB,X,a@b.example,bad@,44117496012.0,call me,2134\n", { kind: "leads" });
  assert.ok(has(r, /^Email "nobody"/, "error"));
  assert.ok(has(r, /^Secondary Email "bad@"/, "error"));
  assert.ok(has(r, /scientific notation/, "error"));
  assert.ok(has(r, /starts with an apostrophe/));
  assert.ok(has(r, /ends in \.0/));
  assert.ok(has(r, /contains letters/));
  assert.ok(has(r, /Zip Code "2134" has four digits/, "info"));
  assert.ok(!has(r, /Zip Code "02134"/));
});

test("employee counts and field lengths", () => {
  const r = validate(`Last Name,Company,No. of Employees\n${"x".repeat(81)},Acme,50+\n`, { kind: "leads" });
  assert.ok(has(r, /No\. of Employees "50\+" is not a whole number/, "error"));
  assert.ok(has(r, /Last Name is 81 characters/, "warning"));
});

test("dates: mixed order, unreadable layouts, ambiguity", () => {
  const r = validate(file("A,x,S,1,03/25/2026,,", "B,x,S,1,25/03/2026,,", "C,x,S,1,March 4 2026,,"));
  assert.ok(has(r, /mixes day-first and month-first/, "error"));
  assert.ok(has(r, /spells out the month/));
  assert.ok(has(validate(file("A,x,S,1,03/04/2026,,")), /could be read day-first or month-first/, "info"));
  assert.ok(has(validate("Last Name,Account Name,Date of Birth\nA,B,1985-02-30\n", { kind: "contacts" }), /not a real calendar date/, "error"));
  assert.equal(classifyDate("2026-03-04").kind, "ymd");
  assert.equal(classifyDate("31/02/2026").kind, "bad");
});

test("headings: aliases, typos, spelling, duplicates, custom fields", () => {
  const r = validate("Surname,Company Name,Compny,Region (custom),Last Name,E-mail\nA,B,C,E,F,g@h.example\n", { kind: "leads" });
  assert.ok(has(r, /Heading "Surname" is not the field name/));
  assert.ok(has(r, /Heading "Compny" is not a Zoho CRM lead field name/));
  assert.ok(has(r, /Region \(custom\)" matches no standard lead field/, "info"));
  assert.ok(has(r, /appears in two columns/, "warning"));
  assert.ok(has(r, /heading differs from the field name/, "info"));
});

test("structure: empty, unterminated quote, ragged rows, limits, encoding", () => {
  assert.ok(has(validate(""), /file is empty/, "error"));
  assert.ok(has(validate('Last Name,Company\n"B,1\n'), /never closed/, "error"));
  assert.ok(has(validate("Last Name,Company\nB,1,extra\n", { kind: "leads" }), /cells, the header has/, "error"));
  assert.ok(has(validate("Last Name,Company\nB,1\nD,2\n", { kind: "leads", rowLimit: 1 }), /The file has 2 rows/, "warning"));
  assert.ok(has(validate("Last Name,Company\nMÃ¼ller,X\n", { kind: "leads" }), /mis-decoded/));
  assert.equal(decodeBuffer(new TextEncoder().encode("é")), "é");
});

test("repair changes formatting only and lists each change", () => {
  const fix = repair(sampleBrokenFile());
  assert.ok(fix.changes.length >= 4);
  const out = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.equal(out[0][0], "Deal Name");
  assert.ok(out.every((r) => r.length === out[0].length));
  assert.ok(fix.text.includes('"$12,000"'), "amounts are left alone");
  assert.ok(fix.text.includes("March 4, 2026"), "dates are left alone");
  assert.ok(fix.text.includes("USD") && !fix.text.includes("usd"));
  assert.ok(repair('a,b\n"x').error);
  assert.ok(repair("Last_Name,Company,Email\nA,B,MAILTO:X@Y.EXAMPLE\n", { kind: "leads" }).text.includes("Last Name,Company,Email\r\nA,B,x@y.example"));
});

test("findings CSV and NOT_CHECKED travel with the result", () => {
  const r = validate(sampleBrokenFile());
  assert.deepEqual(r.notChecked, NOT_CHECKED);
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a,b", 'c"d']]), '"a,b","c""d"\r\n');
});
