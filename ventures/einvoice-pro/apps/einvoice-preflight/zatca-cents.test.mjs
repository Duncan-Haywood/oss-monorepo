// fontoxpath 3.34's format-integer(1, '00') is "1", and plain-compile.mjs's format-number
// stand-in (u:fmt) used it for the cents, so 15.05 read "15.5". ZATCA's cut of BR-CO-17 and
// BR-S-09 rounds the expected subtotal VAT that way and passed files ZATCA rejects (fixed
// 2026-11-18). BR-KSA-51 compares two such strings (115.05 and 115.50 both "115.5"), but a
// second BR-KSA-51 assert in decimal arithmetic already caught that case; kept as a guard.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";

const skip = !(plainAvailable() && existsSync(new URL("./plain/zatca-ksa-ubl.json", import.meta.url))) && "npm i --no-save slimdom fontoxpath";
const sample = () => readFileSync(new URL("./examples/zatca-simplified-invoice.xml", import.meta.url), "utf8");
const fired = async (xml, rule) => (await runPlain(xml)).findings.some((f) => f.rule === rule);

test("BR-KSA-51: a line total of 115.05 where 100.00 + 15.50 = 115.50 is reported", { skip }, async () => {
  const line = (tax, total) => sample().replace(
    '<cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>\n      <cbc:RoundingAmount currencyID="SAR">115.00</cbc:RoundingAmount>',
    `<cbc:TaxAmount currencyID="SAR">${tax}</cbc:TaxAmount>\n      <cbc:RoundingAmount currencyID="SAR">${total}</cbc:RoundingAmount>`);
  assert.ok(line("15.50", "115.05") !== sample());
  assert.equal(await fired(line("15.50", "115.05"), "BR-KSA-51"), true);
  assert.equal(await fired(line("15.50", "115.50"), "BR-KSA-51"), false);
  assert.equal(await fired(line("15.05", "115.05"), "BR-KSA-51"), false);
});

test("BR-CO-17 and BR-S-09: 15% of 100.35 is 15.05, so a subtotal tax of 15.40 is reported", { skip }, async () => {
  const sub = (taxable, tax) => sample().replace(
    '<cbc:TaxableAmount currencyID="SAR">100.00</cbc:TaxableAmount>\n      <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>',
    `<cbc:TaxableAmount currencyID="SAR">${taxable}</cbc:TaxableAmount>\n      <cbc:TaxAmount currencyID="SAR">${tax}</cbc:TaxAmount>`);
  assert.ok(sub("100.35", "15.40") !== sample());
  for (const rule of ["BR-CO-17", "BR-S-09"]) {
    assert.equal(await fired(sub("100.35", "15.40"), rule), true, rule);
    assert.equal(await fired(sub("100.35", "15.05"), rule), false, rule);
  }
});
