import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestProperty, parseDate, findingsCsv, sampleFile, sampleBrokenFile } from "./calc.mjs";

const H = "First Name,Last Name,Email,Create Date,Lifecycle Stage,Phone Number,Postal Code,Country/Region";
const file = (...lines) => [H, ...lines].join("\n") + "\n";
const codes = (r) => r.findings.map((f) => f.code);
const row = (o = {}) => [o.f ?? "Ana", o.l ?? "Reyes", o.e ?? "ana@example.com", o.d ?? "", o.s ?? "", o.p ?? "", o.z ?? "", o.c ?? ""].join(",");

test("the clean example has no errors or warnings, the broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.contacts, 3);
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
  assert.equal(validate('Email\n"a@b.com\n').findings[0].code, "quote");
});

test("semicolon files are reported and repaired", () => {
  const text = "First Name;Email\nAna;ana@example.com\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  const fixed = repair(text);
  assert.match(fixed.text, /^First Name,Email\r\n/);
  assert.match(fixed.changes[0], /semicolon/);
});

test("headers: aliases map, near-misses are flagged, unknown ones are information", () => {
  const r = validate("E-mail,Surname,Emial Address,Favourite Colour\na@b.com,Reyes,x,blue\n");
  assert.deepEqual(r.summary.mapped.map((m) => m.property), ["Email", "Last Name"]);
  assert.ok(codes(r).includes("dup-property") || codes(r).includes("unknown-header"));
  assert.equal(r.findings.find((f) => f.code === "unknown-header" && /Colour/.test(f.title)).severity, "info");
  assert.equal(closestProperty("Emial"), "Email");
  assert.equal(closestProperty("Favourite Colour"), null);
});

test("no Email or Record ID column is a warning, blank email on a row too", () => {
  assert.ok(codes(validate("First Name\nAna\n")).includes("no-identifier"));
  assert.ok(codes(validate(file(row({ e: "" })))).includes("email-blank"));
});

test("email: format, multiple, display name, mailto, typo, disposable, role, spaces, case", () => {
  assert.ok(codes(validate(file(row({ e: "not-an-email" })))).includes("email-format"));
  assert.ok(codes(validate(file(row({ e: '"a@b.com, c@d.com"' })))).includes("email-multiple"));
  assert.ok(codes(validate(file(row({ e: '"Ana <a@b.com>"' })))).includes("email-display"));
  assert.ok(codes(validate(file(row({ e: "mailto:a@b.com" })))).includes("email-mailto"));
  assert.ok(codes(validate(file(row({ e: "a@gmial.com" })))).includes("email-typo"));
  assert.ok(codes(validate(file(row({ e: "a@mailinator.com" })))).includes("email-disposable"));
  assert.ok(codes(validate(file(row({ e: "info@acme.com" })))).includes("email-role"));
  assert.ok(codes(validate(file(row({ e: "A@B.com" })))).includes("email-case"));
  assert.deepEqual(validate(file(row())).findings.filter((f) => f.severity !== "info"), []);
});

test("duplicate emails are matched case-insensitively and counted", () => {
  const r = validate(file(row(), row({ f: "Anna", e: "ANA@example.com" })));
  assert.ok(codes(r).includes("dup-email"));
  assert.equal(r.summary.dupEmails, 1);
});

test("phone: scientific notation, letters, too short", () => {
  assert.ok(codes(validate(file(row({ p: "4.15556E+09" })))).includes("phone-sci"));
  assert.ok(codes(validate(file(row({ p: "call me" })))).includes("phone-letters"));
  assert.ok(codes(validate(file(row({ p: "123" })))).includes("phone-short"));
  assert.ok(!codes(validate(file(row({ p: "+1 (415) 555-0101 ext 22" })))).includes("phone-letters"));
});

test("lifecycle stage and lead status values", () => {
  assert.ok(codes(validate(file(row({ s: "hot lead" })))).includes("lifecycle"));
  assert.ok(!codes(validate(file(row({ s: "Marketing Qualified Lead" })))).includes("lifecycle"));
  assert.ok(!codes(validate(file(row({ s: "customer" })))).includes("lifecycle"));
});

test("US four-digit ZIP is noted only for US or blank country", () => {
  assert.ok(codes(validate(file(row({ z: "2108" })))).includes("zip-zero"));
  assert.ok(!codes(validate(file(row({ z: "2108", c: "Germany" })))).includes("zip-zero"));
});

test("dates: unambiguous mix is an error, ambiguous alone is a note, impossible is an error", () => {
  assert.ok(codes(validate(file(row({ d: "03/14/2026" }), row({ e: "b@b.com", d: "14/03/2026" })))).includes("date-mixed"));
  assert.ok(codes(validate(file(row({ d: "03/04/2026" })))).includes("date-ambiguous"));
  assert.ok(codes(validate(file(row({ d: "2026-13-40" })))).includes("date-invalid"));
  assert.ok(codes(validate(file(row({ d: "yesterday" })))).includes("date-unreadable"));
  assert.deepEqual(parseDate("2026-03-14"), { y: 2026, a: 3, b: 14, order: "ymd" });
  assert.equal(parseDate("14/03/2026").order, "dm");
  assert.equal(parseDate("03/14/26").y, 2026);
});

test("repair: emails, one-way date columns, exact duplicate row, never touches names", () => {
  const text = file(row({ e: " Ana@Example.com ", d: "03/14/2026" }), row({ e: "b@b.com", d: "04/05/2026", f: "BEN" }), row({ e: "b@b.com", d: "04/05/2026", f: "BEN" }));
  const fixed = repair(text);
  assert.equal(fixed.error, null);
  assert.match(fixed.text, /ana@example\.com/);
  assert.match(fixed.text, /2026-03-14/);
  assert.match(fixed.text, /2026-04-05/);
  assert.match(fixed.text, /BEN/);
  assert.equal(parseCsv(fixed.text).rows.length, 3);
  assert.ok(fixed.changes.some((c) => /exact copy/.test(c)));
});

test("repair leaves a date column alone when both orders occur", () => {
  const fixed = repair(file(row({ d: "03/14/2026" }), row({ e: "b@b.com", d: "14/03/2026" })));
  assert.match(fixed.text, /03\/14\/2026/);
  assert.match(fixed.text, /14\/03\/2026/);
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
