import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingProfile } from "./schematron-core.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ready = plainAvailable() && existsSync(new URL("./plain/zatca-ksa-ubl.json", import.meta.url));
const hasSlimdom = await import("slimdom").then(() => true, () => false);
const skipXslt = !hasSlimdom && "npm i --no-save slimdom";
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const rules = (r) => r.findings.map((f) => f.rule).sort();
// BR-KSA-98 reads the clock: any fixed issue date is later than 24 hours ago, so it fires on both files.
// BR-KSA-29 is explained in the README ("ZATCA / Saudi Arabia").
const ALWAYS = ["BR-KSA-29", "BR-KSA-98"];

test("the KSA profile is picked from ProfileID, and only for UBL", () => {
  assert.equal(matchingProfile(read("zatca-simplified-invoice.xml"), "ubl")[0], "zatca");
  assert.equal(matchingProfile(read("zatca-simplified-invoice.xml"), "cii"), null);
  assert.equal(matchingProfile(read("ubl-invoice.xml"), "ubl"), null);
  assert.equal(matchingProfile(read("zatca-simplified-invoice.xml").replace("reporting:1.0", "clearance:1.0"), "ubl")[0], "zatca");
  assert.equal(matchingProfile(read("zatca-simplified-invoice.xml").replace("reporting:1.0", "reporting:2.0"), "ubl"), null);
});

test("a made-up simplified invoice passes the KSA rules and the EU base rules do not run on it", { skip }, async () => {
  const r = await runPlain(read("zatca-simplified-invoice.xml"));
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["zatca"]);
  assert.deepEqual(rules(r), ALWAYS);
  assert.deepEqual(r.skipped, [], "every rule was evaluated, including the format-number ones");
});

test("VAT arithmetic, the QR code, the CRN and the VAT number faults are found", { skip }, async () => {
  const r = await runPlain(read("zatca-simplified-invoice-with-defects.xml"));
  assert.deepEqual(rules(r), [...ALWAYS.filter((id) => id !== "BR-KSA-29"), "BR-CO-14", "BR-CO-15", "BR-CO-17", "BR-KSA-27", "BR-KSA-40", "BR-KSA-F-08", "BR-S-09"].sort());
  assert.equal(r.findings.find((f) => f.rule === "BR-KSA-40").severity, "fatal", "ZATCA's error flag is a fatal finding");
  assert.equal(r.findings.find((f) => f.rule === "BR-KSA-F-08").severity, "warning");
  assert.equal(r.findings.find((f) => f.rule === "BR-KSA-27").source, "zatca-schematron");
});

test("an unsigned simplified invoice is told to carry the cryptographic stamp", { skip }, async () => {
  const xml = read("zatca-simplified-invoice.xml")
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, "")
    .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, "");
  const r = await runPlain(xml);
  assert.deepEqual(rules(r), [...ALWAYS, "BR-KSA-28", "BR-KSA-30", "BR-KSA-60"].sort());
});

test("a standard (B2B) invoice needs a buyer with a name and an address", { skip }, async () => {
  const xml = read("zatca-simplified-invoice.xml").replace('name="0200000"', 'name="0100000"').replace("reporting:1.0", "clearance:1.0");
  const r = await runPlain(xml);
  assert.ok(rules(r).some((id) => id.startsWith("BR-KSA-")), "standard invoice type draws KSA buyer rules");
  assert.ok(r.findings.length > ALWAYS.length);
});

test("the SchXslt reader turns an if, a for-each and a choose into violation XPaths", { skip: skipXslt }, async () => {
  const { schematronFromXslt } = await import("./plain-from-xslt.mjs");
  const xsl = `<xsl:transform xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:svrl="http://purl.oclc.org/dsdl/svrl" xmlns:schxslt="https://doi.org/10.5281/zenodo.1495494" version="2.0">
  <svrl:ns-prefix-in-attribute-values prefix="cbc" uri="urn:cbc"/>
  <xsl:template match="item" priority="5" mode="d1"><xsl:choose><xsl:when test="false()"/><xsl:otherwise>
    <schxslt:rule pattern="d1"><svrl:fired-rule/>
      <xsl:if test="@a"><xsl:for-each select="line"><xsl:choose>
        <xsl:when test="@k='x'"><xsl:if test="not(@v)"><svrl:failed-assert flag="error" id="T-1"><svrl:text>x needs v</svrl:text></svrl:failed-assert></xsl:if></xsl:when>
        <xsl:otherwise><svrl:failed-assert flag="warning" id="T-2"><svrl:text>other kinds are not allowed</svrl:text></svrl:failed-assert></xsl:otherwise>
      </xsl:choose></xsl:for-each></xsl:if>
    </schxslt:rule></xsl:otherwise></xsl:choose></xsl:template>
</xsl:transform>`;
  const file = join(mkdtempSync(join(tmpdir(), "zatca-fixture-")), "rules.xsl");
  writeFileSync(file, xsl);
  const sch = schematronFromXslt(file);
  assert.match(sch, /<pattern id="d1">/);
  assert.match(sch, /id="T-1" flag="fatal" test="not\(\(@a\) and \(exists\(\(line\)\[\(@k='x'\) and \(not\(@v\)\)\]\)\)\)"/, "error becomes fatal; the when guard and the loop wrap the violation");
  assert.match(sch, /id="T-2" flag="warning" test="not\(\(@a\) and \(exists\(\(line\)\[not\(@k='x'\) and \(true\(\)\)\]\)\)\)"/, "otherwise carries the negated guard");
});

test("a simplified credit note (an Invoice document with type code 381) passes, and loses its reason and reference when they are removed", { skip }, async () => {
  const ok = await runPlain(read("zatca-simplified-credit-note.xml"));
  assert.deepEqual(rules(ok), ALWAYS);
  assert.deepEqual(ok.skipped, []);
  const xml = read("zatca-simplified-credit-note.xml")
    .replace(/  <cac:BillingReference>[\s\S]*?<\/cac:BillingReference>\n/, "")
    .replace(/\n\s*<cbc:InstructionNote>[^<]*<\/cbc:InstructionNote>/, "");
  assert.deepEqual(rules(await runPlain(xml)), [...ALWAYS, "BR-KSA-17", "BR-KSA-56"].sort());
});

test("a UBL CreditNote root is not how ZATCA sends credit notes: the EU base rules misfire on it", { skip }, async () => {
  const xml = read("zatca-simplified-credit-note.xml")
    .replace('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"', '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"')
    .replace("</Invoice>", "</CreditNote>").replace(/InvoiceLine/g, "CreditNoteLine").replace(/InvoicedQuantity/g, "CreditedQuantity");
  const r = await runPlain(xml);
  assert.ok(rules(r).includes("BR-22"), "hard-coded InvoicedQuantity path: the rules assume the Invoice root");
});

test("a simplified debit note (an Invoice document with type code 383) passes, and loses its reason and reference when they are removed", { skip }, async () => {
  const ok = await runPlain(read("zatca-simplified-debit-note.xml"));
  assert.deepEqual(rules(ok), ALWAYS);
  assert.deepEqual(ok.skipped, []);
  const xml = read("zatca-simplified-debit-note.xml")
    .replace(/  <cac:BillingReference>[\s\S]*?<\/cac:BillingReference>\n/, "")
    .replace(/\n\s*<cbc:InstructionNote>[^<]*<\/cbc:InstructionNote>/, "");
  assert.deepEqual(rules(await runPlain(xml)), [...ALWAYS, "BR-KSA-17", "BR-KSA-56"].sort());
});
