import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, checkSyntax, suggestDomain, aliasKey, isRoleLocal, isDisposable, parseCsv, toCsv, decodeBuffer, findingsCsv, sampleFile, sampleBrokenFile, PLATFORMS } from "./calc.mjs";

const file = (...rows) => ["Email,First Name,Status", ...rows].join("\n") + "\n";
const has = (r, code) => r.findings.some((f) => f.code === code);
const of = (r, code) => r.findings.filter((f) => f.code === code);

test("the clean sample has no errors or warnings", () => {
  const r = validate(sampleFile(), { platform: "mailchimp" });
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(r.summary.rows, 3);
  assert.equal(r.summary.emailColumn, "Email Address");
});

test("the broken sample surfaces every fault it is meant to", () => {
  const r = validate(sampleBrokenFile(), { platform: "mailchimp" });
  for (const c of ["bom", "delimiter", "platform-email", "email-space", "dup", "alias-dup", "typo", "role", "disposable", "invalid", "blank", "ragged", "sci", "zeros", "mojibake", "mixed-delim", "unsubscribed", "case"]) assert.ok(has(r, c), c);
  assert.equal(r.summary.counts.duplicates, 1);
  assert.equal(r.summary.counts.typos, 2);
});

test("syntax: good and bad addresses", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org", "o'neil@example.ie", "x@xn--bcher-kva.example"]) assert.equal(checkSyntax(ok), null, ok);
  const bad = { "plainaddress": /no @/, "a@@b.com": /more than one @/, "a b@c.com": /space/, "@c.com": /before the @/, "a@c": /no dot/, "a@c.": /empty part/, "a..b@c.com": /dot/, ".a@c.com": /dot/, "a@-c.com": /hyphen/, "a@c.c": /ending/, "a@c.123": /ending/, "Jo <j@c.com>": /Name <address>/, "mailto:a@c.com": /mailto/, "a@c.com;b@d.com": /more than one address/, "a,b@c.com": /comma/, "a@c_d.com": /not allowed in the domain/, "a(b)@c.com": /not allowed before/ };
  for (const [e, re] of Object.entries(bad)) { const r = checkSyntax(e); assert.ok(r && r.level === "error" && re.test(r.reason), `${e}: ${r && r.reason}`); }
  assert.equal(checkSyntax("josé@example.com").level, "warning");
});

test("domain typos get a suggested fix", () => {
  const cases = { "gmial.com": "gmail.com", "gmal.com": "gmail.com", "hotmial.com": "hotmail.com", "yahooo.com": "yahoo.com", "outlok.com": "outlook.com", "gmail.con": "gmail.com", "yahoo.coom": "yahoo.com", "example.con": "example.com", "hotmail.cmo": "hotmail.com", "gmail.co": "gmail.com", "gmaiil.com": "gmail.com" };
  for (const [d, fix] of Object.entries(cases)) assert.equal(suggestDomain(d), fix, d);
  for (const ok of ["gmail.com", "example.com", "live.com", "yahoo.co.uk", "love.com", "company.co"]) assert.equal(suggestDomain(ok), null, ok);
});

test("role accounts, with separators ignored", () => {
  for (const l of ["info", "Admin", "no-reply", "noreply", "do_not_reply", "customer.service", "sales"]) assert.ok(isRoleLocal(l), l);
  for (const l of ["maria", "sales.manager.lee", "infox"]) assert.ok(!isRoleLocal(l), l);
});

test("disposable domains, including subdomains", () => {
  assert.ok(isDisposable("mailinator.com"));
  assert.ok(isDisposable("x.mailinator.com"));
  assert.ok(!isDisposable("example.com"));
});

test("exact duplicates ignore case; gmail dot and plus aliases are flagged separately", () => {
  const r = validate(file("A@x.com,a,subscribed", "a@X.com,a,subscribed", "j.o.e@gmail.com,j,subscribed", "joe+promo@gmail.com,j,subscribed", "joe@googlemail.com,j,subscribed", "p+1@example.com,p,subscribed", "p@example.com,p,subscribed"));
  assert.equal(of(r, "dup").length, 1);
  assert.equal(of(r, "alias-dup").length, 2);
  assert.equal(aliasKey("J.O.E+x@GoogleMail.com"), "joe@gmail.com");
  assert.equal(aliasKey("p+1@example.com"), "p+1@example.com");
});

test("blank email and whitespace", () => {
  const r = validate(file(",A,subscribed", "  b@x.com,B,subscribed", "c@x.com ,C,subscribed"));
  assert.equal(of(r, "blank").length, 1);
  assert.equal(of(r, "email-space").length, 2);
  assert.equal(r.summary.counts.valid, 2);
});

test("a missing email column is an error and names the headings", () => {
  const r = validate("Name,Phone\nA,1\n");
  assert.ok(has(r, "no-email-column"));
  assert.match(of(r, "no-email-column")[0].detail, /"Name"/);
  assert.equal(repair("Name,Phone\nA,1\n").error.length > 0, true);
});

test("Excel damage: scientific notation, stripped zeros, .0, error values, BOM", () => {
  const r = validate("﻿Email,Phone,ZIP\na@x.com,5.55E+09,2108\nb@x.com,5555550101,02108\nc@x.com,5555550102.0,94110\nd@x.com,#NAME?,10001\n");
  for (const c of ["bom", "sci", "zeros", "dot-zero", "excel-error"]) assert.ok(has(r, c), c);
  assert.equal(r.summary.emailColumn, "Email");
});

test("phone numbers one digit short of the column's usual length are flagged", () => {
  const r = validate("Email,Phone\na@x.com,07700900123\nb@x.com,7700900124\nc@x.com,07700900125\n");
  assert.ok(has(r, "zeros"));
});

test("mojibake is reported once per row", () => {
  const r = validate(file("a@x.com,JosÃ© GarcÃ­a,subscribed"));
  assert.equal(of(r, "mojibake").length, 1);
  assert.match(of(r, "mojibake")[0].detail, /line 2\b/);
});

test("delimiters: semicolon file, and a row using the other separator", () => {
  const r = validate("Email;Name\na@x.com;A\nb@x.com,B\n");
  assert.ok(has(r, "delimiter"));
  assert.ok(has(r, "mixed-delim"));
  assert.ok(!has(r, "ragged"));
});

test("ragged rows are errors", () => {
  const r = validate(file("a@x.com,A", "b@x.com,B,subscribed,extra"));
  assert.equal(of(r, "ragged").length, 2);
});

test("unterminated quote stops the check", () => {
  const r = validate('Email,Name\na@x.com,"A\nb@x.com,B\n');
  assert.ok(has(r, "quote"));
  assert.equal(r.findings.length, 1);
});

test("consent column hints", () => {
  const r = validate(file("a@x.com,A,unsubscribed", "b@x.com,B,subscribed", "c@x.com,C,cleaned"));
  assert.ok(has(r, "consent-col"));
  assert.match(of(r, "unsubscribed")[0].title, /^2 rows/);
  assert.ok(has(validate("Email,Name\na@x.com,A\n"), "no-consent-col"));
  assert.ok(has(validate("Email,Opt-in\na@x.com,no\n"), "unsubscribed"));
});

test("platform heading checks", () => {
  const e = (h, p) => validate(`${h}\na@x.com,A\n`, { platform: p });
  assert.ok(!has(e("Email Address,First Name", "mailchimp"), "platform-email"));
  assert.ok(has(e("Email,First Name", "mailchimp"), "platform-email"));
  assert.ok(!has(e("Email,First Name", "hubspot"), "platform-email"));
  assert.ok(!has(e("EMAIL,FIRSTNAME", "brevo"), "platform-email"));
  assert.ok(has(e("Email,First Name", "brevo"), "platform-email"));
  assert.ok(has(e("Name,Phone", "klaviyo"), "platform-email"));
  const r = validate("email_address,first_name\na@x.com,A\n");
  assert.equal(r.summary.platforms.length, Object.keys(PLATFORMS).length);
  assert.equal(r.summary.platforms.find((p) => p.id === "mailchimp").renames.length, 2);
});

test("findings are capped per check and sorted errors first", () => {
  const rows = Array.from({ length: 200 }, (_, i) => `bad${i},x,subscribed`);
  const r = validate(file(...rows));
  assert.ok(of(r, "invalid").length === 60);
  assert.ok(has(r, "invalid-more"));
  assert.equal(r.summary.counts.invalid, 200);
  assert.equal(r.findings[0].severity, "error");
});

test("repair trims, lowercases, dedupes and rejects with reasons", () => {
  const fix = repair(file(" A@X.com ,Ann ,subscribed", "a@x.com,Ann,subscribed", "nope,Bob,subscribed", ",Cy,subscribed", "d@x.com,Di"));
  assert.equal(fix.text, "Email,First Name,Status\r\na@x.com,Ann,subscribed\r\n");
  assert.equal(fix.kept, 1);
  assert.equal(fix.rejected, 4);
  const rej = parseCsv(fix.rejectedText).rows.map((r) => r.cells);
  assert.deepEqual(rej[0].slice(-2), ["Rejected reason", "Original line"]);
  assert.deepEqual(rej.slice(1).map((r) => r[3]), ["Duplicate of line 2", "Invalid email: has no @", "Email is blank", "Wrong number of cells (2, expected 3)"]);
});

test("typo domains are fixed only when opted in, and are deduped after the fix", () => {
  const src = file("a@gmail.com,A,subscribed", "a@gmial.com,A,subscribed", "b@yahoo.con,B,subscribed");
  const off = repair(src);
  assert.match(off.text, /gmial\.com/);
  const on = repair(src, { fixTypos: true });
  assert.doesNotMatch(on.text, /gmial|\.con/);
  assert.match(on.text, /b@yahoo\.com/);
  assert.equal(on.kept, 2);
  assert.match(on.rejectedText, /Duplicate of line 2/);
  assert.ok(on.changes.some((c) => /Fixed 2 typo domains/.test(c)));
});

test("repair never drops alias duplicates or role and disposable addresses", () => {
  const fix = repair(file("a.b@gmail.com,A,subscribed", "ab@gmail.com,A,subscribed", "info@x.com,I,subscribed", "t@mailinator.com,T,subscribed"));
  assert.equal(fix.kept, 4);
  assert.equal(fix.rejectedText, null);
});

test("repair converts delimiter, removes BOM, renames headings for the chosen platform", () => {
  const fix = repair("﻿E-mail;Name\na@x.com;A\nb@x.com,B\n", { platform: "mailchimp" });
  assert.equal(fix.text, "Email Address,Name\r\na@x.com,A\r\nb@x.com,B\r\n");
  assert.ok(fix.changes.some((c) => /byte order mark/.test(c)));
  assert.ok(fix.changes.some((c) => /Renamed heading "E-mail" to "Email Address"/.test(c)));
  assert.ok(fix.changes.some((c) => /Re-split 1 row/.test(c)));
});

test("repair leaves other values alone: names, phones with Excel damage and ZIP digits", () => {
  const fix = repair("Email,Name,Phone,ZIP\na@x.com,JosÃ©,5.55E+09,2108\n");
  assert.equal(fix.text, "Email,Name,Phone,ZIP\r\na@x.com,JosÃ©,5.55E+09,2108\r\n");
});

test("repair on the broken sample leaves a file with no errors", () => {
  const fix = repair(sampleBrokenFile(), { fixTypos: true, platform: "mailchimp" });
  const again = validate(fix.text, { platform: "mailchimp" });
  assert.deepEqual(again.findings.filter((f) => f.severity === "error"), []);
  assert.ok(fix.rejected >= 4);
});

test("quoted commas and newlines survive a round trip", () => {
  const src = 'Email,Name\r\na@x.com,"Smith, ""Al"""\r\nb@x.com,"two\nlines"\r\n';
  const fix = repair(src);
  assert.deepEqual(parseCsv(fix.text).rows.map((r) => r.cells), parseCsv(src).rows.map((r) => r.cells));
  assert.equal(toCsv([["a", " b", "c,d"]]), 'a," b","c,d"\r\n');
});

test("decodeBuffer keeps a UTF-8 BOM visible and reads UTF-16", () => {
  const u8 = new Uint8Array([0xef, 0xbb, 0xbf, 0x45]);
  assert.equal(decodeBuffer(u8), "﻿E");
  const u16 = new Uint8Array([0xff, 0xfe, 0x45, 0x00, 0x6d, 0x00]);
  assert.equal(decodeBuffer(u16), "﻿Em");
  assert.ok(validate(decodeBuffer(u8) + "mail\na@x.com\n").summary.bom);
});

test("findings CSV defuses spreadsheet formulas", () => {
  const r = validate(file("=cmd|x@x.com,A,subscribed"));
  const csv = findingsCsv(r);
  assert.match(csv, /^Severity,Line,Check,Finding,Detail/);
  assert.doesNotMatch(csv, /(^|,)=/m);
});

test("empty input", () => {
  assert.ok(has(validate("  \n"), "empty"));
  assert.match(repair("").error, /empty/);
});
