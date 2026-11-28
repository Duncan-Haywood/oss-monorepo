// The creator's France profile: the BR-FR fields (SIREN as BT-30, the billing mode BT-23, the
// coded PMD/PMT/AAB notes, the VATEX code of the franchise en base) written in CII, UBL and
// Factur-X, and the drafts it refuses before the BR-FR rules would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateInvoice } from "./generate.mjs";
import { generateFacturX } from "./facturx-pdf.mjs";
import { readFontsSync } from "./facturx-pdf-node.mjs";
import { extractEmbeddedInvoiceXml, listEmbeddedFiles } from "./facturx.mjs";
import { preflightDocuments } from "./report.mjs";
import { draft } from "./micro-entrepreneur-bench.mjs";

const paths = (r) => r.errors.map((e) => e.path);

test("CII carries the SIREN (scheme 0002), the billing mode, coded notes and VATEX-FR-FRANCHISE", () => {
  const r = generateInvoice(draft(), { format: "cii", profile: "france" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
  assert.match(r.xml, /<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>S1<\/ram:ID>/);
  assert.match(r.xml, /<ram:Name>Camille Martin EI<\/ram:Name>\n\s*<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">123456782<\/ram:ID>/);
  for (const code of ["PMD", "PMT", "AAB"]) assert.match(r.xml, new RegExp(`<ram:SubjectCode>${code}</ram:SubjectCode>`));
  assert.match(r.xml, /<ram:CategoryCode>E<\/ram:CategoryCode>\n\s*<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE<\/ram:ExemptionReasonCode>/);
  assert.match(r.xml, /<ram:ExemptionReason>TVA non applicable, art\. 293 B du CGI<\/ram:ExemptionReason>/);
});

test("UBL carries the same: ProfileID, PartyLegalEntity CompanyID, #PMD# notes, the reason code", () => {
  const r = generateInvoice(draft(), { format: "ubl", profile: "france" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.match(r.xml, /<cbc:ProfileID>S1<\/cbc:ProfileID>/);
  assert.match(r.xml, /<cbc:RegistrationName>Camille Martin EI<\/cbc:RegistrationName><cbc:CompanyID schemeID="0002">123456782<\/cbc:CompanyID>/);
  assert.match(r.xml, /<cbc:Note>#PMT#Indemnité forfaitaire/);
  assert.match(r.xml, /<cbc:TaxExemptionReasonCode>VATEX-FR-FRANCHISE<\/cbc:TaxExemptionReasonCode>\n\s*<cbc:TaxExemptionReason>/);
});

test("the built-in French checks pass the creator's file (FR-001 to FR-008)", async () => {
  for (const format of ["cii", "ubl"]) {
    const r = generateInvoice(draft(), { format, profile: "france" });
    const rep = (await preflightDocuments([{ name: "f.xml", source: r.xml }], { profile: "france" })).reports[0];
    assert.deepEqual(rep.errors.map((f) => f.rule), [], format);
  }
});

test("refuses what the BR-FR rules refuse, naming the rule", () => {
  const cases = [
    [(d) => { delete d.billing_mode; }, "billing_mode", /BR-FR-08/],
    [(d) => { d.billing_mode = "X1"; }, "billing_mode", /BR-FR-08/],
    [(d) => { delete d.seller.legal_id; }, "seller.legal_id", /BR-FR-10/],
    [(d) => { d.seller.legal_id = "12345678200010"; }, "seller.legal_id", /SIRET is not accepted/],
    [(d) => { d.seller.legal_id = "123456789"; }, "seller.legal_id", /check digit/],
    [(d) => { d.notes = d.notes.filter((n) => n.subject !== "PMT"); }, "notes", /PMT \(BR-FR-05\)/],
    [(d) => { d.number = "F 2026 014"; }, "number", /BR-FR-02/],
    [(d) => { d.buyer.legal_id = "987654321"; }, "buyer.legal_id", /check digit/],
  ];
  for (const [change, path, message] of cases) {
    const d = draft();
    change(d);
    const r = generateInvoice(d, { format: "cii", profile: "france" });
    assert.equal(r.ok, false, path);
    const e = r.errors.find((x) => x.path === path);
    assert.ok(e, `${path}: ${JSON.stringify(r.errors)}`);
    assert.match(e.message, message);
  }
});

test("a seller with no VAT number is refused with the BR-E-02 reason and who to ask", () => {
  const d = draft();
  delete d.seller.vat_id;
  const r = generateInvoice(d, { format: "cii", profile: "france" });
  assert.equal(r.ok, false);
  const e = r.errors.find((x) => x.path === "seller.vat_id");
  assert.match(e.message, /BR-E-02/);
  assert.match(e.message, /293 B du CGI/);
  assert.match(e.message, /plateforme agréée/);
});

test("missing electronic addresses warn (BR-FR-12, -13) but the file is still written", () => {
  const d = draft();
  delete d.buyer.endpoint;
  delete d.seller.endpoint;
  const r = generateInvoice(d, { format: "cii", profile: "france" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings.map((w) => w.path), ["seller.endpoint", "buyer.endpoint"]);
  assert.match(r.warnings[1].message, /BR-FR-12/);
});

test("a buyer without a SIREN only warns: the platform routes on it, but it is the customer's to give", () => {
  const d = draft();
  delete d.buyer.legal_id;
  const r = generateInvoice(d, { format: "cii", profile: "france" });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.path === "buyer.legal_id"));
});

test("an explicit reason code wins, a bad one is refused, two codes in one VAT row are refused", () => {
  const d = draft();
  d.lines[0].tax_reason_code = "vatex-fr-cgi261-4";
  assert.match(generateInvoice(d, { format: "cii", profile: "france" }).xml, /VATEX-FR-CGI261-4/);
  d.lines[0].tax_reason_code = "FRANCHISE";
  assert.ok(paths(generateInvoice(d, { format: "cii", profile: "france" })).includes("lines[0].tax_reason_code"));
  const two = draft();
  two.lines.push({ ...two.lines[0], description: "Formation", tax_reason: "Exonération, art. 261-4-4° du CGI", tax_reason_code: "VATEX-FR-CGI261-4" });
  assert.ok(paths(generateInvoice(two, { format: "cii", profile: "france" })).includes("lines"));
});

test("other profiles are unchanged: no reason code is guessed and the billing mode is not asked for", () => {
  const d = draft();
  delete d.billing_mode;
  const r = generateInvoice(d, { format: "cii", profile: "en16931" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.doesNotMatch(r.xml, /VATEX-FR-FRANCHISE|BusinessProcessSpecifiedDocumentContextParameter/);
});

test("Factur-X: the France profile embeds the same CII as factur-x.xml, which the French checks pass", async () => {
  const r = generateFacturX(draft(), { profile: "france", fonts: readFontsSync(), date: new Date("2026-11-28T00:00:00Z") });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const cii = generateInvoice(draft(), { format: "cii", profile: "france" }).xml;
  assert.equal(r.xml, cii);
  assert.equal(new TextDecoder().decode(await extractEmbeddedInvoiceXml(r.pdf)), cii);
  assert.deepEqual(listEmbeddedFiles(r.pdf).map((f) => f.name), ["factur-x.xml"]);
  const rep = (await preflightDocuments([{ name: "f.pdf", source: r.pdf }], { profile: "france" })).reports[0];
  assert.deepEqual(rep.errors.map((f) => f.rule), []);
});
