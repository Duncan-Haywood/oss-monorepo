import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, sampleDealsFile, findingsCsv, parseCsv, toCsv, classifyDate, decodeBuffer, NOT_CHECKED, REQUIRED } from "./calc.mjs";

const HEAD = "Deal Name,Account Name,Stage,Amount,Closing Date,Probability (%),Lead Source";
const deal = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean samples have no errors or warnings", () => {
  for (const f of [sampleFile(), sampleDealsFile()]) {
    assert.deepEqual(validate(f).findings.filter((x) => x.severity !== "info"), []);
  }
  assert.equal(validate(sampleFile()).summary.records, 3);
  assert.equal(validate(sampleFile()).summary.kind, "leads");
  assert.equal(validate(sampleDealsFile()).summary.kind, "deals");
  assert.equal(validate(sampleDealsFile()).summary.totalValue, 24900);
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /is not a plain number/, /not a number from 0 to 100/, /looks like a fraction/, /scientific notation/, /spells out the month/, /uses dashes or dots/, /mixes day-first/, /appears 2 times/, /Blank row/, /spelled more than one way/, /Deal Name is empty/, /Stage is empty/]) assert.ok(has(r, re), String(re));
});

test("required fields per object", () => {
  assert.deepEqual(REQUIRED.leads, ["last_name", "company"]);
  assert.deepEqual(REQUIRED.deals, ["deal_name", "stage", "closing_date", "amount"]);
  assert.ok(has(validate("First Name,Email\nA,a@b.example\n", { kind: "leads" }), /No Last Name column/, "error"));
  assert.ok(has(validate("Last Name,Email\nB,a@b.example\n", { kind: "leads" }), /No Company column/, "error"));
  assert.ok(!has(validate("Last Name,Email\nB,a@b.example\n", { kind: "contacts" }), /^No /));
  assert.ok(has(validate("Last Name,Company\n,Acme\nB,\n", { kind: "leads" }), /Last Name is empty/, "error"));
  assert.ok(has(validate("Last Name,Company\n,Acme\nB,\n", { kind: "leads" }), /Company is empty/, "error"));
  assert.ok(has(validate("Account Name,Phone\n,1\n", { kind: "accounts" }), /Account Name is empty/, "error"));
  assert.ok(has(validate("Phone\n1\n", { kind: "accounts" }), /No Account Name column/, "error"));
  const d = validate("Deal Name\nA\n", { kind: "deals" });
  for (const c of ["Stage", "Closing Date", "Amount"]) assert.ok(has(d, new RegExp(`No ${c} column`), "error"), c);
  const e = validate(deal(",Acme,Qualification,10,2026-01-02,,", "B,Acme,,,,,"));
  assert.ok(has(e, /Deal Name is empty/, "error"));
  assert.ok(has(e, /Stage is empty/, "error"));
  assert.ok(has(e, /Amount is empty/, "error"));
  assert.ok(has(e, /Closing Date is empty/, "error"));
});

test("amounts with currency symbols and separators", () => {
  const r = validate(deal("A,X,S,$1200,2026-01-02,,", "B,X,S,\"1,200\",2026-01-02,,", "C,X,S,1.200\\,50,2026-01-02,,", "D,X,S,1200.50,2026-01-02,,", "E,X,S,5k,2026-01-02,,"));
  assert.ok(has(r, /Amount "\$1200" is not a plain number/, "error"));
  assert.ok(has(r, /Amount "1,200" is not a plain number/, "error"));
  assert.ok(has(r, /Amount "5k" is not a plain number/, "error"));
  assert.ok(!has(validate(deal("D,X,S,1200.50,2026-01-02,,")), /Amount/));
});

test("probability", () => {
  const r = validate(deal("A,X,S,1,2026-01-02,60,", "B,X,S,1,2026-01-02,0.6,", "C,X,S,1,2026-01-02,150,", "D,X,S,1,2026-01-02,sixty,", "E,X,S,1,2026-01-02,60%,", "F,X,S,1,2026-01-02,0,"));
  assert.ok(has(r, /Probability 0\.6 looks like a fraction/, "warning"));
  assert.equal(r.findings.filter((f) => /not a number from 0 to 100/.test(f.title)).length, 2);
});

test("duplicates: emails, accounts, deals", () => {
  const p = validate("Last Name,Company,Email\nA,X,A@x.example\nB,X,a@X.example\nC,X,c@x.example\n", { kind: "leads" });
  assert.ok(has(p, /appears 2 times/, "warning"));
  assert.equal(p.summary.duplicates, 1);
  assert.ok(has(validate("Account Name\nAcme Ltd\nacme  ltd\nOther\n", { kind: "accounts" }), /Account "Acme Ltd" appears 2 times/));
  assert.ok(has(validate(deal("A,Acme,S,1,2026-01-02,,", "A,Acme,S,1,2026-01-02,,")), /Deal "A" appears 2 times/));
  assert.ok(!has(validate(deal("A,Acme,S,1,2026-01-02,,", "A,Acme,S,2,2026-01-02,,")), /appears/));
});

test("invalid emails, secondary email, and phone Excel damage", () => {
  const r = validate("Last Name,Email,Phone,Mobile\nA,nobody,4.41175E+11,\nB,a@b,'0113,\nC,ok@b.example,44117496012.0,4.4E+10\nD,x@y.example,call me,\n", { kind: "contacts" });
  assert.equal(r.findings.filter((f) => /^Email "/.test(f.title) && f.severity === "error").length, 2);
  assert.equal(r.findings.filter((f) => /scientific notation/.test(f.title) && f.severity === "error").length, 2);
  assert.ok(has(r, /starts with an apostrophe/));
  assert.ok(has(r, /ends in \.0/));
  assert.ok(has(r, /contains letters/));
  assert.ok(has(validate("Last Name,Secondary Email\nA,nope\n", { kind: "contacts" }), /Secondary Email "nope"/, "error"));
});

test("dates: mixed order, unreadable layouts, ambiguity", () => {
  const r = validate(deal("A,X,S,1,03/25/2026,,", "B,X,S,1,25/03/2026,,", "C,X,S,1,March 4 2026,,"));
  assert.ok(has(r, /mixes day-first and month-first/, "error"));
  assert.ok(has(r, /spells out the month/));
  assert.ok(has(validate(deal("A,X,S,1,03/04/2026,,")), /could be read day-first or month-first/, "info"));
  assert.equal(classifyDate("2026-03-04").kind, "ymd");
  assert.equal(classifyDate("31/02/2026").kind, "bad");
});

test("Lead Source and Lead Status are free text: inconsistent spellings warn, values are listed", () => {
  const r = validate("Last Name,Company,Lead Source,Lead Status\nA,X,Web,Open - Not Contacted\nB,X,web,Open - Not Contacted\nC,X,Referral,Contacted\n", { kind: "leads" });
  assert.ok(has(r, /Lead Source is spelled more than one way/, "warning"));
  assert.ok(!has(r, /Lead Status is spelled more than one way/));
  assert.ok(has(r, /2 distinct Lead Status values; not checked/, "info"));
  assert.ok(has(r, /2 distinct Lead Source values; not checked/, "info"));
});

test("headings: aliases, typos, duplicates, custom fields; kind detection", () => {
  const r = validate("Name,Account Name,Stag,Region (custom),Amount,Value\nA,X,S,E,1,2\n", { kind: "deals" });
  assert.ok(has(r, /Heading "Name" is not the field name/));
  assert.ok(has(r, /Heading "Stag" is not a Zoho CRM deal field name/));
  assert.ok(has(r, /Region \(custom\)" matches no standard deal field/, "info"));
  assert.ok(has(r, /appears in two columns/, "warning"));
  assert.equal(validate("Deal Name,Amount\nA,1\n").summary.kind, "deals");
  assert.equal(validate("Last Name,Company,Email\nA,X,a@b.example\n").summary.kind, "leads");
  assert.equal(validate("Last Name,Email\nA,a@b.example\n").summary.kind, "contacts");
  assert.equal(validate("Account Name,Website\nA,a.example\n").summary.kind, "accounts");
  assert.ok(has(validate("last name,e-mail,company\nA,a@b.example,X\n", { kind: "leads" }), /headings? differs? from the field name/));
});

test("zip codes, employee counts and annual revenue", () => {
  const r = validate("Last Name,Company,Zip Code,No. of Employees,Annual Revenue\nA,X,2134,1200,\"$1,000\"\nB,X,02134,25,5000\n", { kind: "leads" });
  assert.ok(has(r, /Zip Code "2134" may have lost a leading zero/, "info"));
  assert.ok(has(r, /No\. of Employees "1200"/) === false);
  assert.ok(has(r, /Annual Revenue "\$1,000" is not a plain number/, "error"));
  assert.ok(has(validate("Last Name,Company,No. of Employees\nA,X,1,200\nB,X,250+\n", { kind: "leads" }), /No\. of Employees "250\+" is not a whole number/, "error"));
});

test("structure: empty, unterminated quote, ragged rows, limits, encoding, semicolons", () => {
  assert.ok(has(validate(""), /file is empty/, "error"));
  assert.ok(has(validate('Deal Name,Amount\n"B,1\n'), /never closed/, "error"));
  assert.ok(has(validate("Deal Name,Amount\nB,1,extra\n", { kind: "deals" }), /cells, the header has/, "error"));
  assert.ok(has(validate("Deal Name,Amount\nB,1\nD,2\n", { kind: "deals", rowLimit: 1 }), /The file has 2 rows/, "warning"));
  assert.ok(has(validate("Last Name\nMÃ¼ller\n", { kind: "contacts" }), /mis-decoded/));
  assert.ok(has(validate("Last Name;Email\nA;a@b.example\n", { kind: "contacts" }), /semicolon/, "warning"));
  assert.equal(decodeBuffer(new TextEncoder().encode("é")), "é");
});

test("the size and row warnings say they are read from memory", () => {
  const r = validate("Deal Name,Amount\nB,1\nD,2\n", { kind: "deals", rowLimit: 1 });
  assert.match(r.findings.find((f) => /The file has 2 rows/.test(f.title)).detail, /from memory/);
});

test("repair changes formatting only and lists each change", () => {
  const fix = repair(sampleBrokenFile());
  assert.ok(fix.changes.length >= 3);
  const out = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.equal(out[0][0], "Deal Name");
  assert.ok(out.every((r) => r.length === out[0].length));
  assert.ok(fix.text.includes('"$12,000"'), "amounts are left alone");
  assert.ok(fix.text.includes("March 4, 2026"), "dates are left alone");
  assert.ok(fix.text.includes(",web,") && fix.text.includes("WEB"), "picklist values are left alone");
  assert.ok(fix.changes.some((c) => /Separator semicolon → comma/.test(c)));
  assert.ok(fix.changes.some((c) => /blank row removed/.test(c)));
  assert.ok(repair('a,b\n"x').error);
  const e = repair("Last Name,E-mail,Phone\n Okafor ,mailto:Maya@Example.com,'0117\nB,c@d.example,44117.0\n", { kind: "contacts" });
  assert.ok(e.text.includes("Okafor,maya@example.com,0117"));
  assert.ok(e.text.includes("44117\r\n"));
  assert.ok(e.changes.some((c) => /heading "E-mail" → "Email"/.test(c)));
});

test("findings CSV and NOT_CHECKED travel with the result", () => {
  const r = validate(sampleBrokenFile());
  assert.deepEqual(r.notChecked, NOT_CHECKED);
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a,b", 'c"d']]), '"a,b","c""d"\r\n');
});
