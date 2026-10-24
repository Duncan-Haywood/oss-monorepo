import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadBrowserRunner } from "./official-browser.mjs";
import { addOfficialFindings, officialNote } from "./official.mjs";

const svrl = (id, flag = "fatal") =>
  `<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"><svrl:failed-assert id="${id}" flag="${flag}" location="/Q{urn:x}Invoice[1]/Q{urn:y}Party[1]"><svrl:text>[${id}]-Something is wrong</svrl:text></svrl:failed-assert></svrl:schematron-output>`;
const manifestFetch = (files) => async () => ({ ok: true, json: async () => ({ files }) });
const UBL = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="c"><cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID></Invoice>';

test("no ./browser/ folder means no runner", async () => {
  assert.equal(await loadBrowserRunner({ fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await loadBrowserRunner({ fetchFn: async () => { throw new Error("offline"); } }), null);
});

test("runs the base rules and the add-on its BT-24 names, in the page", async () => {
  const seen = [];
  const saxon = { transform: async (o) => { seen.push(o.stylesheetLocation); return { principalResult: svrl(o.stylesheetLocation.includes("xrechnung") ? "BR-DE-2" : "BR-02") }; } };
  const run = await loadBrowserRunner({ base: "x/", fetchFn: manifestFetch(["ubl.sef.json", "cii.sef.json", "xrechnung-ubl.sef.json"]), saxon: () => saxon });
  const r = await run(UBL);
  assert.equal(r.status, "ok");
  assert.deepEqual(seen, ["x/browser/ubl.sef.json", "x/browser/xrechnung-ubl.sef.json"]);
  assert.deepEqual(r.sets, ["en16931", "xrechnung"]);
  assert.deepEqual(r.findings.map((f) => f.rule), ["BR-02", "BR-DE-2"]);
  assert.equal(r.findings[0].path, "/Invoice[1]/Party[1]", "Saxon's Q{uri} step names are stripped");
});

test("a rule set missing from the manifest is skipped, not reported as passed", async () => {
  const saxon = { transform: async () => ({ principalResult: svrl("BR-02") }) };
  const run = await loadBrowserRunner({ fetchFn: manifestFetch(["cii.sef.json"]), saxon: () => saxon });
  assert.equal((await run(UBL)).status, "unavailable");
  assert.equal((await run("<nope/>")).status, "unavailable");
});

test("addOfficialFindings prefers the in-page runner and never calls the server", async () => {
  const runner = async () => ({ status: "ok", findings: [{ rule: "BR-02", source: "en16931-schematron" }] });
  const fetchFn = async () => { throw new Error("server must not be called"); };
  const r = await addOfficialFindings({ reports: [{ file: "a.xml", errors: [] }] }, [{ name: "a.xml", source: UBL }], { runner, fetchFn });
  assert.equal(r.reports[0].schematron, "ok");
  assert.match(officialNote(r.reports[0]), /in your browser/);
  assert.equal(r.reports[0].errors[0].rule, "BR-02");
});

test("a runner that throws or is unavailable falls back to the server route", async () => {
  for (const runner of [async () => { throw new Error("boom"); }, async () => ({ status: "unavailable", findings: [] })]) {
    const fetchFn = async () => ({ ok: true, json: async () => ({ reports: [{ schematron: "ok", errors: [{ rule: "BR-09", source: "en16931-schematron" }] }] }) });
    const r = await addOfficialFindings({ reports: [{ file: "a.xml", errors: [] }] }, [{ name: "a.xml", source: UBL }], { runner, fetchFn });
    assert.equal(r.reports[0].errors[0].rule, "BR-09");
  }
});

// The built rules and the real Saxon-JS browser runtime, if `node build-browser.mjs` was run.
test("real Saxon-JS runtime finds the official defects in the example invoice", { skip: !existsSync(new URL("./browser/manifest.json", import.meta.url)) }, async () => {
  const dir = new URL("./browser/", import.meta.url);
  const files = JSON.parse(readFileSync(new URL("manifest.json", dir))).files;
  const { createRequire } = await import("node:module");
  const SaxonJS = createRequire(import.meta.url)("saxon-js");
  const fetchFn = async (u) => ({ ok: true, json: async () => ({ files }) });
  const wrapped = { transform: (o) => SaxonJS.transform({ ...o, stylesheetFileName: new URL(o.stylesheetLocation.replace(/^.*browser\//, ""), dir).pathname, stylesheetLocation: undefined }, "async") };
  const run = await loadBrowserRunner({ fetchFn, saxon: () => wrapped });
  const r = await run(readFileSync(new URL("./examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8"));
  assert.equal(r.status, "ok");
  assert.ok(r.findings.some((f) => /^BR-/.test(f.rule)), "expects at least one BR- finding");
});
