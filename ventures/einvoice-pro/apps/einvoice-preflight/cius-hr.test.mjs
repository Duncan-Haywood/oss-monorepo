import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingAddons } from "./schematron-core.mjs";
import { plainFix, hasSpecificFix } from "./schematron-fixes.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/cius-hr-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const hr = (r) => [...new Set(r.findings.filter((f) => f.source === "cius-hr-schematron").map((f) => f.rule))].sort();
const sample = read("hr-invoice.xml");

test("the Croatian rules are an add-on chosen from BT-24, for UBL only", () => {
  assert.deepEqual(matchingAddons(sample, "ubl").map(([n]) => n), ["cius-hr"]);
  assert.deepEqual(matchingAddons(sample, "cii"), []);
  assert.deepEqual(matchingAddons(sample.replaceAll("urn:mfin.gov.hr:", "x:"), "ubl"), []);
});

test("a clean Croatian invoice passes the HR rules, none skipped; the base warnings on HR-required fields say to keep them", { skip }, async () => {
  const r = await runPlain(sample);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["en16931", "cius-hr"]);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(hr(r), []);
  const base = r.findings.map((f) => f.rule).sort();
  assert.deepEqual(base, ["UBL-CR-006", "UBL-CR-200", "UBL-CR-597"]);
  for (const f of r.findings) {
    assert.equal(f.severity, "warning");
    assert.match(f.fix, /^Keep it: this invoice names HR-CIUS 2025/);
  }
});

test("outside HR-CIUS the same UBL-CR warnings keep the generic fix", { skip }, async () => {
  const r = await runPlain(sample.replace("#conformant#urn:mfin.gov.hr:ext-2025:1.0", "").replace("urn:mfin.gov.hr:cius-2025:1.0", "x"));
  const f = r.findings.find((x) => x.rule === "UBL-CR-006");
  assert.ok(f);
  assert.doesNotMatch(f.fix, /HR-CIUS/);
});

test("OIB check digits: seller, buyer and operator", { skip }, async () => {
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:CompanyID>HR12345678903<", "<cbc:CompanyID>HR12345678904<"))), ["HR-BR-53"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:CompanyID>HR98765432106<", "<cbc:CompanyID>HR98765432100<"))), ["HR-BR-53"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:ID>55556666775</cbc:ID>", "<cbc:ID>55556666770</cbc:ID>"))), ["HR-BR-9"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:Name>Ana Operater</cbc:Name>", ""))), ["HR-BR-37"]);
});

test("issue time, process code, KPD class and pre-2026 dates are Croatian requirements", { skip }, async () => {
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:IssueTime>09:30:00</cbc:IssueTime>", ""))), ["HR-BR-2"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:IssueTime>09:30:00<", "<cbc:IssueTime>09:30<"))), ["HR-BR-2"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:ProfileID>P1<", "<cbc:ProfileID>P13<"))), ["HR-BR-34"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:ProfileID>P1<", "<cbc:ProfileID>P99:Narudzba<"))), []);
  assert.deepEqual(hr(await runPlain(sample.replace(/<cac:CommodityClassification>[\s\S]*?62\.20\.30[\s\S]*?<\/cac:CommodityClassification>/, ""))), ["HR-BR-25"]);
  assert.deepEqual(hr(await runPlain(sample.replace(">62.20.30<", ">62.02.30<"))), ["HR-BR-CL-2"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:IssueDate>2026-11-02<", "<cbc:IssueDate>2025-12-31<"))), ["HR-BR-40"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:ID>42-1-1</cbc:ID>", "<cbc:ID>42 1 1</cbc:ID>"))), ["HR-BR-1"]);
});

test("addresses, due date, HR category labels and empty elements", { skip }, async () => {
  assert.deepEqual(hr(await runPlain(sample.replace(/<cbc:EndpointID schemeID="9934">HR12345678903<\/cbc:EndpointID>/, ""))), ["HR-BR-7"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:DueDate>2026-12-02</cbc:DueDate>", ""))), ["HR-BR-4"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:Name>HR:PDV25<", "<cbc:Name>PDV25<"))), ["HR-BR-CL-1"]);
  assert.deepEqual(hr(await runPlain(sample.replace("<cbc:BuyerReference>NAR-7781</cbc:BuyerReference>", "<cbc:BuyerReference></cbc:BuyerReference>"))), ["HR-BR-33"]);
});

test("every Croatian rule id gets a specific English fix", () => {
  const rules = JSON.parse(readFileSync(new URL("./plain/cius-hr-ubl.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const p of rules.patterns) for (const r of p.rules) for (const c of r.checks) ids.add(c.id);
  assert.equal(ids.size, 62);
  for (const id of ids) {
    assert.ok(hasSpecificFix(id), id);
    assert.match(plainFix(id), /^Croatia: /, id);
  }
});

test("an exempt line: the base's exemption-reason warning says to keep it, and HR-BR-26 asks for the HR breakdown", { skip }, async () => {
  const exempt = sample
    .replace("<cbc:ID>S</cbc:ID>\n        <cbc:Name>HR:PDV5</cbc:Name>\n        <cbc:Percent>5</cbc:Percent>", "<cbc:ID>E</cbc:ID>\n        <cbc:Name>HR:E</cbc:Name>\n        <cbc:Percent>0</cbc:Percent>\n        <cbc:TaxExemptionReason>Oslobodeno prema cl. 39 Zakona o PDV-u</cbc:TaxExemptionReason>");
  const r = await runPlain(exempt);
  assert.match(r.findings.find((f) => f.rule === "UBL-CR-601").fix, /HR-BR-36/);
  assert.ok(hr(r).includes("HR-BR-26"));
  assert.ok(!hr(r).includes("HR-BR-36"));
  assert.ok(hr(await runPlain(exempt.replace(/<cbc:TaxExemptionReason>[^<]*<\/cbc:TaxExemptionReason>/, ""))).includes("HR-BR-36"));
});

// The hosted build leaves the Croatian set out until its licence is checked (worker/build.mjs
// EXCLUDED, docs/LAUNCH-REVIEW.md). A copy without it must not pass a Croatian file on the EU base.
test("a copy without the Croatian rules answers unavailable for an HR-CIUS file, never a base-only pass", { skip }, async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { createPlainRunner } = await import("./plain-schematron.mjs");
  const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: require("slimdom").parseXmlDocument });
  const file = (f) => new URL(`./plain/${f}`, import.meta.url);
  const load = async (f) => (f === "cius-hr-ubl.json" || !existsSync(file(f)) ? null : JSON.parse(readFileSync(file(f), "utf8")));
  const r = await runner.run(sample, load);
  assert.equal(r.status, "unavailable");
  assert.deepEqual(r.findings, []);
  // A plain EN 16931 file is unaffected by the missing add-on.
  const eu = await runner.run(read("ubl-invoice.xml").replace(/<cbc:CustomizationID>[^<]*</, "<cbc:CustomizationID>urn:cen.eu:en16931:2017<"), load);
  assert.equal(eu.status, "ok");
});
