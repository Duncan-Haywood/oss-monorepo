import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS, COUNTRIES } from "./calc.mjs";

const H = COLUMNS;
const file = (...rows) => toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const OK = { "First Name": "A", "Last Name": "B", Email: "a@example.com", Phone: "+16175550101", "Accepts Email Marketing": "no", "Accepts SMS Marketing": "no" };

test("clean example has no errors or warnings, broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.rows, 3);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error"));
  assert.ok(bad.findings.some((f) => f.severity === "warning"));
});

test("parser handles quotes, embedded newlines and reports lines", () => {
  const p = parseCsv('a,b\n"x, ""y""","l1\nl2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "l1\nl2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("empty file, missing contact columns, unterminated quote", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("First Name,Last Name\nA,B\n")).includes("missing-column"));
  assert.equal(validate('Email,Phone\n"a,1\n').findings[0].code, "quote");
});

test("headers: unknown, case, duplicate; template names are accepted", () => {
  const r = validate("Email,email,Fist Name,Frobnicate\na@example.com,a@example.com,x,y\n");
  assert.ok(codes(r).includes("dup-header"));
  assert.ok(codes(r).includes("header-case"));
  assert.equal(r.findings.filter((f) => f.code === "unknown-header").length, 2);
  assert.ok(r.findings.find((f) => f.code === "unknown-header").detail.includes('"First Name"'));
  assert.equal(closestColumn("Defualt Address City"), "Default Address City");
  const t = validate("First Name,Email,Province Code,Country Code,Zip\nA,a@example.com,ON,CA,M5V 2T6\n");
  assert.deepEqual(t.findings.filter((f) => f.severity !== "info"), []);
});

test("semicolon file is reported and repaired", () => {
  const text = "Email;Phone\na@example.com;+16175550101\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  assert.match(repair(text).text, /^Email,Phone\r\n/);
});

test("email validity and case-insensitive duplicates", () => {
  const r = validate(file(OK, { ...OK, Email: "A@Example.com", Phone: "+16175550102" }, { ...OK, Email: "nope", Phone: "+16175550103" }));
  assert.ok(codes(r).includes("dup-email"));
  assert.equal(r.findings.find((f) => f.code === "dup-email").line, 3);
  assert.ok(codes(r).includes("email"));
});

test("rows with neither email nor phone", () => {
  const r = validate(file(OK, { "First Name": "X", "Accepts Email Marketing": "no" }));
  assert.equal(r.findings.find((f) => f.code === "no-contact").line, 3);
});

test("phone: E.164, Excel scientific notation, punctuation, duplicates", () => {
  assert.ok(codes(validate(file({ ...OK, Phone: "6175550101" }))).includes("phone-e164"));
  assert.ok(codes(validate(file({ ...OK, Phone: "4.16556E+09" }))).includes("phone-excel"));
  const p = validate(file({ ...OK, Phone: "+1 (617) 555-0101" }));
  assert.ok(codes(p).includes("phone-punct"));
  assert.ok(!codes(p).includes("phone-e164"));
  assert.ok(codes(validate(file(OK, { ...OK, Email: "z@example.com" }))).includes("dup-phone"));
  assert.ok(!codes(validate(file({ ...OK, Phone: "'+16175550101" }))).includes("phone-e164"));
});

test("zip: leading zeros, decimal ending, scientific notation", () => {
  const z = (zip, cc = "US") => codes(validate(file({ ...OK, "Default Address Zip": zip, "Default Address Country Code": cc })));
  assert.ok(z("2108").includes("zip-zero"));
  assert.ok(z("501").includes("zip-zero"));
  assert.ok(!z("02108").includes("zip-zero"));
  assert.ok(z("2108.0").includes("zip-decimal"));
  assert.ok(z("1.2E+10").includes("zip-excel"));
  assert.ok(!z("2108", "GB").includes("zip-zero"));
});

test("country and province codes", () => {
  const c = (cc, pc = "") => codes(validate(file({ ...OK, "Default Address Country Code": cc, "Default Address Province Code": pc })));
  assert.ok(c("United States").includes("country-code"));
  assert.ok(c("ZZ").includes("country-code"));
  assert.ok(c("us").includes("country-case"));
  assert.ok(c("US", "XX").includes("province-code"));
  assert.ok(!c("US", "MA").includes("province-code"));
  assert.ok(c("CA", "CA").includes("province-code"));
  assert.ok(!c("CA", "ON").includes("province-code"));
  assert.ok(COUNTRIES.has("GB") && !COUNTRIES.has("UK"));
});

test("consent and tax-exempt values", () => {
  const v = (k, val) => codes(validate(file({ ...OK, [k]: val })));
  assert.ok(v("Accepts Email Marketing", "Y").includes("emailMkt-value"));
  assert.ok(v("Accepts SMS Marketing", "1").includes("smsMkt-value"));
  assert.ok(v("Tax Exempt", "maybe").includes("taxExempt-value"));
  for (const ok of ["yes", "No", "TRUE", "false"]) assert.ok(!v("Accepts Email Marketing", ok).includes("emailMkt-value"), ok);
  assert.ok(v("Accepts Email Marketing", "Yes").includes("emailMkt-case"));
});

test("consent note appears with opt-ins and warns about missing contact points", () => {
  const r = validate(file({ ...OK, "Accepts SMS Marketing": "yes" }, { "First Name": "N", Email: "", Phone: "+16175550102", "Accepts Email Marketing": "yes" }));
  assert.ok(codes(r).includes("consent-note"));
  assert.ok(codes(r).includes("optin-no-email"));
  assert.match(r.findings.find((f) => f.code === "consent-note").detail, /never creates, upgrades or changes consent/);
  assert.ok(!codes(validate(file(OK))).includes("consent-note"));
});

test("tags over 255 characters or 250 in number", () => {
  assert.ok(codes(validate(file({ ...OK, Tags: "a," + "x".repeat(256) }))).includes("tag-length"));
  assert.ok(!codes(validate(file({ ...OK, Tags: "x".repeat(255) }))).includes("tag-length"));
  const many = Array.from({ length: 251 }, (_, i) => `t${i}`).join(",");
  assert.ok(codes(validate(file({ ...OK, Tags: many }))).includes("tags-count"));
});

test("Total Spent and Total Orders formats; extra cells", () => {
  assert.ok(codes(validate(file({ ...OK, "Total Spent": "$1,000.00" }))).includes("spent"));
  assert.ok(codes(validate(file({ ...OK, "Total Orders": "2.5" }))).includes("orders"));
  assert.ok(codes(validate("Email,Phone\na@example.com,+16175550101,extra\n")).includes("extra-cells"));
});

test("repair touches formatting only, lists every change, and never invents data", () => {
  const src = file({ ...OK, Email: " a@example.com ", Phone: "+1 617 555 0101", "Accepts Email Marketing": "Yes", "Default Address Country Code": "us", "Default Address Province Code": "ma", "Default Address Zip": "2108.0", "Total Spent": "$5.00", Note: "  keep me  ", Tags: "Keep, Tags", "First Name": "ada" });
  const fix = repair(src);
  const out = parseCsv(fix.text).rows[1].cells;
  const get = (h) => out[H.indexOf(h)];
  assert.equal(get("Email"), "a@example.com");
  assert.equal(get("Phone"), "+16175550101");
  assert.equal(get("Accepts Email Marketing"), "yes");
  assert.equal(get("Default Address Country Code"), "US");
  assert.equal(get("Default Address Province Code"), "MA");
  assert.equal(get("Default Address Zip"), "2108");
  assert.equal(get("Total Spent"), "5.00");
  assert.equal(get("Note"), "  keep me  ");
  assert.equal(get("Tags"), "Keep, Tags");
  assert.equal(get("First Name"), "ada");
  assert.ok(fix.changes.length >= 7);
  assert.ok(fix.changes.every((c) => /→|renamed|Converted/.test(c)));
});

test("repair never turns an ambiguous consent value into consent, or guesses a zip or phone", () => {
  const fix = repair(file({ ...OK, "Accepts SMS Marketing": "Y", "Accepts Email Marketing": "1", Phone: "6175550101", "Default Address Zip": "2108", "Default Address Country Code": "US" }));
  const out = parseCsv(fix.text).rows[1].cells;
  assert.equal(out[H.indexOf("Accepts SMS Marketing")], "Y");
  assert.equal(out[H.indexOf("Accepts Email Marketing")], "1");
  assert.equal(out[H.indexOf("Phone")], "6175550101");
  assert.equal(out[H.indexOf("Default Address Zip")], "2108");
});

test("repaired broken sample has fewer findings than the original", () => {
  const src = sampleBrokenFile();
  const before = validate(src).findings.length;
  assert.ok(validate(repair(src).text).findings.length < before);
});

test("findingsCsv round-trips", () => {
  const rows = parseCsv(findingsCsv(validate(sampleBrokenFile()))).rows;
  assert.deepEqual(rows[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.ok(rows.length > 5);
});
