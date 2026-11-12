// Offline checks for the Comercio Exterior 2.0 complement (Complemento para comercio
// exterior, namespace http://www.sat.gob.mx/ComercioExterior20) inside a CFDI 4.0: the
// export invoice (type I), credit note (E) or transfer (T) a Mexican exporter stamps for a
// definitive export (pedimento A1). Called by cfdi.mjs. Rule ids MX-060..MX-069 are this
// tool's own; each message names the SAT error code (CCE101..CCE172) it stands for.
//
// Sources, all fetched from omawww.sat.gob.mx on 2026-11-12:
//   Matriz_de_Errores_CCE_v2.0.xls   SAT's error matrix for the complement (CCE101..CCE172);
//   EstandarComercioExterior_v20.pdf the technical standard, section 4 "Validaciones
//                                    adicionales a realizar por el Proveedor" (the bound
//                                    formulas for ValorDolares);
//   Guia_complemento_Comercio_Exterior.pdf  the filling guide (revision of 2026-01-16), whose
//                                    Apéndice 4 works four invoices through by hand: the
//                                    fixtures fixtures/cfdi-4.0-cce20-*.xml are those four.
// Catalogue columns the XSD lacks (tariff codes in force and their unit, states by country,
// municipalities and localities by state, the state of each postal code, the postal-code
// and tax-id patterns of c_Pais) come from cce20-data.mjs (build-cce20-data.mjs).
//
// Layers:
//   1. the document (MX-060, MX-061): types I/E/T only, Exportacion 02 needs the complement
//      and 03 forbids it, one complement, only beside the complements SAT lists, no
//      InformacionGlobal, ACuentaTerceros or CuentaPredial, a transfer to oneself with
//      ObjetoImp 01;
//   2. ComercioExterior20.xsd and catComExt.xsd via cfdi.mjs's checkNode (MX-002..MX-006);
//   3. the header (MX-062, MX-063), the issuer's Mexican address (MX-064), the receiver
//      (MX-065), owners and addressees (MX-066);
//   4. goods against the CFDI's lines (MX-067), tariff codes and customs units (MX-068)
//      and the dollar values (MX-069), exact in BigInt.
// Not checkable offline and named in `skipped` when they arise: whether TipoCambioUSD is
// Banxico's FIX rate for the day (CCE121), a receiver's RFC in SAT's l_RFC list (CCE107), a
// tax id against a country's online register (CCE131, CCE135), the colonia of a postal code
// (CCE129, CCE136, CCE145), and the municipality and locality of a postal code (CCE130,
// CCE141, CCE150; only its state is checked). An offline observation, not SAT's or a PAC's
// acceptance, and not customs or tax advice.

import { dec, roundD, truncD, show } from "./pagos20.mjs";
import { PAISES, ESTADOS, MUNICIPIOS, LOCALIDADES, CP_ESTADO, FRACCIONES, VIGENCIA } from "./cce20-data.mjs";

export const CCE20_NS = "http://www.sat.gob.mx/ComercioExterior20";
const CCE11_NS = "http://www.sat.gob.mx/ComercioExterior11";

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

const childNs = (n, name, ns) => n?.children.find((c) => c.name === name && c.ns === ns);
const kidsNs = (n, name, ns) => (n ? n.children.filter((c) => c.name === name && c.ns === ns) : []);
const X = (n, name) => childNs(n, name, CCE20_NS);
const XK = (n, name) => kidsNs(n, name, CCE20_NS);

// Complements SAT lets this one sit beside (CCE115), by element name: Timbre Fiscal
// Digital, otros derechos e impuestos (implocal), leyendas fiscales, CFDI registro fiscal
// and Carta Porte (every version's root is CartaPorte).
const COEXIST = new Set(["TimbreFiscalDigital", "ImpuestosLocales", "LeyendasFiscales", "CFDIRegistroFiscal", "CartaPorte", "ComercioExterior"]);

// ---------- exact decimals at scale 24 ----------

const SCALE = 24n;
const ONE = 10n ** SCALE;
const mul = (a, b) => (a * b) / ONE;
const div = (a, b) => (b === 0n ? null : (a * ONE) / b);
const decimalsOf = (s) => {
  const t = String(s).trim();
  const i = t.indexOf(".");
  return i < 0 ? 0 : t.length - i - 1;
};
/** Half a unit in the last written decimal of `s`, as a scaled BigInt. */
const half = (s) => ONE / 10n ** BigInt(decimalsOf(s)) / 2n;
const EPS = ONE / 10n ** 12n; // the standard's 10^-12
/** Round up (toward +infinity) to d decimals; the standard's "redondear hacia arriba". */
function ceilD(a, d) {
  const q = 10n ** (SCALE - BigInt(d));
  const t = (a / q) * q;
  return t < a ? t + q : t;
}
const sum = (list) => list.reduce((s, v) => s + v, 0n);
const money = (v) => show(v, 2);

/**
 * The standard's limits for a product x*y, each widened by half a unit in its last written
 * decimal (ValorDolares from CantidadAduana x ValorUnitarioAduana, CCE169/CCE171): the lower
 * truncated to cents, the upper less 10^-12 on each factor and rounded up to cents.
 */
export function productLimits(x, y) {
  const a = dec(x), b = dec(y);
  if (a === null || b === null) return null;
  const lo = mul(a - half(x), b - half(y));
  const hi = mul(a + half(x) - EPS, b + half(y) - EPS);
  return [truncD(lo, 2), ceilD(hi, 2)];
}

/**
 * The standard's limits for an amount in the CFDI's currency turned into dollars
 * (NoIdentificacion, CCE157/CCE158): importe x TipoCambio / TipoCambioUSD, each widened by
 * half a unit in its last written decimal (an absent TipoCambio, pesos, is exactly 1). Each
 * rate is widened by its own decimals: the standard writes NumDecimalesTipoCambio for both,
 * which reads as the CFDI's rate, but using the narrower of the two would reject files the
 * guide's own examples call right. `importes` are the written amounts summed. An absent
 * TipoCambioUSD means the amounts are already dollars (a CFDI in USD): no rate at all.
 */
export function dollarLimits(importes, tipoCambio, tipoCambioUSD) {
  const vals = importes.map(dec);
  if (vals.some((v) => v === null)) return null;
  const s = sum(vals);
  const hs = importes.length ? importes.map(half).reduce((m, h) => (h > m ? h : m), 0n) : 0n;
  const tc = tipoCambio === undefined ? ONE : dec(tipoCambio);
  const usd = tipoCambioUSD === undefined ? ONE : dec(tipoCambioUSD);
  if (tc === null || usd === null || usd === 0n) return null;
  const htc = tipoCambio === undefined ? 0n : half(tipoCambio);
  const hu = tipoCambioUSD === undefined ? 0n : half(tipoCambioUSD);
  const lo = div(mul(s - hs, tc - htc), usd + (hu ? hu - EPS : 0n));
  const den = usd - hu;
  if (den <= 0n) return null;
  const hi = div(mul(s + hs - EPS, tc + (htc ? htc - EPS : 0n)), den);
  return [truncD(lo, 2), ceilD(hi, 2)];
}

// ---------- the tariff catalogue ----------

let fraccionMap = null;
/** The tariff codes in force, code -> UMT (the tariff's unit, c_UnidadAduana). */
export function fracciones() {
  if (fraccionMap) return fraccionMap;
  fraccionMap = new Map();
  for (const [umt, gaps] of Object.entries(FRACCIONES)) {
    let n = 0;
    for (const g of gaps.split(",")) {
      n += parseInt(g, 36);
      fraccionMap.set(String(n).padStart(10, "0"), umt);
    }
  }
  return fraccionMap;
}
/** A tariff code's [start, end] in force ("" end: still in force). Codes not listed in
 * VIGENCIA run from 2024-01-18 on. */
export function fraccionVigencia(code) {
  return VIGENCIA[code] || ["2024-01-18", ""];
}
/** Whether a tariff code is in force on `day` (YYYY-MM-DD): the catalogue's start and end
 * dates, both counted as in force. */
export function fraccionVigente(code, day) {
  if (!fracciones().has(code)) return false;
  const [start, end] = fraccionVigencia(code);
  if (!day) return true;
  return day >= start && (!end || day <= end);
}

/** The state of a Mexican postal code from c_CodigoPostal, or null. */
export function cpEstado(cp) {
  if (!/^\d{5}$/.test(cp || "")) return null;
  const n = Number(cp);
  let found = null;
  for (const [start, estado] of CP_ESTADO) {
    if (start > n) break;
    found = estado;
  }
  return found;
}

const inList = (list, code) => (list ? (Array.isArray(list) ? list : list.split(" ")).includes(code) : false);

// ---------- the checker ----------

/**
 * Check the Comercio Exterior side of a CFDI. `root` is the parsed cfdi:Comprobante; `ctx`
 * gives cfdi.mjs's helpers: {findings, skipped, checkNode, ELEMENTS, CFDI_NS, typeProblem,
 * currencyDecimals}.
 */
export function checkComercioExterior(root, ctx) {
  const { findings, skipped, checkNode, ELEMENTS, CFDI_NS, typeProblem, currencyDecimals } = ctx;
  const C = (n, name) => childNs(n, name, CFDI_NS);
  const CK = (n, name) => kidsNs(n, name, CFDI_NS);
  const a = root.attrs;
  const tipo = a.TipoDeComprobante;
  const complemento = C(root, "Complemento");
  const complements = (complemento?.children || []).filter((c) => c.name);
  const cce = complements.filter((c) => c.name === "ComercioExterior" && c.ns === CCE20_NS);
  const old = complements.filter((c) => c.name === "ComercioExterior" && c.ns === CCE11_NS);
  const base = "/Comprobante/Complemento/ComercioExterior";
  const push = (rule, code, message, fix, path) => findings.push(finding(rule, `${message} (SAT ${code})`, fix, path));

  if (old.length) {
    push("MX-060", "CCE999", "The CFDI carries Comercio Exterior 1.1; a CFDI 4.0 takes version 2.0 (SAT's guide for 4.0, in force since 2024-01-18), and 1.1 is not read here.", "Reissue the export with cce20:ComercioExterior Version=\"2.0\".", base);
  }
  if (a.Exportacion === "02" && !cce.length && !old.length) {
    push("MX-060", "CCE104", "Exportacion is 02 (definitive export) but the CFDI has no Comercio Exterior complement.", "Add cce20:ComercioExterior, or use Exportacion 01 if this is not an export.", "/Comprobante/@Exportacion");
  }
  if (!cce.length) return {};
  const node = cce[0];
  const meta = { exports: 1 };

  // ---- 1. the document ----
  if (cce.length > 1) push("MX-060", "CCE113", `The CFDI carries ${cce.length} Comercio Exterior complements; it takes one.`, "Merge the goods into one cce20:ComercioExterior.", base);
  if (!["I", "E", "T"].includes(tipo)) push("MX-060", "CCE101", `A Comercio Exterior complement goes on a type I, E or T CFDI, not ${tipo || "(none)"}.`, "Issue the export as an income (I), credit note (E) or transfer (T) CFDI.", "/Comprobante/@TipoDeComprobante");
  if (a.Exportacion === "03") push("MX-060", "CCE105", "Exportacion is 03 (temporary export) and that leaves the Comercio Exterior complement out.", "Remove the complement, or use Exportacion 02 for a definitive export.", "/Comprobante/@Exportacion");
  for (const c of complements) {
    if (!COEXIST.has(c.name)) push("MX-060", "CCE115", `The ${c.name} complement cannot sit beside Comercio Exterior; SAT allows only the stamp (TimbreFiscalDigital), otros derechos e impuestos, leyendas fiscales, CFDI registro fiscal and Carta Porte.`, `Issue the ${c.name} part as its own CFDI.`, `/Comprobante/Complemento/${c.name}`);
  }
  if (C(root, "InformacionGlobal")) push("MX-061", "CCE106", "An export CFDI carries no InformacionGlobal (that node is for a global invoice to the general public).", "Remove InformacionGlobal.", "/Comprobante/InformacionGlobal");
  const emisorRfc = C(root, "Emisor")?.attrs.Rfc || "";
  const receptor = C(root, "Receptor")?.attrs || {};
  if (tipo === "T" && receptor.Rfc !== undefined && receptor.Rfc !== emisorRfc) push("MX-061", "CCE108", "On a transfer (type T) with Comercio Exterior the receiver's RFC is the issuer's own.", "Set Receptor Rfc to the issuer's RFC; the foreign addressee goes in cce20:Destinatario.", "/Comprobante/Receptor/@Rfc");
  if (tipo === "I" && receptor.Rfc && receptor.Rfc !== "XEXX010101000") skipped.push("CCE107 (receiver RFC): a Mexican RFC must be in SAT's list of registered RFCs (l_RFC), which this offline check cannot read.");
  const conceptos = CK(C(root, "Conceptos"), "Concepto");
  conceptos.forEach((c, i) => {
    const p = `/Comprobante/Conceptos/Concepto[${i + 1}]`;
    if (tipo === "T" && c.attrs.ObjetoImp !== undefined && c.attrs.ObjetoImp !== "01") push("MX-061", "CCE110", `Line ${i + 1}: on a transfer (type T) with Comercio Exterior, ObjetoImp is 01, not ${c.attrs.ObjetoImp}.`, "Set ObjetoImp=\"01\".", `${p}/@ObjetoImp`);
    if (C(c, "ACuentaTerceros")) push("MX-061", "CCE111", `Line ${i + 1}: an export line carries no ACuentaTerceros.`, "Remove ACuentaTerceros; invoice third-party sales separately.", `${p}/ACuentaTerceros`);
    if (C(c, "CuentaPredial")) push("MX-061", "CCE112", `Line ${i + 1}: an export line carries no CuentaPredial.`, "Remove CuentaPredial.", `${p}/CuentaPredial`);
  });

  // ---- 2. the schema ----
  checkNode(node, "Comprobante/Complemento/ComercioExterior", findings, ELEMENTS.ComercioExterior, { ns: CCE20_NS, xsd: "ComercioExterior20.xsd", strip: "Comprobante/Complemento/" });
  const h = node.attrs;

  // ---- 3. the header ----
  const motivo = h.MotivoTraslado;
  const propietarios = XK(node, "Propietario");
  if (tipo === "T" && motivo === undefined) push("MX-062", "CCE102", "A transfer (type T) with Comercio Exterior names its MotivoTraslado.", "Add MotivoTraslado (c_MotivoTraslado: 01 to 05 or 99).", `${base}/@MotivoTraslado`);
  if (tipo !== "T" && motivo !== undefined) push("MX-062", "CCE103", `MotivoTraslado is only for a transfer (type T), not a type ${tipo} CFDI.`, "Remove MotivoTraslado.", `${base}/@MotivoTraslado`);
  if (tipo === "T" && motivo === "05" && !propietarios.length) push("MX-062", "CCE117", "MotivoTraslado 05 (goods owned by someone else) needs at least one Propietario.", "Add cce20:Propietario with the owner's NumRegIdTrib and ResidenciaFiscal.", `${base}/Propietario`);
  if (propietarios.length && !(tipo === "T" && motivo === "05")) push("MX-062", "CCE117", "Propietario is only for a transfer (type T) with MotivoTraslado 05.", "Remove the Propietario nodes, or set MotivoTraslado 05 on a type T CFDI.", `${base}/Propietario`);
  if (motivo === "01") {
    const rel = CK(root, "CfdiRelacionados");
    const uuids = rel.flatMap((r) => CK(r, "CfdiRelacionado").map((x) => x.attrs.UUID).filter(Boolean));
    if (!rel.some((r) => r.attrs.TipoRelacion) || !uuids.length) push("MX-062", "CCE116", "MotivoTraslado 01 (goods sold earlier) needs CfdiRelacionados with the UUID of the invoice that sold them.", "Add cfdi:CfdiRelacionados with TipoRelacion and the sale invoice's UUID.", "/Comprobante/CfdiRelacionados");
  }
  if (h.CertificadoOrigen === "1" && h.NumCertificadoOrigen === undefined) push("MX-062", "CCE118", "CertificadoOrigen is 1 (a certificate of origin was issued) but NumCertificadoOrigen is missing.", "Add the certificate's number in NumCertificadoOrigen.", `${base}/@NumCertificadoOrigen`);
  if (h.CertificadoOrigen === "0" && h.NumCertificadoOrigen !== undefined) push("MX-062", "CCE118", "NumCertificadoOrigen is filled though CertificadoOrigen is 0 (no certificate).", "Remove NumCertificadoOrigen, or set CertificadoOrigen=\"1\".", `${base}/@NumCertificadoOrigen`);
  const rx = X(node, "Receptor");
  const destinatarios = XK(node, "Destinatario");
  if (h.NumeroExportadorConfiable !== undefined) {
    const countries = [X(rx, "Domicilio")?.attrs.Pais, ...destinatarios.flatMap((d) => XK(d, "Domicilio").map((x) => x.attrs.Pais)), receptor.ResidenciaFiscal].filter(Boolean);
    if (!countries.some((c) => PAISES[c]?.group === "Unión Europea")) push("MX-062", "CCE119", `NumeroExportadorConfiable (the EU approved-exporter number) is for goods to a country c_Pais groups as Unión Europea; this export goes to ${countries.length ? [...new Set(countries)].join(", ") : "no country named"}.`, "Remove NumeroExportadorConfiable.", `${base}/@NumeroExportadorConfiable`);
  }
  if (a.Exportacion === "02" && h.Incoterm === undefined) push("MX-062", "CCE120", "Exportacion is 02 (definitive export) and that needs an Incoterm.", "Add Incoterm (c_INCOTERM, for example FCA or DAP).", `${base}/@Incoterm`);
  if (h.TipoCambioUSD !== undefined) skipped.push("CCE121 (TipoCambioUSD): whether it is Banxico's FIX rate for the day needs the published rate, which this offline check does not fetch.");

  // ---- 3b. the issuer ----
  const em = X(node, "Emisor");
  const emDom = X(em, "Domicilio");
  if (emisorRfc.length === 12 && em?.attrs.Curp !== undefined) push("MX-064", "CCE123", "The issuer is a company (12-character RFC) and a company has no CURP.", "Remove Emisor Curp.", `${base}/Emisor/@Curp`);
  if (emisorRfc.length === 13 && em?.attrs.Curp === undefined) push("MX-064", "CCE124", "The issuer is a person (13-character RFC) and needs its CURP in the complement's Emisor.", "Add cce20:Emisor with Curp.", `${base}/Emisor/@Curp`);
  if (emDom) {
    const d = emDom.attrs, p = `${base}/Emisor/Domicilio`;
    if (d.Pais !== undefined && d.Pais !== "MEX") push("MX-064", "CCE125", `The issuer's address is in Mexico: Pais MEX, not ${d.Pais}.`, "Set Pais=\"MEX\".", `${p}/@Pais`);
    mexicanAddress(d, p, "MX-064", { estado: "CCE126", municipio: "CCE127", localidad: "CCE128", colonia: "CCE129", cp: "CCE130" }, true);
  }

  // ---- 3c. the receiver ----
  const xexx = receptor.Rfc === "XEXX010101000";
  const rxNrit = rx?.attrs.NumRegIdTrib;
  if (xexx && rxNrit === undefined) push("MX-065", "CCE133", "The receiver is foreign (XEXX010101000), so the complement's Receptor carries its NumRegIdTrib.", "Add cce20:Receptor NumRegIdTrib, the receiver's tax id in its country.", `${base}/Receptor/@NumRegIdTrib`);
  if (!xexx && rxNrit !== undefined) push("MX-065", "CCE133", "NumRegIdTrib in the complement's Receptor is only for a foreign receiver (Rfc XEXX010101000).", "Remove NumRegIdTrib, or identify the receiver as XEXX010101000.", `${base}/Receptor/@NumRegIdTrib`);
  const rxDom = X(rx, "Domicilio");
  if (rxNrit !== undefined) taxId(rxNrit, rxDom?.attrs.Pais, `${base}/Receptor/@NumRegIdTrib`, "MX-065", "CCE134", "CCE135", "receiver");
  if (rxDom) foreignOrMexican(rxDom.attrs, `${base}/Receptor/Domicilio`, "MX-065", { colonia: "CCE136", localidad: "CCE137", municipio: "CCE138", estado: "CCE139", cpPattern: "CCE140", cp: "CCE141" });

  // ---- 3d. owners and addressees ----
  propietarios.forEach((o, i) => {
    taxId(o.attrs.NumRegIdTrib, o.attrs.ResidenciaFiscal, `${base}/Propietario[${i + 1}]/@NumRegIdTrib`, "MX-066", null, "CCE132", "owner");
  });
  if (tipo === "T" && destinatarios.length > 1) push("MX-066", "CCE142", `A transfer (type T) names one Destinatario; this one names ${destinatarios.length}.`, "Issue one transfer per addressee.", `${base}/Destinatario`);
  destinatarios.forEach((dn, i) => {
    const p = `${base}/Destinatario[${i + 1}]`;
    const doms = XK(dn, "Domicilio");
    if (dn.attrs.NumRegIdTrib !== undefined) for (const dm of doms.length ? doms : [{ attrs: {} }]) taxId(dn.attrs.NumRegIdTrib, dm.attrs.Pais, `${p}/@NumRegIdTrib`, "MX-066", "CCE143", "CCE144", "addressee");
    doms.forEach((dm, j) => foreignOrMexican(dm.attrs, `${p}/Domicilio[${j + 1}]`, "MX-066", { colonia: "CCE145", localidad: "CCE146", municipio: "CCE147", estado: "CCE148", cpPattern: "CCE149", cp: "CCE150" }));
  });

  // ---- 4. goods against the CFDI's lines ----
  const mercancias = XK(X(node, "Mercancias"), "Mercancia");
  meta.goods = mercancias.length;
  const byId = new Map();
  conceptos.forEach((c, i) => {
    const id = c.attrs.NoIdentificacion;
    if (id === undefined) { push("MX-067", "CCE151", `Line ${i + 1} has no NoIdentificacion; on an export each line carries the part or lot number its goods are declared under.`, "Add NoIdentificacion, the same value as the cce20:Mercancia it belongs to.", `/Comprobante/Conceptos/Concepto[${i + 1}]/@NoIdentificacion`); return; }
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(c);
  });
  const mercById = new Map();
  for (const m of mercancias) {
    const id = m.attrs.NoIdentificacion;
    if (!mercById.has(id)) mercById.set(id, []);
    mercById.get(id).push(m);
  }
  const seenPair = new Set();
  const CUSTOMS = ["CantidadAduana", "UnidadAduana", "ValorUnitarioAduana"];
  const anyCustoms = mercancias.some((m) => CUSTOMS.some((k) => m.attrs[k] !== undefined));
  const fecha = (a.Fecha || "").slice(0, 10);
  const moneda = a.Moneda;
  mercancias.forEach((m, i) => {
    const ma = m.attrs, p = `${base}/Mercancias/Mercancia[${i + 1}]`;
    const id = ma.NoIdentificacion;
    const lines = byId.get(id) || [];
    if (id !== undefined && !lines.length) push("MX-067", "CCE152", `Mercancia ${i + 1} (NoIdentificacion ${id}) matches no line of the CFDI.`, "Give the goods' line the same NoIdentificacion, or correct the Mercancia's.", `${p}/@NoIdentificacion`);
    const pair = `${id}|${ma.FraccionArancelaria ?? ""}`;
    if (seenPair.has(pair)) push("MX-067", "CCE153", `Mercancia ${i + 1} repeats NoIdentificacion ${id} with the same FraccionArancelaria as an earlier one.`, "Merge the two Mercancia nodes into one.", p);
    seenPair.add(pair);
    const has = CUSTOMS.filter((k) => ma[k] !== undefined);
    const repeated = lines.length > 1 || (mercById.get(id) || []).length > 1;
    if (has.length && has.length < 3) push("MX-067", "CCE165", `Mercancia ${i + 1} has ${has.join(" and ")} but not ${CUSTOMS.filter((k) => !has.includes(k)).join(" or ")}; the three customs fields go together.`, "Fill CantidadAduana, UnidadAduana and ValorUnitarioAduana, or none of them.", p);
    else if (!has.length && repeated) push("MX-067", "CCE165", `NoIdentificacion ${id} appears on more than one line or Mercancia, so Mercancia ${i + 1} needs CantidadAduana, UnidadAduana and ValorUnitarioAduana.`, "Fill the three customs fields.", p);
    else if (!has.length && anyCustoms) push("MX-067", "CCE166", `Another Mercancia carries customs quantities, so Mercancia ${i + 1} needs CantidadAduana, UnidadAduana and ValorUnitarioAduana too.`, "Fill the three customs fields on every Mercancia, or on none.", p);
    if (tipo === "T" && ma.CantidadAduana === undefined) {
      for (const c of lines) {
        const ca = c.attrs, li = conceptos.indexOf(c) + 1, lp = `/Comprobante/Conceptos/Concepto[${li}]`;
        if (!/^[0-9]{1,14}(\.[0-9]{1,3})?$/.test(ca.Cantidad || "") || dec(ca.Cantidad) < dec("0.001")) push("MX-067", "CCE154", `Line ${li}: without CantidadAduana on its Mercancia, a transfer's Cantidad is at least 0.001 with at most 3 decimals, not ${ca.Cantidad}.`, "Write Cantidad with up to 3 decimals, or add the customs fields to the Mercancia.", `${lp}/@Cantidad`);
        if (typeProblem({ ref: "c_UnidadAduana" }, ca.Unidad ?? "") || ca.Unidad === undefined) push("MX-067", "CCE155", `Line ${li}: without CantidadAduana on its Mercancia, a transfer's Unidad is a c_UnidadAduana code (01 kilo, 06 pieza, 99 servicio...), not ${ca.Unidad === undefined ? "absent" : `"${ca.Unidad}"`}.`, "Set Unidad to the c_UnidadAduana code, or add the customs fields to the Mercancia.", `${lp}/@Unidad`);
        if (!/^[0-9]{1,16}(\.[0-9]{1,4})?$/.test(ca.ValorUnitario || "") || decimalsOf(ca.ValorUnitario) > currencyDecimals(moneda)) push("MX-067", "CCE156", `Line ${li}: without CantidadAduana on its Mercancia, a transfer's ValorUnitario has at most 4 decimals and no more than ${moneda || "the currency"} allows, not ${ca.ValorUnitario}.`, "Round ValorUnitario, or add the customs fields to the Mercancia.", `${lp}/@ValorUnitario`);
      }
    }

    // ---- tariff code and customs unit ----
    const service = ma.UnidadAduana === "99" || lines.some((c) => c.attrs.ClaveUnidad === "E48");
    const fr = ma.FraccionArancelaria;
    if (fr !== undefined && service) push("MX-068", ma.UnidadAduana === "99" ? "CCE170" : "CCE159", `Mercancia ${i + 1} is a service (${ma.UnidadAduana === "99" ? "UnidadAduana 99" : "its line's ClaveUnidad is E48"}) and a service has no FraccionArancelaria.`, "Remove FraccionArancelaria.", `${p}/@FraccionArancelaria`);
    if (fr === undefined && !service) push("MX-068", "CCE160", `Mercancia ${i + 1} is goods (not UnidadAduana 99 or ClaveUnidad E48) and needs its FraccionArancelaria.`, "Add the 10-digit tariff code (8-digit fracción + 2-digit NICO).", `${p}/@FraccionArancelaria`);
    if (fr !== undefined) {
      const umt = fracciones().get(fr);
      if (!umt) push("MX-068", "CCE161", `FraccionArancelaria ${fr} is not a tariff code in SAT's current c_FraccionArancelaria (10 digits, fracción + NICO, in force since 2024-01-18).`, "Use the 10-digit code from the current TIGIE with its NICO.", `${p}/@FraccionArancelaria`);
      else if (!fraccionVigente(fr, fecha)) push("MX-068", "CCE161", `FraccionArancelaria ${fr} is not in force on the CFDI's date ${fecha} (in force ${fraccionVigencia(fr)[0]} to ${fraccionVigencia(fr)[1] || "now"}).`, "Use the code in force on the issue date.", `${p}/@FraccionArancelaria`);
      else if (ma.UnidadAduana !== undefined && ma.UnidadAduana !== umt) push("MX-068", "CCE161", `Mercancia ${i + 1}: UnidadAduana ${ma.UnidadAduana} is not the tariff unit of ${fr}, which is ${umt}.`, `Express CantidadAduana in unit ${umt} and set UnidadAduana="${umt}".`, `${p}/@UnidadAduana`);
      else if (ma.UnidadAduana === undefined) {
        for (const c of lines) if (c.attrs.Unidad !== umt) push("MX-068", "CCE162", `Line ${conceptos.indexOf(c) + 1}: without UnidadAduana on its Mercancia, the line's Unidad is the tariff unit of ${fr}, ${umt}, not ${c.attrs.Unidad === undefined ? "absent" : `"${c.attrs.Unidad}"`}.`, `Set Unidad="${umt}" on the line, or fill the Mercancia's customs fields.`, `/Comprobante/Conceptos/Concepto[${conceptos.indexOf(c) + 1}]/@Unidad`);
      }
    }
    if (ma.UnidadAduana !== undefined && ma.UnidadAduana !== "99" && ma.ValorUnitarioAduana !== undefined && dec(ma.ValorUnitarioAduana) !== null && dec(ma.ValorUnitarioAduana) <= 0n) push("MX-068", "CCE168", `Mercancia ${i + 1}: goods (UnidadAduana ${ma.UnidadAduana}) have a ValorUnitarioAduana above 0.`, "Enter the unit customs value in dollars.", `${p}/@ValorUnitarioAduana`);

    // ---- the dollar value of one Mercancia ----
    const vd = dec(ma.ValorDolares);
    if (vd === null) return;
    const zeroOrOne = vd === 0n || vd === ONE;
    if (vd === 0n && !service) push("MX-069", "CCE172", `Mercancia ${i + 1}: ValorDolares 0 is only for a service outside the customs value (UnidadAduana 99 or ClaveUnidad E48).`, "Enter the goods' value in dollars.", `${p}/@ValorDolares`);
    if (ma.CantidadAduana !== undefined && ma.ValorUnitarioAduana !== undefined && !zeroOrOne) {
      const lim = productLimits(ma.CantidadAduana, ma.ValorUnitarioAduana);
      if (lim && (vd < lim[0] || vd > lim[1])) push("MX-069", "CCE171", `Mercancia ${i + 1}: ValorDolares ${ma.ValorDolares} is outside CantidadAduana x ValorUnitarioAduana (${ma.CantidadAduana} x ${ma.ValorUnitarioAduana}, limits ${money(lim[0])} to ${money(lim[1])}).`, "Make ValorDolares the customs quantity times the unit customs value, or correct the two.", `${p}/@ValorDolares`);
    } else if (ma.CantidadAduana === undefined && !zeroOrOne && lines.length === 1 && (mercById.get(id) || []).length === 1 && tipo === "T") {
      // CCE172 for a transfer (CCE157/158 below cover I and E): the line's Importe in dollars.
      const lim = convert(lines.map((c) => c.attrs.Importe));
      if (lim && (vd < lim[0] || vd > lim[1])) push("MX-069", "CCE172", `Mercancia ${i + 1}: ValorDolares ${ma.ValorDolares} is not its line's Importe ${lines[0].attrs.Importe} ${moneda} in dollars (limits ${money(lim[0])} to ${money(lim[1])}).`, "Set ValorDolares to the line's Importe x TipoCambio / TipoCambioUSD.", `${p}/@ValorDolares`);
    }
  });

  // ---- the dollar values by NoIdentificacion (I and E) ----
  function convert(importes) {
    if (importes.some((v) => v === undefined)) return null;
    if (moneda === "XXX" || moneda === undefined) return null;
    // A CFDI in dollars: ValorDolares is the line's Importe whatever rate the parties
    // agreed (the guide's procedure 2 and its examples 2 and 3), so no conversion.
    if (moneda === "USD") return dollarLimits(importes, undefined, undefined);
    if (h.TipoCambioUSD === undefined) return null;
    return dollarLimits(importes, moneda === "MXN" ? undefined : a.TipoCambio, h.TipoCambioUSD);
  }
  if (tipo === "I" || tipo === "E") {
    for (const [id, ms] of mercById) {
      const lines = byId.get(id) || [];
      if (!lines.length) continue;
      const vds = ms.map((m) => dec(m.attrs.ValorDolares));
      if (vds.some((v) => v === null || v === 0n || v === ONE)) continue;
      const muestras = ms.some((m) => m.attrs.FraccionArancelaria === "9801000100");
      if (muestras) {
        // Samples (CCE163/CCE164): their dollar value is at most the lines' discounts.
        const desc = lines.map((c) => c.attrs.Descuento ?? "0");
        const lim = convert(desc);
        const vSamples = sum(ms.filter((m) => m.attrs.FraccionArancelaria === "9801000100").map((m) => dec(m.attrs.ValorDolares)));
        if (lim && vSamples > lim[1]) push("MX-069", "CCE164", `NoIdentificacion ${id}: the samples' ValorDolares (${money(vSamples)}) is more than the lines' Descuento in dollars (at most ${money(lim[1])}); samples (9801000100) are given away, so their value is discounted.`, "Discount the samples' value on their line, or correct ValorDolares.", `${base}/Mercancias/Mercancia/@ValorDolares`);
        continue;
      }
      const lim = convert(lines.map((c) => c.attrs.Importe));
      if (!lim) { if (moneda !== "XXX") skipped.push(`CCE158 (NoIdentificacion ${id}): an amount or exchange rate could not be read.`); continue; }
      const total = sum(vds);
      if (total < lim[0] || total > lim[1]) {
        const how = moneda === "USD" ? "the lines' Importe (a CFDI in dollars)" : moneda === "MXN" ? "the lines' Importe / TipoCambioUSD" : "the lines' Importe x TipoCambio / TipoCambioUSD";
        push("MX-069", "CCE158", `NoIdentificacion ${id}: ValorDolares ${money(total)} is not ${how}, limits ${money(lim[0])} to ${money(lim[1])}.`, "Recompute ValorDolares from the lines' Importe and the two exchange rates.", `${base}/Mercancias/Mercancia/@ValorDolares`);
      }
    }
  }

  // ---- TotalUSD ----
  const vdAll = mercancias.map((m) => dec(m.attrs.ValorDolares));
  const totalUSD = dec(h.TotalUSD);
  if (totalUSD !== null && vdAll.length && vdAll.every((v) => v !== null)) {
    const want = roundD(sum(vdAll), 2);
    if (totalUSD !== want) push("MX-063", "CCE122", `TotalUSD ${h.TotalUSD} is not the goods' ValorDolares summed and rounded to cents (${money(want)}).`, `Set TotalUSD="${money(want)}".`, `${base}/@TotalUSD`);
  }
  return meta;

  // ---------- address and tax-id helpers (hoisted) ----------

  function mexicanAddress(d, p, rule, codes, issuer) {
    const states = ESTADOS.MEX;
    if (d.Estado !== undefined && !inList(states, d.Estado)) {
      push(rule, codes.estado, `Estado ${d.Estado} is not a Mexican state code in c_Estado.`, "Use the three-letter c_Estado code (for example NLE, JAL, CMX).", `${p}/@Estado`);
      return;
    }
    if (d.Municipio !== undefined && d.Estado && !inList(MUNICIPIOS[d.Estado], d.Municipio)) push(rule, codes.municipio, `Municipio ${d.Municipio} is not a c_Municipio code of ${d.Estado}.`, `Use the municipality's three-digit code within ${d.Estado}.`, `${p}/@Municipio`);
    if (d.Localidad !== undefined && d.Estado && !inList(LOCALIDADES[d.Estado], d.Localidad)) push(rule, codes.localidad, `Localidad ${d.Localidad} is not a c_Localidad code of ${d.Estado}.`, `Use the locality's two-digit code within ${d.Estado}, or leave Localidad out.`, `${p}/@Localidad`);
    if (d.CodigoPostal !== undefined) {
      if (!issuer && typeProblem({ ref: "c_CodigoPostal" }, d.CodigoPostal)) push(rule, codes.cp, `CodigoPostal ${d.CodigoPostal} is not a Mexican postal code in c_CodigoPostal.`, "Use the address's five-digit postal code.", `${p}/@CodigoPostal`);
      else {
        const st = cpEstado(d.CodigoPostal);
        if (st && d.Estado && st !== d.Estado) push(rule, codes.cp, `CodigoPostal ${d.CodigoPostal} belongs to ${st} in c_CodigoPostal, not to Estado ${d.Estado}.`, "Correct the postal code or the state.", `${p}/@CodigoPostal`);
        else if (d.Municipio !== undefined) skipped.push(`${codes.cp} (${p.split("/").slice(-2, -1)[0]} postal code): only the state of ${d.CodigoPostal} is checked; its municipality and locality are not in this tool's tables.`);
      }
    }
    if (d.Colonia !== undefined && /^\d{4}$/.test(d.Colonia)) skipped.push(`${codes.colonia} (${p.split("/").slice(-2, -1)[0]} colonia ${d.Colonia}): the colonia catalogue by postal code is not in this tool's tables.`);
  }

  function foreignOrMexican(d, p, rule, codes) {
    const pais = d.Pais;
    if (pais === "MEX") { mexicanAddress(d, p, rule, codes, false); return; }
    if (pais !== undefined && pais !== "ZZZ" && ESTADOS[pais] && d.Estado !== undefined && !inList(ESTADOS[pais], d.Estado)) push(rule, codes.estado, `Estado "${d.Estado}" is not a c_Estado code of ${pais} (for ${pais} the state is written as its code, for example ${ESTADOS[pais].slice(0, 3).join(", ")}).`, `Use the c_Estado code of the ${pais} state.`, `${p}/@Estado`);
    const pat = PAISES[pais]?.cp;
    if (pat && d.CodigoPostal !== undefined && !new RegExp(`^(?:${pat})$`).test(d.CodigoPostal)) push(rule, codes.cpPattern, `CodigoPostal "${d.CodigoPostal}" does not fit ${pais}'s postal-code pattern in c_Pais (${pat}).`, "Write the postal code in the country's format.", `${p}/@CodigoPostal`);
  }

  function taxId(value, pais, path, rule, mexCode, patCode, who) {
    if (value === undefined) return;
    if (pais === "MEX") {
      if (mexCode) push(rule, mexCode, `A NumRegIdTrib (foreign tax id) for the ${who} goes with an address outside Mexico, and this one's country is MEX.`, "Remove NumRegIdTrib for a Mexican party, or correct the country.", path);
      return;
    }
    const c = PAISES[pais];
    if (!c) return;
    if (c.online) { skipped.push(`${patCode} (${who} NumRegIdTrib): ${pais}'s tax ids are checked against an online register (${c.online}).`); return; }
    if (c.rit && !new RegExp(`^(?:${c.rit})$`).test(value)) push(rule, patCode, `The ${who}'s NumRegIdTrib "${value}" does not fit ${pais}'s tax-id pattern in c_Pais (${c.rit}).`, `Write the ${who}'s tax id in ${pais}'s format (for ${pais}, ${c.rit}), without dashes or spaces.`, path);
  }
}
