// The current Peppol PINT releases (SG 1.4.1, A-NZ 1.1.3), which name the profile
// as urn:peppol:pint:billing-1@sg-1 / @aunz-1. Before 2026-11-11 those ids matched no
// PINT profile and OpenPeppol's own examples got the EU base rules (BR-47, BR-CO-04,
// BR-CL-17...). Found and measured with eval/phive-corpus.mjs; the examples used
// here are our own made-up invoices.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingProfile } from "./schematron-core.mjs";
import { slackTest, splitTop } from "./plain-schematron.mjs";
import { preflightDocuments } from "./report.mjs";
import { expectedLineNet } from "./linenet.mjs";
import { inspectHeaderAdjustments } from "./adjustment.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/pint1-aunz-jur-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const rules = (r) => r.findings.map((f) => f.rule).sort();
// Swap an element's text (the examples also name the ids in their header comment).
const withText = (xml, element, text) => xml.replace(new RegExp(`<cbc:${element}>[^<]*`), `<cbc:${element}>${text}`);

test("the current PINT ids pick the current rule sets; the older ids keep theirs", () => {
  assert.equal(matchingProfile(read("pint-current-sg-invoice.xml"), "ubl")[0], "pint-sg-1");
  assert.equal(matchingProfile(read("pint-current-aunz-invoice.xml"), "ubl")[0], "pint-aunz-1");
  assert.equal(matchingProfile(withText(read("pint-current-aunz-invoice.xml"), "CustomizationID", "urn:peppol:pint:selfbilling-1@aunz-1"), "ubl")[0], "pint-aunz-sb-1");
  assert.equal(matchingProfile(read("pint-sg-invoice.xml"), "ubl")[0], "pint-sg");
  assert.equal(matchingProfile(read("pint-aunz-invoice.xml"), "ubl")[0], "pint-aunz");
  assert.equal(matchingProfile(read("pint-current-sg-invoice.xml"), "cii"), null);
  // Japan, Malaysia, the UAE and Oman load since 2026-11-12 (pint-jp-my-ae-om.test.mjs);
  // PINT EU and any other jurisdiction is not loaded: no profile, EU base.
  assert.equal(matchingProfile(withText(read("pint-current-sg-invoice.xml"), "CustomizationID", "urn:peppol:pint:billing-1@eu-1"), "ubl"), null);
});

test("clean current-release SG and A-NZ invoices pass with no rule skipped", { skip }, async () => {
  for (const [file, set] of [["pint-current-sg-invoice.xml", "pint-sg-1"], ["pint-current-aunz-invoice.xml", "pint-aunz-1"]]) {
    const r = await runPlain(read(file));
    assert.equal(r.status, "ok", file);
    assert.deepEqual(r.sets, [set], file);
    assert.deepEqual(r.findings, [], file);
    assert.deepEqual(r.skipped, [], file);
  }
});

test("the current rules still fire: the old BT-23 draws the SG and A-NZ process rule", { skip }, async () => {
  const sg = await runPlain(withText(read("pint-current-sg-invoice.xml"), "ProfileID", "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"));
  assert.ok(rules(sg).includes("PEPPOL-EN16931-R007-SG"), rules(sg).join(" "));
  const au = await runPlain(withText(read("pint-current-aunz-invoice.xml"), "ProfileID", "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"));
  assert.ok(rules(au).includes("aligned-ibrp-002"), rules(au).join(" "));
});

// A price discount whose difference is inexact in doubles (70.10 - 20.10 is
// 49.99999999999999), on a line of 10 x 50.00.
const discounted = (gross, discount) => read("pint-current-aunz-invoice.xml").replace(
  '<cac:Price><cbc:PriceAmount currencyID="AUD">50.00</cbc:PriceAmount></cac:Price>',
  `<cac:Price><cbc:PriceAmount currencyID="AUD">50.00</cbc:PriceAmount><cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="AUD">${discount}</cbc:Amount><cbc:BaseAmount currencyID="AUD">${gross}</cbc:BaseAmount></cac:AllowanceCharge></cac:Price>`,
);

test("net price = gross - discount holds within 1e-7 inside an `or` (aligned-ibrp-004), and a real miss still fires", { skip }, async () => {
  assert.ok(70.1 - 20.1 !== 50, "the case is inexact in doubles");
  const ok = await runPlain(discounted("70.10", "20.10"));
  assert.deepEqual(rules(ok), []);
  const wrong = await runPlain(discounted("70.10", "20.11"));
  assert.deepEqual(rules(wrong), ["aligned-ibrp-004"]);
});

test("slackTest loosens equalities inside top-level or/and chains only", () => {
  assert.deepEqual(splitTop("not(a) or b = c - d", "or"), ["not(a)", "b = c - d"]);
  assert.equal(splitTop("f(a or b) = c", "or"), null, "an `or` inside brackets is not top level");
  assert.equal(splitTop("if (a) then b = c or d else e", "or"), null, "an if/then is left alone");
  assert.equal(splitTop("'x or y' = z", "or"), null, "an `or` in a string is not an operator");
  assert.equal(slackTest("not(a) or b = c - d"), "(not(a)) or (abs((b ) - ( c - d)) lt 0.0000001)");
  assert.equal(slackTest("a and b = c"), "(a) and (abs((b ) - ( c)) lt 0.0000001)");
  assert.equal(slackTest("not(a) or exists(b)"), null, "nothing to loosen");
  assert.equal(slackTest("a = b"), "abs((a ) - ( b)) lt 0.0000001", "the plain equality is unchanged");
});

test("under PINT the EU conventions for BIC, payment means and exemption reasons step aside", { skip }, async () => {
  // An Australian BSB in the branch id, Singapore's GIRO code, a 0% line with no reason.
  const au = read("pint-current-aunz-invoice.xml").replace(
    "<cac:PayeeFinancialAccount><cbc:ID>0011234567</cbc:ID></cac:PayeeFinancialAccount>",
    "<cac:PayeeFinancialAccount><cbc:ID>0011234567</cbc:ID><cac:FinancialInstitutionBranch><cbc:ID>062-000</cbc:ID></cac:FinancialInstitutionBranch></cac:PayeeFinancialAccount>",
  );
  const { reports } = await preflightDocuments([{ name: "au.xml", source: au }], { schematron: true });
  const ids = reports[0].errors.map((e) => e.rule);
  assert.ok(!ids.includes("INV-026"), ids.join(" "));
  // On an EU Peppol file a six-digit BSB reads as a national clearing code, which BT-86 admits
  // (bic.mjs, 2026-11-12), but a value that is neither a BIC nor a clearing code is still INV-026.
  const eu = withText(au, "CustomizationID", "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0")
    .replace("<cbc:ID>062-000</cbc:ID>", "<cbc:ID>BA11</cbc:ID>");
  const euIds = (await preflightDocuments([{ name: "eu.xml", source: eu }], { schematron: true })).reports[0].errors.map((e) => e.rule);
  assert.ok(euIds.includes("INV-026"), euIds.join(" "));
});

test("line allowances and charges are summed with their sign (OpenPeppol's A-NZ negative invoice, line 2)", () => {
  const line = {
    quantity: -4, unit_price: 400, price_base_quantity: 2,
    adjustments: [{ kind: "charge", amount: -200, percent: -25, base: 800 }, { kind: "allowance", amount: -100, percent: -12.5, base: 800 }],
  };
  assert.equal(expectedLineNet(line), -900);
  assert.equal(expectedLineNet({ quantity: 2, unit_price: 10, adjustments: [{ kind: "allowance", amount: 5 }] }), 15);
});

test("a negative invoice may state a header percentage with its sign; it must still match", () => {
  const invoice = (percent, amount) => ({
    totals: { net: -1627.4, gross: -1780.14 },
    adjustments: [{ kind: "charge", amount, base: 1500, percent, reason: "Refund shipping" }],
  });
  assert.deepEqual(inspectHeaderAdjustments(invoice(-10, -150)).map((f) => f.rule), []);
  assert.deepEqual(inspectHeaderAdjustments(invoice(-10, -140)).map((f) => f.rule), ["INV-051"]);
  assert.deepEqual(inspectHeaderAdjustments(invoice(-120, -1800)).map((f) => f.rule), ["INV-051"]);
  // On an ordinary invoice a negative percentage is still a finding.
  const positive = { totals: { net: 100, gross: 110 }, adjustments: [{ kind: "charge", amount: 10, base: 100, percent: -10, reason: "x" }] };
  assert.ok(inspectHeaderAdjustments(positive).some((f) => f.rule === "INV-051"));
});
