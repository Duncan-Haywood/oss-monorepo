import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, sampleCompaniesFile, findingsCsv, parseCsv, toCsv, classifyDate, decodeBuffer, NOT_CHECKED, LIFECYCLE, LEAD_STATUS } from "./calc.mjs";

const HEAD = "Email,First Name,Phone Number,Postal Code,Country/Region,Lifecycle Stage,Lead Status,Create Date";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean samples have no errors or warnings", () => {
  for (const f of [sampleFile(), sampleCompaniesFile()]) {
    assert.deepEqual(validate(f).findings.filter((x) => x.severity !== "info"), []);
  }
  assert.equal(validate(sampleFile()).summary.contacts, 3);
  assert.equal(validate(sampleCompaniesFile()).summary.kind, "companies");
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /scientific notation/, /not a valid address shape/, /not a default lifecycle stage/, /not a default lead status/, /spells out the month/, /uses dashes or dots/, /mixes day-first/, /appears 2 times/, /Blank row/, /starts with mailto/, /is not the internal value/, /ends in \.0/]) assert.ok(has(r, re), String(re));
});

test("duplicate emails are matched ignoring case", () => {
  const r = validate(file("A@x.example,A,,,,,,", "a@X.example,B,,,,,,", "b@x.example,C,,,,,,"));
  assert.ok(has(r, /appears 2 times/, "warning"));
  assert.equal(r.summary.duplicates, 1);
});

test("invalid emails", () => {
  const r = validate(file("nobody,A,,,,,,", "a@b,B,,,,,,", "a b@c.example,C,,,,,,", "a@b.example;c@d.example,D,,,,,,", "Ann <a@b.example>,E,,,,,,", "ok.name+tag@sub.example.co,F,,,,,,"));
  assert.equal(r.findings.filter((f) => /^Email "/.test(f.title) && f.severity === "error").length, 5);
  assert.ok(has(r, /more than one address/));
  assert.ok(has(r, /has no @/));
});

test("scientific notation in phone and zip, and Excel error values", () => {
  const r = validate(file("a@b.example,A,4.41175E+11,1.2E+4,,,,", "b@b.example,B,#REF!,,,,,"));
  assert.equal(r.findings.filter((f) => /scientific/.test(f.title)).length, 2);
  assert.ok(has(r, /Spreadsheet error/, "error"));
});

test("zip codes that lost a leading zero", () => {
  const r = validate(file("a@b.example,A,,2108,US,,,", "b@b.example,B,,2108,France,,,", "c@b.example,C,,2108,,,,", "d@b.example,D,,2108-1234,USA,,,", "e@b.example,E,,12345.0,US,,,"));
  assert.equal(r.findings.filter((f) => /four digits for a US/.test(f.title)).length, 1);
  assert.ok(has(r, /four digits and no country/, "info"));
  assert.ok(has(r, /ZIP\+4 missing/));
  assert.ok(has(r, /ends in \.0/));
  assert.equal(r.findings.filter((f) => /France|2108.*France/.test(f.title)).length, 0);
});

test("phone numbers that lost a leading zero only for countries that use one", () => {
  const r = validate(file("a@b.example,A,1131234567,,United Kingdom,,,", "b@b.example,B,6175550142,,United States,,,", "c@b.example,C,call me,,,,,"));
  assert.equal(r.findings.filter((f) => /no leading zero/.test(f.title)).length, 1);
  assert.ok(has(r, /contains letters/));
});

test("lifecycle stage and lead status internal values", () => {
  for (const v of LIFECYCLE) assert.ok(!has(validate(file(`a@b.example,A,,,,${v},,`)), /Lifecycle/), v);
  for (const v of LEAD_STATUS) assert.ok(!has(validate(file(`a@b.example,A,,,,,${v},`)), /Lead Status/), v);
  const r = validate(file("a@b.example,A,,,,Customer,,", "b@b.example,B,,,,prospect,,", "c@b.example,C,,,,,In progress,", "d@b.example,D,,,,,Qualified,"));
  assert.ok(has(r, /Lifecycle Stage "Customer" is not the internal/, "warning"));
  assert.ok(has(r, /Lifecycle Stage "prospect" is not a default/, "error"));
  assert.ok(has(r, /Lead Status "In progress" is not the internal/, "warning"));
  assert.ok(has(r, /Lead Status "Qualified" is not a default/, "error"));
});

test("date formats", () => {
  assert.equal(classifyDate("03/25/2026").kind, "mdy");
  assert.equal(classifyDate("25/03/2026").kind, "dmy");
  assert.equal(classifyDate("03/04/2026").kind, "ambiguous");
  assert.equal(classifyDate("2026-03-25").kind, "ymd");
  assert.equal(classifyDate("2026/03/25 14:30").kind, "ymd");
  assert.equal(classifyDate("03/25/2026 2:30 PM").kind, "mdy");
  for (const bad of ["Mar 4, 2026", "4.3.2026", "4-3-2026", "3/4/26", "45000", "20260325", "31/02/2026", "13/13/2026", "1711111111"]) assert.equal(classifyDate(bad).kind, "bad", bad);
  const r = validate(file("a@b.example,A,,,,,,03/25/2026", "b@b.example,B,,,,,,25/03/2026", "c@b.example,C,,,,,,Mar 4 2026", "d@b.example,D,,,,,,2026-03-25"));
  assert.ok(has(r, /mixes day-first and month-first/, "error"));
  assert.ok(has(r, /mixes year-first/, "warning"));
  assert.ok(has(r, /spells out the month/, "error"));
  assert.ok(has(validate(file("a@b.example,A,,,,,,03/04/2026")), /could be read day-first or month-first/, "info"));
});

test("unmatched headings: typos, aliases, custom properties", () => {
  const r = validate("Email,Frist Name,Zip Code,Favourite Colour,e-mail\na@b.example,A,02108,blue,a@b.example\n");
  assert.ok(has(r, /"Frist Name" is not a HubSpot property name/, "warning"));
  assert.ok(has(r, /"Zip Code" is not the property label/, "warning"));
  assert.ok(has(r, /"Favourite Colour" matches no default/, "info"));
  assert.ok(has(r, /appears in two columns/, "error"));
});

test("heading in different case or punctuation is a spelling difference that repair fixes", () => {
  const r = validate("EMAIL,FIRST NAME\na@b.example,A\n");
  assert.ok(has(r, /2 headings differ/, "warning"));
  assert.match(repair("EMAIL,FIRST NAME\na@b.example,A\n").text, /^Email,First Name\r\n/);
});

test("internal names are accepted as headings", () => {
  const r = validate("email,firstname,hs_lead_status,lifecyclestage,zip\na@b.example,A,NEW,lead,02108\n");
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
});

test("semicolon files and semicolons inside cells", () => {
  const r = validate("Email;First Name;Industry\na@b.example;A;Retail;Food\n");
  assert.ok(has(r, /semicolon-separated/, "warning"));
  assert.equal(r.summary.delimiter, ";");
  assert.match(repair("Email;First Name\na@b.example;A\n").text, /^Email,First Name\r\na@b\.example,A\r\n$/);
});

test("row, column and size limits", () => {
  const r = validate(file("a@b.example,A,,,,,,", "b@b.example,B,,,,,,", "c@b.example,C,,,,,,"), { rowLimit: 2 });
  assert.ok(has(r, /The file has 3 rows/, "error"));
  const wide = "Email," + Array.from({ length: 1000 }, (_, i) => `c${i}`).join(",") + "\n";
  assert.ok(has(validate(wide), /1001 columns/, "error"));
});

test("blank rows in the middle are flagged, trailing ones are not", () => {
  const r = validate(file("a@b.example,A,,,,,,", ",,,,,,,", "b@b.example,B,,,,,,", "", ",,,,,,,"));
  assert.equal(r.findings.filter((f) => f.title === "Blank row").length, 1);
});

test("missing Email column and company identifiers", () => {
  assert.ok(has(validate("First Name\nA\n"), /No Email or Record ID/, "warning"));
  assert.ok(has(validate("Name,City\nAcme,Leeds\n"), /No Company Domain Name or Record ID/));
});

test("company domains: duplicates and URLs", () => {
  const r = validate("Name,Company Domain Name\nA,acme.example\nB,https://www.ACME.example/about\nC,not a domain\n");
  assert.equal(r.summary.kind, "companies");
  assert.ok(has(r, /Domain acme\.example appears 2 times/));
  assert.ok(has(r, /is not a bare domain/));
  assert.ok(has(r, /is not a valid domain/, "error"));
});

test("owner values are listed as not checked, never judged against an account", () => {
  const r = validate("Email,Contact owner\na@b.example,boss@x.example\nb@b.example,boss@x.example\nc@b.example,12345\n");
  const f = r.findings.find((x) => /distinct owner values; not checked/.test(x.title));
  assert.ok(f);
  assert.equal(f.severity, "info");
  assert.deepEqual(r.summary.owners.map((o) => o.value).sort(), ["12345", "boss@x.example"]);
});

test("number properties", () => {
  const r = validate("Email,Annual Revenue,Number of Employees\na@b.example,\"$1,200,000\",12\nb@b.example,850000,x\n");
  assert.equal(r.findings.filter((f) => /not a plain number/.test(f.title)).length, 2);
});

test("empty, header-only, unterminated quote, wrong cell count", () => {
  assert.ok(has(validate(""), /empty/, "error"));
  assert.ok(has(validate("Email\n"), /no records/, "error"));
  assert.ok(has(validate(file("\"A,,,,,")), /never closed/, "error"));
  assert.ok(has(validate(file("a@b.example,A")), /has 2 cells/, "error"));
});

test("the not-checked list is returned with every result", () => {
  assert.deepEqual(validate(sampleFile()).notChecked, NOT_CHECKED);
  assert.ok(NOT_CHECKED.some((n) => /owner/i.test(n)));
});

test("repair is formatting only, lists every change with its line, and never touches digits or names", () => {
  const src = ["Email;First Name;Phone Number;Postal Code;Lifecycle Stage;Lead Status;Create Date", " Maya@X.example ;  Maya;'0113 496 0456;'02108;Customer;In progress;03/04/2026", "mailto:b@x.example;Bob;4.4E+11;2108;lead;NEW;3/4/26", ";;;;;;", "c@x.example;Cy;44117496012.0;12345.0;;;"].join("\n") + "\n";
  const r = repair(src);
  const parsed = parseCsv(r.text.replace(/\r/g, ""), ",").rows.map((x) => x.cells);
  assert.deepEqual(parsed[1], ["maya@x.example", "Maya", "0113 496 0456", "02108", "customer", "IN_PROGRESS", "03/04/2026"]);
  assert.deepEqual(parsed[2], ["b@x.example", "Bob", "4.4E+11", "2108", "lead", "NEW", "3/4/26"]);
  assert.deepEqual(parsed[3], ["c@x.example", "Cy", "44117496012", "12345", "", "", ""]);
  assert.equal(parsed.length, 4);
  assert.ok(r.changes.every((c) => /^Line \d+:|^Separator|blank rows? removed in total/.test(c)), r.changes.join("\n"));
  assert.ok(r.changes.some((c) => /blank row removed/.test(c)));
  assert.ok(!r.changes.some((c) => /4\.4E/.test(c) || /2108"? →/.test(c) && !/02108/.test(c)));
  // the result still parses with the same findings minus the fixed ones
  const after = validate(r.text);
  assert.ok(!has(after, /mailto|semicolon|Blank row|ends in/));
});

test("repair refuses a file with an unterminated quote and an empty file", () => {
  assert.match(repair(file("\"A,,,,,")).error, /never closed/);
  assert.match(repair("").error, /empty/);
});

test("repair on a clean file changes nothing", () => {
  const r = repair(sampleFile());
  assert.deepEqual(r.changes, []);
});

test("csv helpers round trip quotes, commas and newlines", () => {
  const rows = [["a,b", 'say "hi"', "line1\nline2", " pad "]];
  assert.deepEqual(parseCsv(toCsv(rows).replace(/\r\n$/, "")).rows[0].cells, rows[0]);
  assert.equal(decodeBuffer(new TextEncoder().encode("Müller")), "Müller");
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,title,detail\r\n/);
});

test("a byte-order mark and CRLF line endings are tolerated", () => {
  const r = validate("﻿Email,First Name\r\na@b.example,A\r\n");
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(r.summary.contacts, 1);
});
