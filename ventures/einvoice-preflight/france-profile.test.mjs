import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectFrenchProfile, sirenValid, siretValid } from "./profile.mjs";
import { parseInvoiceSource, preflightDocuments } from "./report.mjs";

const ids = (invoice) => inspectFrenchProfile(invoice).map((f) => f.rule);

const good = () => ({
  invoice_number: "F-1", issue_date: "2026-10-15", currency: "EUR", document_type: "invoice",
  supplier: { id: "S", name: "Atelier SARL", country: "FR", vat_id: "FR27443061841", legal_id: { id: "443 061 841", scheme: "0002" } },
  customer: { id: "C", name: "Client SA", country: "FR", legal_id: "732829320" },
  notes: [
    "#PMD#Pénalités de retard : trois fois le taux d'intérêt légal.",
    "#PMT#Indemnité forfaitaire pour frais de recouvrement : 40 EUR.",
    "#AAB#Pas d'escompte pour paiement anticipé.",
    "Catégorie d'opération : prestation de services.",
  ],
});

test("SIREN and SIRET use the Luhn check; La Poste is the documented exception", () => {
  assert.equal(sirenValid("443061841"), true);
  assert.equal(sirenValid("443 061 842"), false);
  assert.equal(sirenValid("12345678"), false);
  assert.equal(siretValid("44306184100005"), true);
  assert.equal(siretValid("44306184100006"), false);
  assert.equal(siretValid("35600000000010"), true);
  assert.equal(siretValid("35600000000011"), false);
});

test("a complete French invoice has no FR findings", () => {
  assert.deepEqual(ids(good()), []);
});

test("missing identifiers on French parties", () => {
  const inv = good();
  delete inv.supplier.legal_id;
  delete inv.customer.legal_id;
  assert.deepEqual(ids(inv), ["FR-001", "FR-004"]);
});

test("a mistyped SIREN fails on either side and is never echoed", () => {
  const inv = good();
  inv.customer.legal_id = "732829321";
  const found = inspectFrenchProfile(inv);
  assert.deepEqual(found.map((f) => f.rule), ["FR-002"]);
  assert.ok(!JSON.stringify(found).includes("732829321"));
});

test("VAT number built on another company's SIREN", () => {
  const inv = good();
  inv.supplier.vat_id = "FR12732829320";
  assert.deepEqual(ids(inv), ["FR-003"]);
});

test("each payment mention is its own finding, accepted in French, English or by subject code", () => {
  const inv = good();
  inv.notes = ["Late payment penalty: 3x legal rate", "Recovery indemnity EUR 40"];
  assert.deepEqual(ids(inv), ["FR-007", "FR-008"]);
  inv.notes = [];
  assert.deepEqual(ids(inv), ["FR-005", "FR-006", "FR-007", "FR-008"]);
  inv.payment = { terms_text: "Escompte 2%, pénalités de retard 12%, indemnité de recouvrement 40 €, prestation de services" };
  assert.deepEqual(ids(inv), []);
});

test("credit notes and non-French sellers skip the payment mentions", () => {
  const credit = { ...good(), document_type: "credit_note", notes: [] };
  assert.deepEqual(ids(credit), []);
  const foreign = { ...good(), notes: [], supplier: { id: "S", name: "GmbH", country: "DE", vat_id: "DE136695976" } };
  assert.deepEqual(ids(foreign), []);
});

test("UBL and CII readers carry legal ids and notes into the profile", async () => {
  const ubl = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:ID>F-9</cbc:ID><cbc:IssueDate>2026-10-15</cbc:IssueDate><cbc:Note>#PMD#Pénalités de retard</cbc:Note><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Atelier</cbc:RegistrationName><cbc:CompanyID schemeID="0002">443061841</cbc:CompanyID></cac:PartyLegalEntity><cac:PostalAddress><cac:Country><cbc:IdentificationCode>FR</cbc:IdentificationCode></cac:Country></cac:PostalAddress></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Client</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount>0</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>0</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>0</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount>0</cbc:LineExtensionAmount><cac:Item><cbc:Name>x</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>0</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>0</cbc:PriceAmount></cac:Price></cac:InvoiceLine></Invoice>`;
  const parsed = await parseInvoiceSource("a.xml", ubl);
  assert.equal(parsed.supplier.legal_id.id, "443061841");
  assert.equal(parsed.supplier.legal_id.scheme, "0002");
  assert.deepEqual(ids(parsed), ["FR-006", "FR-007", "FR-008"]);
  const result = await preflightDocuments([{ name: "a.xml", source: ubl }], { profile: "france" });
  assert.ok(result.reports[0].errors.some((e) => e.rule === "FR-006"));
  const plain = await preflightDocuments([{ name: "a.xml", source: ubl }], {});
  assert.ok(!plain.reports[0].errors.some((e) => e.rule.startsWith("FR-")));
});

test("FR-008 accepts goods, services or mixed in French or English", () => {
  for (const phrase of ["livraison de biens", "opération mixte", "Services", "goods"]) {
    const inv = good();
    inv.notes[3] = phrase;
    assert.deepEqual(ids(inv), [], phrase);
  }
  const inv = good();
  inv.notes.pop();
  assert.deepEqual(ids(inv), ["FR-008"]);
});
