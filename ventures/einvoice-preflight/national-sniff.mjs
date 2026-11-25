// The format sniffers for the Mexican and Brazilian national schemas, with nothing heavy behind
// them, so report.mjs can tell what a file is before it loads that format's checker.
//
// cfdi.mjs (with Mexico's postal catalogue and Carta Porte, about 336 kB compressed) and the
// Brazilian checkers (NF-e, NF-e events, national and municipal NFS-e, with the ABRASF schemas
// and the TOM city codes, about 232 kB more) were static imports of report.mjs. Every check on
// the page downloaded and evaluated them, though a German UBL or CII invoice uses neither: 61% of
// the engine's 926 kB. report.mjs now sniffs with these functions and `import()`s the checker only
// for a file of that format (docs/history/einvoice-page-perf-2026-11-25-national-checkers-on-demand.md).
//
// The checker modules re-export their sniffer from here, so existing imports keep working.

export function looksLikeCfdi(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?Comprobante[\s>]/.test(head) && /http:\/\/www\.sat\.gob\.mx\/cfd\/[34]/.test(head);
}

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
// An xmlns or xmlns:prefix attribute whose value is exactly NFE_NS.
const NFE_NS_DECL = new RegExp(`\\sxmlns(?::[A-Za-z0-9_.-]+)?\\s*=\\s*(["'])${NFE_NS.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\1`);

export function looksLikeNfe(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:NFe|nfeProc)[\s>]/.test(head) && NFE_NS_DECL.test(head);
}

export function looksLikeNfeEvent(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:envEvento|evento|procEventoNFe)[\s>]/.test(head) && head.includes(NFE_NS);
}

export const NFSE_NS = "http://www.sped.fazenda.gov.br/nfse";
// An xmlns or xmlns:prefix attribute; the head declares NFSE_NS when one's value is exactly it
// (compared as a string, so no character of the namespace is read as a pattern).
const XMLNS_DECL = /\sxmlns(?::[A-Za-z0-9_.-]+)?\s*=\s*(["'])(.*?)\1/g;
const declaresNfseNs = (head) => [...String(head).matchAll(XMLNS_DECL)].some((m) => m[2] === NFSE_NS);

export function looksLikeNfse(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?(?:DPS|NFSe)[\s>]/.test(head) && declaresNfseNs(head);
}

// The single-file ABRASF-model layouts with their own namespaces (SimplISS, Curitiba, Abaco).
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
