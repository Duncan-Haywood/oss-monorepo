// BT-63 (the tax representative's VAT number) and INV-064 (PEPPOL-COMMON-R056-2's
// Dutch VAT shape). eval/nl-vat-r056-2-differential.mjs runs Peppol's own
// assertion on the same kind of files (eval/nl-vat-r056-2-differential-2026-11-17.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { checkInvoice } from "./checks.mjs";
import { inspectNlVatShape } from "./vat.mjs";

const UBL = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const CII = readFileSync(new URL("./examples/cii-invoice.xml", import.meta.url), "utf8");
const vatRules = (findings, path) => findings.filter((f) => ["INV-022", "INV-023", "INV-064"].includes(f.rule) && f.path === path).map((f) => [f.rule, f.severity || "error"]);

const ublRep = (vat) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:TaxRepresentativeParty><cac:PartyName><cbc:Name>Fiscal Rep BV</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>${vat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:TaxRepresentativeParty>`);
const ciiRep = (vat) => CII.replace("</ram:BuyerTradeParty>", `$&<ram:SellerTaxRepresentativeTradeParty><ram:Name>Fiscal Rep BV</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${vat}</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTaxRepresentativeTradeParty>`);

test("UBL and CII readers keep the tax representative's VAT number (BT-63)", () => {
  assert.deepEqual(parseUblInvoice(ublRep("NL123456782B01")).tax_representative, { vat_id: "NL123456782B01" });
  assert.deepEqual(parseCiiInvoice(ciiRep("NL123456782B01")).tax_representative, { vat_id: "NL123456782B01" });
  assert.equal(parseUblInvoice(UBL).tax_representative, undefined);
});

test("a valid tax representative VAT number draws nothing", () => {
  for (const xml of [ublRep("NL123456782B01"), ciiRep("NL002455799B11")]) {
    const parse = xml === CII || xml.includes("ram:") ? parseCiiInvoice : parseUblInvoice;
    assert.deepEqual(vatRules(checkInvoice(parse(xml)), "/tax_representative/vat_id"), []);
  }
});

test("a mistyped tax representative VAT number fails INV-023 or INV-022, as the seller's does", () => {
  assert.deepEqual(vatRules(checkInvoice(parseUblInvoice(ublRep("NL123456783B01"))), "/tax_representative/vat_id"), [["INV-023", "error"]]);
  assert.deepEqual(vatRules(checkInvoice(parseCiiInvoice(ciiRep("NL12345678B01"))), "/tax_representative/vat_id"), [["INV-022", "error"]]);
  const finding = checkInvoice(parseUblInvoice(ublRep("DE13669597"))).find((f) => f.path === "/tax_representative/vat_id");
  assert.match(finding.message, /^Tax representative VAT identifier/);
});

test("INV-064 warns on a valid Dutch number written with spaces, dots or a lowercase b (Peppol R056-2)", () => {
  for (const vat of ["NL 123456782 B01", "NL123456782.B01", "NL123456782b01", "NL123456782-B01"]) {
    assert.deepEqual(vatRules(checkInvoice(parseUblInvoice(ublRep(vat))), "/tax_representative/vat_id"), [["INV-064", "warning"]], vat);
    assert.deepEqual(vatRules(checkInvoice(parseCiiInvoice(CII.replace(">DE136695976<", `>${vat}<`))), "/supplier/vat_id"), [["INV-064", "warning"]], vat);
  }
});

test("INV-064 stays out of what R056-2 does not read", () => {
  assert.deepEqual(inspectNlVatShape({ vat_id: "nl123456782b01" }, "supplier"), []);
  assert.deepEqual(inspectNlVatShape({ vat_id: "  NL123456782B01 " }, "supplier"), []);
  assert.deepEqual(inspectNlVatShape({ vat_id: "DE 136695976" }, "supplier"), []);
  assert.equal(inspectNlVatShape({ vat_id: "NL123456782B01 " }, "supplier").length, 1);
});

test("a JSON invoice's tax representative VAT number is checked too", () => {
  const invoice = parseUblInvoice(UBL);
  invoice.tax_representative = { vat_id: "NL123456783B01" };
  assert.deepEqual(vatRules(checkInvoice(invoice), "/tax_representative/vat_id"), [["INV-023", "error"]]);
});
