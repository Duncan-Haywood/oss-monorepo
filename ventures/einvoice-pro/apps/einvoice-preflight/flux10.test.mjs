// France's e-reporting file (Flux 10): the reader and gap checks (flux10.mjs), routing, the
// report, and FNFE-MPE's Flux 10 controls (plain/flux10-fr.json) on this repo's three made-up
// files (fixtures/flux10/*.xml, valid against the PPF's XSD with xmllint) and broken copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { detectSyntax, plainOnlySets } from "./schematron-core.mjs";
import { flux10Findings, frVatKeyOk, looksLikeFlux10, readFlux10, realDate, sirenKeyOk } from "./flux10.mjs";
import { preflightDocuments } from "./report.mjs";

const require = createRequire(import.meta.url);
let ready = existsSync(new URL("./plain/flux10-fr.json", import.meta.url));
try { require.resolve("slimdom"); require.resolve("fontoxpath"); } catch { ready = false; }
const skip = !ready && "needs `npm i --no-save slimdom fontoxpath` and plain/flux10-fr.json";

const example = (name) => readFileSync(new URL(`./fixtures/flux10/${name}.xml`, import.meta.url), "utf8");
const B2C = example("b2c-transactions");
const INTL = example("international-invoices");
const PAY = example("payments");
const rules = (findings) => findings.filter((f) => f.rule !== "FR-F10-100").map((f) => f.rule);

test("detection: a Flux 10 file is its own syntax, before its <Invoice> elements look like UBL", () => {
  for (const x of [B2C, INTL, PAY]) {
    assert.ok(looksLikeFlux10(x));
    assert.equal(detectSyntax(x), "flux10");
    assert.deepEqual(plainOnlySets(x, "flux10"), ["flux10-fr"]);
  }
  assert.equal(detectSyntax("<Report><Header/></Report>"), "");
  assert.equal(detectSyntax('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><Report/></Invoice>'), "ubl");
  assert.ok(!looksLikeFlux10('<Invoice><ReportDocument/></Invoice>'));
});

test("reader: kinds, period, parties, totals", () => {
  const b2c = readFlux10(B2C);
  assert.equal(b2c.kind, "transactions");
  assert.deepEqual(b2c.period, { start: "20261001", end: "20261010" });
  assert.equal(b2c.transactions.length, 3);
  assert.equal(b2c.transactions[0].subtotals[1].rate, "5.5");
  assert.equal(b2c.issuer.id, "100000009");
  const intl = readFlux10(INTL);
  assert.equal(intl.invoices.length, 2);
  assert.equal(intl.invoices[1].refs[0].id, "F2026-1042");
  assert.equal(intl.invoices[0].buyer.scheme, "0223");
  const pay = readFlux10(PAY);
  assert.equal(pay.kind, "payments");
  assert.equal(pay.invoices[0].payment.subtotals.length, 2);
  assert.equal(pay.transactions[0].payment.date, "20261015");
  assert.throws(() => readFlux10("<Report/>"), /not a Flux 10/);
});

test("keys and dates", () => {
  assert.ok(sirenKeyOk("100000009") && sirenKeyOk("200000008"));
  assert.ok(!sirenKeyOk("100000008"));
  assert.ok(sirenKeyOk("356000000")); // La Poste: digit sum divisible by 5
  assert.ok(frVatKeyOk("FR88100000009"));
  assert.ok(!frVatKeyOk("FR40100000009"));
  assert.ok(frVatKeyOk("DE999999999")); // only French numeric keys are checked
  assert.ok(realDate("20240229") && !realDate("20260229") && !realDate("20261131") && !realDate("20261011250000"));
});

test("the three examples raise nothing beyond the summary", () => {
  for (const x of [B2C, INTL, PAY]) assert.deepEqual(rules(flux10Findings(readFlux10(x))), []);
});

test("gap checks: what the official controls let through", () => {
  const f = (x) => rules(flux10Findings(readFlux10(x)));
  assert.deepEqual(f(B2C.replace("<DateTimeString>20261011090000", "<DateTimeString>20260230090000")), ["FR-F10-101"]);
  assert.deepEqual(f(B2C.replace("<TaxTotal>200.00</TaxTotal>", "<TaxTotal>209.00</TaxTotal>").replace("<TaxTotal>211.00</TaxTotal>", "<TaxTotal>220.00</TaxTotal>")), ["FR-F10-102"]);
  // 57 sales: half a cent each is tolerated (0.285), more is not
  assert.deepEqual(f(B2C.replace("<TaxTotal>200.00</TaxTotal>", "<TaxTotal>200.25</TaxTotal>")), []);
  assert.deepEqual(f(B2C.replace("<Date>20261002</Date>", "<Date>20261012</Date>")), ["FR-F10-103"]);
  assert.deepEqual(f(B2C.replace("<TaxPercent>5.5</TaxPercent>\n        <TaxableAmount>200.00", "<TaxPercent>20</TaxPercent>\n        <TaxableAmount>200.00")).filter((r) => r === "FR-F10-106"), ["FR-F10-106"]);
  assert.deepEqual(f(B2C.replace('<Id schemeId="0002">100000009', '<Id schemeId="0002">100000008')), ["FR-F10-104"]);
  assert.deepEqual(f(INTL.replace("FR88100000009", "FR40100000009")), ["FR-F10-105"]);
  assert.deepEqual(f(INTL.replace("FR88100000009", "FR37200000008")), ["FR-F10-105"]);
  assert.deepEqual(f(INTL.replace("<Percent>0</Percent>", "<Percent>20</Percent>")), ["FR-F10-102"]);
  assert.deepEqual(f(PAY.replace("<Date>20261014</Date>", "<Date>20261114</Date>")), ["FR-F10-103"]);
  assert.deepEqual(f(PAY.replace("<Date>20261014</Date>", "<Date>20261034</Date>")), ["FR-F10-101"]);
  // G1.53 is written for EUR blocks only; a USD block's sums are checked here
  assert.deepEqual(f(B2C.replace("<TransactionsCurrency>EUR</TransactionsCurrency>\n      <TaxDueDateTypeCode>72", "<TransactionsCurrency>USD</TransactionsCurrency>\n      <TaxDueDateTypeCode>72").replace("<TaxExclusiveAmount>500.00", "<TaxExclusiveAmount>510.00")), ["FR-F10-107"]);
});

test("report: a Flux 10 file is read as e-reporting, not as an invoice", async () => {
  const r = await preflightDocuments([{ name: "intl.xml", source: INTL }, { name: "pay.xml", source: PAY }, { name: "b2c.xml", source: B2C }]);
  // the credit note (381, 240.00) reduces the 0% base; the B2C days add up per rate
  assert.match(r.reports[2].envelope, /per rate: 20% base 2260\.00 VAT 452\.00, 5\.5% base 285\.50 VAT 15\.70\./);
  assert.deepEqual(r.readErrors ?? [], []);
  assert.match(r.reports[0].envelope, /Flux 10\): 10\.1 invoices .* 0% base 4560\.00 VAT 0\.00/);
  assert.deepEqual(r.reports[0].flux10.kinds, ["10.1 invoices (international B2B)"]);
  assert.match(r.reports[1].envelope, /10\.2 payments on invoices and 10\.4 payments on transactions/);
  assert.ok(r.reports.every((x) => x.errors.every((e) => e.rule === "FR-F10-100")));
});

test("official Flux 10 controls: the examples pass all 150, none left unevaluated", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  for (const x of [B2C, INTL, PAY]) {
    const r = await runPlain(x);
    assert.equal(r.status, "ok");
    assert.deepEqual(r.sets, ["flux10-fr"]);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.skipped, []);
  }
});

test("official Flux 10 controls fire on broken copies, with the PPF's control codes", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  const codes = async (x) => (await runPlain(x)).findings.map((f) => f.rule).sort();
  assert.deepEqual(await codes(B2C.replace("<TaxTotal>211.00</TaxTotal>", "<TaxTotal>212.00</TaxTotal>")), ["G1.53"]);
  assert.deepEqual(await codes(B2C.replace("<CategoryCode>TLB1", "<CategoryCode>TLB9")), ["G1.68"]);
  assert.deepEqual(await codes(B2C.replace('<Id schemeId="0238">0003', '<Id schemeId="0238">00031')), ["G6.22"]);
  assert.deepEqual(await codes(INTL.replace("<TypeCode>380</TypeCode>", "<TypeCode>384</TypeCode>")), ["G1.32"]);
  assert.deepEqual(await codes(INTL.replace(/<Buyer>\s*<CompanyId[^>]*>[^<]*<\/CompanyId>/, "<Buyer>")), ["G6.28"]);
  assert.deepEqual(await codes(PAY.replace("<Amount>330.00</Amount>", "<Amount>-330.00</Amount>")), ["G1.16"]);
  const r = await runPlain(INTL.replace("<PriceAmount>120.00", "<PriceAmount>125.00"));
  assert.equal(r.findings[0].rule, "G1.55");
  assert.equal(r.findings[0].source, "flux10-fr-schematron");
  assert.doesNotMatch(r.findings[0].message, /Source :|^:/);
});
