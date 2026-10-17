import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, sampleDealsFile, findingsCsv, parseCsv, toCsv, classifyDate, decodeBuffer, NOT_CHECKED, DEAL_STATUS } from "./calc.mjs";

const HEAD = "Title,Value,Currency,Stage,Status,Expected Close Date,Account";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean samples have no errors or warnings", () => {
  for (const f of [sampleFile(), sampleDealsFile()]) {
    assert.deepEqual(validate(f).findings.filter((x) => x.severity !== "info"), []);
  }
  assert.equal(validate(sampleFile()).summary.records, 3);
  assert.equal(validate(sampleFile()).summary.kind, "contacts");
  assert.equal(validate(sampleDealsFile()).summary.kind, "deals");
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /is not a plain number/, /3-letter code/, /scientific notation/, /spells out the month/, /uses dashes or dots/, /mixes day-first/, /appears 2 times/, /Blank row/, /is not Open, Won or Lost/, /lower case/, /differs from "Open"/]) assert.ok(has(r, re), String(re));
});

test("deal status is Open, Won or Lost; stage names are only listed", () => {
  for (const v of DEAL_STATUS) assert.ok(!has(validate(file(`A,1,USD,S,${v},,`)), /Status/), v);
  const r = validate(file("A,1,USD,Anything Goes,won,,", "B,1,USD,S,Closed,,"));
  assert.ok(has(r, /Status "won" differs from "Won"/, "info"));
  assert.ok(has(r, /Status "Closed" is not Open, Won or Lost/, "warning"));
  assert.ok(has(r, /2 distinct stage names/, "info"));
  assert.ok(!r.findings.some((f) => /Stage/.test(f.title) && f.severity !== "info"), "a stage name is never an error");
});

test("value and currency", () => {
  const r = validate(file("A,$1200,USD,S,Open,,", 'B,"1,200",usd,S,Open,,', "C,1.200;50,EUR,S,Open,,", "D,1200.50,GBP,S,Open,,", "E,500,US dollars,S,Open,,"));
  assert.ok(has(r, /Value "\$1200" is not a plain number/, "error"));
  assert.ok(has(r, /Currency "US dollars" is not a 3-letter code/, "error"));
  assert.ok(!has(validate(file("D,1200.50,GBP,S,Open,,")), /Value|Currency/));
  assert.ok(has(validate(file("A,1,USD,S,Open,,", "B,1,EUR,S,Open,,")), /2 currencies in one file/, "info"));
});

test("an email is required on a contact, and must be valid and unique", () => {
  assert.ok(has(validate("First Name,Last Name\nA,B\n", { kind: "contacts" }), /No Email column/, "error"));
  assert.ok(has(validate("Email,First Name\n,Ana\nb@x.example,Bo\n", { kind: "contacts" }), /Email is empty/, "error"));
  const p = validate("Email\nA@x.example\na@X.example\nc@x.example\nnobody\nb@c\n", { kind: "contacts" });
  assert.ok(has(p, /appears 2 times/, "warning"));
  assert.equal(p.summary.duplicates, 1);
  assert.equal(p.findings.filter((f) => /^Email "/.test(f.title) && f.severity === "error").length, 2);
  assert.ok(has(validate("Email\nmailto:a@x.example\n", { kind: "contacts" }), /starts with mailto/, "warning"));
});

test("accounts and deals need a name; duplicates are reported", () => {
  assert.ok(has(validate("Website\nexample.com\n", { kind: "accounts" }), /No Account Name column/, "error"));
  assert.ok(has(validate("Account Name,Website\n,example.com\n", { kind: "accounts" }), /Account Name is empty/, "error"));
  assert.ok(has(validate("Account Name\nAcme Ltd\nacme  ltd\nOther\n", { kind: "accounts" }), /Organization "Acme Ltd" appears 2 times/));
  assert.ok(has(validate("Value\n1\n", { kind: "deals" }), /No Title column/, "error"));
  assert.ok(has(validate(file(",1,USD,S,Open,,")), /Title is empty/, "error"));
  assert.ok(has(validate(file("A,1,USD,S,Open,,Acme", "A,1,USD,S,Open,,Acme")), /Deal "A" appears 2 times/));
  assert.ok(!has(validate(file("A,1,USD,S,Open,,Acme", "A,2,USD,S,Open,,Acme")), /appears/));
});

test("tags", () => {
  assert.ok(has(validate("Email,Tags\na@x.example,vip;wholesale\n", { kind: "contacts" }), /separated by semicolons/, "warning"));
  assert.ok(has(validate("Email,Tags\na@x.example,vip|wholesale\n", { kind: "contacts" }), /separated by pipes/, "warning"));
  assert.ok(!has(validate('Email,Tags\na@x.example,"vip,wholesale"\n', { kind: "contacts" }), /Tags/));
});

test("phone damage", () => {
  const r = validate("Email,Phone\na@b.example,4.41175E+11\nb@b.example,'0113\nc@b.example,44117496012.0\nd@y.example,call me\n", { kind: "contacts" });
  assert.ok(has(r, /scientific notation/, "error"));
  assert.ok(has(r, /starts with an apostrophe/));
  assert.ok(has(r, /ends in \.0/));
  assert.ok(has(r, /contains letters/));
});

test("dates: mixed order, unreadable layouts, ambiguity", () => {
  const r = validate(file("A,1,USD,S,Open,03/25/2026,", "B,1,USD,S,Open,25/03/2026,", "C,1,USD,S,Open,March 4 2026,"));
  assert.ok(has(r, /mixes day-first and month-first/, "error"));
  assert.ok(has(r, /spells out the month/));
  assert.ok(has(validate(file("A,1,USD,S,Open,03/04/2026,")), /could be read day-first or month-first/, "info"));
  assert.equal(classifyDate("2026-03-04").kind, "ymd");
  assert.equal(classifyDate("31/02/2026").kind, "bad");
});

test("headings: aliases, typos, duplicates, custom fields; kind detection", () => {
  const r = validate("Opportunity,Value,Stag,Region (custom),Price\nA,1,S,E,2\n", { kind: "deals" });
  assert.ok(has(r, /Heading "Opportunity" is not the field name/));
  assert.ok(has(r, /Heading "Stag" is not an ActiveCampaign deal field name/));
  assert.ok(has(r, /Region \(custom\)" matches no standard deal field/, "info"));
  assert.ok(has(r, /appears in two columns/, "warning"));
  assert.equal(validate("Title,Value,Status\nA,1,Open\n").summary.kind, "deals");
  assert.equal(validate("Email,First Name\na@b.example,A\n").summary.kind, "contacts");
  assert.equal(validate("Account Name,Website\nA,example.com\n").summary.kind, "accounts");
});

test("structure: empty, unterminated quote, ragged rows, limits, encoding", () => {
  assert.ok(has(validate(""), /file is empty/, "error"));
  assert.ok(has(validate('Email,Tags\n"b@x.example,1\n'), /never closed/, "error"));
  assert.ok(has(validate("Email,Tags\nb@x.example,1,extra\n", { kind: "contacts" }), /cells, the header has/, "error"));
  assert.ok(has(validate("Email\nb@x.example\nd@x.example\n", { kind: "contacts", rowLimit: 1 }), /The file has 2 rows/, "warning"));
  assert.ok(has(validate("Email,Last Name\na@b.example,MÃ¼ller\n", { kind: "contacts" }), /mis-decoded/));
  assert.equal(decodeBuffer(new TextEncoder().encode("é")), "é");
});

test("repair changes formatting only and lists each change", () => {
  const fix = repair(sampleBrokenFile());
  assert.ok(fix.changes.length >= 3);
  const out = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.equal(out[0][0], "Title");
  assert.ok(out.every((r) => r.length === out[0].length));
  assert.ok(fix.text.includes('"$12,000"'), "values are left alone");
  assert.ok(fix.text.includes("Won it"), "statuses with no single reading are left alone");
  assert.ok(fix.text.includes("March 4, 2026"), "dates are left alone");
  assert.ok(fix.text.includes("USD") && !fix.text.includes("usd"));
  assert.ok(repair('a,b\n"x').error);
  assert.ok(repair("Title,Status\nA,won\n", { kind: "deals" }).text.includes("A,Won"));
  assert.ok(repair("Email\nMAYA@X.EXAMPLE\n", { kind: "contacts" }).text.includes("maya@x.example"));
});

test("findings CSV and NOT_CHECKED travel with the result", () => {
  const r = validate(sampleBrokenFile());
  assert.deepEqual(r.notChecked, NOT_CHECKED);
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a,b", 'c"d']]), '"a,b","c""d"\r\n');
});
