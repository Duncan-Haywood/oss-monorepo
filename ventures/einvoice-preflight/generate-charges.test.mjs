// Document-level allowances and charges (BG-20, BG-21) in every profile, and Croatia's
// out-of-scope labels (HR:POVNAK, HR:PP, HR:PPMV, HR:N) on lines and charges. The Croatian cases
// rebuild the Porezna uprava's own samples (Primjeri eRačuna: eRacun_PDV_NEOP_POVRATNA_NAKNADA_stavka
// and _trosak, eRacun_PDV_NEOP_PP_trosak, Racun_za_leasing_PDV_PPMV_aktivacija,
// eRacun_PDV25_i_Neoporeziva_naknada_trosak) and expect the same amounts due. Companies and
// OIBs are made up; their check digits are valid.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { generateInvoice } from "./generate.mjs";
import { parseInvoiceSource } from "./report.mjs";
import { checkInvoice } from "./checks.mjs";
import { runPlain, plainAvailable } from "./plain-node.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/cius-hr-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const fatal = (r) => [...new Set(r.findings.filter((f) => f.severity !== "warning").map((f) => f.rule))].sort();

const hrDraft = (lines, extra = {}) => ({
  number: "42-1-1", issue_date: "2026-11-02", issue_time: "09:30:00", due_date: "2026-12-02", process: "P1",
  operator: { name: "Ana Operater", oib: "55556666775" },
  seller: { name: "Primjer Usluge d.o.o.", street: "Ilica 1", city: "Zagreb", postal_code: "10000", country: "HR", vat_id: "HR12345678903" },
  buyer: { name: "Kupac Primjer d.d.", street: "Riva 5", city: "Split", postal_code: "21000", country: "HR", vat_id: "HR98765432106" },
  payment: { means: "30", iban: "HR1210010051863000160", reference: "HR00 42-1-1" },
  lines: lines || [{ description: "Proizvod", quantity: 1, unit_price: 100, tax_percent: 25, kpd: "62.20.20" }],
  ...extra,
});
const product = { description: "Proizvod", quantity: 1, unit_price: 100, tax_percent: 25, kpd: "62.20.20" };

// [name, draft, the authority's sample's PayableAmount, label, its HR tax scheme, out-of-scope amount]
const samples = [
  ["deposit as a line (POVRATNA_NAKNADA_stavka)", hrDraft([product, { description: "Povratna naknada", quantity: 1, unit_price: 5, hr_label: "POVNAK", kpd: "22.22.19" }]), "130.00", "POVNAK", "OTH", "5.00"],
  ["deposit as a charge (POVRATNA_NAKNADA_trosak)", hrDraft(null, { charges: [{ amount: 5, hr_label: "POVNAK" }] }), "130.00", "POVNAK", "OTH", "5.00"],
  ["consumption tax as a charge (PP_trosak)", hrDraft(null, { charges: [{ amount: 3, hr_label: "HR:PP" }] }), "128.00", "PP", "LOC", "3.00"],
  ["special tax on motor vehicles (leasing PPMV)", hrDraft([{ ...product, description: "Automobil", unit_price: 10000, kpd: "29.10.22" }], { charges: [{ amount: 2000, hr_label: "PPMV" }] }), "14500.00", "PPMV", "CAR", "2000.00"],
  ["tourist tax as a non-taxable charge (Neoporeziva_naknada_trosak)", hrDraft(null, { charges: [{ reason: "Turistička pristojba", amount: 10, hr_label: "N" }] }), "135.00", "N", "VAT", "10.00"],
];

for (const [name, d, payable, label, scheme, oos] of samples) {
  test(`HR: ${name} is written as the authority's sample is, and passes the HR rules`, { skip }, async () => {
    const out = generateInvoice(d, { profile: "hr" });
    assert.ok(out.ok, JSON.stringify(out.errors));
    assert.match(out.xml, new RegExp(`<cbc:PayableAmount currencyID="EUR">${payable.replace(".", "\\.")}</cbc:PayableAmount>`));
    // EN layer: exempt at 0 %, the reason tagged with the label.
    assert.match(out.xml, new RegExp(`<cac:TaxSubtotal>[\\s\\S]*?<cbc:ID>E</cbc:ID>\\s*<cbc:Percent>0</cbc:Percent>\\s*<cbc:TaxExemptionReason>#HR:${label}#`));
    // HR layer: an O row under the label and its scheme; the amount out of the HR tax base.
    assert.match(out.xml, new RegExp(`<cbc:ID>O</cbc:ID>\\s*<cbc:Name>HR:${label}</cbc:Name>\\s*<cbc:Percent>0</cbc:Percent>\\s*<hrextac:HRTaxScheme><cbc:ID>${scheme}</cbc:ID>`));
    assert.match(out.xml, new RegExp(`<hrextac:OutOfScopeOfVATAmount currencyID="EUR">${oos.replace(".", "\\.")}<`));
    const r = await runPlain(out.xml);
    assert.deepEqual(r.skipped, []);
    assert.deepEqual(fatal(r), []);
    // The rules check these sums: one euro more out of scope breaks the HR tax base and the O sum.
    const wrong = out.xml.replace(/(<hrextac:OutOfScopeOfVATAmount currencyID="EUR">)([\d.]+)/, (_, a, v) => `${a}${(Number(v) + 1).toFixed(2)}`);
    assert.deepEqual(fatal(await runPlain(wrong)), ["HR-BR-27", "HR-BR-32"]);
  });
}

test("HR: a charge outside the VAT base needs its label on the charge (HR-BR-11), and the creator writes it", { skip }, async () => {
  const out = generateInvoice(samples[2][1], { profile: "hr" });
  assert.match(out.xml, /<cac:AllowanceCharge>\s*<cbc:ChargeIndicator>true<\/cbc:ChargeIndicator>\s*<cbc:AllowanceChargeReason>#HR:PP#Porez na potrošnju<\/cbc:AllowanceChargeReason>/);
  const unnamed = out.xml.replace(/(<cac:AllowanceCharge>[\s\S]*?)<cbc:Name>HR:PP<\/cbc:Name>\s*/, "$1");
  assert.ok(fatal(await runPlain(unnamed)).includes("HR-BR-11"));
});

test("HR: an exempt line, a deposit, a PP charge, a 25 % delivery charge and a discount on one invoice", { skip }, async () => {
  const d = hrDraft([
    product,
    { description: "Tecaj", quantity: 1, unit_price: 150, tax_category: "E", tax_reason: "Oslobođeno PDV-a prema čl. 39. Zakona o PDV-u", kpd: "85.59.09" },
    { description: "Povratna naknada", quantity: 4, unit_price: 0.07, hr_label: "POVNAK", kpd: "22.22.19" },
  ], {
    charges: [{ amount: 3, hr_label: "PP" }, { reason: "Dostava", amount: 8, tax_percent: 25 }],
    allowances: [{ reason: "Popust", amount: 10, tax_percent: 25 }],
  });
  const out = generateInvoice(d, { profile: "hr" });
  assert.ok(out.ok, JSON.stringify(out.errors));
  // S: 100 + 8 - 10 = 98 at 25 % = 24.50; E: 150 + 0.28 + 3; HR base 251.28 - 3.28 out of scope.
  assert.deepEqual(out.totals, { net: 250.28, tax: 24.5, gross: 275.78, prepaid: 0, due: 275.78, allowances: 10, charges: 11, taxable: 251.28 });
  assert.match(out.xml, /<cbc:TaxExclusiveAmount currencyID="EUR">248\.00<\/cbc:TaxExclusiveAmount>\s*<hrextac:OutOfScopeOfVATAmount currencyID="EUR">3\.28</);
  // One EN E row (BR-E-01) carrying both reasons; separate HR rows for HR:E, HR:POVNAK and HR:PP.
  assert.equal((out.xml.match(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/g) || []).filter((x) => /<cbc:ID>E</.test(x)).length, 1);
  for (const n of ["HR:E", "HR:POVNAK", "HR:PP", "HR:PDV25"]) assert.match(out.xml, new RegExp(`<hrextac:HRTaxCategory>\\s*<cbc:ID>[A-Z]+</cbc:ID>\\s*<cbc:Name>${n}</cbc:Name>`));
  assert.deepEqual(fatal(await runPlain(out.xml)), []);
});

test("HR: what the rules or the samples rule out is refused before writing", () => {
  const errs = (d, profile = "hr") => generateInvoice(d, { profile }).errors.map((e) => e.path);
  assert.deepEqual(errs(hrDraft(null, { charges: [{ amount: 3, hr_label: "XX" }] })), ["charges[0].hr_label", "charges[0].reason"]);
  assert.deepEqual(errs(hrDraft(null, { charges: [{ amount: 3, hr_label: "PP", tax_category: "S", tax_percent: 25 }] })), ["charges[0].tax_category", "charges[0].tax_percent"]);
  assert.deepEqual(errs(hrDraft(null, { allowances: [{ reason: "Povrat ambalaže", amount: 3, hr_label: "POVNAK" }] })), ["allowances[0].hr_label", "allowances"]);
  const eu = hrDraft(null, { charges: [{ amount: 3, hr_label: "PP" }] });
  assert.deepEqual(errs(eu, "en16931"), ["charges[0].hr_label", "charges[0].reason"]);
});

// Every profile: a discount and a delivery charge in UBL and CII.
const deDraft = () => ({
  number: "RE-2026-001", issue_date: "2026-10-15", due_date: "2026-11-14", delivery_date: "2026-10-14",
  buyer_reference: "04011000-12345-03", order_reference: "PO-77",
  seller: { name: "Muster Software GmbH", street: "Hauptstrasse 1", city: "Berlin", postal_code: "10115", country: "DE", vat_id: "DE136695976", endpoint: { scheme: "0204", id: "991-01234-56" }, contact: { name: "Erika Muster", phone: "+49 30 123456", email: "billing@muster.example" } },
  buyer: { name: "Kunde AG", street: "Marktplatz 2", city: "Hamburg", postal_code: "20095", country: "DE", endpoint: { scheme: "0204", id: "991-65432-10" } },
  payment: { iban: "DE02 1203 0000 0000 2020 51", bic: "BYLADEM1001" },
  lines: [
    { description: "Beratung", quantity: 2, unit: "hours", unit_price: 100, tax_percent: 19 },
    { description: "Handbuch", quantity: 3, unit: "pieces", unit_price: 33.33, tax_percent: 7 },
  ],
  allowances: [{ reason: "Rabatt", amount: 20, tax_percent: 19 }],
  charges: [{ reason: "Versand", amount: 4.9, tax_percent: 7 }],
});

for (const profile of ["xrechnung", "peppol", "en16931"]) {
  for (const format of ["ubl", "cii"]) {
    test(`${profile} ${format}: an allowance and a charge count in their VAT rows and the totals`, { skip }, async () => {
      const out = generateInvoice(deDraft(), { profile, format });
      assert.ok(out.ok, JSON.stringify(out.errors));
      // 19 %: 200 - 20 = 180 -> 34.20; 7 %: 99.99 + 4.90 = 104.89 -> 7.34.
      assert.deepEqual(out.totals, { net: 299.99, tax: 41.54, gross: 326.43, prepaid: 0, due: 326.43, allowances: 20, charges: 4.9, taxable: 284.89 });
      const back = await parseInvoiceSource("x.xml", out.xml);
      assert.deepEqual(checkInvoice(back), []);
      const r = await runPlain(out.xml);
      assert.deepEqual(r.skipped, []);
      assert.deepEqual(fatal(r), []);
    });
  }
}

test("allowances and charges: bad input is an error, not a broken file", () => {
  const errs = (mut) => { const d = deDraft(); mut(d); return generateInvoice(d).errors.map((e) => e.path); };
  assert.deepEqual(errs((d) => { d.allowances[0].amount = 0; }), ["allowances[0].amount"]);
  assert.deepEqual(errs((d) => { delete d.charges[0].reason; }), ["charges[0].reason"]);
  assert.deepEqual(errs((d) => { d.charges = { amount: 1 }; }), ["charges"]);
  assert.deepEqual(errs((d) => { d.allowances[0].amount = 250; }), ["allowances"]);
  assert.deepEqual(errs((d) => { d.charges[0].tax_category = "E"; d.charges[0].tax_percent = 0; }), ["charges[0].tax_reason"]);
  // No allowances or charges: the totals keep their old shape.
  const plain = deDraft();
  delete plain.allowances; delete plain.charges;
  assert.deepEqual(Object.keys(generateInvoice(plain).totals), ["net", "tax", "gross", "prepaid", "due"]);
});
