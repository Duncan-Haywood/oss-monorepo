import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { readInvoiceForView, invoiceViewHtml, formatAmount, formatDate, formatDecimal, esc } from "./einvoice-view.mjs";
import { extractEmbeddedInvoice } from "./facturx.mjs";

const example = (f) => fs.readFileSync(new URL(`./examples/${f}`, import.meta.url));

test("UBL XRechnung: header, parties, lines, VAT breakdown, totals and payment as the file states them", () => {
  const v = readInvoiceForView(example("ubl-invoice.xml"));
  assert.equal(v.syntax, "UBL");
  assert.equal(v.profile, "XRechnung");
  assert.equal(v.number, "INV-2026-0042");
  assert.equal(v.issueDate, "2026-08-24");
  assert.equal(v.dueDate, "2026-09-23");
  assert.equal(v.buyerReference, "04011000-12345-03");
  assert.deepEqual(v.seller, {
    name: "Supplier GmbH", street: "Hauptstrasse 1", postcode: "10115", city: "Berlin", country: "DE",
    vatId: "DE136695976", endpoint: "4012345000009",
  });
  assert.equal(v.lines.length, 2);
  assert.deepEqual(v.lines[1], { id: "2", name: "Printed handbook", quantity: "3", unit: "C62", price: "50.00", net: "150.00", vatCategory: "S", vatPercent: "7" });
  assert.deepEqual(v.taxes.map((t) => [t.vatPercent, t.basis, t.amount]), [["19", "200.00", "38.00"], ["7", "150.00", "10.50"]]);
  assert.equal(v.totals.tax, "48.50");
  assert.equal(v.totals.prepaid, "98.50");
  assert.equal(v.totals.due, "300.00");
  assert.deepEqual(v.payments, [{ code: "58", reference: "INV-2026-0042", iban: "DE02120300000000202051" }]);
  assert.equal(v.paymentTerms, "Net 30 days");
});

test("CII: format-102 dates, reverse charge with its exemption reason, payment terms", () => {
  const v = readInvoiceForView(example("cii-invoice.xml"));
  assert.equal(v.syntax, "CII");
  assert.equal(v.issueDate, "20260824");
  assert.equal(v.dueDate, "20260923");
  assert.deepEqual(v.buyer, { name: "Acheteur SARL", country: "FR", vatId: "FR40303265045" });
  assert.deepEqual(v.taxes, [{ vatCategory: "AE", vatPercent: "0", basis: "250.00", amount: "0.00", exemption: "Reverse charge" }]);
  const html = invoiceViewHtml(v);
  assert.match(html, /24\.08\.2026/);
  assert.match(html, /Steuerschuldnerschaft des Leistungsempfängers \(Reverse Charge\) \(AE\)/);
  assert.match(html, /Grund: Reverse charge/);
  assert.match(html, /10 Std\./);
});

test("UBL credit note: its type, the invoice it corrects and the seller's contact", () => {
  const v = readInvoiceForView(example("peppol-credit-note.xml"));
  assert.equal(v.typeCode, "381");
  assert.equal(v.precedingInvoice, "INV-2026-0042");
  assert.equal(v.seller.contact.email, "ar@supplier.example");
  const html = invoiceViewHtml(v);
  assert.match(html, /Gutschrift \(Rechnungskorrektur\)/);
  assert.match(html, /Bezug auf Rechnung <span class="bt">BT-25<\/span><\/th><td>INV-2026-0042/);
});

test("the XML inside a Factur-X PDF reads the same as the CII file", async () => {
  const { payload } = await extractEmbeddedInvoice(example("factur-x-invoice.pdf"));
  const v = readInvoiceForView(payload);
  assert.equal(v.syntax, "CII");
  assert.ok(v.number);
  assert.ok(v.totals.due);
  assert.ok(v.lines.length >= 1);
});

test("a second tax total in the VAT accounting currency (BT-111) is shown apart, never as BT-110", () => {
  const xml = String(example("ubl-invoice.xml")).replace(
    "<cac:TaxTotal>",
    '<cac:TaxTotal><cbc:TaxAmount currencyID="CHF">45.00</cbc:TaxAmount></cac:TaxTotal><cac:TaxTotal>',
  );
  const v = readInvoiceForView(xml);
  assert.equal(v.totals.tax, "48.50");
  assert.equal(v.totals.taxInAccountingCurrency, "45.00 CHF");
});

test("every value from the file is escaped in the view", () => {
  const xml = String(example("ubl-invoice.xml"))
    .replace("<cbc:Name>Supplier GmbH</cbc:Name>", "<cbc:Name>&lt;img src=x onerror=alert(1)&gt;</cbc:Name>")
    .replace("<cbc:ID>INV-2026-0042</cbc:ID>", '<cbc:ID>"&gt;&lt;script&gt;x()&lt;/script&gt;</cbc:ID>')
    .replace("<cbc:Note>Net 30 days</cbc:Note>", "<cbc:Note><![CDATA[<b>bold</b>]]></cbc:Note>");
  const html = invoiceViewHtml(readInvoiceForView(xml));
  assert.doesNotMatch(html, /<img|<script|onerror=alert\(1\)"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
});

test("files it cannot show get a German reason, and DTDs are refused", () => {
  assert.throws(() => readInvoiceForView("not xml"), /kein XML/);
  assert.throws(() => readInvoiceForView("<rsm:CrossIndustryDocument xmlns:rsm='x'/>"), /ZUGFeRD-1\.0/);
  assert.throws(() => readInvoiceForView("<FatturaElettronica/>"), /weder eine UBL-Rechnung/);
  assert.throws(() => readInvoiceForView('<!DOCTYPE x [<!ENTITY a "b">]><Invoice/>'), /DTD/);
});

test("amounts and dates are reformatted as strings, never through floating point", () => {
  assert.equal(formatAmount("1234567.5", "EUR"), "1.234.567,50 €");
  assert.equal(formatAmount("0.1"), "0,10");
  assert.equal(formatAmount("-98.50", "USD"), "−98,50 USD");
  assert.equal(formatAmount("12345678901234567.89"), "12.345.678.901.234.567,89");
  assert.equal(formatAmount("1e3"), "1e3");
  assert.equal(formatDecimal("0.333"), "0,333");
  assert.equal(formatDate("2026-08-24"), "24.08.2026");
  assert.equal(formatDate("20260824"), "24.08.2026");
  assert.equal(formatDate("24/08/2026"), "24/08/2026");
});

test("an invoice with almost nothing in it still renders, with placeholders", () => {
  const html = invoiceViewHtml(readInvoiceForView("<Invoice/>"));
  assert.match(html, /\(keine Nummer\)/);
  assert.match(html, /Keine Positionen in der Datei/);
});

test("codes that name an Object.prototype member are shown as bare codes", () => {
  const xml = String(example("ubl-invoice.xml"))
    .replace("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>", "<cbc:InvoiceTypeCode>constructor</cbc:InvoiceTypeCode>")
    .replace('unitCode="HUR"', 'unitCode="toString"');
  const html = invoiceViewHtml(readInvoiceForView(xml));
  assert.match(html, /Code constructor/);
  assert.match(html, /2 toString/);
  assert.doesNotMatch(html, /function|native code/);
});
