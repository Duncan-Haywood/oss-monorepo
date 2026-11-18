// France's BR-FR rules (FNFE-MPE Schematron 1.4.0.04, plain/cius-fr-*.json, build-fr-rules.mjs)
// on FNFE's own example invoices (fixtures/fr-fnfe/, from fnfempe/France_RFE Z.example/TEST),
// and on copies of them with one French rule broken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { matchingAddons, plainOnlySets } from "./schematron-core.mjs";

const require = createRequire(import.meta.url);
let ready = existsSync(new URL("./plain/cius-fr-ubl.json", import.meta.url));
try { require.resolve("slimdom"); require.resolve("fontoxpath"); } catch { ready = false; }
const skip = !ready && "needs `npm i --no-save slimdom fontoxpath` and plain/cius-fr-*.json";

const fixture = (name) => readFileSync(new URL(`./fixtures/fr-fnfe/${name}`, import.meta.url), "utf8");
const FILES = ["uc1-en16931-ubl.xml", "uc1-en16931-cii.xml", "uc10-multi-vendeur-extended-ctc-fr-ubl.xml", "uc10-multi-vendeur-extended-ctc-fr-cii.xml"];
const frRules = (r) => r.findings.filter((f) => f.source === "cius-fr-schematron");

test("routing: Extended-CTC-FR's BT-24 selects BR-FR; a bare EN 16931 id needs the French profile", () => {
  assert.deepEqual(matchingAddons(fixture(FILES[2]), "ubl").map(([n]) => n), ["cius-fr"]);
  assert.deepEqual(matchingAddons(fixture(FILES[0]), "ubl").map(([n]) => n), []);
  assert.deepEqual(matchingAddons(fixture(FILES[0]), "ubl", { profile: "france" }).map(([n]) => n), ["cius-fr"]);
  assert.deepEqual(matchingAddons(fixture(FILES[1]), "cii", { profile: "france" }).map(([n]) => n), ["cius-fr"]);
  assert.deepEqual(matchingAddons(fixture(FILES[0]), "ubl", { profile: "peppol" }).map(([n]) => n), []);
  // no Saxon form: a French file goes to the plain route, never the EU base alone
  assert.deepEqual(plainOnlySets(fixture(FILES[0]), "ubl", { profile: "france" }), ["cius-fr"]);
});

test("FNFE's examples pass every BR-FR rule, and no rule is left unevaluated", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  for (const name of FILES) {
    const r = await runPlain(fixture(name), { profile: "france" });
    assert.equal(r.status, "ok", name);
    assert.ok(r.sets.includes("cius-fr"), `${name}: ${r.sets}`);
    assert.deepEqual(frRules(r).map((f) => f.rule), [], name);
    assert.deepEqual((r.skipped || []).filter((id) => id.startsWith("BR-FR")), [], name);
  }
});

test("BR-FR fires on broken copies: invoice number, billing mode, VAT rate, multi-vendor totals", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  const ids = async (xml, syntax = "ubl") => frRules(await runPlain(xml, { profile: "france" })).map((f) => f.rule);
  const ubl = fixture(FILES[0]);
  // BR-FR-02: BT-1 allows letters, digits and + - _ / only
  assert.ok((await ids(ubl.replace("<cbc:ID>F202500003</cbc:ID>", "<cbc:ID>F 2025.00003</cbc:ID>"))).includes("BR-FR-02_BT-1"));
  // BR-FR-08: BT-23 must be one of the French billing modes (B1, S1, M1 ...)
  assert.ok((await ids(ubl.replace("<cbc:ProfileID>S1</cbc:ProfileID>", "<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>"))).includes("BR-FR-08_BT-23"));
  // BR-FR-19: a VAT rate France does not have
  const rate = ubl.match(/<cbc:Percent>([\d.]+)<\/cbc:Percent>/)[1];
  assert.ok((await ids(ubl.replaceAll(`<cbc:Percent>${rate}</cbc:Percent>`, "<cbc:Percent>21.00</cbc:Percent>"))).some((id) => id.startsWith("BR-FR-")), "a 21% rate is not French");
  // BR-FR-MV-05 reads rule lets inside predicates (plain-compile.mjs bindInPredicates): a GROUP
  // line whose net no longer matches its sub-lines fails, the untouched file passes (test above).
  const mv = fixture(FILES[2]);
  const group = mv.match(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/g).find((l) => /DocumentStatusCode>GROUP</.test(l) && !/BillingReferenceLine/.test(l));
  assert.ok(group, "UC10 has a top-level GROUP line");
  const net = group.match(/<cbc:LineExtensionAmount currencyID="EUR">([\d.]+)</)[1];
  const broken = mv.replace(group, group.replace(`<cbc:LineExtensionAmount currencyID="EUR">${net}<`, `<cbc:LineExtensionAmount currencyID="EUR">${(Number(net) + 10).toFixed(2)}<`));
  assert.ok((await ids(broken)).includes("BR-FR-MV-05_EXT-FR-FE-BG-12"));
});

test("without the French profile a bare EN 16931 file gets no BR-FR findings", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  const r = await runPlain(fixture(FILES[0]).replace("<cbc:ProfileID>S1</cbc:ProfileID>", "<cbc:ProfileID>X9</cbc:ProfileID>"));
  assert.ok(!r.sets.includes("cius-fr"));
  assert.deepEqual(frRules(r), []);
});

test("preflightDocuments runs BR-FR with profile=france and schematron on", { skip }, async () => {
  const { preflightDocuments } = await import("./report.mjs");
  const bad = fixture(FILES[0]).replace("<cbc:ProfileID>S1</cbc:ProfileID>", "<cbc:ProfileID>X9</cbc:ProfileID>");
  const res = await preflightDocuments([{ name: "fr.xml", source: bad }], { profile: "france", schematron: true });
  const rules = res.reports[0].errors.map((e) => e.rule);
  assert.equal(res.reports[0].schematron, "ok");
  assert.ok(rules.includes("BR-FR-08_BT-23"), rules.join(" "));
});
