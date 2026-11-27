// The CII schema pass (cii-xsd.mjs): the EN 16931 subset of UN/CEFACT D16B, read from CEN's XSD.
// Every expected verdict below was checked with xmllint against the same XSD (2026-11-26,
// eval/cii-xsd-2026-11-26.md), so a fault this pass reports is one a schema validator reports.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkAgainstCiiSchema, schemaApplies } from "./cii-xsd.mjs";
import { preflightDocuments } from "./report.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const CLEAN = read("./examples/xrechnung-cii-invoice.xml");
const rules = (text) => checkAgainstCiiSchema(text).findings.map((f) => f.rule);
const swap = (text, a, b) => {
  const i = text.indexOf(a);
  const j = text.indexOf(b);
  assert.ok(i >= 0 && j > i, "fixture changed");
  return text.slice(0, i) + b + text.slice(i + a.length, j) + a + text.slice(j + b.length);
};

test("the shipped EN 16931, XRechnung, NLCIUS and French CII examples pass the schema", () => {
  for (const f of ["./examples/cii-invoice.xml", "./examples/xrechnung-cii-invoice.xml", "./examples/xrechnung-cii-credit-note.xml",
    "./examples/nlcius-cii-invoice.xml", "./fixtures/fr-fnfe/uc1-en16931-cii.xml"]) {
    const r = checkAgainstCiiSchema(read(f));
    assert.equal(r.applied, true, f);
    assert.deepEqual(r.findings, [], f);
  }
});

test("which specification identifiers (BT-24) the subset schema governs", () => {
  assert.equal(schemaApplies("urn:cen.eu:en16931:2017"), true);
  assert.equal(schemaApplies(" urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0 "), true);
  assert.equal(schemaApplies("urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic"), true);
  assert.equal(schemaApplies("urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended"), false);
  assert.equal(schemaApplies("urn:factur-x.eu:1p0:minimum"), false);
  assert.equal(schemaApplies("urn:factur-x.eu:1p0:basicwl"), false);
  assert.equal(schemaApplies("urn:ferd:CrossIndustryDocument:invoice:1p0:comfort"), false);
  assert.equal(schemaApplies(""), false);
});

test("an EXTENDED file is checked by its own schema, not the subset, so its extra elements pass", () => {
  const r = checkAgainstCiiSchema(read("./fixtures/fr-fnfe/uc12-sous-ligne-extended-fx-cii.xml"));
  assert.equal(r.applied, true);
  assert.equal(r.schema, "extended");
  assert.deepEqual(r.findings, []);
});

test("CII-002: elements out of sequence (PaymentReference after the currency, Allowance before Charge)", () => {
  const a = swap(CLEAN, "<ram:LineTotalAmount>", "<ram:TaxBasisTotalAmount>");
  // swap() exchanges only the opening tags; restore well-formedness by swapping the closers too.
  const b = swap(a, "</ram:LineTotalAmount>", "</ram:TaxBasisTotalAmount>");
  const r = checkAgainstCiiSchema(b);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-002"]);
  assert.match(r.findings[0].message, /out of place in SpecifiedTradeSettlementHeaderMonetarySummation/);
  assert.match(r.findings[0].path, /MonetarySummation\/LineTotalAmount$/);
});

test("CII-003: a required element missing (the invoice number, BT-1)", () => {
  const text = CLEAN.replace(/<ram:ID>[^<]*<\/ram:ID>\s*(<ram:TypeCode>380)/, "$1");
  assert.notEqual(text, CLEAN);
  const r = checkAgainstCiiSchema(text);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-003"]);
  assert.match(r.findings[0].message, /^ID is required in ExchangedDocument/);
});

test("CII-001: an element the schema does not allow here", () => {
  const text = CLEAN.replace("<ram:TypeCode>380</ram:TypeCode>", "<ram:TypeCode>380</ram:TypeCode><ram:InvoiceNumber>1</ram:InvoiceNumber>");
  assert.deepEqual(rules(text), ["CII-001"]);
});

test("CII-004: a decimal written with a comma, and an Indicator that is not true/false; the value is never echoed", () => {
  const text = CLEAN.replace(/<ram:LineTotalAmount>([\d.]+)<\/ram:LineTotalAmount>/, "<ram:LineTotalAmount>1234,56</ram:LineTotalAmount>");
  assert.notEqual(text, CLEAN);
  const r = checkAgainstCiiSchema(text);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-004"]);
  assert.match(r.findings[0].message, /LineTotalAmount is not a number/);
  assert.equal(JSON.stringify(r.findings).includes("1234,56"), false);
  const yes = CLEAN.replace(/<udt:Indicator>(true|false)<\/udt:Indicator>/, "<udt:Indicator>ja</udt:Indicator>");
  if (yes !== CLEAN) assert.deepEqual(rules(yes), ["CII-004"]);
});

test("CII-005: an attribute fixed by the schema written with another value", () => {
  const text = CLEAN.replace("<ram:InvoiceCurrencyCode>", '<ram:InvoiceCurrencyCode listID="ISO4217">');
  assert.notEqual(text, CLEAN);
  const r = checkAgainstCiiSchema(text);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-005"]);
  assert.match(r.findings[0].message, /listID of InvoiceCurrencyCode must be "ISO 4217 3A"/);
  assert.deepEqual(rules(CLEAN.replace("<ram:InvoiceCurrencyCode>", '<ram:InvoiceCurrencyCode listID="ISO 4217 3A">')), []);
});

test("CII-006: a cut-off file", () => {
  const r = checkAgainstCiiSchema(CLEAN.slice(0, Math.floor(CLEAN.length / 2)));
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-006"]);
});

test("CII-007: udt:DateTimeString where the schema wants qdt (the preceding invoice's date, BT-26)", () => {
  const good = read("./examples/xrechnung-cii-credit-note.xml");
  const bad = good.replace(/<qdt:DateTimeString( format="102">\d+<\/)qdt:DateTimeString>/, "<udt:DateTimeString$1udt:DateTimeString>");
  assert.notEqual(bad, good);
  const r = checkAgainstCiiSchema(bad);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-007"]);
  assert.match(r.findings[0].message, /DateTimeString inside FormattedIssueDateTime is in the udt .* the qdt/);
  assert.match(r.findings[0].path, /InvoiceReferencedDocument\/FormattedIssueDateTime\/DateTimeString$/);
});

test("CII-007: namespaces follow the declarations, not the prefixes (a default namespace, a renamed prefix)", () => {
  // Same document with ram bound to "r": still valid.
  const renamed = CLEAN.replaceAll("ram:", "r:").replace("xmlns:ram=", "xmlns:r=");
  assert.notEqual(renamed, CLEAN);
  assert.deepEqual(rules(renamed), []);
  // ram's elements put in udt by binding the prefix to the wrong URI on one element.
  const wrong = CLEAN.replace("<ram:BuyerReference>", '<ram:BuyerReference xmlns:ram="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">');
  assert.notEqual(wrong, CLEAN);
  assert.deepEqual(rules(wrong), ["CII-007"]);
});

test("the report runs the schema pass on CII files and reports it beside the built-in rules", async () => {
  const text = swap(swap(CLEAN, "<ram:LineTotalAmount>", "<ram:TaxBasisTotalAmount>"), "</ram:LineTotalAmount>", "</ram:TaxBasisTotalAmount>");
  const { reports } = await preflightDocuments([{ name: "x.xml", source: text }]);
  assert.ok(reports[0].errors.some((e) => e.rule === "CII-002"));
  const clean = await preflightDocuments([{ name: "x.xml", source: CLEAN }]);
  assert.equal(clean.reports[0].errors.some((e) => /^CII-/.test(e.rule)), false);
});
