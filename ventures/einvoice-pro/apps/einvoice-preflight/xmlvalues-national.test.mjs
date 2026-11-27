// INV-065 in the national readers (FatturaPA, FA(3), Facturae, NAV, ISDOC): a number
// or date with a no-break space that String.trim() hid. Added 2026-11-17;
// eval/nbsp-other-formats-2026-11-17.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFatturaPa } from "./fatturapa.mjs";
import { checkFa3 } from "./fa3.mjs";
import { checkFacturae } from "./facturae.mjs";
import { checkNavInvoice, checkNavInvoiceData } from "./hungary-nav.mjs";
import { parseIsdocInvoice } from "./isdoc.mjs";
import { checkInvoice } from "./checks.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const inv065 = (findings) => findings.filter((f) => f.rule === "INV-065");
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `exactly one ${from}`);
  return text.replace(from, to);
};

const CASES = [
  ["FatturaPA", read("./examples/fatturapa-invoice.xml"), "<ImportoTotaleDocumento>1320.00<", (x) => checkFatturaPa(x).findings, "/FatturaElettronica[1]/FatturaElettronicaBody[1]/DatiGenerali[1]/DatiGeneraliDocumento[1]/ImportoTotaleDocumento[1]"],
  ["FA(3)", read("./examples/fa3-invoice.xml"), "<P_15>1584.00<", (x) => checkFa3(x, { today: "2026-11-17" }).findings, "/Faktura[1]/Fa[1]/P_15[1]"],
  ["Facturae", read("./fixtures/facturae/valid-322.xml"), "<InvoiceTotal>1060.00<", (x) => checkFacturae(x, { today: "2026-11-17" }).findings, "/InvoiceTotal[1]"],
  ["NAV", read("./fixtures/hungary-nav/simplified.xml"), "<invoiceGrossAmount>33000<", (x) => checkNavInvoiceData(x, { reportDate: "2026-11-17" }).findings, "/invoiceGrossAmount[1]"],
];

for (const [name, xml, leaf, check, path] of CASES) {
  test(`${name}: the clean file draws no INV-065`, () => {
    assert.deepEqual(inv065(check(xml)), []);
  });
  test(`${name}: a no-break space after an amount is INV-065 on that element`, () => {
    const bad = once(xml, leaf, leaf.replace(/<$/, " <"));
    const found = inv065(check(bad));
    assert.equal(found.length, 1);
    assert.ok(found[0].path.endsWith(path), found[0].path);
    assert.match(found[0].message, /\[U\+00A0\]/);
    assert.match(found[0].message, /no-break space/);
  });
  test(`${name}: the same space on a text leaf is not INV-065`, () => {
    const firstText = xml.match(/>(?!true<|false<)([A-Za-z][A-Za-z ]{3,})</);
    const bad = xml.replace(firstText[0], `>${firstText[1]} <`);
    assert.deepEqual(inv065(check(bad)), []);
  });
}

test("NAV manageInvoice: the finding's path names its operation", () => {
  const data = once(read("./fixtures/hungary-nav/simplified.xml"), "<invoiceGrossAmount>33000<", "<invoiceGrossAmount>33000 <");
  const b64 = Buffer.from(data, "utf8").toString("base64");
  const req = `<ManageInvoiceRequest xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"><invoiceOperations><compressedContent>false</compressedContent><invoiceOperation><index>1</index><invoiceOperation>CREATE</invoiceOperation><invoiceData>${b64}</invoiceData></invoiceOperation></invoiceOperations></ManageInvoiceRequest>`;
  const found = inv065(checkNavInvoice(req).findings);
  assert.equal(found.length, 1);
  assert.match(found[0].path, /^\/ManageInvoiceRequest\/invoiceOperations\/invoiceOperation\[1\]\/invoiceData\/.*invoiceGrossAmount\[1\]$/);
});

const ISDOC = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2"><DocumentType>1</DocumentType><ID>2026001</ID><IssueDate>2026-10-01</IssueDate><LocalCurrencyCode>CZK</LocalCurrencyCode>
<AccountingSupplierParty><Party><PartyName><Name>Dodavatel s.r.o.</Name></PartyName></Party></AccountingSupplierParty>
<AccountingCustomerParty><Party><PartyName><Name>Odberatel a.s.</Name></PartyName></Party></AccountingCustomerParty>
<InvoiceLines><InvoiceLine><ID>1</ID><InvoicedQuantity>2</InvoicedQuantity><LineExtensionAmount>200</LineExtensionAmount><UnitPrice>100</UnitPrice><ClassifiedTaxCategory><Percent>21</Percent></ClassifiedTaxCategory><Item><Description>Prace</Description></Item></InvoiceLine></InvoiceLines>
<TaxTotal><TaxAmount>42</TaxAmount></TaxTotal>
<LegalMonetaryTotal><TaxExclusiveAmount>200</TaxExclusiveAmount><TaxInclusiveAmount>242</TaxInclusiveAmount><PayableAmount>242</PayableAmount></LegalMonetaryTotal></Invoice>`;

test("ISDOC (made-up file): clean draws no INV-065; a U+202F before the payable amount does", () => {
  assert.deepEqual(inv065(checkInvoice(parseIsdocInvoice(ISDOC))), []);
  const bad = once(ISDOC, "<PayableAmount>242<", "<PayableAmount> 242<");
  const found = inv065(checkInvoice(parseIsdocInvoice(bad)));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /\/Invoice\[1\]\/LegalMonetaryTotal\[1\]\/PayableAmount\[1\]/);
  assert.match(found[0].message, /narrow no-break space/);
});
