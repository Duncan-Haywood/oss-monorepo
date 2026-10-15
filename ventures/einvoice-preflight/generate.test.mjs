import { test } from "node:test";
import assert from "node:assert/strict";
import { generateInvoice, buildInvoice } from "./generate.mjs";
import { parseInvoiceSource } from "./report.mjs";
import { checkInvoice } from "./checks.mjs";

const draft = () => ({
  number: "RE-2026-001",
  issue_date: "2026-10-15",
  due_date: "2026-11-14",
  buyer_reference: "04011000-12345-03",
  order_reference: "PO-77",
  seller: {
    name: "Muster Software GmbH", street: "Hauptstrasse 1", city: "Berlin", postal_code: "10115", country: "DE",
    vat_id: "DE136695976", endpoint: { scheme: "EM", id: "billing@muster.example" },
    contact: { name: "Erika Muster", phone: "+49 30 123456", email: "billing@muster.example" },
  },
  buyer: { name: "Kunde AG", street: "Marktplatz 2", city: "Hamburg", postal_code: "20095", country: "DE", endpoint: { scheme: "EM", id: "ap@kunde.example" } },
  payment: { iban: "DE02 1203 0000 0000 2020 51", bic: "BYLADEM1001" },
  terms: "Zahlbar innerhalb von 30 Tagen",
  lines: [
    { description: "Beratung", quantity: 2, unit: "hours", unit_price: 100, tax_percent: 19 },
    { description: "Handbuch", quantity: 3, unit: "pieces", unit_price: 33.33, tax_percent: 7 },
  ],
});

for (const format of ["ubl", "cii"]) {
  test(`${format}: output reads back and is clean through the checker`, async () => {
    const out = generateInvoice(draft(), { format });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    assert.deepEqual(out.warnings, []);
    const back = await parseInvoiceSource("x.xml", out.xml);
    assert.deepEqual(checkInvoice(back), []);
    assert.equal(Number(back.totals.net), 299.99);
    assert.equal(Number(back.totals.tax), 38 + 7);
    assert.equal(back.lines.length, 2);
  });
}

test("totals are computed in cents per VAT group", () => {
  const out = generateInvoice(draft());
  // 200.00 @19% = 38.00 ; 99.99 @7% = 7.00 (6.9993 rounds half up)
  assert.deepEqual(out.totals, { net: 299.99, tax: 45, gross: 344.99, prepaid: 0, due: 344.99 });
});

test("missing required fields are errors, not a broken file", () => {
  const out = generateInvoice({ lines: [] });
  assert.equal(out.ok, false);
  assert.equal(out.xml, undefined);
  const paths = out.errors.map((e) => e.path);
  for (const p of ["number", "issue_date", "seller.name", "buyer.name", "lines"]) assert.ok(paths.includes(p), p);
});

test("exempt and reverse-charge categories need a reason", () => {
  const d = draft();
  d.lines = [{ description: "Service", quantity: 1, unit_price: 500, tax_percent: 0, tax_category: "AE" }];
  assert.ok(generateInvoice(d).errors.some((e) => e.path === "lines[0].tax_reason"));
  d.lines[0].tax_reason = "Reverse charge";
  const out = generateInvoice(d);
  assert.equal(out.ok, true);
  assert.match(out.xml, /<cbc:TaxExemptionReason>Reverse charge</);
  assert.equal(out.totals.tax, 0);
});

test("Kleinunternehmer with only a national tax number is clean", async () => {
  const d = draft();
  delete d.seller.vat_id;
  d.seller.tax_number = "21/815/08150";
  d.lines = [{ description: "Webdesign", quantity: 1, unit_price: 800, tax_percent: 0, tax_category: "E", tax_reason: "Kleinunternehmer gemäß § 19 UStG" }];
  const out = generateInvoice(d);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const back = await parseInvoiceSource("x.xml", out.xml);
  assert.deepEqual(checkInvoice(back), []);
});

test("a standard-rated line with 0% is rejected", () => {
  const d = draft();
  d.lines[0].tax_category = "S";
  d.lines[0].tax_percent = 0;
  assert.ok(generateInvoice(d).errors.some((e) => /Standard-rated/.test(e.message)));
});

test("xrechnung warns about the German-specific fields, peppol does not ask for a contact", () => {
  const d = draft();
  delete d.buyer_reference;
  d.seller.contact = {};
  const x = buildInvoice(d, { profile: "xrechnung" });
  assert.ok(x.warnings.some((w) => w.path === "buyer_reference"));
  assert.ok(x.warnings.some((w) => w.path === "seller.contact"));
  const p = buildInvoice(d, { profile: "peppol" });
  assert.ok(!p.warnings.some((w) => w.path === "seller.contact"));
});

test("credit note carries the original invoice and reads back as a credit note", async () => {
  const d = draft();
  d.document_type = "credit_note";
  d.original_invoice = "RE-2026-000";
  d.due_date = "";
  const out = generateInvoice(d);
  assert.match(out.xml, /<CreditNote /);
  assert.match(out.xml, /<cac:CreditNoteLine>/);
  const back = await parseInvoiceSource("x.xml", out.xml);
  assert.equal(back.document_type, "credit_note");
  assert.equal(back.original_invoice, "RE-2026-000");
  assert.deepEqual(checkInvoice(back), []);
});

test("user text is XML-escaped", () => {
  const d = draft();
  d.lines[0].description = `R&D <"quoted"> & more`;
  const out = generateInvoice(d);
  assert.match(out.xml, /R&amp;D &lt;&quot;quoted&quot;&gt; &amp; more/);
});

test("prepaid reduces the amount due", () => {
  const d = draft();
  d.prepaid = 100;
  const out = generateInvoice(d);
  assert.equal(out.totals.due, 244.99);
});

test("examples/draft-invoice.json is complete: no errors, no warnings, clean in both syntaxes", async () => {
  const { readFileSync } = await import("node:fs");
  const d = JSON.parse(readFileSync(new URL("./examples/draft-invoice.json", import.meta.url), "utf8"));
  for (const format of ["ubl", "cii"]) {
    const out = generateInvoice(d, { format });
    assert.equal(out.ok, true);
    assert.deepEqual(out.warnings, []);
    assert.deepEqual(checkInvoice(await parseInvoiceSource("x.xml", out.xml)), []);
  }
});
