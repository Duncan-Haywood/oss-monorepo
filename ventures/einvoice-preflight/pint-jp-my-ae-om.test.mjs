// PINT Japan, Malaysia, the UAE and Oman (added 2026-11-12). Before then their
// CustomizationIDs matched no profile, so a JPY consumption-tax or MYR SST invoice got the
// EU base rules, and the built-in INV-0xx checks blocked 121 of OpenPeppol's 123 examples
// for these four countries (eval/phive-corpus.mjs). The invoices here are our own made-up ones.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingProfile } from "./schematron-core.mjs";
import { preflightDocuments, isBlocking } from "./report.mjs";
import { parseUblInvoice } from "./ubl.mjs";
import { looksLikeKnownScheme } from "./endpoint.mjs";
import { normalizeDocumentType } from "./document.mjs";
import { taxPercentOf } from "./linenet.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/pint1-om-jur-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const jp = readFileSync(new URL("./examples/pint-current-jp-invoice.xml", import.meta.url), "utf8");
const withId = (xml, id) => xml.replace(/<cbc:CustomizationID>[^<]*/, `<cbc:CustomizationID>${id}`);
const blocking = async (xml) => {
  const { reports } = await preflightDocuments([{ name: "x.xml", source: xml }], { schematron: true });
  return reports[0].errors.filter(isBlocking).map((e) => e.rule).sort();
};

test("each new PINT id picks its own profile", () => {
  const cases = {
    "urn:peppol:pint:billing-1@jp-1": "pint-jp-1",
    "urn:peppol:pint:nontaxinvoice-1@jp-1": "pint-jp-ntr-1",
    "urn:peppol:pint:selfbilling-1@jp-1": "pint-jp-sb-1",
    "urn:peppol:pint:billing-1@my-1": "pint-my-1",
    "urn:peppol:pint:selfbilling-1@my-1": "pint-my-sb-1",
    "urn:peppol:pint:billing-1@ae-1": "pint-ae-1",
    "urn:peppol:pint:selfbilling-1@ae-1": "pint-ae-sb-1",
    "urn:peppol:pint:billing-1@om-1": "pint-om-1",
    "urn:peppol:pint:selfbilling-1@om-1": "pint-om-sb-1",
  };
  for (const [id, profile] of Object.entries(cases)) assert.equal(matchingProfile(withId(jp, id), "ubl")?.[0], profile, id);
});

test("every rule file a profile names is on disk and in the manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("./plain/manifest.json", import.meta.url), "utf8"));
  for (const tag of ["jp", "jp-ntr", "jp-sb", "my", "my-sb", "ae", "ae-sb", "om", "om-sb"]) {
    const [, p] = matchingProfile(withId(jp, `urn:peppol:pint:${tag.includes("ntr") ? "nontaxinvoice" : tag.endsWith("sb") ? "selfbilling" : "billing"}-1@${tag.split("-")[0]}-1`), "ubl");
    for (const file of p.files.ubl) assert.ok(existsSync(new URL(`./plain/${file}`, import.meta.url)), file);
    assert.ok(manifest.sets[`pint1-${tag}-ubl`], tag);
  }
  // A shared stylesheet is written once and the duplicate points at it.
  assert.equal(manifest.sets["pint1-jp-ubl"].sameAs, "pint1-sg-ubl");
});

test("a clean made-up Japanese invoice passes the JP rules and the built-in checks", { skip }, async () => {
  const r = await runPlain(jp);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["pint-jp-1"]);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(await blocking(jp), []);
});

test("the JP rules fire: a T-number with the wrong length draws a JP rule, not the EU base", { skip }, async () => {
  const r = await runPlain(jp.replace("T9000000000001", "T90000000001"));
  assert.ok(r.findings.length > 0);
  assert.ok(r.findings.every((f) => f.source === "pint-jp-schematron"), r.findings.map((f) => f.rule).join(" "));
  assert.ok(!r.findings.some((f) => /^BR-/.test(f.rule)), "no EU base rule");
});

test("a real arithmetic fault still blocks under PINT JP", { skip }, async () => {
  const wrong = jp.replace('<cbc:TaxAmount currencyID="JPY">4800</cbc:TaxAmount>\n    <cac:TaxSubtotal>', '<cbc:TaxAmount currencyID="JPY">4900</cbc:TaxAmount>\n    <cac:TaxSubtotal>');
  assert.notEqual(wrong, jp);
  assert.ok((await blocking(wrong)).includes("INV-018"));
});

test("a non-tax-registered seller states 10% and charges nothing (JP-NTR): no INV-018/038", { skip }, async () => {
  const ntr = withId(jp, "urn:peppol:pint:nontaxinvoice-1@jp-1")
    .replace("<cbc:InvoiceTypeCode>380", "<cbc:InvoiceTypeCode>480")
    .replaceAll('<cbc:TaxAmount currencyID="JPY">4800</cbc:TaxAmount>', '<cbc:TaxAmount currencyID="JPY">0</cbc:TaxAmount>')
    .replace('<cbc:TaxInclusiveAmount currencyID="JPY">54600', '<cbc:TaxInclusiveAmount currencyID="JPY">49800')
    .replace('<cbc:PayableAmount currencyID="JPY">54600', '<cbc:PayableAmount currencyID="JPY">49800');
  const rules = await blocking(ntr);
  for (const id of ["INV-018", "INV-038", "INV-032"]) assert.ok(!rules.includes(id), rules.join(" "));
  // The same file under the ordinary JP profile is a real tax fault.
  assert.ok((await blocking(withId(ntr, "urn:peppol:pint:billing-1@jp-1"))).includes("INV-018"));
});

test("a breakdown repeated in the tax currency (PINT IBG-38) is not added to the document's", () => {
  const twice = jp
    .replace("<cbc:DocumentCurrencyCode>JPY</cbc:DocumentCurrencyCode>", "<cbc:DocumentCurrencyCode>JPY</cbc:DocumentCurrencyCode>\n  <cbc:TaxCurrencyCode>USD</cbc:TaxCurrencyCode>")
    .replace("  <cac:LegalMonetaryTotal>", `  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="USD">32.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxAmount currencyID="USD">32.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>`);
  const rows = parseUblInvoice(twice).tax_breakdown;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.tax_category), ["S", "E"]);
});

test("a flat-amount tax row (Malaysia's tourism tax) is kept with its scheme, VAT rows are not", () => {
  const ttx = jp.replace("  </cac:TaxTotal>", `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="JPY">48000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="JPY">200</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>TTX</cbc:ID><cac:TaxScheme><cbc:ID>AAL</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`);
  const rows = parseUblInvoice(ttx).tax_breakdown;
  assert.equal(rows[2].tax_scheme, "AAL");
  assert.equal(rows[2].tax_percent, undefined);
  assert.equal(rows[0].tax_scheme, undefined);
});

test("the shared lists know what OpenPeppol's own files use", () => {
  for (const scheme of ["0188", "0248", "0235", "0097", "9959"]) assert.ok(looksLikeKnownScheme(scheme), scheme);
  assert.ok(!looksLikeKnownScheme("0999"));
  assert.equal(normalizeDocumentType("480"), "invoice");
  // E, Z, AE, K and G must be 0%; PINT AE and OM leave the percent out on them.
  for (const c of ["E", "Z", "AE", "K", "G", "O"]) assert.equal(taxPercentOf({ tax_category: c }), 0, c);
  assert.equal(taxPercentOf({ tax_category: "S" }), null);
});

test("Oman's ruleset-version banner (an always-true information report) is not compiled as a check", () => {
  const om = JSON.parse(readFileSync(new URL("./plain/pint1-om-jur-ubl.json", import.meta.url), "utf8"));
  const checks = om.patterns.flatMap((p) => p.rules.flatMap((r) => r.checks));
  assert.ok(!checks.some((c) => c.id === "BTOM-META-001"));
  assert.ok(checks.some((c) => c.id === "IBR-001-OM"));
  // Its two warnings keep their severity (role="warning" in the stylesheet).
  assert.ok(checks.filter((c) => c.flag === "warning").length >= 2);
});
