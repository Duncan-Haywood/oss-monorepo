import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, closestField, parseDate, findingsCsv, sampleFile, sampleBrokenFile } from "./calc.mjs";

const H = "FirstName,LastName,Company,Email,Status,Rating,AnnualRevenue,NumberOfEmployees,CreatedDate,Phone,OwnerId";
const file = (...lines) => [H, ...lines].join("\n") + "\n";
const codes = (r) => r.findings.map((f) => f.code);
const row = (o = {}) => [o.f ?? "Ana", o.l ?? "Reyes", o.c ?? "Northwind", o.e ?? "ana@example.com", o.s ?? "", o.r ?? "", o.a ?? "", o.n ?? "", o.d ?? "", o.p ?? "", o.o ?? ""].join(",");

test("the clean example has no errors or warnings, the broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.leads, 3);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error"));
  assert.ok(bad.findings.some((f) => f.severity === "warning"));
});

test("parser handles quotes, doubled quotes, embedded newlines and reports the line", () => {
  const p = parseCsv('a,b\n"x, ""y""","line1\nline2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "line1\nline2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("empty file and unterminated quote stop early", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.equal(validate('LastName\n"x\n').findings[0].code, "quote");
});

test("semicolon files are reported and repaired", () => {
  const text = "FirstName;LastName;Company\nAna;Reyes;Acme\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  assert.match(repair(text).text, /^FirstName,LastName,Company\r\n/);
});

test("LastName and Company are required as columns and per row", () => {
  assert.ok(codes(validate("FirstName,Email\nA,a@b.com\n")).includes("missing-last-name"));
  assert.ok(codes(validate("FirstName,LastName\nA,B\n")).includes("missing-company"));
  const r = validate(file(row({ l: "" }), row({ e: "b@b.com", c: "" })));
  assert.ok(codes(r).includes("last-name-blank"));
  assert.ok(codes(r).includes("company-blank"));
});

test("headers: aliases map, near-misses are flagged, custom columns are information", () => {
  const r = validate("Surname,Account,E-mail,Favourite Colour,Emial Address\nR,Acme,a@b.com,blue,x\n");
  assert.deepEqual(r.summary.mapped.map((m) => m.property), ["LastName", "Company", "Email"]);
  assert.equal(r.findings.find((f) => f.code === "unknown-header" && /Colour/.test(f.title)).severity, "info");
  assert.equal(closestField("Emial"), "Email");
  assert.equal(closestField("Favourite Colour"), null);
});

test("email: format, multiple, display name, mailto, typo, disposable, case, spaces", () => {
  assert.ok(codes(validate(file(row({ e: "nope" })))).includes("email-format"));
  assert.ok(codes(validate(file(row({ e: '"a@b.com, c@d.com"' })))).includes("email-multiple"));
  assert.ok(codes(validate(file(row({ e: '"Ana <a@b.com>"' })))).includes("email-display"));
  assert.ok(codes(validate(file(row({ e: "mailto:a@b.com" })))).includes("email-mailto"));
  assert.ok(codes(validate(file(row({ e: "a@gmial.com" })))).includes("email-typo"));
  assert.ok(codes(validate(file(row({ e: "a@mailinator.com" })))).includes("email-disposable"));
  assert.ok(codes(validate(file(row({ e: "A@B.com" })))).includes("email-case"));
  assert.deepEqual(validate(file(row())).findings.filter((f) => f.severity !== "info"), []);
});

test("duplicate emails are matched case-insensitively and counted", () => {
  const r = validate(file(row(), row({ f: "Anna", e: "ANA@example.com" })));
  assert.ok(codes(r).includes("dup-email"));
  assert.equal(r.summary.dupEmails, 1);
});

test("picklists: Status is an error, Rating a warning, wrong capitals a note", () => {
  assert.ok(codes(validate(file(row({ s: "Qualified" })))).includes("status"));
  assert.ok(codes(validate(file(row({ s: "open - not contacted" })))).includes("status-case"));
  assert.ok(!codes(validate(file(row({ s: "Open - Not Contacted" })))).includes("status"));
  assert.ok(codes(validate(file(row({ r: "Lukewarm" })))).includes("rating"));
});

test("numbers: revenue and employee count", () => {
  assert.ok(codes(validate(file(row({ a: "$1.2M" })))).includes("revenue"));
  assert.ok(codes(validate(file(row({ n: "11-50" })))).includes("employees"));
  assert.deepEqual(validate(file(row({ a: "1200000.50", n: "14" }))).findings.filter((f) => f.severity !== "info"), []);
});

test("phone, owner id and field length", () => {
  assert.ok(codes(validate(file(row({ p: "4.15556E+09" })))).includes("phone-sci"));
  assert.ok(codes(validate(file(row({ p: "call me" })))).includes("phone-letters"));
  assert.ok(codes(validate(file(row({ o: "5.00E+14" })))).includes("owner-sci"));
  assert.ok(codes(validate(file(row({ o: "Bob" })))).includes("owner-id"));
  assert.ok(codes(validate(file(row({ o: "003abcdefghijkl" })))).includes("owner-prefix"));
  assert.ok(!codes(validate(file(row({ o: "005abcdefghijkl" })))).some((c) => c.startsWith("owner")));
  assert.ok(codes(validate(file(row({ l: "x".repeat(81) })))).includes("too-long"));
});

test("dates: unambiguous mix is an error, ambiguous alone a note, impossible an error", () => {
  assert.ok(codes(validate(file(row({ d: "03/14/2026" }), row({ e: "b@b.com", d: "14/03/2026" })))).includes("date-mixed"));
  assert.ok(codes(validate(file(row({ d: "03/04/2026" })))).includes("date-ambiguous"));
  assert.ok(codes(validate(file(row({ d: "2026-13-40" })))).includes("date-invalid"));
  assert.ok(codes(validate(file(row({ d: "yesterday" })))).includes("date-unreadable"));
  assert.equal(parseDate("14/03/2026").order, "dm");
});

test("repair: emails, picklist capitals, one-way dates, exact duplicate row; names untouched", () => {
  const text = file(row({ e: " Ana@Example.com ", s: "open - not contacted", r: "hot", d: "03/14/2026" }), row({ f: "BEN", e: "b@b.com", d: "04/05/2026" }), row({ f: "BEN", e: "b@b.com", d: "04/05/2026" }));
  const fixed = repair(text);
  assert.equal(fixed.error, null);
  assert.match(fixed.text, /ana@example\.com/);
  assert.match(fixed.text, /Open - Not Contacted/);
  assert.match(fixed.text, /,Hot,/);
  assert.match(fixed.text, /2026-03-14/);
  assert.match(fixed.text, /BEN/);
  assert.equal(parseCsv(fixed.text).rows.length, 3);
  assert.ok(fixed.changes.some((c) => /exact copy/.test(c)));
});

test("repair leaves a date column alone when both orders occur, and does not invent a status", () => {
  const fixed = repair(file(row({ d: "03/14/2026", s: "Qualified" }), row({ e: "b@b.com", d: "14/03/2026" })));
  assert.match(fixed.text, /03\/14\/2026/);
  assert.match(fixed.text, /14\/03\/2026/);
  assert.match(fixed.text, /Qualified/);
});

test("repair refuses an unterminated quote and an empty file", () => {
  assert.ok(repair('a\n"x\n').error);
  assert.ok(repair("").error);
});

test("findings export is valid CSV", () => {
  const out = findingsCsv(validate(sampleBrokenFile()));
  assert.equal(parseCsv(out).rows[0].cells.join(), "severity,line,code,title,detail");
  assert.ok(parseCsv(out).rows.length > 5);
});
