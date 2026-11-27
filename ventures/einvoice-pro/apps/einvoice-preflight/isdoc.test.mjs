import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeIsdoc, preflightDocuments, ISDOC_MESSAGE } from "./report.mjs";
import { readFileSync } from "node:fs";

const isdoc = '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2"><ID>1</ID></Invoice>';

test("ISDOC is recognised by its namespace, UBL is not", () => {
  assert.equal(looksLikeIsdoc(isdoc), true);
  assert.equal(looksLikeIsdoc(readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8")), false);
  assert.equal(looksLikeIsdoc("<Invoice><ID>1</ID></Invoice>"), false);
});

const full = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2"><DocumentType>1</DocumentType><ID>2026001</ID><IssueDate>2026-10-01</IssueDate><LocalCurrencyCode>CZK</LocalCurrencyCode>
<AccountingSupplierParty><Party><PartyName><Name>Dodavatel s.r.o.</Name></PartyName></Party></AccountingSupplierParty>
<AccountingCustomerParty><Party><PartyName><Name>Odberatel a.s.</Name></PartyName></Party></AccountingCustomerParty>
<InvoiceLines><InvoiceLine><ID>1</ID><InvoicedQuantity>2</InvoicedQuantity><LineExtensionAmount>200</LineExtensionAmount><UnitPrice>100</UnitPrice><ClassifiedTaxCategory><Percent>21</Percent></ClassifiedTaxCategory><Item><Description>Prace</Description></Item></InvoiceLine></InvoiceLines>
<TaxTotal><TaxAmount>__TAX__</TaxAmount></TaxTotal>
<LegalMonetaryTotal><TaxExclusiveAmount>200</TaxExclusiveAmount><TaxInclusiveAmount>__GROSS__</TaxInclusiveAmount><PayableAmount>__GROSS__</PayableAmount></LegalMonetaryTotal></Invoice>`;

test("ISDOC is read best-effort and checked with the neutral rules (made-up file)", async () => {
  const good = await preflightDocuments([{ name: "a.isdoc", source: full.replaceAll("__TAX__", "42").replaceAll("__GROSS__", "242") }]);
  assert.equal(good.readErrors.length, 0);
  assert.match(good.reports[0].envelope, /ISDOC.*unverified/);
  const bad = await preflightDocuments([{ name: "b.isdoc", source: full.replaceAll("__TAX__", "40").replaceAll("__GROSS__", "250") }]);
  assert.ok(bad.reports[0].errors.length > good.reports[0].errors.length);
});

test("an ISDOC file the reader cannot parse still gets the plain message", async () => {
  const out = await preflightDocuments([{ name: "faktura.isdoc", source: isdoc.replace("<ID>1</ID>", "") .replace("Invoice", "Faktura").replace("/Invoice", "/Faktura") }]);
  assert.equal(out.reports.length, 0);
  assert.ok(out.readErrors[0].error.startsWith(ISDOC_MESSAGE));
});

test("a UBL file in the same batch is still checked", async () => {
  const ubl = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");
  const out = await preflightDocuments([{ name: "a.isdoc", source: isdoc }, { name: "b.xml", source: ubl }]);
  assert.equal(out.reports.length, 2);
});
