import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSvrl, detectSyntax, runSchematron, schematronAvailable, addonsFor, SEF_DIR } from "./schematron.mjs";
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
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
test("official rules flag the planted defects and pass the clean invoice", { skip: !ready && "run build-schematron.mjs" }, (t) => {
  const bad = runSchematron(read("ubl-invoice-with-defects.xml"));
  if (bad.status === "unavailable") return t.skip("saxon-js not installed");
  assert.equal(bad.status, "ok");
  assert.ok(bad.findings.some((f) => f.rule === "BR-CO-15"));
  const good = runSchematron(read("ubl-invoice.xml"));
  assert.deepEqual(good.findings.filter((f) => f.source === "en16931-schematron"), []);
});

const addonsReady = ready && addonsFor("<CustomizationID>xrechnung</CustomizationID>", "ubl").length > 0;
test("XRechnung add-on runs when BT-24 names XRechnung and says what is missing", { skip: !addonsReady && "run build-schematron.mjs" }, (t) => {
  const r = runSchematron(read("ubl-invoice.xml"));
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "xrechnung"]);
  const de = r.findings.filter((f) => f.source === "xrechnung-schematron");
  assert.ok(de.some((f) => f.rule === "BR-DE-2"));
  assert.match(de.find((f) => f.rule === "BR-DE-2").fix, /seller contact/);
  const plain = runSchematron(read("ubl-invoice.xml").replace(/urn:cen\.eu:en16931:2017#compliant#urn:xeinkauf\.de:kosit:xrechnung_3\.0/, "urn:cen.eu:en16931:2017"));
  assert.deepEqual(plain.sets, ["en16931"]);
});

test("Peppol add-on runs when BT-24 names Peppol BIS 3", { skip: !ready && "run build-schematron.mjs" }, (t) => {
  const pep = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
  const xml = read("ubl-invoice.xml").replace(/urn:cen\.eu:en16931:2017#compliant#urn:xeinkauf\.de:kosit:xrechnung_3\.0/, pep);
  if (!existsSync(join(SEF_DIR, "peppol-ubl.sef.json"))) return t.skip("run build-schematron.mjs");
  const r = runSchematron(xml);
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "peppol"]);
  assert.ok(r.findings.every((f) => f.source !== "xrechnung-schematron"));
});

const ciiXrReady = ready && existsSync(join(SEF_DIR, "cii.sef.json")) && addonsFor(read("xrechnung-cii-invoice.xml"), "cii").length > 0;
test("the XRechnung CII example passes the official EN 16931 and BR-DE rules", { skip: !ciiXrReady && "run build-schematron.mjs" }, (t) => {
  const r = runSchematron(read("xrechnung-cii-invoice.xml"));
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "xrechnung"]);
  assert.deepEqual(r.findings.filter((f) => f.severity === "fatal"), []);
});

test("XRechnung CII add-on flags a missing seller contact (BR-DE-2)", { skip: !ciiXrReady && "run build-schematron.mjs" }, (t) => {
  const xml = read("xrechnung-cii-invoice.xml").replace(/<ram:DefinedTradeContact>[\s\S]*?<\/ram:DefinedTradeContact>/, "");
  const r = runSchematron(xml);
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.ok(r.findings.some((f) => f.source === "xrechnung-schematron" && f.rule === "BR-DE-2"));
});

const xrSef = new URL("./schematron/xrechnung-ubl.sef.json", import.meta.url);
test("every BR-DE rule in the compiled XRechnung add-on has a specific English fix", { skip: !existsSync(xrSef) && "run build-schematron.mjs" }, () => {
  const sef = readFileSync(xrSef, "utf8");
  const ids = [...new Set([...sef.matchAll(/"val":"(BR-DE-\d+(?:-[ab])?|BR-DE-TMP-32)"/g)].map((m) => m[1]))];
  assert.ok(ids.length > 20, `found ${ids.length} ids`);
  assert.deepEqual(ids.filter((id) => !hasSpecificFix(id)), []);
});
