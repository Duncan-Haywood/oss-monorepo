import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectSlovakProfile, slovakDicShapeValid, SLOVAK_RULES } from "./profile.mjs";
import { preflightDocuments } from "./report.mjs";
import { generateInvoice } from "./generate.mjs";

// SK-nnn: the fields the Financial Administration's table (v1.13, 29 Oct 2026) marks
// required for a Slovak e-invoice where EN 16931 leaves them optional.
const ids = (invoice) => inspectSlovakProfile(invoice).map((f) => f.rule);

const good = () => ({
  invoice_number: "FA-2027-1", issue_date: "2027-01-05", currency: "EUR", document_type: "invoice",
  supplier: { name: "Dodávateľ s.r.o.", country: "SK", vat_id: "SK2020273893", street: "Hlavná 1", city: "Bratislava", postal_code: "811 01", endpoint: { scheme: "0245", id: "2020273893" } },
  customer: { name: "Odberateľ a.s.", country: "SK", street: "Námestie 2", city: "Žilina", postal_code: "010 01", endpoint: { scheme: "0245", id: "2120000011" } },
  payment: { iban: "SK3112000000198742637541" },
});

test("every SK rule has a description", () => {
  assert.deepEqual(Object.keys(SLOVAK_RULES), ["SK-001", "SK-002", "SK-003", "SK-004", "SK-005", "SK-006"]);
});

test("a complete Slovak invoice has no SK findings", () => {
  assert.deepEqual(ids(good()), []);
});

test("addresses EN 16931 leaves optional are required (VAT Act § 74(1)(a), (b))", () => {
  const inv = good();
  delete inv.supplier.street;
  delete inv.customer.postal_code;
  delete inv.customer.city;
  const found = inspectSlovakProfile(inv);
  assert.deepEqual(found.map((f) => f.rule), ["SK-001", "SK-002"]);
  assert.match(found[0].message, /street/);
  assert.match(found[1].message, /city, postcode/);
});

test("DIČ electronic address: 10 digits under 0245; other schemes warn for Slovak parties only", () => {
  assert.equal(slovakDicShapeValid("2020273893"), true);
  assert.equal(slovakDicShapeValid("SK2020273893"), false);
  assert.equal(slovakDicShapeValid("202027389"), false);
  const inv = good();
  inv.customer.endpoint = { scheme: "0245", id: "SK2120000011" };
  assert.deepEqual(ids(inv), ["SK-004"]);
  const other = good();
  other.customer.endpoint = { scheme: "0088", id: "5790000435975" };
  const warn = inspectSlovakProfile(other);
  assert.deepEqual(warn.map((f) => [f.rule, f.severity]), [["SK-003", "warning"]]);
  other.customer.country = "CZ";
  assert.deepEqual(ids(other), []);
});

test("SK-006 warns when the seller's DIČ address and SK VAT digits differ", () => {
  const inv = good();
  inv.supplier.endpoint.id = "2020273894";
  const f = inspectSlovakProfile(inv);
  assert.deepEqual(f.map((x) => [x.rule, x.severity]), [["SK-006", "warning"]]);
});

test("SK-005 warns on a missing payment account, not on a credit note", () => {
  const inv = good();
  delete inv.payment;
  assert.deepEqual(inspectSlovakProfile(inv).map((f) => [f.rule, f.severity]), [["SK-005", "warning"]]);
  inv.document_type = "credit_note";
  assert.deepEqual(ids(inv), []);
});

test("a UBL file through preflight: profile slovakia adds Peppol and SK rules, no profile adds neither", async () => {
  const draft = {
    number: "FA-2027-1", issue_date: "2027-01-05", due_date: "2027-02-04", delivery_date: "2027-01-04", currency: "EUR",
    buyer_reference: "OBJ-1",
    seller: { name: "Dodávateľ s.r.o.", street: "Hlavná 1", postal_code: "81101", city: "Bratislava", country: "SK", vat_id: "SK2020273893", endpoint: { scheme: "0245", id: "2020273893" } },
    buyer: { name: "Odberateľ a.s.", city: "Žilina", country: "SK", endpoint: { scheme: "0245", id: "2120000011" } },
    payment: { iban: "SK3112000000198742637541" },
    lines: [{ description: "Služba", quantity: 1, unit: "hours", unit_price: 100, tax_percent: 23 }],
  };
  const made = generateInvoice(draft, { format: "ubl", profile: "peppol" });
  const xml = made.xml ?? made.ubl ?? made.output;
  assert.equal(typeof xml, "string", Object.keys(made).join(","));
  const sk = await preflightDocuments([{ name: "sk.xml", source: xml }], { profile: "slovakia" });
  const rules = sk.reports[0].errors.map((e) => e.rule);
  assert.ok(rules.includes("SK-002"), rules.join(","));
  assert.ok(!rules.includes("SK-001"), rules.join(","));
  assert.ok(!rules.some((r) => r.startsWith("PP-")), rules.join(","));
  const plain = await preflightDocuments([{ name: "sk.xml", source: xml }], {});
  assert.ok(!plain.reports[0].errors.some((e) => /^(SK|PP)-/.test(e.rule)));
});
