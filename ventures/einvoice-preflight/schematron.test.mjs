import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  assert.match(plainFix("BR-CL-23"), /unit of measure/);
  assert.match(plainFix("BR-CL-99"), /code list/);
  assert.match(plainFix("BR-S-05"), /above 0/);
  assert.match(plainFix("BR-O-11"), /Category O/);
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

test("every rule id in every compiled Schematron file has a specific English fix", { skip: !existsSync(xrSef) && "run build-schematron.mjs" }, () => {
  const dir = new URL("./schematron/", import.meta.url);
  const missing = new Set();
  let total = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sef.json"))) {
    const sef = readFileSync(new URL(f, dir), "utf8");
    for (const m of sef.matchAll(/"val":"((?:BR|PEPPOL|DE-R)[A-Za-z0-9-]*-[A-Za-z0-9-]+)"/g)) {
      total++;
      if (!hasSpecificFix(m[1])) missing.add(m[1]);
    }
  }
  assert.ok(total > 300, `found ${total} ids`);
  assert.deepEqual([...missing], []);
});

const peppolCiiReady = ready && existsSync(join(SEF_DIR, "peppol-cii.sef.json"));
test("Peppol BIS 3 add-on runs on CII and flags a missing buyer reference (R003)", { skip: !peppolCiiReady && "run build-schematron.mjs" }, (t) => {
  const pep = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
  const base = read("xrechnung-cii-invoice.xml").replace(/urn:cen\.eu:en16931:2017#compliant#urn:xeinkauf\.de:kosit:xrechnung_3\.0/, pep);
  const r = runSchematron(base);
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "peppol"]);
  assert.ok(r.findings.every((f) => f.source !== "xrechnung-schematron"));
  const bad = runSchematron(base.replace(/<ram:BuyerReference>[\s\S]*?<\/ram:BuyerReference>/, "").replace(/<ram:BuyerOrderReferencedDocument>[\s\S]*?<\/ram:BuyerOrderReferencedDocument>/, ""));
  const f = bad.findings.find((x) => x.source === "peppol-schematron" && x.rule === "PEPPOL-EN16931-R003");
  assert.ok(f, JSON.stringify(bad.findings.map((x) => x.rule)));
  assert.match(f.fix, /buyer reference/);
});

const creditReady = ready && existsSync(join(SEF_DIR, "peppol-ubl.sef.json"));
test("the Peppol BIS 3 credit note example passes the official EN 16931 and Peppol rules", { skip: !creditReady && "run build-schematron.mjs" }, (t) => {
  const xml = read("peppol-credit-note.xml");
  const r = runSchematron(xml);
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "peppol"]);
  assert.deepEqual(r.findings, []);
});

test("Peppol applies the German DE-R rules to a domestic credit note and each finding has a specific fix", { skip: !creditReady && "run build-schematron.mjs" }, (t) => {
  const xml = read("peppol-credit-note.xml").replace(/<cac:Contact>[\s\S]*?<\/cac:Contact>/, "").replace(/<cbc:PostalZone>20095<\/cbc:PostalZone>/, "");
  const r = runSchematron(xml);
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  const rules = r.findings.map((f) => f.rule).sort();
  assert.deepEqual(rules, ["DE-R-002", "DE-R-009"]);
  assert.ok(r.findings.every((f) => f.source === "peppol-schematron" && hasSpecificFix(f.rule)));
});

test("the XRechnung CII credit note example (type 381) passes the official rules apart from the information-level note", { skip: !ciiXrReady && "run build-schematron.mjs" }, (t) => {
  const r = runSchematron(read("xrechnung-cii-credit-note.xml"));
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "xrechnung"]);
  assert.deepEqual(r.findings.map((f) => f.rule), ["BR-DE-TMP-32"]);
  assert.equal(r.findings[0].severity, "information");
});

test("a UBL credit note with defects reports each official rule with a specific fix", { skip: !creditReady && "run build-schematron.mjs" }, (t) => {
  const r = runSchematron(read("ubl-credit-note-with-defects.xml"));
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  const rules = r.findings.map((f) => f.rule).sort();
  assert.deepEqual(rules, ["BR-CL-01", "BR-CO-14", "BR-CO-15", "DE-R-015", "PEPPOL-EN16931-P0101", "PEPPOL-EN16931-R003"]);
  assert.ok(r.findings.every((f) => hasSpecificFix(f.rule)), "every finding has a rule-specific English fix");
});

test("a CII credit note with defects reports each official rule with a specific fix", { skip: !ciiXrReady && "run build-schematron.mjs" }, (t) => {
  const r = runSchematron(read("xrechnung-cii-credit-note-with-defects.xml"));
  if (r.status === "unavailable") return t.skip("saxon-js not installed");
  assert.deepEqual(r.sets, ["en16931", "xrechnung"]);
  const rules = r.findings.map((f) => f.rule).sort();
  assert.deepEqual(rules, ["BR-CL-01", "BR-CO-14", "BR-CO-17", "BR-DE-15", "BR-DE-17", "BR-DE-2", "BR-DE-TMP-32", "BR-S-09"]);
  assert.ok(r.findings.every((f) => hasSpecificFix(f.rule)), "every finding has a rule-specific English fix");
});
