// XRechnung extension third-party payments (BG-DEX-09, cac:PrepaidPayment): BR-DEX-09
// adds them to the amount due (it overrides BR-CO-16), BR-DEX-10 to -14 check each one.
// Rules read from KoSIT's xrechnung-schematron (Apache-2.0, not copied here),
// src/validation/schematron/ubl/XRechnung-UBL-validation.sch at commit 7e3ddbe2 (2026-09-04).
// The files below are this repository's own example with two payments added, the shape
// of the KoSIT test suite's extension case 05.01a (not copied either).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { inspectXrechnungProfile, XRECHNUNG_EXTENSION } from "./profile.mjs";
import { preflightDocuments } from "./report.mjs";
import { TEMPLATES } from "./pro/explain-catalog.mjs";

const base = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");
const STANDARD = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
const EXTENSION = `${STANDARD}#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0`;

const payment = (id, amount, description, currency = "EUR") =>
  `<cac:PrepaidPayment><cbc:ID>${id}</cbc:ID><cbc:PaidAmount currencyID="${currency}">${amount}</cbc:PaidAmount><cbc:InstructionID>${description}</cbc:InstructionID></cac:PrepaidPayment>`;

/** The example (gross 398.50, prepaid 98.50, due 300.00) with payments added and the due set. */
function file({ spec = EXTENSION, payments = [payment("MobilesBezahlen", "19.96", "Anbieter A"), payment("MobilesBezahlen", "10.00", "Anbieter B")], due = "329.96" } = {}) {
  let xml = base.replace(`<cbc:CustomizationID>${STANDARD}</cbc:CustomizationID>`, `<cbc:CustomizationID>${spec}</cbc:CustomizationID>`);
  xml = xml.replace("</cac:PaymentTerms>", `</cac:PaymentTerms>\n  ${payments.join("\n  ")}`);
  xml = xml.replace('<cbc:PayableAmount currencyID="EUR">300.00</cbc:PayableAmount>', `<cbc:PayableAmount currencyID="EUR">${due}</cbc:PayableAmount>`);
  assert.ok(xml.includes(due), "fixture edit applied");
  return xml;
}

const rules = (xml) => checkInvoice(parseUblInvoice(xml).invoice ?? parseUblInvoice(xml)).map((f) => f.rule);
const parsed = (xml) => { const r = parseUblInvoice(xml); return r.invoice ?? r; };

test("the extension's BT-24 is recognised and the standard one is not", () => {
  assert.ok(XRECHNUNG_EXTENSION.test(EXTENSION));
  assert.ok(!XRECHNUNG_EXTENSION.test(STANDARD));
  assert.ok(!XRECHNUNG_EXTENSION.test(`${EXTENSION}x`));
});

test("the UBL reader keeps each third-party payment", () => {
  const invoice = parsed(file());
  assert.deepEqual(invoice.third_party_payments, [
    { type: "MobilesBezahlen", amount: 19.96, amount_text: "19.96", currency: "EUR", description: "Anbieter A" },
    { type: "MobilesBezahlen", amount: 10, amount_text: "10.00", currency: "EUR", description: "Anbieter B" },
  ]);
  assert.equal(parsed(base).third_party_payments, undefined);
});

test("BR-DEX-09: in an extension file the amount due adds the third-party payments", () => {
  // 398.50 - 98.50 + 19.96 + 10.00 = 329.96: valid, as KoSIT's validator says.
  assert.ok(!rules(file()).includes("INV-029"));
  // The BR-CO-16 figure is wrong in an extension file with payments.
  const wrong = checkInvoice(parsed(file({ due: "300.00" })));
  const finding = wrong.find((f) => f.rule === "INV-029");
  assert.ok(finding);
  assert.match(finding.message, /BR-DEX-09/);
  assert.match(finding.fix, /329\.96/);
});

test("outside the extension BR-CO-16 stands and the payments are named in the finding", () => {
  const findings = checkInvoice(parsed(file({ spec: STANDARD })));
  const finding = findings.find((f) => f.rule === "INV-029");
  assert.ok(finding, "standard XRechnung: the third-party payments do not count");
  assert.match(finding.message, /only in an XRechnung extension/);
  assert.match(finding.fix, /300\.00/);
  // The plain BR-CO-16 total still passes in a standard file that carries the elements.
  assert.ok(!rules(file({ spec: STANDARD, due: "300.00" })).includes("INV-029"));
});

test("a payment whose amount is not a number does not refuse the file", () => {
  const invoice = parsed(file({ payments: [payment("X", "abc", "Y")], due: "300.00" }));
  assert.equal(invoice.third_party_payments[0].amount, null);
  assert.ok(!checkInvoice(invoice).some((f) => f.rule === "INV-029"));
});

test("BR-DEX-10 to -14 in the XRechnung profile, extension files only", () => {
  const check = (payments, spec = EXTENSION) => inspectXrechnungProfile(parsed(file({ spec, payments, due: "300.00" })));
  assert.deepEqual(check([payment("MobilesBezahlen", "19.96", "Anbieter A")]).filter((f) => /XR-01[01]/.test(f.rule)), []);
  const missing = check(['<cac:PrepaidPayment><cbc:PaidAmount currencyID="EUR">5.00</cbc:PaidAmount></cac:PrepaidPayment>']);
  const xr010 = missing.filter((f) => f.rule === "XR-010");
  assert.equal(xr010.length, 1);
  assert.match(xr010[0].message, /type \(BT-DEX-001\), description \(BT-DEX-003\)/);
  assert.equal(xr010[0].path, "/third_party_payments/0");
  const decimals = check([payment("A", "19.955", "B")]).filter((f) => f.rule === "XR-011");
  assert.equal(decimals.length, 1);
  assert.match(decimals[0].message, /BR-DEX-13/);
  const currency = check([payment("A", "19.96", "B", "USD")]).filter((f) => f.rule === "XR-011");
  assert.equal(currency.length, 1);
  assert.match(currency[0].message, /USD, the invoice in EUR \(BR-DEX-14\)/);
  // KoSIT runs these only when BT-24 declares the extension.
  assert.deepEqual(check([payment("A", "19.955", "B", "USD")], STANDARD).filter((f) => /XR-01[01]/.test(f.rule)), []);
});

test("through the report with the xrechnung profile, the valid extension file has no total or DEX finding", async () => {
  const result = await preflightDocuments([{ name: "x.xml", source: file() }], { profile: "xrechnung" });
  const ids = result.reports[0].errors.map((e) => e.rule);
  for (const rule of ["INV-029", "XR-010", "XR-011", "XR-008"]) assert.ok(!ids.includes(rule), `${rule} in ${ids}`);
});

test("XR-010 and XR-011 have explanations in every language the catalog keeps", () => {
  for (const rule of ["XR-010", "XR-011"]) {
    for (const lang of ["en", "de", "fr"]) assert.equal(TEMPLATES[rule][lang].length, 2, `${rule} ${lang}`);
  }
});
