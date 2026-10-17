import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, sampleDealsFile, findingsCsv, parseCsv, toCsv, classifyDate, decodeBuffer, NOT_CHECKED, DEAL_STAGES, LEAD_STATUS } from "./calc.mjs";

const HEAD = "Deal Name,Amount,Currency,Stage,Closing Date,Probability (%),Account Name";
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
  for (const re of [/semicolon/, /is not a plain number/, /3-letter code/, /not a number from 0 to 100/, /looks like a fraction/, /scientific notation/, /spells out the month/, /uses dashes or dots/, /mixes day-first/, /appears 2 times/, /Blank row/, /differs from "Proposal\/Price Quote"/, /lower case/, /outside Zoho CRM's defaults/]) assert.ok(has(r, re), String(re));
});

test("stage and lead status picklists", () => {
  for (const v of DEAL_STAGES) assert.ok(!has(validate(file(`A,1,USD,"${v}",,,`)), /Stage/), v);
  const r = validate(file("A,1,USD,closed won,,,", "B,1,USD,Won it,,,"));
  assert.ok(has(r, /Stage "closed won" differs/, "info"));
  assert.ok(has(r, /1 picklist value outside/, "info"));
  assert.ok(!r.findings.some((f) => f.severity === "error" && /Stage/.test(f.title)), "an edited picklist is never an error");
  for (const v of LEAD_STATUS) assert.ok(!has(validate(`Last Name,Company,Lead Status\nA,B,${v}\n`), /Lead Status/), v);
  assert.ok(has(validate("Last Name,Company,Lead Status\nA,B,contacted\n"), /Lead Status "contacted" differs/, "info"));
});

test("amount and currency", () => {
  const r = validate(file("A,$1200,USD,S,,,", 'B,"1,200",usd,S,,,', "C,1.200;50,EUR,S,,,", "D,1200.50,GBP,S,,,", "E,500,US dollars,S,,,"));
  assert.ok(has(r, /Amount "\$1200" is not a plain number/, "error"));
  assert.ok(has(r, /Currency "US dollars" is not a 3-letter code/, "error"));
  assert.ok(!has(validate(file("D,1200.50,GBP,S,,,")), /Amount|Currency/));
  assert.ok(has(validate(file("A,1,USD,S,,,", "B,1,EUR,S,,,")), /2 currencies in one file/, "info"));
});

test("probability", () => {
  const r = validate(file("A,1,USD,S,,60,", "B,1,USD,S,,0.6,", "C,1,USD,S,,150,", "D,1,USD,S,,sixty,", "E,1,USD,S,,60%,", "F,1,USD,S,,0,"));
  assert.ok(has(r, /Probability 0\.6 looks like a fraction/, "warning"));
  assert.equal(r.findings.filter((f) => /not a number from 0 to 100/.test(f.title)).length, 2);
  assert.ok(has(validate(file("A,1,USD,Closed Won,,40,")), /Closed Won deal with probability 40/, "info"));
});

test("required fields depend on the module", () => {
  assert.ok(has(validate("Email\na@b.example\n", { kind: "leads" }), /No Last Name column/, "error"));
  assert.ok(has(validate("Last Name,Email\nA,a@b.example\n", { kind: "leads" }), /No Company column/, "error"));
  assert.ok(!has(validate("Last Name,Company\nA,B\n", { kind: "leads" }), /^No /, "error"));
  assert.ok(has(validate("Last Name,Company\n,Acme\nOkafor,\n", { kind: "leads" }), /Last Name is empty/, "error"));
  assert.ok(has(validate("Last Name,Company\n,Acme\nOkafor,\n", { kind: "leads" }), /Company is empty/, "error"));
  assert.ok(!has(validate("Last Name,Email\nA,a@b.example\n", { kind: "contacts" }), /^No /, "error"));
  assert.ok(has(validate("Amount\n1\n", { kind: "deals" }), /No Deal Name column/, "error"));
  assert.ok(has(validate(file(",1,USD,S,,,")), /Deal Name is empty/, "error"));
  assert.ok(has(validate("Account Name,Website\n,example.com\n", { kind: "accounts" }), /Account Name is empty/, "error"));
});

test("duplicates: emails, accounts, deals", () => {
  const p = validate("Last Name,Email\nA,A@x.example\nB,a@X.example\nC,c@x.example\n", { kind: "contacts" });
  assert.ok(has(p, /appears 2 times/, "warning"));
  assert.equal(p.summary.duplicates, 1);
  assert.ok(has(validate("Account Name\nAcme Ltd\nacme  ltd\nOther\n", { kind: "accounts" }), /Organization "Acme Ltd" appears 2 times/));
  assert.ok(has(validate(file("A,1,USD,S,,,Acme", "A,1,USD,S,,,Acme")), /Deal "A" appears 2 times/));
  assert.ok(!has(validate(file("A,1,USD,S,,,Acme", "A,2,USD,S,,,Acme")), /appears/));
});

test("invalid emails and phone damage", () => {
  const r = validate("Last Name,Email,Phone,Mobile\nA,nobody,4.41175E+11,\nB,a@b,'0113,\nC,ok@b.example,44117496012.0,\nD,x@y.example,call me,07700900123\n", { kind: "contacts" });
  assert.equal(r.findings.filter((f) => /^Email "/.test(f.title) && f.severity === "error").length, 2);
  assert.ok(has(r, /scientific notation/, "error"));
  assert.ok(has(r, /starts with an apostrophe/));
  assert.ok(has(r, /ends in \.0/));
  assert.ok(has(r, /contains letters/));
});

test("dates: mixed order, unreadable layouts, ambiguity", () => {
  const r = validate(file("A,1,USD,S,03/25/2026,,", "B,1,USD,S,25/03/2026,,", "C,1,USD,S,March 4 2026,,"));
  assert.ok(has(r, /mixes day-first and month-first/, "error"));
  assert.ok(has(r, /spells out the month/));
  assert.ok(has(validate(file("A,1,USD,S,03/04/2026,,")), /could be read day-first or month-first/, "info"));
  assert.equal(classifyDate("2026-03-04").kind, "ymd");
  assert.equal(classifyDate("31/02/2026").kind, "bad");
});

test("headings: aliases, typos, duplicates, custom fields; module detection", () => {
  const r = validate("Opportunity,Amount,Stag,Region (custom),Price\nA,1,S,E,2\n", { kind: "deals" });
  assert.ok(has(r, /Heading "Opportunity" is not the field name/));
  assert.ok(has(r, /Heading "Stag" is not a Zoho CRM deal field name/));
  assert.ok(has(r, /Region \(custom\)" matches no standard deal field/, "info"));
  assert.ok(has(r, /appears in two columns/, "warning"));
  assert.equal(validate("Deal Name,Amount\nA,1\n").summary.kind, "deals");
  assert.equal(validate("Last Name,Company,Email\nA,B,a@b.example\n").summary.kind, "leads");
  assert.equal(validate("Last Name,Email\nA,a@b.example\n").summary.kind, "contacts");
  assert.equal(validate("Account Name,Website\nA,example.com\n").summary.kind, "accounts");
});

test("structure: empty, unterminated quote, ragged rows, limits, encoding", () => {
  assert.ok(has(validate(""), /file is empty/, "error"));
  assert.ok(has(validate('Deal Name,Amount\n"B,1\n'), /never closed/, "error"));
  assert.ok(has(validate("Deal Name,Amount\nB,1,extra\n", { kind: "deals" }), /cells, the header has/, "error"));
  assert.ok(has(validate("Deal Name,Amount\nB,1\nD,2\n", { kind: "deals", rowLimit: 1 }), /The file has 2 rows/, "warning"));
  assert.ok(has(validate("Last Name\nMÃ¼ller\n", { kind: "contacts" }), /mis-decoded/));
  assert.equal(decodeBuffer(new TextEncoder().encode("é")), "é");
});

test("repair changes formatting only and lists each change", () => {
  const fix = repair(sampleBrokenFile());
  assert.ok(fix.changes.length >= 3);
  const out = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.equal(out[0][0], "Deal Name");
  assert.ok(out.every((r) => r.length === out[0].length));
  assert.ok(fix.text.includes('"$12,000"'), "amounts are left alone");
  assert.ok(fix.text.includes("Won it"), "picklist values with no single reading are left alone");
  assert.ok(fix.text.includes("March 4, 2026"), "dates are left alone");
  assert.ok(fix.text.includes("Proposal/Price Quote"));
  assert.ok(fix.text.includes("USD") && !fix.text.includes("usd"));
  assert.ok(repair('a,b\n"x').error);
  assert.ok(repair("Deal Name,Stage\nA,closed won\n", { kind: "deals" }).text.includes("A,Closed Won"));
});

test("findings CSV and NOT_CHECKED travel with the result", () => {
  const r = validate(sampleBrokenFile());
  assert.deepEqual(r.notChecked, NOT_CHECKED);
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a,b", 'c"d']]), '"a,b","c""d"\r\n');
});
