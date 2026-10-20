import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectPeppolProfile } from "./profile.mjs";
import { generateInvoice } from "./generate.mjs";
import { parseInvoiceSource, preflightDocuments } from "./report.mjs";

const ids = (invoice) => inspectPeppolProfile(invoice).map((f) => f.rule);

const good = () => ({
  invoice_number: "INV-1", issue_date: "2026-10-15", currency: "EUR",
  buyer_reference: "PO-77",
  profile_id: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
  specification_id: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
  supplier: { name: "Seller BV", endpoint: { scheme: "0088", id: "5790000435975" } },
  customer: { name: "Buyer NV", endpoint: { scheme: "EM", id: "ap@buyer.example" } },
});

test("a complete Peppol invoice has no PP findings", () => {
  assert.deepEqual(ids(good()), []);
});

test("each rule fires on its own defect", () => {
  const cases = [
    ["PP-001", (i) => { delete i.profile_id; }],
    ["PP-001", (i) => { i.profile_id = "urn:other"; }],
    ["PP-002", (i) => { delete i.specification_id; }],
    ["PP-002", (i) => { i.specification_id = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"; }],
    ["PP-003", (i) => { delete i.supplier.endpoint; }],
    ["PP-004", (i) => { i.customer.endpoint = { scheme: "EM", id: " " }; }],
    ["PP-005", (i) => { delete i.buyer_reference; }],
  ];
  for (const [rule, mutate] of cases) {
    const inv = good();
    mutate(inv);
    assert.deepEqual(ids(inv), [rule], rule);
  }
});

test("an order reference stands in for a buyer reference", () => {
  const inv = good();
  delete inv.buyer_reference;
  inv.order_reference = "PO-1";
  assert.deepEqual(ids(inv), []);
});

const draft = () => ({
  number: "INV-2026-001", issue_date: "2026-10-15", due_date: "2026-11-14",
  buyer_reference: "PO-77",
  seller: { name: "Seller BV", street: "Straat 1", city: "Utrecht", postal_code: "3511", country: "NL", vat_id: "NL123456789B01", endpoint: { scheme: "EM", id: "billing@seller.example" } },
  buyer: { name: "Buyer NV", street: "Laan 2", city: "Gent", postal_code: "9000", country: "BE", endpoint: { scheme: "EM", id: "ap@buyer.example" } },
  payment: { iban: "NL91ABNA0417164300" },
  lines: [{ description: "Consulting", quantity: 2, unit: "hours", unit_price: 100, tax_percent: 21 }],
});

for (const format of ["ubl", "cii"]) {
  test(`${format}: the generator's Peppol output passes the Peppol profile after a round trip`, async () => {
    const out = generateInvoice(draft(), { format, profile: "peppol" });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const back = await parseInvoiceSource("x.xml", out.xml);
    assert.equal(back.profile_id, "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0");
    assert.deepEqual(ids(back), []);
  });

  test(`${format}: an XRechnung document fails the Peppol specification check`, async () => {
    const out = generateInvoice(draft(), { format, profile: "xrechnung" });
    const back = await parseInvoiceSource("x.xml", out.xml);
    assert.ok(ids(back).includes("PP-002"));
  });
}

test("the Peppol profile is opt-in on preflightDocuments", async () => {
  const doc = JSON.stringify({ ...good(), profile_id: undefined, lines: [], totals: {} });
  const plain = await preflightDocuments([{ name: "a.json", source: doc }]);
  const withProfile = await preflightDocuments([{ name: "a.json", source: doc }], { profile: "peppol" });
  assert.ok(!plain.reports[0].errors.some((e) => e.rule.startsWith("PP-")));
  assert.ok(withProfile.reports[0].errors.some((e) => e.rule === "PP-001"));
});
