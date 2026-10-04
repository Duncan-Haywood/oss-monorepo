import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, sampleDealsFile, findingsCsv, parseCsv, toCsv, classifyDate, decodeBuffer, NOT_CHECKED, DEAL_STATUS } from "./calc.mjs";

const HEAD = "Title,Value,Currency,Stage,Status,Expected close date,Probability,Organization";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean samples have no errors or warnings", () => {
  for (const f of [sampleFile(), sampleDealsFile()]) {
    assert.deepEqual(validate(f).findings.filter((x) => x.severity !== "info"), []);
  }
  assert.equal(validate(sampleFile()).summary.records, 3);
  assert.equal(validate(sampleFile()).summary.kind, "people");
  assert.equal(validate(sampleDealsFile()).summary.kind, "deals");
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /is not a plain number/, /not Open, Won or Lost/, /3-letter code/, /not a number from 0 to 100/, /looks like a fraction/, /scientific notation/, /spells out the month/, /uses dashes or dots/, /mixes day-first/, /appears 2 times/, /Blank row/, /differs from "Open"/, /lower case/]) assert.ok(has(r, re), String(re));
});

test("deal status", () => {
  for (const v of DEAL_STATUS) assert.ok(!has(validate(file(`A,1,USD,S,${v},,,`)), /Status/), v);
  const r = validate(file("A,1,USD,S,won,,,", "B,1,USD,S,Closed Won,,,", "C,1,USD,S,In progress,,,"));
  assert.ok(has(r, /Status "won" differs/, "info"));
  assert.equal(r.findings.filter((f) => /is not Open, Won or Lost/.test(f.title)).length, 2);
});

test("value and currency", () => {
  const r = validate(file("A,$1200,USD,S,Open,,,", "B,1,200,usd,S,Open,,", "C,1.200,50,EUR,S,Open,,", "D,1200.50,GBP,S,Open,,,", "E,500,US dollars,S,Open,,,"));
  assert.ok(has(r, /Value "\$1200" is not a plain number/, "error"));
  assert.ok(has(r, /Currency "US dollars" is not a 3-letter code/, "error"));
  assert.ok(!has(validate(file("D,1200.50,GBP,S,Open,,,")), /Value|Currency/));
  const mixed = validate(file("A,1,USD,S,Open,,,", "B,1,EUR,S,Open,,,"));
  assert.ok(has(mixed, /2 currencies in one file/, "info"));
});

test("probability", () => {
  const r = validate(file("A,1,USD,S,Open,,60,", "B,1,USD,S,Open,,0.6,", "C,1,USD,S,Open,,150,", "D,1,USD,S,Open,,sixty,", "E,1,USD,S,Open,,60%,", "F,1,USD,S,Open,,0,"));
  assert.ok(has(r, /Probability 0\.6 looks like a fraction/, "warning"));
  assert.equal(r.findings.filter((f) => /not a number from 0 to 100/.test(f.title)).length, 2);
});

test("required name or title depends on the object", () => {
  assert.ok(has(validate("Value\n1\n", { kind: "deals" }), /No Title column/, "error"));
  assert.ok(has(validate("Email\na@b.example\n", { kind: "people" }), /No Name column/, "error"));
  assert.ok(!has(validate("First name,Last name,Email\nA,B,a@b.example\n", { kind: "people" }), /No Name column/));
  assert.ok(has(validate("First name,Last name,Email\n,,a@b.example\nA,B,\n", { kind: "people" }), /First and last name are both empty/, "error"));
  assert.ok(has(validate(file(",1,USD,S,Open,,,")), /Title is empty/, "error"));
  assert.ok(has(validate("Name,Address\n,1 High St\n", { kind: "organizations" }), /Name is empty/, "error"));
});

test("duplicates: emails, organizations, deals", () => {
  const p = validate("Name,Email\nA,A@x.example\nB,a@X.example\nC,c@x.example\n", { kind: "people" });
  assert.ok(has(p, /appears 2 times/, "warning"));
  assert.equal(p.summary.duplicates, 1);
  assert.ok(has(validate("Name\nAcme Ltd\nacme  ltd\nOther\n", { kind: "organizations" }), /Organization "Acme Ltd" appears 2 times/));
  assert.ok(has(validate(file("A,1,USD,S,Open,,,Acme", "A,1,USD,S,Open,,,Acme")), /Deal "A" appears 2 times/));
  assert.ok(!has(validate(file("A,1,USD,S,Open,,,Acme", "A,2,USD,S,Open,,,Acme")), /appears/));
});

test("invalid emails and phone damage", () => {
  const r = validate("Name,Email,Phone\nA,nobody,4.41175E+11\nB,a@b,'0113\nC,ok@b.example,44117496012.0\nD,x@y.example,call me\n", { kind: "people" });
  assert.equal(r.findings.filter((f) => /^Email "/.test(f.title) && f.severity === "error").length, 2);
  assert.ok(has(r, /scientific notation/, "error"));
  assert.ok(has(r, /starts with an apostrophe/));
  assert.ok(has(r, /ends in \.0/));
  assert.ok(has(r, /contains letters/));
});

test("dates: mixed order, unreadable layouts, ambiguity", () => {
  const r = validate(file("A,1,USD,S,Open,03/25/2026,,", "B,1,USD,S,Open,25/03/2026,,", "C,1,USD,S,Open,March 4 2026,,"));
  assert.ok(has(r, /mixes day-first and month-first/, "error"));
  assert.ok(has(r, /spells out the month/));
  assert.ok(has(validate(file("A,1,USD,S,Open,03/04/2026,,")), /could be read day-first or month-first/, "info"));
  assert.equal(classifyDate("2026-03-04").kind, "ymd");
  assert.equal(classifyDate("31/02/2026").kind, "bad");
});

test("won time on an open deal, lost and won hints", () => {
  const r = validate("Title,Status,Won time,Lost reason\nA,Open,2026-01-02,\nB,Lost,,\nC,Won,,\n", { kind: "deals" });
  assert.ok(has(r, /Open deal has a won time/, "warning"));
  assert.ok(has(r, /Lost deal with no lost reason/, "info"));
  assert.ok(has(r, /Won deal with no won time/, "info"));
});

test("headings: aliases, typos, duplicates, custom fields; kind detection", () => {
  const r = validate("Deal title,Amount,Stag,Region (custom),Value\nA,1,S,E,2\n", { kind: "deals" });
  assert.ok(has(r, /Heading "Deal title" is not the field name/));
  assert.ok(has(r, /Heading "Stag" is not a Pipedrive deal field name/));
  assert.ok(has(r, /Region \(custom\)" matches no standard deal field/, "info"));
  assert.ok(has(r, /appears in two columns/, "warning"));
  assert.equal(validate("Title,Value\nA,1\n").summary.kind, "deals");
  assert.equal(validate("Name,Email\nA,a@b.example\n").summary.kind, "people");
  assert.equal(validate("Name,Address\nA,1 High St\n").summary.kind, "organizations");
});

test("structure: empty, unterminated quote, ragged rows, limits, encoding", () => {
  assert.ok(has(validate(""), /file is empty/, "error"));
  assert.ok(has(validate('Title,Value\n"B,1\n'), /never closed/, "error"));
  assert.ok(has(validate("Title,Value\nB,1,extra\n", { kind: "deals" }), /cells, the header has/, "error"));
  assert.ok(has(validate("Title,Value\nB,1\nD,2\n", { kind: "deals", rowLimit: 1 }), /The file has 2 rows/, "warning"));
  assert.ok(has(validate("Name\nMÃ¼ller\n", { kind: "people" }), /mis-decoded/));
  assert.equal(decodeBuffer(new TextEncoder().encode("é")), "é");
});

test("repair changes formatting only and lists each change", () => {
  const fix = repair(sampleBrokenFile());
  assert.ok(fix.changes.length >= 4);
  const out = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.equal(out[0][0], "Deal title");
  assert.ok(out.every((r) => r.length === out[0].length));
  assert.ok(fix.text.includes("$12,000".replace(",", ",")) || fix.text.includes('"$12,000"'), "values are left alone");
  assert.ok(fix.text.includes("Closed Won"), "statuses with no single reading are left alone");
  assert.ok(fix.text.includes("March 4, 2026"), "dates are left alone");
  assert.ok(fix.text.includes("USD") && !fix.text.includes("usd"));
  assert.ok(repair('a,b\n"x').error);
  assert.ok(repair("Title,Status\nA,won\n", { kind: "deals" }).text.includes("A,Won"));
});

test("findings CSV and NOT_CHECKED travel with the result", () => {
  const r = validate(sampleBrokenFile());
  assert.deepEqual(r.notChecked, NOT_CHECKED);
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a,b", 'c"d']]), '"a,b","c""d"\r\n');
});
