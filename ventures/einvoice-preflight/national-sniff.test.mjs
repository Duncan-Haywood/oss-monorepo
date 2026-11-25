// 2026-11-25: Mexico's and Brazil's checkers are 568 kB of the engine's 926 kB compressed, and an
// EU invoice uses neither. report.mjs sniffs with national-sniff.mjs and import()s the checker only
// for a file of its format (docs/history/einvoice-page-perf-2026-11-25-national-checkers-on-demand.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sniff from "./national-sniff.mjs";
import * as cfdi from "./cfdi.mjs";
import * as nfe from "./nfe.mjs";
import * as nfeEvent from "./nfe-event.mjs";
import * as nfse from "./nfse.mjs";
import * as abrasf from "./abrasf.mjs";
import * as dsf from "./dsf.mjs";
import { preflightDocuments } from "./report.mjs";

const HEAVY = ["./cfdi.mjs", "./nfe.mjs", "./nfe-event.mjs", "./nfse.mjs", "./abrasf.mjs", "./dsf.mjs"];

test("report.mjs keeps the Mexican and Brazilian checkers off its static imports", () => {
  const src = readFileSync(new URL("./report.mjs", import.meta.url), "utf8");
  const statics = [...src.matchAll(/^import\s[^;]*?from\s*"([^"]+)"/gm)].map((m) => m[1]);
  for (const mod of HEAVY) {
    assert.ok(!statics.includes(mod), `${mod} is a static import of report.mjs again`);
    assert.match(src, new RegExp(`await import\\("${mod.replace(/[.\/]/g, "\\$&")}"\\)`), `${mod} is not loaded on demand`);
  }
  assert.ok(statics.includes("./national-sniff.mjs"));
});

test("national-sniff.mjs imports nothing, so sniffing stays cheap", () => {
  const src = readFileSync(new URL("./national-sniff.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^\s*import\s/m);
});

test("each checker module re-exports the very sniffer report.mjs uses", () => {
  assert.equal(cfdi.looksLikeCfdi, sniff.looksLikeCfdi);
  assert.equal(nfe.looksLikeNfe, sniff.looksLikeNfe);
  assert.equal(nfe.NFE_NS, sniff.NFE_NS);
  assert.equal(nfeEvent.looksLikeNfeEvent, sniff.looksLikeNfeEvent);
  assert.equal(nfse.looksLikeNfse, sniff.looksLikeNfse);
  assert.equal(nfse.NFSE_NS, sniff.NFSE_NS);
  assert.equal(abrasf.looksLikeAbrasf, sniff.looksLikeAbrasf);
  assert.equal(dsf.looksLikeDsf, sniff.looksLikeDsf);
});

test("a CFDI and an NF-e are still read by their own checkers through the on-demand path", async () => {
  const cfdiXml = `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"></cfdi:Comprobante>`;
  const nfeXml = `<?xml version="1.0"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00"></infNFe></NFe>`;
  const { reports } = await preflightDocuments([{ name: "mx.xml", source: cfdiXml }, { name: "br.xml", source: nfeXml }]);
  assert.match(reports[0].envelope, /^Read as Mexican CFDI/);
  assert.match(reports[1].envelope, /^Read as Brazilian NF-e/);
});
