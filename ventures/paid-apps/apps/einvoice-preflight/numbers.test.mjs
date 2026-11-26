// Amounts the web page and the CLI must read the same way (numbers.mjs mirrors
// src/einvoice_preflight/numbers.py), plus two report guards. Red-team run
// 2026-11-11: Number() read "0x64" as 100, so a UBL or CII file with hex amounts
// passed the page clean while the CLI flagged it and a receiver (xs:decimal)
// rejects it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDecimal } from "./numbers.mjs";
import { checkInvoice } from "./checks.mjs";
import { buildChecklist, preflightDocuments } from "./report.mjs";

const VALID = {
  invoice_number: "INV-1", issue_date: "2026-08-24", currency: "EUR",
  supplier: { id: "S1", name: "Supplier" }, customer: { id: "C1", name: "Customer" },
  lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
  totals: { net: 200, tax: 38, gross: 238 },
};
const rules = (inv) => new Set(checkInvoice(inv).map((e) => e.rule));

test("plain numbers read as the CLI reads them", () => {
  for (const [text, want] of [["12.50", 12.5], [" 3 ", 3], ["-4", -4], ["+.5", 0.5], ["5.", 5], ["1e-7", 1e-7], [238, 238]]) {
    assert.equal(parseDecimal(text), want, String(text));
  }
});

test("what the CLI rejects is rejected", () => {
  for (const text of ["0x64", "0X64", "0b11", "0o7", "1_000", "١٢", "1,00", "NaN", "Infinity", "-Infinity",
    "", " ", ".", true, false, null, undefined, [5], {}, Infinity, NaN, "1e15", 1e15, "1e400"]) {
    assert.equal(parseDecimal(text), null, JSON.stringify(text) ?? String(text));
  }
  assert.equal(parseDecimal("99999999999999.99"), 99999999999999.99);
});

test("a JSON invoice with hex quantities and prices is invalid, as in the CLI", () => {
  const inv = structuredClone(VALID);
  Object.assign(inv.lines[0], { quantity: "0x2", unit_price: "0x64" });
  const found = rules(inv);
  assert.ok(found.has("INV-009"));
  assert.ok(found.has("INV-010"));
  const totals = structuredClone(VALID);
  totals.totals.net = "0xC8";
  assert.ok(rules(totals).has("INV-013"));
});

test("a UBL file with a hex amount does not pass the page clean", async () => {
  const source = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");
  const clean = await preflightDocuments([{ name: "ok.xml", source }]);
  assert.equal(clean.readErrors.length, 0);
  assert.equal(clean.reports[0].errors.filter((e) => e.severity !== "note" && e.severity !== "warning").length, 0);
  const hex = source.replace(/(<cbc:PriceAmount[^>]*>)([^<]*)</, (m, open, v) => `${open}0x${Math.round(Number(v)).toString(16)}<`);
  assert.notEqual(hex, source);
  const result = await preflightDocuments([{ name: "hex.xml", source: hex }]);
  const flagged = result.readErrors.length > 0 || result.reports[0].errors.length > 0;
  assert.ok(flagged, "hex amount read as a number");
});

test("a CII file with a hex amount does not pass the page clean", async () => {
  const source = readFileSync(new URL("./examples/cii-invoice.xml", import.meta.url), "utf8");
  const hex = source.replace(/(<ram:ChargeAmount[^>]*>)([^<]*)</, (m, open, v) => `${open}0x${Math.round(Number(v)).toString(16)}<`);
  assert.notEqual(hex, source);
  const result = await preflightDocuments([{ name: "hex.xml", source: hex }]);
  assert.ok(result.readErrors.length > 0 || result.reports[0].errors.length > 0, "hex amount read as a number");
});

test("the checklist counts a rule seen twice and leaves a single one bare", () => {
  const e = (rule, path) => ({ rule, path, message: "m", fix: "f" });
  const text = buildChecklist({ reports: [{ file: "a.xml", errors: [e("INV-012", "/lines/0"), e("INV-012", "/lines/1"), e("INV-013", "/totals/net")] }], readErrors: [] });
  assert.match(text, /INV-012 \(2 occurrence\(s\)\) at/);
  assert.match(text, /INV-013 at \/totals\/net/);
});

test("a JSON draft under the official-rules option keeps its built-in IBAN finding", async () => {
  // PINT and ZATCA drops apply only when an XML file draws those rule sets; a JSON draft has no XML.
  const inv = structuredClone(VALID);
  inv.payment = { iban: "not an iban" };
  const { reports } = await preflightDocuments([{ name: "d.json", source: JSON.stringify(inv) }], { schematron: true });
  assert.ok(reports[0].errors.some((x) => x.rule === "INV-024"));
});
