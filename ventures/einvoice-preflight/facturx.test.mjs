import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { checkInvoice } from "./checks.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import {
  buildPdfWithAttachment,
  envelopeNote,
  extractEmbeddedInvoice,
  extractEmbeddedInvoiceXml,
  looksLikePdf,
  safeAttachmentLabel,
} from "./facturx.mjs";
import { inspectInvoiceSource, parseInvoiceSource, preflightDocuments } from "./report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const example = (name) => readFileSync(path.join(HERE, "examples", name));

test("looksLikePdf reads the header and the .pdf suffix", () => {
  assert.equal(looksLikePdf("invoice.pdf", new Uint8Array([0])), true);
  assert.equal(looksLikePdf("invoice.xml", example("cii-invoice.xml")), false);
  assert.equal(looksLikePdf("invoice.bin", example("factur-x-invoice.pdf")), true);
});

test("the shipped Factur-X example unwraps to the CII attachment", async () => {
  const xml = await extractEmbeddedInvoiceXml(example("factur-x-invoice.pdf"));
  const invoice = parseCiiInvoice(xml);
  assert.equal(invoice.invoice_number, "INV-2026-0043");
  assert.equal(checkInvoice(invoice).length, 0);
});

test("parseInvoiceSource unwraps a Factur-X PDF into the same facts", async () => {
  const invoice = await parseInvoiceSource("factur-x-invoice.pdf", example("factur-x-invoice.pdf"));
  assert.equal(invoice.invoice_number, "INV-2026-0043");
  assert.equal(invoice.supplier.vat_id, "DE136695976");
  assert.equal(invoice.tax_exemption_reason, "Reverse charge");
});

test("an encrypted PDF is refused without reading the attachment", async () => {
  const pdf = buildPdfWithAttachment(example("cii-invoice.xml"), "factur-x.xml", { encrypt: true });
  await assert.rejects(() => extractEmbeddedInvoiceXml(pdf), /encrypted/);
});

test("a PDF without an invoice attachment is refused", async () => {
  const empty = new TextEncoder().encode("%PDF-1.4\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
  await assert.rejects(() => extractEmbeddedInvoiceXml(empty), /no embedded invoice file/);
});

test("a locally built uncompressed PDF round-trips the CII example", async () => {
  const pdf = buildPdfWithAttachment(example("cii-invoice.xml"));
  const invoice = parseCiiInvoice(await extractEmbeddedInvoiceXml(pdf));
  assert.equal(invoice.invoice_number, "INV-2026-0043");
});

test("a FlateDecode attachment still unwraps in the browser path", async () => {
  const pdf = buildPdfWithAttachment(deflateSync(example("cii-invoice.xml")), "factur-x.xml", {
    filter: "FlateDecode",
  });
  const invoice = parseCiiInvoice(await extractEmbeddedInvoiceXml(pdf));
  assert.equal(invoice.invoice_number, "INV-2026-0043");
});

test("safe attachment labels never echo a custom PDF name", () => {
  assert.equal(safeAttachmentLabel("factur-x.xml"), "factur-x.xml");
  assert.equal(safeAttachmentLabel("XRECHNUNG.XML"), "xrechnung.xml");
  assert.equal(safeAttachmentLabel("notes.txt"), "embedded invoice XML");
  assert.equal(safeAttachmentLabel("=cmd|calc"), "embedded invoice XML");
  assert.equal(envelopeNote("factur-x.xml", "cii"), "Unwrapped factur-x.xml (CII) from the PDF.");
});

test("inspectInvoiceSource names the unwrapped Factur-X attachment", async () => {
  const { invoice, envelope } = await inspectInvoiceSource(
    "factur-x-invoice.pdf",
    example("factur-x-invoice.pdf"),
  );
  assert.equal(invoice.invoice_number, "INV-2026-0043");
  assert.equal(envelope, "Unwrapped factur-x.xml (CII) from the PDF.");
});

test("preflight of the shipped PDF carries the envelope note and not a custom name", async () => {
  const result = await preflightDocuments([
    { name: "factur-x-invoice.pdf", source: example("factur-x-invoice.pdf") },
  ]);
  assert.equal(result.reports[0].envelope, "Unwrapped factur-x.xml (CII) from the PDF.");
  assert.equal(result.reports[0].errors.length, 0);
  assert.equal(result.reports[0].envelope.includes("notes"), false);
});
