import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSvrl, detectSyntax, runSchematron, schematronAvailable } from "./schematron.mjs";
import { plainFix, hasSpecificFix } from "./schematron-fixes.mjs";
import { preflightDocuments } from "./report.mjs";

const SVRL = `<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl">
<svrl:failed-assert id="BR-CO-15" flag="fatal" location="/*:Invoice[namespace-uri()='urn:x'][1]/*:LegalMonetaryTotal[namespace-uri()='urn:y'][1]" test="x">
<svrl:text>[BR-CO-15]-Total &amp; VAT (BT-112) = a + b.</svrl:text></svrl:failed-assert>
<svrl:failed-assert id="BR-S-09" flag="warning" location="/a" test="y"><svrl:text>[BR-S-09]-Rate.</svrl:text></svrl:failed-assert>
</svrl:schematron-output>`;

test("parseSvrl reads rule id, severity, message and a readable path", () => {
  const f = parseSvrl(SVRL);
  assert.equal(f.length, 2);
  assert.equal(f[0].rule, "BR-CO-15");
  assert.equal(f[0].message, "Total & VAT (BT-112) = a + b.");
  assert.equal(f[0].path, "/Invoice[1]/LegalMonetaryTotal[1]");
  assert.equal(f[0].source, "en16931-schematron");
  assert.equal(f[1].severity, "warning");
  assert.match(f[0].fix, /Recalculate/);
});

test("plainFix: specific, family and generic fallbacks", () => {
  assert.ok(hasSpecificFix("BR-CO-15"));
  assert.match(plainFix("BR-E-10"), /exemption reason/);
  assert.match(plainFix("BR-CL-23"), /code list/);
  assert.match(plainFix("PEPPOL-EN16931-R003"), /buyer reference/);
  assert.match(plainFix("ZZ-1"), /re-run/);
});

test("detectSyntax", () => {
  assert.equal(detectSyntax("<Invoice xmlns='x'/>"), "ubl");
  assert.equal(detectSyntax("<rsm:CrossIndustryInvoice/>"), "cii");
  assert.equal(detectSyntax("{}"), "");
});

test("report says unavailable for JSON drafts and never throws", async () => {
  const src = readFileSync(new URL("./examples/valid-invoice.json", import.meta.url), "utf8");
  const { reports } = await preflightDocuments([{ name: "i.json", source: src }], { schematron: true });
  assert.equal(reports[0].schematron, "unavailable");
});

const ready = schematronAvailable("ubl");
test("official rules flag the planted defects and pass the clean invoice", { skip: !ready && "run build-schematron.mjs" }, (t) => {
  const bad = runSchematron(readFileSync(new URL("./examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8"));
  if (bad.status === "unavailable") return t.skip("saxon-js not installed");
  assert.equal(bad.status, "ok");
  assert.ok(bad.findings.some((f) => f.rule === "BR-CO-15"));
  const good = runSchematron(readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8"));
  assert.deepEqual(good.findings, []);
});

const xrReady = schematronAvailable("ubl", "xrechnung");
test("XRechnung add-on rules run for a declared XRechnung invoice and flag a missing payment block", { skip: !xrReady && "run build-schematron.mjs" }, (t) => {
  const clean = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");
  if (runSchematron(clean).status === "unavailable") return t.skip("saxon-js not installed");
  const ok = runSchematron(clean);
  assert.deepEqual(ok.rulesets, ["base", "xrechnung"]);
  assert.deepEqual(ok.findings, []);
  const bad = runSchematron(clean.replace(/<cac:PaymentMeans>[\s\S]*?<\/cac:PaymentMeans>/, ""));
  const de1 = bad.findings.find((f) => f.rule === "BR-DE-1");
  assert.ok(de1);
  assert.equal(de1.source, "xrechnung-schematron");
  assert.match(de1.fix, /payment means code/);
  assert.equal(de1.path, "/Invoice[1]");
});

test("a plain EN 16931 invoice skips the add-on unless forced", { skip: !xrReady && "run build-schematron.mjs" }, (t) => {
  const plain = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8").replace(/#urn:xeinkauf[^<]*/, "");
  if (runSchematron(plain).status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(runSchematron(plain).rulesets, ["base"]);
  assert.deepEqual(runSchematron(plain, { xrechnung: true }).rulesets, ["base", "xrechnung"]);
});
