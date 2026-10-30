import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPdfEnvelope, profileFromGuideline, profileFromXmp } from "./pdf-envelope.mjs";
import { buildPdfWithAttachment } from "./facturx.mjs";
import { preflightDocuments } from "./report.mjs";

const xml = (id) => `<rsm:CrossIndustryInvoice><rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${id}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext></rsm:CrossIndustryInvoice>`;
const withXmp = (level, part = 3) => {
  const pdf = buildPdfWithAttachment("<x/>");
  const meta = new TextEncoder().encode(`\n<x:xmpmeta><rdf:Description pdfaid:part="${part}" fx:ConformanceLevel="${level}"/></x:xmpmeta>\n`);
  const out = new Uint8Array(pdf.length + meta.length);
  out.set(pdf); out.set(meta, pdf.length);
  return out;
};

test("profile names line up between XMP and guideline ID", () => {
  assert.equal(profileFromXmp("BASIC WL"), "basicwl");
  assert.equal(profileFromXmp("EN 16931"), "en16931");
  assert.equal(profileFromGuideline("urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic"), "basic");
  assert.equal(profileFromGuideline("urn:cen.eu:en16931:2017"), "en16931");
  assert.equal(profileFromGuideline("urn:factur-x.eu:1p0:basicwl"), "basicwl");
});

test("a clean envelope draws nothing", () => {
  assert.deepEqual(checkPdfEnvelope(withXmp("EN 16931"), xml("urn:cen.eu:en16931:2017")), []);
});

test("PDF-001 when the PDF is not PDF/A-3 or has no XMP", () => {
  assert.deepEqual(checkPdfEnvelope(withXmp("BASIC", 1), "").map((f) => f.rule), ["PDF-001"]);
  assert.ok(checkPdfEnvelope(buildPdfWithAttachment("<x/>"), "").some((f) => f.rule === "PDF-001" && f.severity === "note"));
});

test("PDF-002 for a non-standard attachment name", () => {
  const rules = checkPdfEnvelope(buildPdfWithAttachment("<x/>", "invoice.xml"), "").map((f) => f.rule);
  assert.ok(rules.includes("PDF-002"));
  assert.ok(!checkPdfEnvelope(buildPdfWithAttachment("<x/>", "Factur-X.xml"), "").some((f) => f.rule === "PDF-002"));
});

test("PDF-003 when AFRelationship is missing", () => {
  const pdf = new TextDecoder("latin1").decode(buildPdfWithAttachment("<x/>")).replace(" /AFRelationship /Data", "");
  assert.ok(checkPdfEnvelope(new TextEncoder().encode(pdf), "").some((f) => f.rule === "PDF-003"));
});

test("PDF-004 when XMP and XML disagree on the profile", () => {
  const found = checkPdfEnvelope(withXmp("MINIMUM"), xml("urn:cen.eu:en16931:2017"));
  assert.deepEqual(found.map((f) => f.rule), ["PDF-004"]);
  assert.equal(found[0].severity, undefined);
});

test("the report carries the envelope findings for a PDF", async () => {
  const pdf = readFileSync(new URL("./examples/factur-x-invoice.pdf", import.meta.url));
  const { reports } = await preflightDocuments([{ name: "a.pdf", source: new Uint8Array(pdf) }]);
  assert.ok(reports[0].errors.some((f) => f.rule === "PDF-001"));
});
