// The Factur-X profile schema pass (cii-xsd.mjs with facturx-xsd-data.mjs): files declared as
// MINIMUM, BASIC WL or EXTENDED are checked against that profile's own XSD from the Factur-X
// 1.0.9 package, and files declared as the French EXTENDED-CTC-FR against its D22B XSD. Every
// expected verdict below was checked with xmllint against the same XSDs (2026-11-26,
// eval/facturx-xsd-2026-11-26.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkAgainstCiiSchema, FACTURX_PROFILE_IDS, schemaApplies, schemaFor } from "./cii-xsd.mjs";
import facturx from "./facturx-xsd-data.mjs";
import { preflightDocuments } from "./report.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const BASICWL = read("./fixtures/fr-fnfe/basicwl-f20260024-fx-cii.xml");
const EXTENDED = read("./fixtures/fr-fnfe/uc12-sous-ligne-extended-fx-cii.xml");
const CTC_FR = read("./fixtures/fr-fnfe/uc10-multi-vendeur-extended-ctc-fr-cii.xml");
const rules = (text) => checkAgainstCiiSchema(text).findings.map((f) => f.rule);

// A made-up MINIMUM invoice (BT-24 urn:factur-x.eu:1p0:minimum): header totals only, no lines.
const MINIMUM = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>INV-1001</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261126</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>Example Seller SARL</ram:Name>
        <ram:PostalTradeAddress><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR00000000000</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Example Buyer SAS</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">20.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>120.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;

test("the data module holds the four profiles, read from the Factur-X 1.0.9 and EXTENDED-CTC-FR XSDs", () => {
  assert.deepEqual(Object.keys(facturx.profiles).sort(), ["basicwl", "extended", "extendedctcfr", "minimum"]);
  assert.match(facturx.source, /Factur-X 1\.0\.9/);
  assert.match(facturx.source, /EXTENDED-CTC-FR XSDs \(UN\/CEFACT CrossIndustryInvoice 100\.D22B\)/);
  assert.match(facturx.notice, /UN\/CEFACT/);
  for (const p of Object.values(facturx.profiles)) assert.ok(p.complex[p.root], "root type present");
});

test("which schema each specification identifier (BT-24) gets", () => {
  assert.equal(schemaFor("urn:cen.eu:en16931:2017"), "en16931");
  assert.equal(schemaFor("urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic"), "en16931");
  assert.equal(schemaFor(" urn:factur-x.eu:1p0:minimum "), "minimum");
  assert.equal(schemaFor("urn:factur-x.eu:1p0:basicwl"), "basicwl");
  assert.equal(schemaFor("urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended"), "extended");
  assert.equal(schemaFor("urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr"), "extendedctcfr");
  // Other extensions have schemas not read here: the XRechnung extension, ZUGFeRD 1.
  assert.equal(schemaFor("urn:cen.eu:en16931:2017#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0"), null);
  assert.equal(schemaFor("urn:ferd:CrossIndustryDocument:invoice:1p0:comfort"), null);
  assert.equal(schemaFor(""), null);
  // schemaApplies keeps its meaning: the EN 16931 subset only.
  for (const id of Object.keys(FACTURX_PROFILE_IDS)) assert.equal(schemaApplies(id), false, id);
});

test("clean MINIMUM, BASIC WL and EXTENDED files pass their own schema", () => {
  for (const [text, schema] of [[MINIMUM, "minimum"], [BASICWL, "basicwl"], [EXTENDED, "extended"]]) {
    const r = checkAgainstCiiSchema(text);
    assert.equal(r.applied, true, schema);
    assert.equal(r.schema, schema);
    assert.deepEqual(r.findings, [], schema);
  }
});

test("an EXTENDED-CTC-FR file passes its own D22B schema", () => {
  const r = checkAgainstCiiSchema(CTC_FR);
  assert.equal(r.applied, true);
  assert.equal(r.schema, "extendedctcfr");
  assert.deepEqual(r.findings, []);
});

test("EXTENDED-CTC-FR: the trade transaction missing (CII-003), a comma decimal (CII-004), a stray attribute (CII-005)", () => {
  // xmllint on the same XSD: each of the three is invalid, for the same element. (The invoice
  // number, BT-1, is optional in the full D22B schema; its Schematron requires it.)
  const start = CTC_FR.indexOf("<rsm:SupplyChainTradeTransaction>");
  const end = CTC_FR.indexOf("</rsm:SupplyChainTradeTransaction>") + "</rsm:SupplyChainTradeTransaction>".length;
  assert.ok(start > 0 && end > start);
  const noTransaction = CTC_FR.slice(0, start) + CTC_FR.slice(end);
  assert.deepEqual(rules(noTransaction), ["CII-003"]);
  const comma = CTC_FR.replace(/<ram:GrandTotalAmount([^>]*)>(\d+)\.(\d+)</, "<ram:GrandTotalAmount$1>$2,$3<");
  assert.notEqual(comma, CTC_FR);
  assert.deepEqual(rules(comma), ["CII-004"]);
  // listVersionID, which the Factur-X profiles refuse on TypeCode, is declared on D22B's code types.
  assert.deepEqual(rules(CTC_FR.replace("<ram:TypeCode>", '<ram:TypeCode listVersionID="1">')), []);
  const stray = CTC_FR.replace(/<ram:GrandTotalAmount([^>]*)>/, '<ram:GrandTotalAmount$1 unit="EUR">');
  assert.notEqual(stray, CTC_FR);
  const r = checkAgainstCiiSchema(stray);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-005"]);
  assert.match(r.findings[0].message, /EXTENDED-CTC-FR \(CII D22B\) schema/);
});

test("EXTENDED-CTC-FR: the document context out of sequence (CII-002)", () => {
  const a = CTC_FR.indexOf("<rsm:ExchangedDocumentContext>");
  const b = CTC_FR.indexOf("</rsm:ExchangedDocumentContext>") + "</rsm:ExchangedDocumentContext>".length;
  const c = CTC_FR.indexOf("<rsm:ExchangedDocument>");
  const d = CTC_FR.indexOf("</rsm:ExchangedDocument>") + "</rsm:ExchangedDocument>".length;
  assert.ok(a < b && b <= c && c < d);
  const swapped = CTC_FR.slice(0, a) + CTC_FR.slice(c, d) + CTC_FR.slice(b, c) + CTC_FR.slice(a, b) + CTC_FR.slice(d);
  assert.ok(rules(swapped).includes("CII-002"));
});

test("MINIMUM: an invoice line is not part of the profile (CII-001)", () => {
  const line = "<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument></ram:IncludedSupplyChainTradeLineItem>";
  const text = MINIMUM.replace("<ram:ApplicableHeaderTradeAgreement>", `${line}<ram:ApplicableHeaderTradeAgreement>`);
  const r = checkAgainstCiiSchema(text);
  assert.equal(r.schema, "minimum");
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-001"]);
  assert.match(r.findings[0].message, /IncludedSupplyChainTradeLineItem/);
});

test("MINIMUM: the grand total missing (CII-003)", () => {
  const text = MINIMUM.replace(/<ram:GrandTotalAmount>[^<]*<\/ram:GrandTotalAmount>/, "");
  assert.deepEqual(rules(text), ["CII-003"]);
});

test("MINIMUM: totals out of order (CII-002)", () => {
  const text = MINIMUM.replace("<ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>\n        <ram:DuePayableAmount>120.00</ram:DuePayableAmount>",
    "<ram:DuePayableAmount>120.00</ram:DuePayableAmount>\n        <ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>");
  assert.notEqual(text, MINIMUM);
  assert.deepEqual(rules(text), ["CII-002"]);
});

test("MINIMUM: a decimal written with a comma (CII-004)", () => {
  const text = MINIMUM.replace("<ram:GrandTotalAmount>120.00<", "<ram:GrandTotalAmount>120,00<");
  assert.deepEqual(rules(text), ["CII-004"]);
});

test("BASIC WL: listID on the currency code, which the profile's CurrencyCodeType does not declare (CII-005)", () => {
  // The EN 16931 subset declares listID (fixed ISO4217); BASIC WL's type has no attribute at all.
  const text = BASICWL.replace("<ram:InvoiceCurrencyCode>", '<ram:InvoiceCurrencyCode listID="ISO4217">');
  assert.notEqual(text, BASICWL);
  const r = checkAgainstCiiSchema(text);
  assert.deepEqual(r.findings.map((f) => f.rule), ["CII-005"]);
  assert.match(r.findings[0].message, /InvoiceCurrencyCode carries an attribute listID that the Factur-X BASIC WL schema does not declare/);
});

test("an attribute on a simple-typed element, and namespace declarations and xsi: attributes left alone", () => {
  const stray = MINIMUM.replace("<ram:TypeCode>380", '<ram:TypeCode listVersionID="1">380');
  assert.deepEqual(rules(stray), ["CII-005"]);
  const decorated = MINIMUM.replace('xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
    'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:x y">');
  assert.notEqual(decorated, MINIMUM);
  assert.deepEqual(rules(decorated), []);
});

test("EXTENDED: an element in the wrong namespace (CII-007) and one out of sequence (CII-002)", () => {
  const ns = EXTENDED.replace(/<udt:DateTimeString format="102">([^<]*)<\/udt:DateTimeString>/, '<qdt:DateTimeString xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" format="102">$1</qdt:DateTimeString>');
  assert.notEqual(ns, EXTENDED);
  assert.ok(rules(ns).includes("CII-007"));
  const i = EXTENDED.indexOf("<ram:TypeCode>");
  const j = EXTENDED.indexOf("</ram:TypeCode>") + "</ram:TypeCode>".length;
  const k = EXTENDED.indexOf("<ram:ID>", EXTENDED.indexOf("<rsm:ExchangedDocument>"));
  const swapped = EXTENDED.slice(0, k) + EXTENDED.slice(i, j) + EXTENDED.slice(k, i) + EXTENDED.slice(j);
  assert.deepEqual(rules(swapped), ["CII-002"]);
});

test("the report runs the profile schema on a BASIC WL file", async () => {
  const text = BASICWL.replace("<ram:InvoiceCurrencyCode>", '<ram:InvoiceCurrencyCode listID="ISO4217">');
  const report = await preflightDocuments([{ name: "basicwl.xml", source: text }]);
  const all = JSON.stringify(report);
  assert.match(all, /CII-005/);
});
