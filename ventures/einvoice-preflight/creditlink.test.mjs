import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightDocuments } from "./report.mjs";

const SELLER = { id: "S1", name: "Supplier GmbH", vat_id: "DE136695976" };
const invoice = (over = {}) => ({
  invoice_number: "INV-1001",
  issue_date: "2026-08-24",
  currency: "EUR",
  supplier: SELLER,
  customer: { id: "C1", name: "Customer GmbH" },
  lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
  totals: { net: 200, tax: 38, gross: 238 },
  ...over,
});
const credit = (number, net, over = {}) => {
  const tax = Math.round(net * 19) / 100;
  return invoice({
    invoice_number: number,
    document_type: "credit_note",
    original_invoice: "INV-1001",
    lines: [{ description: "Credit", quantity: 1, unit_price: net, tax_percent: 19, net }],
    totals: { net, tax, gross: net + tax },
    ...over,
  });
};
const run = async (docs) => {
  const result = await preflightDocuments(docs.map((d, i) => ({ name: `f${i}.json`, source: JSON.stringify(d) })));
  return result.reports.map((r) => r.errors.map((e) => e.rule));
};

test("a partial credit against an invoice in the batch is clean", async () => {
  assert.deepEqual(await run([invoice(), credit("CN-1", 100)]), [[], []]);
});

test("credit notes that add up to more than the invoice are all flagged INV-057", async () => {
  assert.deepEqual(await run([invoice(), credit("CN-1", 150), credit("CN-2", 100)]), [[], ["INV-057"], ["INV-057"]]);
});

test("credits that add up exactly to the invoice are fine", async () => {
  assert.deepEqual(await run([invoice(), credit("CN-1", 150), credit("CN-2", 50)]), [[], [], []]);
});

test("a currency mismatch is INV-056 and does not add into the amount check", async () => {
  assert.deepEqual(await run([invoice(), credit("CN-1", 100, { currency: "USD" })]), [[], ["INV-056"]]);
});

test("an original issued by another seller is INV-058", async () => {
  const other = { id: "S2", name: "Other Ltd" };
  assert.deepEqual(await run([invoice(), credit("CN-1", 100, { supplier: other })]), [[], ["INV-058"]]);
});

test("an original that is not in the batch is left alone", async () => {
  assert.deepEqual(await run([credit("CN-1", 999)]), [[]]);
});

test("references match case-insensitively and ignore spaces at the ends", async () => {
  assert.deepEqual(await run([invoice(), credit("CN-1", 300, { original_invoice: " inv-1001 " })]), [[], ["INV-057"]]);
});

test("findings carry no invoice number or amount", async () => {
  const result = await preflightDocuments([invoice(), credit("CN-1", 300)].map((d, i) => ({ name: `f${i}.json`, source: JSON.stringify(d) })));
  const text = JSON.stringify(result.reports[1].errors);
  assert.doesNotMatch(text, /INV-1001|CN-1|338|357/);
});
