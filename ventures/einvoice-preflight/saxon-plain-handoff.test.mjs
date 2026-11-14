// The Saxon route (a self-hosted ./browser/ build, or runSchematron with ./schematron/ built)
// compiles only the EU base, XRechnung and Peppol BIS. Before 2026-11-14 a PINT, ZATCA,
// CIUS-RO, NLCIUS or CIUS-PT file sent there was checked against the current EU base
// alone: PINT's GST categories drew EU findings, and no national rule ran. Such files now
// go to the plain route (./plain/), or are "unavailable", never the EU base in their place.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadBrowserRunner } from "./official-browser.mjs";
import { plainOnlySets } from "./schematron-core.mjs";
import { runSchematron } from "./schematron.mjs";

const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const ALL_SEF = ["ubl.sef.json", "cii.sef.json", "xrechnung-ubl.sef.json", "xrechnung-cii.sef.json", "peppol-ubl.sef.json", "peppol-cii.sef.json"];
const manifestFetch = async () => ({ ok: true, json: async () => ({ files: ALL_SEF }) });
const svrl = '<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"><svrl:failed-assert id="BR-CL-18" flag="fatal" location="/x"><svrl:text>[BR-CL-18]-EU code list</svrl:text></svrl:failed-assert></svrl:schematron-output>';

const PLAIN_ONLY = {
  "pint-sg-invoice.xml": ["pint-sg"],
  "pint-current-jp-invoice.xml": ["pint-jp-1"],
  "pint-my-tourism-tax-invoice.xml": ["pint-my-1"],
  "zatca-simplified-invoice.xml": ["zatca"],
  "ro-invoice.xml": ["cius-ro"],
  "nlcius-invoice.xml": ["nlcius"],
  "nlcius-cii-invoice.xml": ["nlcius"],
  "pt-invoice.xml": ["cius-pt"],
};
const SAXON_OK = ["ubl-invoice.xml", "xrechnung-cii-invoice.xml", "peppol-nl-credit-note.xml"];

test("plainOnlySets names the sets with no Saxon form, and nothing for EU, XRechnung or Peppol BIS files", () => {
  for (const [file, sets] of Object.entries(PLAIN_ONLY)) {
    const xml = read(file);
    const syntax = /CrossIndustryInvoice/.test(xml) ? "cii" : "ubl";
    assert.deepEqual(plainOnlySets(xml, syntax), sets, file);
  }
  for (const file of SAXON_OK) {
    const xml = read(file);
    assert.deepEqual(plainOnlySets(xml, /CrossIndustryInvoice/.test(xml) ? "cii" : "ubl"), [], file);
  }
  assert.deepEqual(plainOnlySets("<x/>", ""), []);
});

test("the in-page Saxon runner hands plain-only files to ./plain/ and never runs the EU base on them", async () => {
  const saxonCalls = [];
  const saxon = { transform: async (o) => { saxonCalls.push(o.stylesheetLocation); return { principalResult: svrl }; } };
  const plainCalls = [];
  const plainRunner = () => async (xml) => { plainCalls.push(xml.length); return { status: "ok", syntax: "ubl", findings: [], sets: ["plain"] }; };
  const run = await loadBrowserRunner({ fetchFn: manifestFetch, saxon: () => saxon, plainRunner });
  for (const file of Object.keys(PLAIN_ONLY)) {
    const r = await run(read(file));
    assert.deepEqual(r.sets, ["plain"], file);
    assert.deepEqual(r.findings, [], `${file}: no EU base finding`);
  }
  assert.deepEqual(saxonCalls, [], "Saxon never ran on a plain-only file");
  assert.equal(plainCalls.length, Object.keys(PLAIN_ONLY).length);
  // EU, XRechnung and Peppol BIS files still run in Saxon.
  for (const file of SAXON_OK) assert.equal((await run(read(file))).status, "ok", file);
  assert.equal(saxonCalls.length > 0, true);
  assert.equal(plainCalls.length, Object.keys(PLAIN_ONLY).length, "plain route not used for Saxon-ready files");
});

test("with Saxon but no ./plain/, a plain-only file is unavailable (so the page asks the server), not an EU-base result", async () => {
  const saxon = { transform: async () => ({ principalResult: svrl }) };
  const run = await loadBrowserRunner({ fetchFn: manifestFetch, saxon: () => saxon, plainRunner: () => null });
  const r = await run(read("pint-sg-invoice.xml"));
  assert.equal(r.status, "unavailable");
  assert.deepEqual(r.plainOnly, ["pint-sg"]);
  assert.deepEqual(r.findings, []);
});

test("runSchematron declines plain-only files whatever is built, naming the sets", () => {
  for (const [file, sets] of Object.entries(PLAIN_ONLY)) {
    const r = runSchematron(read(file));
    assert.equal(r.status, "unavailable", file);
    assert.deepEqual(r.plainOnly, sets, file);
    assert.deepEqual(r.findings, []);
  }
});

const built = existsSync(new URL("./schematron/ubl.sef.json", import.meta.url));
test("with the Saxon rules built, EU and XRechnung files still run there", { skip: !built && "node build-schematron.mjs" }, () => {
  const r = runSchematron(read("ubl-invoice.xml"));
  assert.equal(r.status, "ok");
  assert.equal(r.plainOnly, undefined);
});
