// The NAV Online Számla 3.0 schema pass (hu-xsd.mjs, HU-027..HU-032) on NAV's own samples
// (fixtures/hungary-nav, MIT) and on faults seeded into them. Each seeded fault here was
// also judged by xmllint on NAV's XSD in eval/hu-xsd-diff.mjs (eval/hungary-nav-xsd-2026-11-15.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNavInvoice } from "./hungary-nav.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { checkAgainstNavSchema } from "./hu-xsd.mjs";
import { checkAgainstFa3Schema } from "./fa3-xsd.mjs";
import schema from "./hu-xsd-data.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/hungary-nav/${f}`, import.meta.url), "utf8");
const samples = ["foreign-currency.xml", "simplified.xml", "modification.xml", "several-vat-types.xml"].map(read);
const foreign = samples[0];
const schemaFindings = (xml) => checkNavInvoice(xml).findings.filter((f) => /^HU-0(2[7-9]|3[0-2])$/.test(f.rule));
const only = (xml) => schemaFindings(xml).map((f) => f.rule);

test("the table is read from NAV's three schema files, keyed by namespace", () => {
  assert.match(schema.source, /invoiceData\.xsd/);
  assert.match(schema.source, /NTCA common 1\.0/);
  assert.equal(schema.root, "#InvoiceData");
  assert.ok(schema.simple["common:TaxpayerIdType"], "common.xsd types are present");
  assert.ok(schema.complex["base:TaxNumberType"], "invoiceBase.xsd types are present");
  assert.ok(Object.values(schema.complex).length >= 80);
});

test("NAV's samples pass the schema", () => {
  for (const xml of samples) assert.deepEqual(schemaFindings(xml), []);
});

test("structure faults: unknown, repeated, out of order, missing", () => {
  assert.deepEqual(only(foreign.replace("<invoiceIssueDate>", "<invoiceNote>x</invoiceNote><invoiceIssueDate>")), ["HU-027"]);
  assert.deepEqual(only(foreign.replace(/(<invoiceIssueDate>[^<]*<\/invoiceIssueDate>)/, "$1$1")), ["HU-027"]);
  const swapped = foreign.replace(/(<invoiceNumber>[^<]*<\/invoiceNumber>)(\s*)(<invoiceIssueDate>[^<]*<\/invoiceIssueDate>)/, "$3$2$1");
  const s = schemaFindings(swapped);
  assert.deepEqual(s.map((f) => f.rule), ["HU-028"]);
  assert.match(s[0].message, /out of place in InvoiceData/);
  const missing = schemaFindings(foreign.replace(/<currencyCode>[^<]*<\/currencyCode>/, ""));
  assert.deepEqual(missing.map((f) => f.rule), ["HU-029"]);
  assert.match(missing[0].message, /currencyCode is required in invoiceDetail/);
  assert.match(missing[0].message, /SCHEMA_VIOLATION/);
});

test("value faults name the element and never echo the value", () => {
  const badId = schemaFindings(foreign.replace("<base:taxpayerId>99999999<", "<base:taxpayerId>9999999X<"));
  assert.deepEqual(badId.map((f) => f.rule), ["HU-030"]);
  assert.match(badId[0].message, /taxpayerId does not match the format/);
  assert.ok(!badId[0].message.includes("9999999X"));
  assert.deepEqual(only(foreign.replace("<currencyCode>EUR<", "<currencyCode>eur<")), ["HU-030"]);
  assert.deepEqual(only(foreign.replace("<invoiceIssueDate>2021-05-15<", "<invoiceIssueDate>2021-05<")), ["HU-030"]);
  const unit = schemaFindings(foreign.replace("<unitOfMeasure>KILOGRAM<", "<unitOfMeasure>KILO<"));
  assert.deepEqual(unit.map((f) => f.rule), ["HU-030"]);
  assert.match(unit[0].message, /unitOfMeasure is not/);
});

test("namespace faults: a base: element without its prefix, a data element with one, a root with no namespace", () => {
  const dropped = schemaFindings(foreign.replace("<base:taxpayerId>99999999</base:taxpayerId>", "<taxpayerId>99999999</taxpayerId>"));
  assert.deepEqual(dropped.map((f) => f.rule), ["HU-032"]);
  assert.match(dropped[0].message, /taxpayerId inside supplierTaxNumber is in the data namespace; NAV's schema puts it in the base namespace/);
  assert.match(dropped[0].fix, /base: prefix/);
  assert.equal(dropped[0].path, "/InvoiceData/invoiceMain/invoice/invoiceHead/supplierInfo/supplierTaxNumber/taxpayerId");
  const added = schemaFindings(foreign.replace("<currencyCode>EUR</currencyCode>", "<base:currencyCode>EUR</base:currencyCode>"));
  assert.deepEqual(added.map((f) => f.rule), ["HU-032"]);
  assert.match(added[0].fix, /default namespace/);
  const undeclared = schemaFindings(foreign.replace("<currencyCode>EUR</currencyCode>", "<x:currencyCode>EUR</x:currencyCode>"));
  assert.match(undeclared[0].message, /an undeclared prefix/);
  const bare = schemaFindings(foreign.replace(' xmlns="http://schemas.nav.gov.hu/OSA/3.0/data"', ""));
  assert.deepEqual(bare.map((f) => f.rule), ["HU-032"], "one finding for the root, not one per element");
});

test("NAV's API sample still carries 2.0's privatePersonIndicator; the fix names its 3.0 replacement", () => {
  const r = checkNavInvoice(read("manageInvoice.xml"));
  const extra = r.findings.filter((f) => f.rule === "HU-027");
  assert.equal(extra.length, 3);
  assert.ok(extra.every((f) => /customerVatStatus/.test(f.fix) && /PRIVATE_PERSON/.test(f.fix)));
});

test("a summary row with an empty vatRate is a schema fault, not a crash", () => {
  const xml = foreign.replace(/<vatRate>\s*<vatPercentage>[^<]*<\/vatPercentage>\s*<\/vatRate>/, "<vatRate></vatRate>");
  assert.notEqual(xml, foreign);
  const r = checkNavInvoice(xml);
  assert.ok(r.findings.some((f) => f.rule === "HU-029" || f.rule === "HU-028"));
});

test("fixed=\"true\" elements: empty takes the fixed value, 1 is true, false is refused", () => {
  const xml = read("several-vat-types.xml");
  assert.ok(xml.includes("<vatDomesticReverseCharge>true</vatDomesticReverseCharge>"));
  const as = (v) => only(xml.replace("<vatDomesticReverseCharge>true</vatDomesticReverseCharge>", `<vatDomesticReverseCharge>${v}</vatDomesticReverseCharge>`));
  assert.deepEqual(as(""), []);
  assert.deepEqual(as("1"), []);
  assert.deepEqual(as("false"), ["HU-030"]);
  assert.deepEqual(as("0"), ["HU-030"]);
  assert.deepEqual(as("yes"), ["HU-030"]);
});

test("checkAgainstNavSchema without text skips only the namespace check", () => {
  const xml = foreign.replace("<base:taxpayerId>99999999</base:taxpayerId>", "<taxpayerId>99999999</taxpayerId>");
  const root = parseXmlTree(xml).children.find((c) => c.name === "InvoiceData");
  assert.deepEqual(checkAgainstNavSchema(root), []);
  assert.deepEqual(checkAgainstNavSchema(root, "/InvoiceData", xml).map((f) => f.rule), ["HU-032"]);
});

test("the shared validator still drives FA(3) with its own codes", () => {
  const fa3 = readFileSync(new URL("./examples/fa3-invoice.xml", import.meta.url), "utf8");
  const root = parseXmlTree(fa3).children.find((c) => c.name === "Faktura");
  assert.deepEqual(checkAgainstFa3Schema(root, fa3), []);
  const broken = fa3.replace(/<P_2>[^<]*<\/P_2>/, "");
  const r = checkAgainstFa3Schema(parseXmlTree(broken).children.find((c) => c.name === "Faktura"), broken);
  assert.ok(r.length && r.every((f) => /^PL-01[2-6]$/.test(f.rule)));
  const badDate = fa3.replace(/<P_1>[^<]*<\/P_1>/, "<P_1>2026-13</P_1>");
  const v = checkAgainstFa3Schema(parseXmlTree(badDate).children.find((c) => c.name === "Faktura"), badDate);
  assert.deepEqual(v.map((f) => f.rule), ["PL-015"]);
  assert.match(v[0].fix, /KSeF refuses/);
});
