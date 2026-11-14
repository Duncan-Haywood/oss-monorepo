// The creator's Croatian profile (HR-CIUS 2025 + HR extension) and the O / K fixes that came
// with it. Every written file is read back through the plain route: the EN 16931 base plus the
// Porezna uprava's HR-BR rules (plain/cius-hr-ubl.json). Companies, operator and OIBs are made
// up; their check digits are valid.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { generateInvoice, oibOk } from "./generate.mjs";
import { runPlain, plainAvailable } from "./plain-node.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/cius-hr-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const fatal = (r) => r.findings.filter((f) => f.severity !== "warning").map((f) => f.rule).sort();

const draft = (lines) => ({
  number: "42-1-1", issue_date: "2026-11-02", issue_time: "09:30:00", due_date: "2026-12-02", process: "P1",
  operator: { name: "Ana Operater", oib: "55556666775" },
  seller: { name: "Primjer Usluge d.o.o.", street: "Ilica 1", city: "Zagreb", postal_code: "10000", country: "HR", vat_id: "HR12345678903" },
  buyer: { name: "Kupac Primjer d.d.", street: "Riva 5", city: "Split", postal_code: "21000", country: "HR", vat_id: "HR98765432106" },
  payment: { means: "30", iban: "HR1210010051863000160", reference: "HR00 42-1-1" },
  lines: lines || [
    { description: "IT podrska", quantity: 2, unit: "HUR", unit_price: 100, tax_percent: 25, kpd: "62.20.30" },
    { description: "Prirucnik", quantity: 3, unit_price: 20, tax_percent: 5, kpd: "58.11.11" },
  ],
});
const exempt = { description: "Tecaj", quantity: 1, unit_price: 150, tax_percent: 0, tax_category: "E", tax_reason: "Oslobođeno PDV-a prema čl. 39. Zakona o PDV-u", kpd: "85.59.09" };

test("OIB check digit (ISO 7064 MOD 11,10)", () => {
  for (const ok of ["12345678903", "98765432106", "55556666775", "11111111119", "HR12345678903"]) assert.ok(oibOk(ok), ok);
  for (const bad of ["12345678901", "1234567890", "abcdefghijk", "", null]) assert.ok(!oibOk(bad), String(bad));
});

test("a standard-rated Croatian invoice: HR header fields, operator, KPD and labels; no extension needed", { skip }, async () => {
  const out = generateInvoice(draft(), { profile: "hr" });
  assert.ok(out.ok, JSON.stringify(out.errors));
  assert.match(out.xml, /<cbc:CustomizationID>urn:cen\.eu:en16931:2017#compliant#urn:mfin\.gov\.hr:cius-2025:1\.0#conformant#urn:mfin\.gov\.hr:ext-2025:1\.0</);
  assert.match(out.xml, /<cbc:ProfileID>P1<\/cbc:ProfileID>/);
  assert.match(out.xml, /<cbc:IssueTime>09:30:00<\/cbc:IssueTime>/);
  assert.match(out.xml, /<cac:SellerContact>\s*<cbc:ID>55556666775<\/cbc:ID>\s*<cbc:Name>Ana Operater<\/cbc:Name>/);
  assert.match(out.xml, /<cbc:EndpointID schemeID="9934">12345678903</);
  assert.match(out.xml, /listID="CG">62\.20\.30</);
  assert.match(out.xml, /<cbc:Name>HR:PDV25<\/cbc:Name>/);
  assert.match(out.xml, /<cbc:Name>HR:PDV5<\/cbc:Name>/);
  assert.doesNotMatch(out.xml, /HRFISK20Data/);
  const r = await runPlain(out.xml);
  assert.deepEqual(r.sets, ["en16931", "cius-hr"]);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(fatal(r), []);
});

test("an exempt line brings the HR extension (HR-BR-26) with sums the HR rules accept", { skip }, async () => {
  const d = draft();
  d.lines.push(exempt);
  const out = generateInvoice(d, { profile: "hr" });
  assert.ok(out.ok, JSON.stringify(out.errors));
  assert.ok(out.xml.indexOf("<ext:UBLExtensions>") < out.xml.indexOf("<cbc:CustomizationID>"), "extensions come first");
  assert.match(out.xml, /<hrextac:HRTaxTotal>\s*<cbc:TaxAmount currencyID="EUR">53\.00</);
  assert.match(out.xml, /<cbc:ID>E<\/cbc:ID>\s*<cbc:Name>HR:E<\/cbc:Name>\s*<cbc:Percent>0<\/cbc:Percent>\s*<cbc:TaxExemptionReason>/);
  assert.match(out.xml, /<cbc:TaxExclusiveAmount currencyID="EUR">410\.00<\/cbc:TaxExclusiveAmount>\s*<hrextac:OutOfScopeOfVATAmount currencyID="EUR">0\.00</);
  const r = await runPlain(out.xml);
  assert.deepEqual(fatal(r), []);
  // The extension is what HR-BR-26 asks for: without it the same file fails.
  const stripped = out.xml.replace(/\s*<ext:UBLExtensions>[\s\S]*<\/ext:UBLExtensions>/, "");
  assert.deepEqual(fatal(await runPlain(stripped)), ["HR-BR-26"]);
  // and its sums are checked: a wrong HR VAT total breaks HR-BR-54 and HR-BR-55.
  const wrong = out.xml.replace(/(<hrextac:HRTaxTotal>\s*<cbc:TaxAmount currencyID="EUR">)53\.00/, "$154.00");
  assert.deepEqual(fatal(await runPlain(wrong)), ["HR-BR-54", "HR-BR-55"]);
});

test("Z, AE and 13 % lines, and a credit note with the original invoice's date, pass the HR rules", { skip }, async () => {
  const one = (cat, pct, reason) => [{ description: "Usluga", quantity: 1, unit_price: 80, tax_percent: pct, tax_category: cat, tax_reason: reason, kpd: "62.20.30" }];
  for (const lines of [one("Z", 0), one("AE", 0, "Prijenos porezne obveze"), one("S", 13)]) {
    const out = generateInvoice(draft(lines), { profile: "hr" });
    assert.ok(out.ok, JSON.stringify(out.errors));
    assert.deepEqual(fatal(await runPlain(out.xml)), [], lines[0].tax_category);
  }
  const credit = draft();
  credit.document_type = "credit_note";
  credit.original_invoice = "41-1-1";
  credit.original_invoice_date = "2026-10-15";
  credit.lines.forEach((l) => delete l.kpd); // a credit note may go without KPD (HR-BR-25)
  const out = generateInvoice(credit, { profile: "hr" });
  assert.ok(out.ok, JSON.stringify(out.errors));
  assert.match(out.xml, /<cbc:ID>41-1-1<\/cbc:ID><cbc:IssueDate>2026-10-15<\/cbc:IssueDate>/);
  assert.deepEqual(fatal(await runPlain(out.xml)), []);
});

test("the creator refuses what the HR rules would reject, before writing it", () => {
  const errs = (mut) => { const d = draft(); mut(d); return generateInvoice(d, { profile: "hr" }).errors.map((e) => e.path); };
  assert.deepEqual(errs((d) => { delete d.issue_time; }), ["issue_time"]);
  assert.deepEqual(errs((d) => { d.issue_time = "09:30"; }), ["issue_time"]);
  assert.deepEqual(errs((d) => { d.process = "P13"; }), ["process"]);
  assert.deepEqual(errs((d) => { d.issue_date = "2025-12-01"; }), ["issue_date"]);
  assert.deepEqual(errs((d) => { delete d.due_date; }), ["due_date"]);
  assert.deepEqual(errs((d) => { d.operator.oib = "12345678901"; }), ["operator.oib"]);
  assert.deepEqual(errs((d) => { delete d.operator.name; }), ["operator.name"]);
  assert.deepEqual(errs((d) => { d.seller.vat_id = "HR12345678901"; }), ["seller.vat_id"]);
  assert.deepEqual(errs((d) => { delete d.buyer.vat_id; }), ["buyer.endpoint", "buyer.vat_id"]);
  assert.deepEqual(errs((d) => { delete d.lines[0].kpd; }), ["lines[0].kpd"]);
  assert.deepEqual(errs((d) => { d.lines[0].kpd = "6220"; }), ["lines[0].kpd"]);
  assert.deepEqual(errs((d) => { d.lines[0].tax_percent = 19; }), ["lines[0].tax_percent"]);
  assert.deepEqual(errs((d) => { d.lines = [{ ...exempt, tax_category: "O" }]; }), ["lines"]);
  assert.deepEqual(errs((d) => { d.document_type = "credit_note"; d.original_invoice = "41-1-1"; }), ["original_invoice_date"]);
  assert.ok(generateInvoice(draft(), { profile: "hr", format: "cii" }).errors.some((e) => e.path === "format"));
  assert.ok(generateInvoice(draft(), { profile: "hr" }).ok);
});

// Found while building the Croatian profile: every profile wrote O and K invoices the EN 16931
// base rejects.
const eu = (cat, reason, seller, buyer) => ({
  number: "A1", issue_date: "2026-11-02", due_date: "2026-12-02", delivery_date: "2026-11-01",
  seller: seller || { name: "S GmbH", city: "Berlin", country: "DE", vat_id: "DE136695976" },
  buyer: buyer || { name: "B GmbH", city: "Köln", country: "DE", vat_id: "DE811193231" },
  lines: [{ description: "x", quantity: 1, unit_price: 10, tax_percent: 0, tax_category: cat, tax_reason: reason }],
});

test("not subject to VAT (O): no rate, no VAT IDs, alone on the invoice; the EN base accepts it", { skip }, async () => {
  const d = eu("O", "Not subject to VAT", { name: "S GmbH", city: "Berlin", country: "DE", tax_number: "21/815/08150", company_id: "HRB 12345" }, { name: "B GmbH", city: "Köln", country: "DE" });
  for (const format of ["ubl", "cii"]) {
    const out = generateInvoice(d, { profile: "en16931", format });
    assert.ok(out.ok, JSON.stringify(out.errors));
    assert.doesNotMatch(out.xml, /<cbc:Percent>|RateApplicablePercent/);
    assert.deepEqual(fatal(await runPlain(out.xml)), [], format);
  }
  assert.deepEqual(generateInvoice(eu("O", "Not subject to VAT"), { profile: "en16931" }).errors.map((e) => e.path), ["seller.vat_id", "buyer.vat_id", "seller.company_id"]);
  const mixed = eu("O", "Not subject to VAT", { name: "S GmbH", city: "Berlin", country: "DE", tax_number: "21/815/08150", company_id: "HRB 12345" }, { name: "B GmbH", city: "Köln", country: "DE" });
  mixed.lines.push({ description: "y", quantity: 1, unit_price: 10, tax_percent: 19 });
  assert.deepEqual(generateInvoice(mixed, { profile: "en16931" }).errors.map((e) => e.path), ["lines"]);
});

test("intra-community supply (K): delivery date required, deliver-to country from the buyer", { skip }, async () => {
  const buyer = { name: "B SARL", city: "Paris", country: "FR", vat_id: "FR40303265045" };
  for (const format of ["ubl", "cii"]) {
    const out = generateInvoice(eu("K", "Intra-community supply", null, buyer), { profile: "en16931", format });
    assert.ok(out.ok, JSON.stringify(out.errors));
    assert.match(out.xml, format === "ubl" ? /<cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>FR</ : /<ram:ShipToTradeParty><ram:PostalTradeAddress><ram:CountryID>FR</);
    assert.deepEqual(fatal(await runPlain(out.xml)), [], format);
  }
  const noDate = eu("K", "Intra-community supply", null, buyer);
  delete noDate.delivery_date;
  assert.deepEqual(generateInvoice(noDate, { profile: "en16931" }).errors.map((e) => e.path), ["delivery_date"]);
});
