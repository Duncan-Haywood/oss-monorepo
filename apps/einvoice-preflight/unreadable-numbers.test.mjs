import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkCfdi } from "./cfdi.mjs";

// Class guard (red team, 2026-11-12): a number the schema rejects ("abc", or empty) is named once,
// on itself. The arithmetic rules used to read it as 0 and then blame the correct values beside
// it: a right SubTotal, Total, tax summary or Pagos Totales. For every numeric attribute in the
// two example CFDIs, each finding must point at the attribute that was broken.
const CODES = new Set(["Version", "Folio", "LugarExpedicion", "NoCertificado", "DomicilioFiscalReceptor", "RegimenFiscal",
  "RegimenFiscalReceptor", "ClaveProdServ", "FormaPago", "FormaDePagoP", "Exportacion", "ObjetoImp", "ObjetoImpDR",
  "NumParcialidad", "Impuesto", "ImpuestoDR", "ImpuestoP", "Serie"]);

for (const fx of ["cfdi-4.0-invoice.xml", "cfdi-4.0-pago.xml"]) {
  test(`${fx}: an unreadable amount blames only itself`, () => {
    const good = readFileSync(new URL(`./fixtures/${fx}`, import.meta.url), "utf8");
    assert.deepEqual(checkCfdi(good).findings, []);
    const re = / ([A-Z][A-Za-z]+)="(-?\d+(?:\.\d+)?)"/g;
    let m, tried = 0;
    while ((m = re.exec(good))) {
      if (CODES.has(m[1])) continue;
      for (const bad of ["abc", ""]) {
        const x = good.slice(0, m.index) + ` ${m[1]}="${bad}"` + good.slice(m.index + m[0].length);
        const r = checkCfdi(x).findings;
        tried++;
        assert.ok(r.length, `${m[1]}="${bad}" at ${m.index} drew no finding`);
        for (const f of r) {
          assert.ok(f.path?.endsWith(`@${m[1]}`), `${m[1]}="${bad}" at offset ${m.index}: ${f.rule} blames ${f.path}: ${f.message}`);
        }
      }
    }
    assert.ok(tried >= 40, `only ${tried} attributes tried`);
  });
}
