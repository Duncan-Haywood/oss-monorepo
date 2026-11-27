import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectXrechnungProfile, leitwegCheckDigitsValid, looksLikeLeitwegId } from "./profile.mjs";
import { generateInvoice } from "./generate.mjs";
import { parseInvoiceSource, preflightDocuments } from "./report.mjs";

const ids = (invoice) => inspectXrechnungProfile(invoice).map((f) => f.rule);

const good = () => ({
  invoice_number: "RE-1", issue_date: "2026-10-15", currency: "EUR",
  buyer_reference: "04011000-12345-03",
  document_code: "380",
  specification_id: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
  supplier: {
    id: "S", name: "Muster GmbH", vat_id: "DE136695976", city: "Berlin", postal_code: "10115",
    contact: { name: "Erika Muster", phone: "+49 30 1", email: "billing@muster.example" },
  },
  customer: { id: "C", name: "Stadt", city: "Hamburg", postal_code: "20095" },
  payment: { means: "58", iban: "DE89370400440532013000" },
});

test("Leitweg-ID check digits match the published samples", () => {
  assert.equal(leitwegCheckDigitsValid("991-12345-73"), true);
  assert.equal(leitwegCheckDigitsValid("09-12345-15"), true);
  assert.equal(leitwegCheckDigitsValid("991-12345-74"), false);
  assert.equal(leitwegCheckDigitsValid(""), false);
});

test("Leitweg-ID shape", () => {
  assert.equal(looksLikeLeitwegId("04011000-12345-03"), true);
  assert.equal(looksLikeLeitwegId("991-ABC12-xx"), false);
  assert.equal(looksLikeLeitwegId("KST 4711"), false);
});

test("a complete invoice has no XR findings", () => {
  assert.deepEqual(ids(good()), []);
});

test("a cost-centre buyer reference is not treated as a Leitweg-ID", () => {
  const inv = good();
  inv.buyer_reference = "Kostenstelle 4711";
  assert.deepEqual(ids(inv), []);
});

test("each rule fires on its own defect", () => {
  const cases = [
    ["XR-001", (i) => { delete i.buyer_reference; }],
    ["XR-002", (i) => { i.buyer_reference = "04011000-12345-04"; }],
    ["XR-003", (i) => { delete i.payment; }],
    ["XR-004", (i) => { delete i.supplier.contact.phone; }],
    ["XR-004", (i) => { i.supplier.contact.email = "not an email"; }],
    ["XR-005", (i) => { delete i.supplier.postal_code; }],
    ["XR-006", (i) => { delete i.customer.city; }],
    ["XR-007", (i) => { i.document_code = "751"; }],
    ["XR-008", (i) => { i.specification_id = "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0"; }],
    ["XR-009", (i) => { delete i.supplier.vat_id; }],
  ];
  for (const [rule, mutate] of cases) {
    const inv = good();
    mutate(inv);
    assert.deepEqual(ids(inv), [rule], rule);
  }
});

test("findings never repeat the typed reference", () => {
  const inv = good();
  inv.buyer_reference = "04011000-12345-04";
  assert.ok(!JSON.stringify(inspectXrechnungProfile(inv)).includes("12345"));
});

const draft = () => ({
  number: "RE-2026-001", issue_date: "2026-10-15", due_date: "2026-11-14",
  buyer_reference: "04011000-12345-03",
  seller: {
    name: "Muster Software GmbH", street: "Hauptstrasse 1", city: "Berlin", postal_code: "10115", country: "DE",
    vat_id: "DE136695976", endpoint: { scheme: "EM", id: "billing@muster.example" },
    contact: { name: "Erika Muster", phone: "+49 30 123456", email: "billing@muster.example" },
  },
  buyer: { name: "Kunde AG", street: "Marktplatz 2", city: "Hamburg", postal_code: "20095", country: "DE", endpoint: { scheme: "EM", id: "ap@kunde.example" } },
  payment: { iban: "DE02 1203 0000 0000 2020 51", bic: "BYLADEM1001" },
  lines: [{ description: "Beratung", quantity: 2, unit: "hours", unit_price: 100, tax_percent: 19 }],
});

for (const format of ["ubl", "cii"]) {
  test(`${format}: the generator's XRechnung output passes the XRechnung profile`, async () => {
    const out = generateInvoice(draft(), { format, profile: "xrechnung" });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const back = await parseInvoiceSource("x.xml", out.xml);
    assert.equal(back.supplier.contact.email, "billing@muster.example");
    assert.equal(back.supplier.city, "Berlin");
    assert.deepEqual(inspectXrechnungProfile(back), []);
  });

  test(`${format}: a draft missing contact and buyer reference is caught after a round trip`, async () => {
    const d = draft();
    delete d.seller.contact;
    delete d.buyer_reference;
    const out = generateInvoice(d, { format, profile: "xrechnung" });
    const back = await parseInvoiceSource("x.xml", out.xml);
    assert.deepEqual(ids(back).sort(), ["XR-001", "XR-004"]);
  });
}

test("the profile is opt-in on preflightDocuments", async () => {
  const doc = JSON.stringify({ ...good(), buyer_reference: undefined, lines: [], totals: {} });
  const plain = await preflightDocuments([{ name: "a.json", source: doc }]);
  const withProfile = await preflightDocuments([{ name: "a.json", source: doc }], { profile: "xrechnung" });
  assert.ok(!plain.reports[0].errors.some((e) => e.rule.startsWith("XR-")));
  assert.ok(withProfile.reports[0].errors.some((e) => e.rule === "XR-001"));
});
