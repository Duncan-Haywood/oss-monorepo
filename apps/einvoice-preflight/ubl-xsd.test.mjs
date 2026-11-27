// The UBL 2.1 schema pass (ubl-xsd.mjs, UBL-XSD-01..07), read from the OASIS UBL 2.1 XSD
// by build-ubl-schema.mjs. Every verdict on a whole file here was also checked with
// xmllint on the real XSD; eval/ubl-xsd-diff.mjs repeats that on seeded mutations
// (eval/ubl-xsd-2026-11-26.md).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkAgainstUblSchema, looksLikeUblDocument, UBL_SCHEMA_SOURCE } from "./ubl-xsd.mjs";
import { preflightDocuments } from "./report.mjs";
import { TEMPLATES } from "./pro/explain-catalog.mjs";
import schema from "./ubl-xsd-data.mjs";

const read = (f) => readFileSync(new URL(`./examples/${f}`, import.meta.url), "utf8");
const rules = (xml) => checkAgainstUblSchema(xml).map((f) => f.rule);
const base = read("ubl-invoice.xml");
const credit = read("peppol-credit-note.xml");
// xmllint on UBL-Invoice-2.1.xsd / UBL-CreditNote-2.1.xsd refuses only these two of the UBL examples.
const XMLLINT_INVALID = new Set(["ro-invoice-with-defects.xml", "nlcius-invoice-with-defects.xml"]);

test("every UBL example xmllint accepts passes the schema pass with no finding", () => {
  const files = readdirSync(new URL("./examples/", import.meta.url)).filter((f) => f.endsWith(".xml") && looksLikeUblDocument(read(f)));
  assert.ok(files.length >= 25, `${files.length} UBL examples`);
  for (const f of files) {
    if (XMLLINT_INVALID.has(f)) continue;
    assert.deepEqual(checkAgainstUblSchema(read(f)), [], f);
  }
});

test("the two examples xmllint refuses are refused for the same reason", () => {
  const ro = checkAgainstUblSchema(read("ro-invoice-with-defects.xml"));
  assert.deepEqual(ro.map((f) => [f.rule, f.path]), [["UBL-XSD-04", "/Invoice/IssueDate"]]);
  assert.match(ro[0].message, /not a YYYY-MM-DD date/);
  const nl = checkAgainstUblSchema(read("nlcius-invoice-with-defects.xml"));
  assert.deepEqual(nl.map((f) => f.rule), ["UBL-XSD-02"]);
  assert.match(nl[0].message, /PostalZone is out of place in PostalAddress/);
});

test("UBL-XSD-01: an unknown element, and one too many", () => {
  assert.deepEqual(rules(base.replace("<cbc:IssueDate>", "<cbc:Colour>red</cbc:Colour><cbc:IssueDate>")), ["UBL-XSD-01"]);
  const twice = base.replace(/(<cbc:IssueDate>[^<]*<\/cbc:IssueDate>)/, "$1$1");
  const f = checkAgainstUblSchema(twice);
  assert.deepEqual(f.map((x) => x.rule), ["UBL-XSD-01"]);
  assert.match(f[0].message, /IssueDate appears more than once in Invoice/);
});

test("UBL-XSD-02: elements out of sequence", () => {
  const swapped = base.replace(/(<cbc:ID>[^<]*<\/cbc:ID>)(\s*)(<cbc:IssueDate>[^<]*<\/cbc:IssueDate>)/, "$3$2$1");
  assert.notEqual(swapped, base);
  const f = checkAgainstUblSchema(swapped);
  assert.deepEqual(f.map((x) => x.rule), ["UBL-XSD-02"]);
  assert.match(f[0].message, /cannot follow/);
});

test("UBL-XSD-03: a required element missing", () => {
  const f = checkAgainstUblSchema(base.replace(/<cbc:IssueDate>[^<]*<\/cbc:IssueDate>/, ""));
  assert.deepEqual(f.map((x) => [x.rule, x.path]), [["UBL-XSD-03", "/Invoice/IssueDate"]]);
});

test("UBL-XSD-04: numbers, dates, times, booleans and base64 are read by their XSD types", () => {
  assert.deepEqual(rules(base.replace(/<cbc:PayableAmount currencyID="(\w+)">[^<]*</, '<cbc:PayableAmount currencyID="$1">1.234,50<')), ["UBL-XSD-04"]);
  assert.deepEqual(rules(base.replace(/<cbc:IssueDate>[^<]*</, "<cbc:IssueDate>2026-02-30<")), ["UBL-XSD-04"]);
  assert.deepEqual(rules(base.replace(/(<\/cbc:IssueDate>)/, "$1<cbc:IssueTime>25:00:00</cbc:IssueTime>")), ["UBL-XSD-04"]);
  assert.deepEqual(rules(base.replace(/(<\/cbc:IssueDate>)/, "$1<cbc:IssueTime>24:00:00</cbc:IssueTime>")), []);
  assert.deepEqual(rules(base.replace(/(<\/cbc:IssueDate>)/, "$1<cbc:IssueTime>10:30:00+01:00</cbc:IssueTime>")), []);
  // libxml2 skips characters outside the base64 alphabet; the XSD (and Xerces, which the
  // Java validators use) does not, and neither do we.
  const zatca = read("zatca-simplified-invoice.xml");
  assert.deepEqual(rules(zatca.replace(/(<cbc:EmbeddedDocumentBinaryObject mimeCode="text\/plain">)([^<]*)/, "$1$2€")), ["UBL-XSD-04"]);
  assert.deepEqual(rules(zatca.replace(/(<cbc:EmbeddedDocumentBinaryObject mimeCode="text\/plain">)([^<]*)/, "$1QUJD")), []);
  assert.deepEqual(rules(zatca.replace(/(<cbc:EmbeddedDocumentBinaryObject mimeCode="text\/plain">)([^<]*)/, "$1QUJ")), ["UBL-XSD-04"]);
});

test("UBL-XSD-05: a required attribute missing, or one the schema does not declare", () => {
  const f = checkAgainstUblSchema(base.replace(/<cbc:PayableAmount currencyID="\w+">/, "<cbc:PayableAmount>"));
  assert.deepEqual(f.map((x) => x.rule), ["UBL-XSD-05"]);
  assert.match(f[0].message, /PayableAmount is missing its required attribute currencyID/);
  const extra = checkAgainstUblSchema(base.replace("<cbc:IssueDate>", '<cbc:IssueDate format="DD.MM.YYYY">'));
  assert.deepEqual(extra.map((x) => x.rule), ["UBL-XSD-05"]);
  assert.match(extra[0].message, /attribute format that the UBL 2.1 schema does not declare/);
  assert.match(extra[0].fix, /takes no attributes/);
  // xsi:schemaLocation is allowed on any element.
  assert.deepEqual(rules(base.replace(/<Invoice\b/, '<Invoice xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:x x.xsd"')), []);
});

test("UBL-XSD-06: an element or the root in the wrong namespace", () => {
  const f = checkAgainstUblSchema(base.replace(/<cbc:IssueDate>([^<]*)<\/cbc:IssueDate>/, "<cac:IssueDate>$1</cac:IssueDate>"));
  assert.deepEqual(f.map((x) => x.rule), ["UBL-XSD-06"]);
  assert.match(f[0].message, /IssueDate inside Invoice is in the cac: namespace; UBL 2.1 puts it in the cbc: namespace/);
  const root = checkAgainstUblSchema(base.replace("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2", "urn:oasis:names:specification:ubl:schema:xsd:Invoice-1"));
  assert.deepEqual(root.map((x) => x.rule), ["UBL-XSD-06"]);
});

test("UBL-XSD-07: a cut-off file", () => {
  const cut = base.slice(0, base.indexOf("</cac:AccountingSupplierParty>"));
  assert.deepEqual(rules(cut), ["UBL-XSD-07"]);
});

test("an extension must hold exactly one element from its own namespace, which is not looked into", () => {
  const ext = (content) => base.replace(/(<cbc:CustomizationID>)/, `<ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:UBLExtension><ext:ExtensionContent>${content}</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>$1`);
  assert.ok(/<cbc:CustomizationID>/.test(base));
  assert.deepEqual(rules(ext('<my:Data xmlns:my="urn:example"><my:Anything>x</my:Anything></my:Data>')), []);
  assert.deepEqual(rules(ext("")), ["UBL-XSD-03"]);
  assert.deepEqual(rules(ext('<my:A xmlns:my="urn:example"/><my:B xmlns:my="urn:example"/>')), ["UBL-XSD-01"]);
  // ##other: any namespace but ext's and none at all. <Data/> inherits the Invoice default
  // namespace, which xmllint accepts; with xmlns="" or the ext: prefix it does not.
  assert.deepEqual(rules(ext("<Data/>")), []);
  assert.deepEqual(rules(ext('<Data xmlns=""/>')), ["UBL-XSD-06"]);
  assert.deepEqual(rules(ext("<ext:Data/>")), ["UBL-XSD-06"]);
});

test("credit notes are checked against CreditNote's own model", () => {
  assert.deepEqual(rules(credit), []);
  // InvoiceLine is an Invoice element; a CreditNote has CreditNoteLine.
  const f = checkAgainstUblSchema(credit.replace(/<cac:CreditNoteLine>/g, "<cac:InvoiceLine>").replace(/<\/cac:CreditNoteLine>/g, "</cac:InvoiceLine>"));
  assert.ok(f.some((x) => x.rule === "UBL-XSD-01" && /InvoiceLine is not allowed inside CreditNote/.test(x.message)));
});

test("messages never echo the value", () => {
  const marker = "DE987654321MARKER";
  const f = checkAgainstUblSchema(base.replace(/<cbc:IssueDate>[^<]*</, `<cbc:IssueDate>${marker}<`));
  assert.equal(f.length, 1);
  assert.ok(!JSON.stringify(f).includes(marker));
});

test("a file that is not UBL gets nothing from this pass", () => {
  assert.deepEqual(checkAgainstUblSchema(read("cii-invoice.xml")), []);
  assert.equal(looksLikeUblDocument(read("cii-invoice.xml")), false);
});

test("the report runs the schema pass on UBL files", async () => {
  const broken = base.replace(/<cbc:PayableAmount currencyID="\w+">/, "<cbc:PayableAmount>");
  const { reports } = await preflightDocuments([{ name: "broken.xml", source: broken }]);
  assert.ok(reports[0].errors.some((e) => e.rule === "UBL-XSD-05"));
  const { reports: clean } = await preflightDocuments([{ name: "ok.xml", source: base }]);
  assert.ok(!clean[0].errors.some((e) => e.rule.startsWith("UBL-XSD")));
});

test("the table is facts read from the OASIS schema, and every rule is explained in three languages", () => {
  assert.match(UBL_SCHEMA_SOURCE, /OASIS UBL 2\.1/);
  assert.deepEqual(Object.keys(schema.roots), ["Invoice", "CreditNote"]);
  assert.ok(Object.keys(schema.complex).length > 100);
  for (let i = 1; i <= 7; i++) {
    const t = TEMPLATES[`UBL-XSD-0${i}`];
    for (const lang of ["en", "de", "fr"]) assert.equal(t?.[lang]?.length, 2, `UBL-XSD-0${i} ${lang}`);
  }
});
