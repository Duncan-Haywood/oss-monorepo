// One guard over every national reader: an amount written as hex, with an exponent or with a decimal
// comma is not a schema decimal, and each reader must say so under its own schema rule. Number() takes
// "0x10" as 16 and "1e3" as 1000, so a reader that only calls Number() reads them silently; the
// Hungarian reader did until its schema gate (HU-030) landed on 2026-11-15. A new reader goes in this table.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNavInvoice } from "./hungary-nav.mjs";
import { checkFa3 } from "./fa3.mjs";
import { checkFatturaPa } from "./fatturapa.mjs";
import { checkFacturae } from "./facturae.mjs";
import { checkCfdi } from "./cfdi.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const READERS = [
  ["Hungary NAV", checkNavInvoice, read("./fixtures/hungary-nav/foreign-currency.xml"), /<invoiceVatAmount>[^<]+</, (v) => `<invoiceVatAmount>${v}<`, "HU-030"],
  ["Poland FA(3)", checkFa3, read("./examples/fa3-invoice.xml"), /<P_15>[^<]+</, (v) => `<P_15>${v}<`, "PL-015"],
  ["Italy FatturaPA", checkFatturaPa, read("./examples/fatturapa-invoice.xml"), /<ImportoTotaleDocumento>[^<]+</, (v) => `<ImportoTotaleDocumento>${v}<`, "IT-021"],
  ["Spain Facturae", checkFacturae, read("./fixtures/facturae/valid-322.xml"), /<TotalGrossAmount>[^<]+</, (v) => `<TotalGrossAmount>${v}<`, "ES-021"],
  ["Mexico CFDI", checkCfdi, read("./fixtures/cfdi-4.0-invoice.xml"), /Total="3850\.50"/, (v) => `Total="${v}"`, "MX-003"],
];

for (const [name, check, xml, find, put, rule] of READERS) {
  test(`${name}: a non-decimal amount is a ${rule} finding`, () => {
    assert.ok(find.test(xml), `${name}: fixture lost the amount this test edits`);
    assert.ok(!check(xml).findings.some((f) => f.rule === rule), `${name}: clean fixture already has ${rule}`);
    for (const bad of ["0x10", "1e3", "12,50"]) {
      const f = check(xml.replace(find, put(bad))).findings;
      assert.ok(f.some((x) => x.rule === rule), `${name} ${bad}: ${JSON.stringify(f.map((x) => `${x.rule} ${x.message}`))}`);
    }
  });
}
