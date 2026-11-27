// Every safe fix: the fixed file must re-validate, the change is shown as a diff, and fixes that
// would need judgement are refused. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkInvoice, passes, validate } from "./check.mjs";
import { normaliseDate, PEPPOL_BILLING_PROCESS } from "./fixes.mjs";

const UBL = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
const CII = readFileSync(new URL("../examples/xrechnung-cii-invoice.xml", import.meta.url), "utf8");

/** @param {string} from @param {string} to @param {string} [src] */
function mutate(from, to, src = UBL) {
  assert.ok(src.includes(from), `fixture lacks ${from}`);
  return src.replace(from, to);
}

/**
 * Run the paid check with fixes; assert the fix applied, the diff shows it, and the fixed
 * content independently re-validates with no blocking finding.
 */
async function assertFixed(name, xml, fixId, opts = {}) {
  const before = await validate(name, xml, opts);
  assert.equal(passes(before), false, "the mutated file must fail first");
  const r = await checkInvoice({ name, source: xml }, { fix: true, ...opts });
  assert.ok(r.fixes, "fixes block present");
  const applied = r.fixes.applied.map((a) => a.id);
  assert.ok(applied.includes(fixId), `${fixId} applied (got ${applied.join(",")}; skipped ${JSON.stringify(r.fixes.skipped)})`);
  assert.match(r.fixes.diff, /^--- a\//);
  assert.match(r.fixes.diff, /^-/m);
  assert.match(r.fixes.diff, /^\+/m);
  assert.equal(r.fixes.revalidation.status, "pass");
  // Independent re-validation of the returned content, not just the pipeline's own state.
  const after = await validate(name, r.fixes.content, opts);
  assert.equal(passes(after), true, JSON.stringify(after.findings));
  assert.deepEqual(after.findings, []);
  return r;
}

test("date-format: German dotted issue date becomes ISO and re-validates", async () => {
  const r = await assertFixed("d.xml", mutate("<cbc:IssueDate>2026-08-24", "<cbc:IssueDate>24.08.2026"), "date-format");
  const fix = r.fixes.applied.find((a) => a.id === "date-format");
  assert.deepEqual(fix.changes, [{ element: "IssueDate", before: "24.08.2026", after: "2026-08-24" }]);
  assert.ok(fix.resolves.includes("INV-003"));
  assert.match(fix.diff, /-  <cbc:IssueDate>24\.08\.2026<\/cbc:IssueDate>\n\+  <cbc:IssueDate>2026-08-24<\/cbc:IssueDate>/);
});

test("date-format: unambiguous day-first slash date and compact dates", async () => {
  await assertFixed("d.xml", mutate("<cbc:DueDate>2026-09-23", "<cbc:DueDate>23/09/2026"), "date-format");
  await assertFixed("d.xml", mutate("<cbc:DueDate>2026-09-23", "<cbc:DueDate>20260923"), "date-format");
});

test("date-format: CII format 102 date written as a German date", async () => {
  await assertFixed("c.xml", mutate('format="102">20260902', 'format="102">02.09.2026', CII), "date-format");
});

test("date-format refuses an ambiguous slash date and says why", async () => {
  const xml = mutate("<cbc:DueDate>2026-09-23", "<cbc:DueDate>03/04/2026");
  const r = await checkInvoice({ name: "a.xml", source: xml }, { fix: true });
  assert.equal(r.fixes.applied.length, 0);
  assert.match(JSON.stringify(r.fixes.skipped), /day\/month or month\/day/);
  assert.equal(r.fixes.content, undefined, "no fixed file when nothing was fixed");
});

test("normaliseDate: forms, impossible dates and ambiguity", () => {
  assert.deepEqual(normaliseDate("24.08.2026", "iso"), { ok: true, value: "2026-08-24" });
  assert.deepEqual(normaliseDate("2026/8/4", "102"), { ok: true, value: "20260804" });
  assert.deepEqual(normaliseDate("2026-08-24T00:00:00", "iso"), { ok: true, value: "2026-08-24" });
  assert.deepEqual(normaliseDate("09/23/2026", "iso"), { ok: true, value: "2026-09-23" });
  assert.equal(normaliseDate("31.02.2026", "iso").ok, false);
  assert.equal(normaliseDate("04/05/2026", "iso").ok, false);
  assert.equal(normaliseDate("next Tuesday", "iso").ok, false);
});

test("amount-decimals: a three-decimal VAT total is rounded and re-validates", async () => {
  const r = await assertFixed("r.xml", mutate('<cbc:TaxAmount currencyID="EUR">48.50', '<cbc:TaxAmount currencyID="EUR">48.504'), "amount-decimals");
  assert.deepEqual(r.fixes.applied[0].changes, [{ element: "TaxAmount", before: "48.504", after: "48.50" }]);
});

test("amount-decimals: CII line total", async () => {
  await assertFixed("c.xml", mutate("<ram:LineTotalAmount>960.00", "<ram:LineTotalAmount>960.004", CII), "amount-decimals");
});

test("amount-decimals refuses a rounding that leaves the totals a cent apart", async () => {
  const xml = mutate('<cbc:LineExtensionAmount currencyID="EUR">350.00', '<cbc:LineExtensionAmount currencyID="EUR">350.006');
  const r = await checkInvoice({ name: "r.xml", source: xml }, { fix: true });
  assert.equal(r.fixes.applied.length, 0);
  const skip = r.fixes.skipped.find((s) => s.id === "amount-decimals");
  assert.match(skip.reason, /needs a human/);
  assert.ok(skip.introduced.some((s) => s.includes("BR-CO-10")));
});

test("amount-decimals leaves prices alone (unit prices may carry more decimals)", async () => {
  const xml = mutate('<cbc:PriceAmount currencyID="EUR">100.00', '<cbc:PriceAmount currencyID="EUR">100.0000');
  const v = await validate("p.xml", xml);
  assert.equal(passes(v), true);
  assert.ok(!v.findings.some((f) => f.rule === "PRO-DEC-001"));
});

test("currency-case: lower-case code and its currencyID attributes", async () => {
  const xml = UBL.replace("<cbc:DocumentCurrencyCode>EUR", "<cbc:DocumentCurrencyCode>eur").replaceAll('currencyID="EUR"', 'currencyID="eur"');
  const r = await assertFixed("u.xml", xml, "currency-case");
  assert.ok(!r.fixes.content.includes('"eur"'));
});

test("currency-missing: the one currency every amount names is added", async () => {
  const xml = UBL.replace(/\s*<cbc:DocumentCurrencyCode>EUR<\/cbc:DocumentCurrencyCode>/, "");
  const r = await assertFixed("m.xml", xml, "currency-missing");
  assert.match(r.fixes.content, /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>\n  <cbc:DocumentCurrencyCode>EUR<\/cbc:DocumentCurrencyCode>/);
});

test("currency-missing refuses when amounts name two currencies", async () => {
  const xml = UBL.replace(/\s*<cbc:DocumentCurrencyCode>EUR<\/cbc:DocumentCurrencyCode>/, "").replace('currencyID="EUR">200.00', 'currencyID="USD">200.00');
  const r = await checkInvoice({ name: "m.xml", source: xml }, { fix: true });
  assert.equal(r.fixes.applied.length, 0);
  assert.match(JSON.stringify(r.fixes.skipped), /2 currencies/);
});

test("peppol-process: missing ProfileID gets the single valid billing process (UBL)", async () => {
  const xml = mutate(
    "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
  ).replace('<cbc:EndpointID schemeID="0088">4098765000003</cbc:EndpointID>', '<cbc:EndpointID schemeID="0088">4098765000003</cbc:EndpointID>');
  const r = await assertFixed("p.xml", xml, "peppol-process", { profile: "peppol" });
  assert.ok(r.fixes.content.includes(`<cbc:ProfileID>${PEPPOL_BILLING_PROCESS}</cbc:ProfileID>`));
});

test("peppol-process: CII business process parameter is inserted", async () => {
  const xml = CII.replace(/<ram:BusinessProcessSpecifiedDocumentContextParameter>[\s\S]*?<\/ram:BusinessProcessSpecifiedDocumentContextParameter>\s*/, "");
  const r = await checkInvoice({ name: "c.xml", source: xml }, { fix: true, profile: "peppol" });
  const fix = r.fixes.applied.find((a) => a.id === "peppol-process");
  assert.ok(fix, JSON.stringify(r.fixes));
  const after = await validate("c.xml", r.fixes.content, { profile: "peppol" });
  assert.ok(!after.findings.some((f) => f.rule === "PP-001"));
});

test("peppol-process refuses a self-billing invoice", async () => {
  const xml = mutate("<cbc:InvoiceTypeCode>380", "<cbc:InvoiceTypeCode>389");
  const r = await checkInvoice({ name: "s.xml", source: xml }, { fix: true, profile: "peppol" });
  assert.ok(!(r.fixes?.applied ?? []).some((a) => a.id === "peppol-process"));
});

test("several fixes at once produce one combined diff and a passing file", async () => {
  const xml = UBL.replace("<cbc:IssueDate>2026-08-24", "<cbc:IssueDate>24.08.2026")
    .replace('<cbc:TaxAmount currencyID="EUR">48.50', '<cbc:TaxAmount currencyID="EUR">48.504')
    .replace("<cbc:DocumentCurrencyCode>EUR", "<cbc:DocumentCurrencyCode>eur");
  const r = await checkInvoice({ name: "multi.xml", source: xml }, { fix: true, lang: "de" });
  assert.deepEqual(r.fixes.applied.map((a) => a.id).sort(), ["amount-decimals", "currency-case", "date-format"]);
  assert.equal((r.fixes.diff.match(/^@@/gm) ?? []).length, 2);
  assert.equal(passes(await validate("multi.xml", r.fixes.content)), true);
});

test("arithmetic errors are never auto-fixed (not on the whitelist)", async () => {
  const xml = readFileSync(new URL("../examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8");
  const r = await checkInvoice({ name: "x.xml", source: xml }, { fix: true });
  assert.equal(r.status, "fail");
  assert.deepEqual(r.fixes.applied, []);
});

test("a clean invoice is untouched", async () => {
  const r = await checkInvoice({ name: "ok.xml", source: UBL }, { fix: true });
  assert.equal(r.status, "pass");
  assert.equal(r.fixes, undefined);
});

test("PDFs are reported, never rewritten", async () => {
  const pdf = new Uint8Array(readFileSync(new URL("../examples/factur-x-credit-note-with-defects.pdf", import.meta.url)));
  const r = await checkInvoice({ name: "x.pdf", source: pdf }, { fix: true });
  assert.equal(r.fixes.applied.length, 0);
  assert.match(r.fixes.skipped[0].reason, /PDFs/);
});
