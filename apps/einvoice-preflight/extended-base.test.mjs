// Extended profiles get their own base set instead of the EN 16931 base (2026-11-17):
// FNFE-MPE's EXTENDED-CTC-FR (UBL, CII) and Factur-X 1.09.2 EXTENDED (CII), compiled by
// build-fr-rules.mjs into plain/extended-ctc-fr-*.json and plain/facturx-extended-cii.json.
// Before, the EU base rejected every one of FNFE's extended examples (multi-vendor, sub-lines).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { matchingExtendedBase, plainOnlySets } from "./schematron-core.mjs";

const require = createRequire(import.meta.url);
let ready = ["extended-ctc-fr-ubl", "extended-ctc-fr-cii", "facturx-extended-cii"].every((f) => existsSync(new URL(`./plain/${f}.json`, import.meta.url)));
try { require.resolve("slimdom"); require.resolve("fontoxpath"); } catch { ready = false; }
const skip = !ready && "needs `npm i --no-save slimdom fontoxpath` and plain/extended-*.json";

const fixture = (name) => readFileSync(new URL(`./fixtures/fr-fnfe/${name}`, import.meta.url), "utf8");
const UBL = "uc10-multi-vendeur-extended-ctc-fr-ubl.xml";
const CII = "uc10-multi-vendeur-extended-ctc-fr-cii.xml";
const FX = "uc12-sous-ligne-extended-fx-cii.xml";

test("routing: an extended BT-24 picks its own base; EN 16931 and other profiles do not", () => {
  assert.equal(matchingExtendedBase(fixture(UBL), "ubl")[0], "extended-ctc-fr");
  assert.equal(matchingExtendedBase(fixture(CII), "cii")[0], "extended-ctc-fr");
  assert.equal(matchingExtendedBase(fixture(FX), "cii")[0], "facturx-extended");
  assert.equal(matchingExtendedBase(fixture("uc1-en16931-ubl.xml"), "ubl"), null);
  const zf20 = fixture(FX).replace("urn:factur-x.eu:1p0:extended", "urn:zugferd.de:2p0:extended");
  assert.equal(matchingExtendedBase(zf20, "cii")[0], "facturx-extended");
  const fxEn = fixture(FX).replace("#conformant#urn:factur-x.eu:1p0:extended", "");
  assert.equal(matchingExtendedBase(fxEn, "cii"), null);
  // Factur-X EXTENDED has no UBL form
  assert.equal(matchingExtendedBase(fixture(FX), "ubl"), null);
  // no Saxon form: the Saxon runner hands an extended file to the plain route
  assert.deepEqual(plainOnlySets(fixture(UBL), "ubl"), ["extended-ctc-fr", "cius-fr"]);
  assert.deepEqual(plainOnlySets(fixture(FX), "cii"), ["facturx-extended"]);
});

test("FNFE's extended examples pass their base and BR-FR, with nothing left unevaluated", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  for (const [name, base] of [[UBL, "extended-ctc-fr"], [CII, "extended-ctc-fr"], [FX, "facturx-extended"]]) {
    const r = await runPlain(fixture(name), { profile: "france" });
    assert.equal(r.status, "ok", name);
    assert.deepEqual(r.sets, [base, "cius-fr"], name);
    assert.deepEqual(r.findings.map((f) => `${f.rule} ${f.path}`), [], name);
    assert.deepEqual(r.skipped || [], [], name);
  }
});

test("the base still catches what an extended file must not do", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  const ids = async (xml) => (await runPlain(xml)).findings.map((f) => f.rule);
  // a currency that is not ISO 4217 (BR-CL-04), on both syntaxes
  assert.ok((await ids(fixture(UBL).replace(/(<cbc:DocumentCurrencyCode>)[^<]+/, "$1XXQ"))).includes("BR-CL-04"));
  assert.ok((await ids(fixture(CII).replace(/(<ram:InvoiceCurrencyCode>)[^<]+/, "$1XXQ"))).includes("BR-CL-04"));
  // Factur-X's code-list checks read the inlined lists (they once opened a side file):
  // an unknown unit code fails, and the finding says what to do
  const r = await runPlain(fixture(FX).replace(/(<ram:BilledQuantity unitCode=")[^"]+/, "$1ZZQ"));
  const unit = r.findings.find((f) => f.rule.startsWith("FX-SCH-A-") && /unitCode/.test(f.message));
  assert.ok(unit, JSON.stringify(r.findings.map((f) => f.rule)));
  assert.match(unit.fix, /current Factur-X code list/);
  assert.equal(unit.source, "facturx-extended-schematron");
  // a tax total that no longer matches the breakdown (BR-FXEXT-CO-15 on sub-line files)
  const fx = fixture(FX);
  const tax = fx.match(/<ram:TaxTotalAmount currencyID="EUR">([\d.]+)</)[1];
  const broken = fx.replace(`<ram:TaxTotalAmount currencyID="EUR">${tax}<`, `<ram:TaxTotalAmount currencyID="EUR">${(Number(tax) + 1).toFixed(2)}<`);
  assert.ok((await ids(broken)).some((id) => /^BR-FXEXT-CO-1[45]$/.test(id)), "tax total +1 fails");
});

test("a copy without the extended base reports unavailable, not an EN 16931 verdict", { skip }, async () => {
  const { createPlainRunner } = await import("./plain-schematron.mjs");
  const { parseXmlDocument } = require("slimdom");
  const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (x) => parseXmlDocument(x) });
  const load = async (f) => (f.startsWith("extended-") ? null : JSON.parse(readFileSync(new URL(`./plain/${f}`, import.meta.url), "utf8")));
  const r = await runner.run(fixture(UBL), load);
  assert.equal(r.status, "unavailable");
});
