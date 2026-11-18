// CIUS-RO 1.0.9 runs on EN 16931 validation 1.3.8, not on the current base
// (phive-rules-cius-ro's basedOn, and ANAF's own bundled EN16931-CIUS_RO-UBL-validation.xslt,
// which has no UBL-SR-51..59). UBL-SR-53 arrived in 1.3.14 and fails ANAF's own
// non-VAT buyer: a PartyTaxScheme holding the CUI with an empty TaxScheme.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { createPlainRunner } from "./plain-schematron.mjs";
import { preflightDocuments } from "./report.mjs";

const plain = (f) => new URL(`./plain/${f}`, import.meta.url);
const ready = plainAvailable() && existsSync(plain("en16931-1.3.8-ubl.json")) && existsSync(plain("cius-ro-ubl.json"));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");

// ANAF's shape for a buyer that is not VAT registered: the fiscal code (CUI) in a
// PartyTaxScheme whose TaxScheme carries no ID.
const nonVatBuyer = (xml) => xml.replace(
  "<cbc:CompanyID>RO76543210</cbc:CompanyID>\n        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>",
  "<cbc:CompanyID>8609468</cbc:CompanyID>\n        <cac:TaxScheme/>",
);
const rules = (r) => r.findings.map((f) => f.rule).sort();

test("a Romanian invoice runs the 1.3.8 base, a plain EN 16931 one the current base", { skip }, async () => {
  const ro = await runPlain(read("ro-invoice.xml"));
  assert.deepEqual(ro.sets, ["en16931-1.3.8", "cius-ro"]);
  assert.deepEqual(ro.findings, []);
  assert.deepEqual(ro.skipped, []);
  const eu = await runPlain(read("ubl-invoice.xml").replace(/<cbc:CustomizationID>[^<]*</, "<cbc:CustomizationID>urn:cen.eu:en16931:2017<"));
  assert.equal(eu.sets[0], "en16931");
});

test("ANAF's non-VAT buyer draws no UBL-SR-53 under CIUS-RO; the same party does under the current base", { skip }, async () => {
  const xml = nonVatBuyer(read("ro-invoice.xml"));
  assert.ok(xml.includes("<cac:TaxScheme/>"), "fixture edit applied");
  assert.ok(!rules(await runPlain(xml)).includes("UBL-SR-53"));
  // Without the CIUS-RO id the file falls to the current base, which does carry the rule.
  const eu = xml.replace(/<cbc:CustomizationID>[^<]*</, "<cbc:CustomizationID>urn:cen.eu:en16931:2017<");
  assert.ok(rules(await runPlain(eu)).includes("UBL-SR-53"));
});

test("a copy without the 1.3.8 file falls back to the current base instead of failing", { skip }, async () => {
  const { parseXmlDocument } = (await import("node:module")).createRequire(import.meta.url)("slimdom");
  const fontoxpath = (await import("node:module")).createRequire(import.meta.url)("fontoxpath");
  const runner = createPlainRunner({ fontoxpath, parseXml: parseXmlDocument });
  const load = async (f) => (f.startsWith("en16931-1.3.8") || !existsSync(plain(f)) ? null : JSON.parse(readFileSync(plain(f), "utf8")));
  const r = await runner.run(read("ro-invoice.xml"), load);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["en16931", "cius-ro"]);
});

test("the report runs CIUS-RO on a Romanian file (the plain route takes national add-ons)", { skip }, async () => {
  const [report] = (await preflightDocuments([{ name: "ro.xml", source: read("ro-invoice-with-defects.xml") }], { schematron: true })).reports;
  const national = report.errors.filter((e) => e.source === "cius-ro-schematron").map((e) => e.rule);
  assert.ok(national.includes("BR-RO-010"), national.join(" "));
  assert.equal(report.errors.filter((e) => e.rule === "UBL-SR-53").length, 0);
});
