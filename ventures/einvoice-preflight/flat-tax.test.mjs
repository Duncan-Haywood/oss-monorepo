// Flat-amount taxes beside VAT (added 2026-11-13). Malaysia's tourism tax is 10 MYR a
// room-night in its own tax scheme (AAL), with no percentage. The built-in INV-011, INV-018
// and INV-038 read every breakdown row and line as taxable x rate, so OpenPeppol's four TTX
// samples drew INV-018 and INV-038 (eval/phive-corpus.mjs --builtin: PINT MY 20 of 24 good
// cases clean), and the report hid both checks on any file with such a row, which also hid a
// wrong SST row beside it. Now a flat row is read as a flat amount, the SST rows stay checked,
// and a line's rate is its VAT/GST category whichever is listed first.
// examples/pint-my-tourism-tax-invoice.xml is our own made-up invoice.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { checkInvoice } from "./checks.mjs";
import { inspectTaxBreakdown } from "./breakdown.mjs";
import { isFlatTaxRow, flatTaxTotal } from "./linenet.mjs";
import { parseUblInvoice } from "./ubl.mjs";
import { preflightDocuments, isBlocking } from "./report.mjs";
import { plainAvailable } from "./plain-node.mjs";

const xml = readFileSync(new URL("./examples/pint-my-tourism-tax-invoice.xml", import.meta.url), "utf8");
const ARITHMETIC = new Set(["INV-011", "INV-012", "INV-014", "INV-017", "INV-018", "INV-038"]);
const arithmetic = (invoice) => checkInvoice(invoice).filter((e) => ARITHMETIC.has(e.rule)).map((e) => e.rule).sort();
const ready = plainAvailable() && existsSync(new URL("./plain/pint1-my-jur-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";

test("a flat row is a non-VAT scheme with no percentage", () => {
  assert.equal(isFlatTaxRow({ tax_scheme: "AAL", tax: 30 }), true);
  assert.equal(isFlatTaxRow({ tax_scheme: "AAL", tax_percent: 10, tax: 30 }), false);
  assert.equal(isFlatTaxRow({ tax_scheme: "VAT", tax: 30 }), false);
  assert.equal(isFlatTaxRow({ tax_category: "TTX", tax: 30 }), false);
  assert.equal(flatTaxTotal({ tax_breakdown: [{ tax_scheme: "AAL", tax: "30.00" }, { tax_percent: 8, tax: 60 }] }), 30);
  assert.equal(flatTaxTotal({ tax_breakdown: [{ tax_scheme: "AAL" }] }), null);
});

test("the reader takes the line's SST category even when the tourism tax comes first", () => {
  const invoice = parseUblInvoice(xml);
  assert.equal(invoice.lines[0].tax_percent, 8);
  assert.equal(invoice.lines[0].tax_category, "SE");
  assert.deepEqual(invoice.tax_breakdown[1], { taxable: 750, tax: 30, tax_category: "TTX", tax_scheme: "AAL" });
});

test("the made-up tourism tax invoice passes the built-in arithmetic", () => {
  assert.deepEqual(arithmetic(parseUblInvoice(xml)), []);
});

test("a tax total that leaves out the tourism tax is INV-018, with the right figure", () => {
  const invoice = parseUblInvoice(xml);
  invoice.totals.tax = 63.2;
  invoice.totals.gross = 853.2;
  const e = checkInvoice(invoice).find((x) => x.rule === "INV-018");
  assert.ok(e);
  assert.match(e.fix, /93\.20/);
});

test("a wrong SST row on a tourism tax file is still INV-038", () => {
  const invoice = parseUblInvoice(xml);
  invoice.tax_breakdown[0].tax = 79;
  invoice.totals.tax = 109;
  invoice.totals.gross = 899;
  const rules = inspectTaxBreakdown(invoice).map((e) => e.message);
  assert.equal(rules.length, 1);
  assert.match(rules[0], /row 1 tax amount does not equal taxable times the percentage/);
});

test("a flat row with no tax amount is INV-038, and the total is not judged", () => {
  const invoice = parseUblInvoice(xml);
  delete invoice.tax_breakdown[1].tax;
  assert.deepEqual(inspectTaxBreakdown(invoice).map((e) => e.path), ["/tax_breakdown/1/tax"]);
  assert.ok(!checkInvoice(invoice).some((e) => e.rule === "INV-018"));
});

test("with PINT MY's rules on, the file passes, and a wrong SST row is no longer hidden", { skip }, async () => {
  const blocking = async (source) => {
    const { reports } = await preflightDocuments([{ name: "x.xml", source }], { schematron: true });
    return reports[0].errors.filter(isBlocking).map((e) => e.rule).sort();
  };
  assert.deepEqual(await blocking(xml), []);
  // 790 x 8% is 63.20; the row says 79.00. Before 2026-11-13 the report dropped INV-038 here.
  const wrong = xml.replace('<cbc:TaxAmount currencyID="MYR">63.20</cbc:TaxAmount>', '<cbc:TaxAmount currencyID="MYR">79.00</cbc:TaxAmount>');
  assert.ok((await blocking(wrong)).includes("INV-038"));
});
