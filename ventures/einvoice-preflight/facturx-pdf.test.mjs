import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateFacturX, parseTrueType, subsetTrueType, srgbIccProfile, writeFacturXPdf } from "./facturx-pdf.mjs";
import { readFontsSync } from "./facturx-pdf-node.mjs";
import { buildInvoice, toCii } from "./generate.mjs";
import { extractEmbeddedInvoiceXml, listEmbeddedFiles } from "./facturx.mjs";
import { preflightDocuments, buildJsonReport } from "./report.mjs";

const draft = JSON.parse(readFileSync(new URL("./examples/draft-invoice.json", import.meta.url), "utf8"));
const fonts = readFontsSync();
const date = new Date("2026-11-14T12:00:00Z");
const latin1 = (b) => new TextDecoder("latin1").decode(b);

test("writes a PDF whose embedded XML is exactly the CII the creator writes", async () => {
  const r = generateFacturX(draft, { profile: "en16931", fonts, date });
  assert.equal(r.ok, true);
  assert.equal(r.filename, "RE-2026-001.pdf");
  assert.equal(latin1(r.pdf.subarray(0, 8)), "%PDF-1.7");
  const xml = new TextDecoder().decode(await extractEmbeddedInvoiceXml(r.pdf));
  assert.equal(xml, toCii(buildInvoice(draft, { profile: "en16931" }).doc));
  assert.equal(xml, r.xml);
  assert.deepEqual(listEmbeddedFiles(r.pdf).map((f) => f.name), ["factur-x.xml"]);
});

test("carries the PDF/A-3 and Factur-X markers veraPDF and receivers read", () => {
  const text = latin1(generateFacturX(draft, { profile: "en16931", fonts, date }).pdf);
  for (const needle of ["<pdfaid:part>3</pdfaid:part>", "<pdfaid:conformance>B</pdfaid:conformance>",
    "<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>", "<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>",
    "<pdfaSchema:prefix>fx</pdfaSchema:prefix>", "/AFRelationship /Alternative", "/Subtype /text#2Fxml",
    "/S /GTS_PDFA1", "/FontFile2", "/CIDToGIDMap /Identity", "/ToUnicode", "/ID [<"]) {
    assert.ok(text.includes(needle), needle);
  }
  assert.doesNotMatch(text.match(/trailer\n<<[^\n]*>>/)[0], /\/Info/, "no Info dictionary to disagree with the XMP");
});

test("XRechnung goes in as xrechnung.xml with level XRECHNUNG", () => {
  const r = generateFacturX(draft, { profile: "xrechnung", fonts, date });
  const text = latin1(r.pdf);
  assert.ok(text.includes("<fx:ConformanceLevel>XRECHNUNG</fx:ConformanceLevel>"));
  assert.deepEqual(listEmbeddedFiles(r.pdf).map((f) => f.name), ["xrechnung.xml"]);
});

test("Peppol is refused with the reason", () => {
  const r = generateFacturX(draft, { profile: "peppol", fonts });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /en16931 or xrechnung/);
});

test("draft errors come back without a PDF", () => {
  const r = generateFacturX({ ...draft, number: "" }, { fonts });
  assert.equal(r.ok, false);
  assert.equal(r.pdf, undefined);
  assert.ok(r.errors.some((e) => e.path === "number"));
});

test("the repo's own checker reads it with no findings, envelope checks included", async () => {
  const r = generateFacturX(draft, { profile: "en16931", fonts, date });
  const report = buildJsonReport(await preflightDocuments([{ name: r.filename, source: r.pdf }]));
  assert.deepEqual(report.errors, []);
});

test("every xref offset points at its object and every stream length is exact", () => {
  const pdf = generateFacturX({ ...draft, note: "Zażółć gęślą jaźń — Ευχαριστούμε" }, { profile: "en16931", fonts, date }).pdf;
  const text = latin1(pdf);
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(text.startsWith("xref\n", startxref));
  const rows = text.slice(startxref).split("\n").slice(3).filter((l) => / 00000 n $/.test(l));
  rows.forEach((row, i) => assert.ok(text.startsWith(`${i + 1} 0 obj\n`, Number(row.slice(0, 10))), `object ${i + 1}`));
  for (const m of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(text.slice(start + Number(m[1]), start + Number(m[1]) + 10), "\nendstream");
  }
});

test("is byte-identical for the same draft and date", () => {
  const a = generateFacturX(draft, { fonts, date }).pdf;
  const b = generateFacturX(draft, { fonts, date }).pdf;
  assert.deepEqual(a, b);
});

test("long invoices flow onto more pages, numbered", () => {
  const lines = Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i + 1}`, quantity: 1, unit: "pieces", unit_price: 10, tax_percent: 19 }));
  const text = latin1(generateFacturX({ ...draft, lines }, { fonts, date }).pdf);
  const count = Number(text.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1]);
  assert.ok(count >= 2);
  assert.ok(text.includes("/Type /Page /Parent"));
});

test("the font subset keeps used glyphs at their ids and drops the rest", () => {
  const full = parseTrueType(fonts.regular);
  const gA = full.cmap.get(0x41), gL = full.cmap.get(0x141);
  const sub = parseTrueType(subsetTrueType(full, [gA, gL]));
  assert.equal(sub.numGlyphs, full.numGlyphs);
  assert.ok(sub.loca[gA + 1] > sub.loca[gA]);
  assert.ok(sub.loca[gL + 1] > sub.loca[gL]);
  const gB = full.cmap.get(0x42);
  assert.equal(sub.loca[gB + 1], sub.loca[gB]);
  assert.ok(subsetTrueType(full, [gA]).length < fonts.regular.length / 3);
});

test("the ICC profile is a v2 RGB display profile with a consistent size", () => {
  const icc = srgbIccProfile();
  const dv = new DataView(icc.buffer, icc.byteOffset);
  assert.equal(dv.getUint32(0), icc.length);
  assert.equal(latin1(icc.subarray(12, 24)), "mntrRGB XYZ ");
  assert.equal(latin1(icc.subarray(36, 40)), "acsp");
  assert.equal(icc[8], 2);
  assert.equal(dv.getUint32(128), 9);
});

test("characters outside the font print as ? and the XML keeps them", async () => {
  const r = generateFacturX({ ...draft, note: "注文 42" }, { fonts, date });
  assert.ok(r.xml.includes("注文 42"));
  assert.ok(new TextDecoder().decode(await extractEmbeddedInvoiceXml(r.pdf)).includes("注文 42"));
});

test("writeFacturXPdf needs fonts", () => {
  const doc = buildInvoice(draft, { profile: "en16931" }).doc;
  assert.throws(() => writeFacturXPdf(doc, toCii(doc), {}), /fonts/);
});
