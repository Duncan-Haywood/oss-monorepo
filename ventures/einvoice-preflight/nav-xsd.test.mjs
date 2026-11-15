import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAgainstNavSchema, navValueProblem, parseNsTree, NAV_XSD_SOURCE } from "./nav-xsd.mjs";
import { checkNavInvoice } from "./hungary-nav.mjs";
import schema from "./nav-xsd-data.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/hungary-nav/${f}`, import.meta.url), "utf8");
const FILES = ["foreign-currency.xml", "simplified.xml", "modification.xml", "several-vat-types.xml", "product-fee.xml"];
const rules = (xml) => checkAgainstNavSchema(xml).map((f) => f.rule);

test("the table is read from NAV's 3.0 schemas with NTCA common 1.0", () => {
  assert.match(NAV_XSD_SOURCE, /common-1\.0\.0/);
  assert.equal(schema.namespaces.common, "http://schemas.nav.gov.hu/NTCA/1.0/common");
  assert.equal(schema.root.ns, "data");
  assert.deepEqual(schema.simple["data:ProductFeeMeasuringUnitType"].enum, ["DARAB", "KG"]);
});

test("NAV's own samples pass the schema pass (xmllint agrees)", () => {
  for (const f of FILES) assert.deepEqual(checkAgainstNavSchema(read(f)), [], f);
});

test("namespaces are resolved per element, defaults and prefixes", () => {
  const t = parseNsTree('<a xmlns="urn:x" xmlns:p="urn:p"><p:b/><c xmlns="urn:y"><d/></c></a>');
  const a = t.children[0];
  assert.equal(a.ns, "urn:x");
  assert.equal(a.children[0].ns, "urn:p");
  assert.equal(a.children[1].children[0].ns, "urn:y");
});

test("an element moved into the wrong namespace is HU-031", () => {
  const xml = read("foreign-currency.xml").replace(/<base:countryCode>(\w+)<\/base:countryCode>/, "<countryCode>$1</countryCode>");
  const f = checkAgainstNavSchema(xml);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, "HU-031");
  assert.match(f[0].message, /countryCode.*base:/);
});

test("out of order, missing, unknown and duplicated elements", () => {
  const base = read("foreign-currency.xml");
  assert.deepEqual(rules(base.replace(/(<invoiceNumber>[^<]*<\/invoiceNumber>)(\s*)(<invoiceIssueDate>[^<]*<\/invoiceIssueDate>)/, "$3$2$1")), ["HU-028"]);
  assert.deepEqual(rules(base.replace(/<invoiceIssueDate>[^<]*<\/invoiceIssueDate>/, "")), ["HU-029"]);
  assert.deepEqual(rules(base.replace(/<invoiceIssueDate>/, "<extraField>1</extraField><invoiceIssueDate>")), ["HU-027"]);
  assert.deepEqual(rules(base.replace(/(<invoiceIssueDate>[^<]*<\/invoiceIssueDate>)/, "$1$1")), ["HU-027"]);
});

test("values: code lists, decimals, dates, empty text", () => {
  assert.match(navValueProblem("data:ProductFeeMeasuringUnitType", "LITER"), /not one of DARAB, KG/);
  assert.match(navValueProblem("base:MonetaryType", "1.123"), /decimal places/);
  assert.equal(navValueProblem("base:MonetaryType", "1.120"), "");
  assert.match(navValueProblem("base:InvoiceDateType", "2009-12-31"), /before 2010-01-01/);
  assert.match(navValueProblem("base:InvoiceDateType", "2026-02-30"), /YYYY-MM-DD/);
  assert.match(navValueProblem("common:SimpleText255NotBlankType", ""), /empty|format/);
  const xml = read("product-fee.xml").replace("<productFeeMeasuringUnit>KG</productFeeMeasuringUnit>", "<productFeeMeasuringUnit>kg</productFeeMeasuringUnit>");
  const f = checkAgainstNavSchema(xml);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, "HU-030");
  assert.ok(!f[0].message.includes("kg"), "never echoes the value");
});

test("a fixed element with another value", () => {
  const xml = read("several-vat-types.xml").replace("<vatDomesticReverseCharge>true</vatDomesticReverseCharge>", "<vatDomesticReverseCharge>false</vatDomesticReverseCharge>");
  assert.notEqual(xml, read("several-vat-types.xml"));
  assert.ok(checkAgainstNavSchema(xml).some((f) => f.rule === "HU-030" && /can only be true/.test(f.message)));
});

test("InvoiceData in the wrong namespace is one HU-031, nothing else", () => {
  const xml = read("simplified.xml").replace('xmlns="http://schemas.nav.gov.hu/OSA/3.0/data"', 'xmlns="http://schemas.nav.gov.hu/OSA/2.0/data"');
  assert.deepEqual(rules(xml), ["HU-031"]);
});

test("the schema findings come out of checkNavInvoice as errors", () => {
  const xml = read("simplified.xml").replace(/<invoiceIssueDate>[^<]*<\/invoiceIssueDate>/, "");
  const r = checkNavInvoice(xml);
  const f = r.findings.find((x) => x.rule === "HU-029");
  assert.ok(f);
  assert.equal(f.severity, undefined);
});
