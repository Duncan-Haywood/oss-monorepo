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

test("the shipped Factur-X credit note unwraps, is a 381 and checks clean", async () => {
  const invoice = await parseInvoiceSource("factur-x-credit-note.pdf", example("factur-x-credit-note.pdf"));
  assert.equal(invoice.invoice_number, "GS-2026-0011");
  assert.deepEqual(checkInvoice(invoice), []);
});

test("the Factur-X credit note with defects gives the same built-in findings as its XML", async () => {
  const fromPdf = await parseInvoiceSource("factur-x-credit-note-with-defects.pdf", example("factur-x-credit-note-with-defects.pdf"));
  const fromXml = await parseInvoiceSource("xrechnung-cii-credit-note-with-defects.xml", example("xrechnung-cii-credit-note-with-defects.xml"));
  assert.deepEqual(checkInvoice(fromPdf), checkInvoice(fromXml));
  assert.deepEqual(checkInvoice(fromPdf).map((f) => f.rule), ["INV-032", "INV-038"]);
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
  // The example is hand-made with no XMP, so only the PDF/A-3 note is expected.
  assert.deepEqual(result.reports[0].errors.map((e) => e.rule), ["PDF-001"]);
  assert.equal(result.reports[0].envelope.includes("notes"), false);
});

// Real generators order the stream dictionary freely and often store /Length
// as an indirect reference; each shape below used to be unreadable.
const SHAPE_XML = `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">${"x".repeat(300)}</rsm:CrossIndustryInvoice>`;

function shapedPdf(dict, body, lengthObject = "") {
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n4 0 obj\n${dict}\nstream\n`),
    body,
    Buffer.from(`\nendstream\nendobj\n${lengthObject}trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n`),
  ]);
}

test("reads embedded streams whatever the dictionary key order or length form", async () => {
  const plain = Buffer.from(SHAPE_XML);
  const packed = deflateSync(plain);
  const lengthOf = (n) => `5 0 obj\n${n}\nendobj\n`;
  const cases = {
    "indirect length": shapedPdf("<< /Type /EmbeddedFile /Length 5 0 R >>", plain, lengthOf(plain.length)),
    "filter before type": shapedPdf(`<< /Length ${packed.length} /Filter /FlateDecode /Type /EmbeddedFile >>`, packed),
    "filter before type, indirect length": shapedPdf("<< /Filter /FlateDecode /Length 5 0 R /Type /EmbeddedFile >>", packed, lengthOf(packed.length)),
    "filter after type, indirect length": shapedPdf("<< /Type /EmbeddedFile /Filter /FlateDecode /Length 5 0 R >>", packed, lengthOf(packed.length)),
    "wrong direct length falls back to endstream": shapedPdf("<< /Type /EmbeddedFile /Length 7 >>", plain),
  };
  for (const [label, pdf] of Object.entries(cases)) {
    const xml = await extractEmbeddedInvoiceXml(pdf);
    assert.equal(new TextDecoder().decode(xml), SHAPE_XML, label);
  }
});

test("an embedded invoice whose root follows a long licence comment still unwraps", async () => {
  // The official ZUGFeRD samples carry a licence comment of over 5 KB before the root.
  const xml = example("cii-invoice.xml").toString("utf8");
  const comment = `<!-- ${"Nutzungsrechte / terms of use. ".repeat(250)}-->\n`;
  const withComment = xml.replace(/(<\?xml[^>]*\?>\s*)/, `$1${comment}`);
  assert.ok(withComment.indexOf("CrossIndustryInvoice") > 5000);
  const pdf = buildPdfWithAttachment(Buffer.from(withComment), "factur-x.xml");
  const out = await extractEmbeddedInvoiceXml(pdf);
  assert.match(Buffer.from(out).toString("utf8"), /CrossIndustryInvoice/);
});

test("an attachment whose /Subtype names application/octet-stream still unwraps", async () => {
  const pdf = buildPdfWithAttachment(example("cii-invoice.xml"));
  const text = Buffer.from(pdf).toString("latin1").replace("/Subtype /text#2Fxml", "/Subtype /application#2Foctet-stream");
  const xml = await extractEmbeddedInvoiceXml(Buffer.from(text, "latin1"));
  assert.match(Buffer.from(xml).toString("utf8"), /CrossIndustryInvoice/);
});
