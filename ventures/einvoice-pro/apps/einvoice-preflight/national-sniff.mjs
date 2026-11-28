// The format sniffers for the Mexican and Brazilian national schemas, with nothing heavy behind
// them, so report.mjs can tell what a file is before it loads that format's checker.
//
// cfdi.mjs (Mexico's CFDI schema, postal catalogue, Carta Porte, CCE) and the Brazilian checkers
// (NF-e, NF-e events, national and municipal NFS-e, with the ABRASF schemas and the TOM city codes)
// were static imports of report.mjs, so the paid Worker compiled them on every cold start though
// the DE/FR product's UBL and CII invoices reach neither. report.mjs now sniffs with these
// functions and `import()`s a checker only for a file of that format, as the free edition has
// done since 2026-11-25 (docs/history/einvoice-pro-worker-cold-start-perf-2026-11-28.md).
// The functions are this copy's own, moved verbatim; the checker modules re-export them.
import { declaresNamespace } from "./xml-text.mjs";

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
export const NFSE_NS = "http://www.sped.fazenda.gov.br/nfse";

export function looksLikeCfdi(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?Comprobante[\s>]/.test(head) && /http:\/\/www\.sat\.gob\.mx\/cfd\/[34]/.test(head);
}

export function looksLikeNfe(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:NFe|nfeProc)[\s>]/.test(head) && declaresNamespace(head, NFE_NS);
}

export function looksLikeNfeEvent(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:envEvento|evento|procEventoNFe)[\s>]/.test(head) && declaresNamespace(head, NFE_NS);
}

export function looksLikeNfse(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:DPS|NFSe)[\s>]/.test(head) && declaresNamespace(head, NFSE_NS);
}

export const ABRASF_OWN_NS = /sistema\.com\.br\/Nfse\/arquivos\/nfse_3\.xsd|isscuritiba\.curitiba\.pr\.gov\.br\/iss\/nfse\.xsd|www\.e-nfs\.com\.br/;
export function looksLikeAbrasf(text) {
  const head = String(text).slice(0, 8192);
  // Ginfes 1.00 (www.ginfes.com.br/..._v03.xsd) and WebISS 1.00 (www.abrasf.org.br/nfse) are
  // ABRASF-model provider layouts with their own namespaces, read as such; so are ISSNet 1.00
  // (www.issnetonline.com.br/webserviceabrasf/vsd/...) and Betha 1.00
  // (www.betha.com.br/e-nota-contribuinte-ws).
  // The single-file 1.0x layouts add SimplISS 1.00 (www.sistema.com.br/Nfse/arquivos/nfse_3.xsd),
  // Curitiba's (isscuritiba.curitiba.pr.gov.br/iss/nfse.xsd) and Abaco 1.00 (www.e-nfs.com.br).
  return ABRASF_OWN_NS.test(head) || head.includes("abrasf.org.br/nfse.xsd") || head.includes("www.ginfes.com.br/") || head.includes("issnetonline.com.br/webserviceabrasf/vsd/") || head.includes("betha.com.br/e-nota-contribuinte-ws") || /abrasf\.org\.br\/nfse["'&]/.test(head) || head.includes("abrasf.org.br/ABRASF/arquivos/nfse.xsd") || /&lt;[A-Za-z]+[^&]*xmlns=&quot;http:\/\/www\.abrasf\.org\.br\/nfse\.xsd/.test(head);
}

export function looksLikeDsf(text) {
  return String(text).slice(0, 8192).includes("localhost:8080/WsNFe2/lote");
}
