import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkFacturae, looksLikeFacturae } from "./facturae.mjs";
import { preflightDocuments } from "./report.mjs";
import { inspectPartyVat } from "./vat.mjs";

// A hand-made Facturae 3.2.2 file (made-up parties; xmllint validates it against
// facturae.gob.es's Facturaev3_2_2.xml): two lines with a discount and a charge,
// a general discount, 21% IVA, 15% IRPF withheld and a suplido.
const VALID = readFileSync(new URL("./fixtures/facturae/valid-322.xml", import.meta.url), "utf8");
const run = (xml) => checkFacturae(xml, { today: "2026-11-15" });
const rules = (xml) => run(xml).findings.map((f) => f.rule);

test("the valid fixture draws no finding and names its version", () => {
  assert.ok(looksLikeFacturae(VALID));
  const r = run(VALID);
  assert.deepEqual(r.findings, []);
  assert.equal(r.version, "3.2.2");
  assert.ok(r.skipped.some((s) => s.rule === "signature"));
});

test("UBL, FatturaPA and plain XML are not taken for Facturae", () => {
  assert.equal(looksLikeFacturae('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'), false);
  assert.equal(looksLikeFacturae('<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"/>'), false);
  assert.equal(looksLikeFacturae("<Facturae><x/></Facturae>"), false);
});

test("schema layer: missing, out of order, unknown, bad code, bad amount, cut-off", () => {
  assert.ok(rules(VALID.replace("<TaxCurrencyCode>EUR</TaxCurrencyCode>", "")).includes("ES-020"));
  assert.ok(rules(VALID.replace(/(<Quantity>[^<]*<\/Quantity>)(\s*)(<UnitOfMeasure>[^<]*<\/UnitOfMeasure>)/, "$3$2$1")).includes("ES-018"));
  assert.ok(rules(VALID.replace("<InvoiceClass>", "<Notas>x</Notas><InvoiceClass>")).includes("ES-019"));
  assert.ok(rules(VALID.replace("<InvoiceClass>OO<", "<InvoiceClass>XX<")).includes("ES-021"));
  const comma = run(VALID.replace("<TotalGrossAmount>1050.00<", "<TotalGrossAmount>1050,00<")).findings.find((f) => f.rule === "ES-021");
  assert.match(comma.message, /decimal comma/);
  assert.deepEqual(rules(VALID.slice(0, 3000)), ["ES-022"]);
});

test("an optional xs:choice may be absent (AccountType's branch address)", () => {
  assert.ok(!rules(VALID).includes("ES-020"));
});

test("line, invoice and batch arithmetic use the field description's formulas", () => {
  const cases = [
    ["<TotalCost>900.000000<", "<TotalCost>901.000000<", "ES-007"],
    ["<GrossAmount>855.000000<", "<GrossAmount>856.000000<", "ES-008"],
    ["<TotalGrossAmount>1050.00<", "<TotalGrossAmount>1051.00<", "ES-009"],
    ["<TotalGeneralDiscounts>50.00<", "<TotalGeneralDiscounts>40.00<", "ES-010"],
    ["<TotalGrossAmountBeforeTaxes>1000.00<", "<TotalGrossAmountBeforeTaxes>1001.00<", "ES-012"],
    ["<TaxAmount><TotalAmount>210.00<", "<TaxAmount><TotalAmount>210.02<", "ES-013"],
    ["<TotalTaxOutputs>210.00<", "<TotalTaxOutputs>211.00<", "ES-014"],
    ["<TotalTaxesWithheld>150.00<", "<TotalTaxesWithheld>0.00<", "ES-015"],
    ["<InvoiceTotal>1060.00<", "<InvoiceTotal>1210.00<", "ES-016"],
    ["<TotalOutstandingAmount>1060.00<", "<TotalOutstandingAmount>1050.00<", "ES-017"],
    ["<TotalExecutableAmount>1147.50<", "<TotalExecutableAmount>1060.00<", "ES-024"],
    ["<TotalReimbursableExpenses>87.50<", "<TotalReimbursableExpenses>80.00<", "ES-025"],
    ["<TotalInvoicesAmount><TotalAmount>1060.00<", "<TotalInvoicesAmount><TotalAmount>1147.50<", "ES-004"],
    ["<InvoicesCount>1<", "<InvoicesCount>2<", "ES-003"],
  ];
  for (const [from, to, rule] of cases) {
    assert.ok(VALID.includes(from), from);
    assert.ok(rules(VALID.replace(from, to)).includes(rule), `${rule} for ${to}`);
  }
});

test("withholding (IRPF) is subtracted, not added, and a suplido is added to the total to execute", () => {
  // The fixture's own numbers: 1000 + 210 - 150 = 1060; 1060 + 87.50 = 1147.50.
  assert.ok(!rules(VALID).some((r) => ["ES-016", "ES-024"].includes(r)));
});

test("corrective invoices: OR needs Corrective, 01/02 need the corrected number and, in 3.2.2, its date; code and text pair", () => {
  assert.ok(rules(VALID.replace("<InvoiceClass>OO<", "<InvoiceClass>OR<")).includes("ES-027"));
  const corr = (inner) => VALID.replace("<InvoiceClass>OO</InvoiceClass>", `<InvoiceClass>OR</InvoiceClass><Corrective>${inner}</Corrective>`);
  const body = (n, d, date) => `${n}<ReasonCode>01</ReasonCode><ReasonDescription>${d}</ReasonDescription><TaxPeriod><StartDate>2026-10-01</StartDate><EndDate>2026-10-31</EndDate></TaxPeriod><CorrectionMethod>01</CorrectionMethod><CorrectionMethodDescription>Rectificación íntegra</CorrectionMethodDescription>${date}`;
  assert.deepEqual(rules(corr(body("<InvoiceNumber>0041</InvoiceNumber>", "Número de la factura", "<InvoiceIssueDate>2026-10-15</InvoiceIssueDate>"))), []);
  assert.ok(rules(corr(body("", "Número de la factura", "<InvoiceIssueDate>2026-10-15</InvoiceIssueDate>"))).includes("ES-028"));
  assert.ok(rules(corr(body("<InvoiceNumber>0041</InvoiceNumber>", "Número de la factura", ""))).includes("ES-028"));
  assert.ok(rules(corr(body("<InvoiceNumber>0041</InvoiceNumber>", "Serie de la factura", "<InvoiceIssueDate>2026-10-15</InvoiceIssueDate>"))).includes("ES-029"));
});

test("summary invoices need InvoicingPeriod; foreign currency needs the exchange rate", () => {
  assert.ok(rules(VALID.replace("<InvoiceClass>OO<", "<InvoiceClass>OC<")).includes("ES-030"));
  const usd = VALID.replace(/<InvoiceCurrencyCode>EUR</g, "<InvoiceCurrencyCode>USD<");
  assert.ok(rules(usd).includes("ES-031"));
});

test("modality, version and dates", () => {
  // Modality L (lote) with the one invoice and InvoicesCount 1 the file holds: ES-002 alone, not ES-003.
  assert.ok(VALID.includes("<InvoicesCount>1<"));
  const lote = rules(VALID.replace("<Modality>I<", "<Modality>L<"));
  assert.ok(lote.includes("ES-002"));
  assert.ok(!lote.includes("ES-003"));
  assert.ok(rules(VALID.replace("<SchemaVersion>3.2.2<", "<SchemaVersion>3.2.1<")).includes("ES-001"));
  assert.ok(rules(VALID.replace("<IssueDate>2026-11-02<", "<IssueDate>2026-12-02<")).includes("ES-037"));
  const old = run(VALID.replace("http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml", "http://www.facturae.es/Facturae/2009/v3.2/Facturae"));
  assert.ok(old.findings.some((f) => f.rule === "ES-001"));
  assert.ok(old.skipped.some((s) => s.rule === "ES-018..022"));
});

test("NIF, NIE and CIF check characters; findings never echo the number", () => {
  const bad = run(VALID.replace("<TaxIdentificationNumber>B12345674<", "<TaxIdentificationNumber>B12345675<"));
  const f = bad.findings.find((x) => x.rule === "ES-032");
  assert.ok(f);
  assert.doesNotMatch(JSON.stringify(f), /B1234567/);
  assert.ok(!rules(VALID.replace("<TaxIdentificationNumber>B12345674<", "<TaxIdentificationNumber>X1234567L<")).includes("ES-032"));
});

test("Spanish NIE and K/L/M NIFs pass the party VAT check (they failed INV-023 before 2026-11-15)", () => {
  // Valid per python-stdnum 2.2 es.nif; an altered letter fails.
  for (const id of ["X1234567L", "Y1234567X", "Z1234567R", "K1234567L", "M1234567L", "12345678Z", "B12345674"]) {
    assert.deepEqual(inspectPartyVat({ vat_id: `ES${id}` }, "seller"), [], id);
  }
  for (const id of ["X1234567T", "K1234567T", "12345678A"]) {
    assert.equal(inspectPartyVat({ vat_id: `ES${id}` }, "seller")[0]?.rule, "INV-023", id);
  }
});

test("the batch report routes a Facturae file to its own reader", async () => {
  const { reports, readErrors } = await preflightDocuments([{ name: "factura.xml", source: VALID }]);
  assert.deepEqual(readErrors, []);
  assert.equal(reports.length, 1);
  assert.match(reports[0].envelope, /Spanish Facturae 3\.2\.2/);
  assert.equal(reports[0].errors.filter((e) => e.rule === "ES-037").length, 0);
});
