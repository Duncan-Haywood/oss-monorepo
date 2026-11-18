// Offline checks for a Mexican CFDI 4.0 (Comprobante Fiscal Digital por Internet)
// XML file, the format a PAC stamps for SAT. CFDI is not EN 16931, so none of the
// UBL/CII rules apply. Rule ids are MX-nnn and are this tool's own, not SAT's
// CFDI40xxx error codes (the Anexo 20 error matrix was not read). Three layers:
//   1. the schema: elements, order, required attributes, patterns, lengths and
//      catalogue codes, read from SAT's cfdv40.xsd, tdCFDI.xsd and catCFDI.xsd by
//      build-cfdi-schema.mjs into cfdi-xsd-data.mjs;
//   2. the sums: line amounts, discounts, line taxes, the tax summary and the total,
//      rounded to the currency's decimals the way CfdiUtils (MIT) recomputes them;
//   3. a handful of well-known 4.0 consistency rules (general public and foreign
//      receivers, PPD with payment form 99, MXN exchange rate, T and P documents).
//   4. regimes and uses (MX-015..MX-017): each regime and UsoCFDI against the kind of
//      RFC (person or company) and each use against the receiver's regime, from SAT's
//      catCFDI spreadsheet columns, read by build-cfdi-regimen.mjs into cfdi-regimen-data.mjs.
// A type P (payment) CFDI's Pagos 2.0 complement is read by pagos20.mjs (MX-040..MX-049);
// a type N (payroll) CFDI's Nómina 1.2 complement by nomina12.mjs (MX-050..MX-057); an
// export's Comercio Exterior 2.0 complement by cce20.mjs (MX-060..MX-069); a waybill's
// Carta Porte 3.1 complement by cartaporte31.mjs (MX-070..MX-080).
// A check that depends on something this reader does not model (local taxes in the
// implocal complement) is skipped and named in `skipped`. An
// offline observation, not SAT's or a PAC's acceptance, and not tax advice. Findings
// never repeat an RFC.

import { ELEMENTS, TYPES } from "./cfdi-xsd-data.mjs";
import { checkRfc } from "./mexico.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { checkPagos } from "./pagos20.mjs";
import { checkNomina } from "./nomina12.mjs";
import { checkComercioExterior } from "./cce20.mjs";
import { checkCartaPorte } from "./cartaporte31.mjs";
import { REGIMEN, USO } from "./cfdi-regimen-data.mjs";

export { parseCfdiXml };

export const CFDI_NS = "http://www.sat.gob.mx/cfd/4";

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function looksLikeCfdi(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?Comprobante[\s>]/.test(head) && /http:\/\/www\.sat\.gob\.mx\/cfd\/[34]/.test(head);
}

// ---------- schema layer ----------

function inRuns(type, value) {
  if (!new RegExp(`^\\d{${type.width}}$`).test(value)) return false;
  const n = Number(value);
  let lo = 0, hi = type.runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, len] = type.runs[mid];
    if (n < start) hi = mid - 1;
    else if (n >= start + len) lo = mid + 1;
    else return true;
  }
  return false;
}

const patternCache = new Map();
function patternTest(p, v) {
  if (!patternCache.has(p)) patternCache.set(p, new RegExp(`^(?:${p})$`, "u"));
  return patternCache.get(p).test(v);
}

/** Why `raw` does not fit `type`, or "" when it does. */
export function typeProblem(typeIn, raw) {
  const type = typeIn.ref ? TYPES[typeIn.ref] : typeIn;
  if (!type) return "";
  const v = type.collapse ? raw.replace(/\s+/g, " ").trim() : raw;
  const label = typeIn.ref ? ` (${typeIn.ref})` : "";
  if (type.enum && !type.enum.includes(v)) return `is not a code in SAT's catalogue${label}`;
  if (type.runs && !inRuns(type, v)) return `is not a code in SAT's catalogue${label}`;
  const len = [...v].length;
  if (type.length !== undefined && len !== type.length) return `should be ${type.length} characters long, not ${len}`;
  if (type.minLength !== undefined && len < type.minLength) return `is shorter than ${type.minLength} characters`;
  if (type.maxLength !== undefined && len > type.maxLength) return `is longer than ${type.maxLength} characters`;
  if (type.pattern && !patternTest(type.pattern, v)) return `does not match the schema's pattern${label}`;
  if (["decimal", "short", "int"].includes(type.base)) {
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(v)) return "is not a number";
    // libxml2 (xmllint, and the many tools built on it) rejects a decimal of more than
    // 24 digits; XML Schema 1.0 promises only 18. No real amount is that long.
    if (v.replace(/^[+-]?0*/, "").replace(".", "").length > 24) return "has more digits than schema validators accept";
    // fractionDigits limits the value, not the spelling: "27.8900" has two (xmllint and a
    // real PAC accept it under fractionDigits 2). Currency decimals are checked elsewhere.
    if (type.fractionDigits !== undefined && decimalsOf(v.replace(/(\.\d*?)0+$/, "$1")) > type.fractionDigits) return `has more than ${type.fractionDigits} decimals`;
    if (type.minInclusive !== undefined && Number(v) < Number(type.minInclusive)) return `is below the minimum ${type.minInclusive}`;
    if (type.maxInclusive !== undefined && Number(v) > Number(type.maxInclusive)) return `is above the maximum ${type.maxInclusive}`;
    if (type.minExclusive !== undefined && Number(v) <= Number(type.minExclusive)) return `must be greater than ${type.minExclusive}`;
  }
  return "";
}

// `ctx` says which schema the node belongs to: its namespace, the XSD named in fixes, and
// the prefix to drop from `path` to reach the ELEMENTS key (the Pagos complement's keys
// start at "Pagos").
const CFDI_CTX = { ns: "http://www.sat.gob.mx/cfd/4", xsd: "cfdv40.xsd", strip: "" };

function checkNode(node, path, out, def, ctx = CFDI_CTX) {
  const where = "/" + path;
  // attributes
  const known = new Set(def.attrs.map((a) => a.n));
  for (const a of def.attrs) {
    const v = node.attrs[a.n];
    if (v === undefined) {
      if (a.req) out.push(finding("MX-002", `${path.split("/").pop()} is missing the required attribute ${a.n}.`, `Add ${a.n} (required by ${ctx.xsd}).`, `${where}/@${a.n}`));
      continue;
    }
    const why = typeProblem(a.type, v);
    if (why) out.push(finding("MX-003", `${a.n} on ${path.split("/").pop()} ${why}.`, `Correct ${a.n} to a value ${ctx.xsd} accepts.`, `${where}/@${a.n}`));
    if (a.fixed !== undefined && v !== a.fixed) out.push(finding("MX-003", `${a.n} must be "${a.fixed}".`, `Set ${a.n}="${a.fixed}".`, `${where}/@${a.n}`));
  }
  for (const k of Object.keys(node.attrs)) {
    if (k.includes(":") || known.has(k)) continue;
    out.push(finding("MX-004", `${path.split("/").pop()} carries an attribute the schema does not define: ${k}.`, `Remove ${k} or check its spelling (attributes are case-sensitive).`, `${where}/@${k}`));
  }
  if (def.any) return; // Complemento / Addenda / ACuentaTerceros parts: free content
  // children, in sequence
  const kids = node.children.filter((c) => c.name);
  const order = def.seq.map((s) => s.el);
  let pos = 0;
  const counts = {};
  for (const c of kids) {
    const idx = c.ns === ctx.ns ? order.indexOf(c.name) : -1;
    if (idx < 0) {
      out.push(finding("MX-005", `${path.split("/").pop()} contains an element the schema does not allow there: ${c.prefix ? c.prefix + ":" : ""}${c.name}.`, "Remove it, or move it into Complemento (complements) or Addenda (anything else).", `${where}/${c.name}`));
      continue;
    }
    if (!def.choice && idx < pos) {
      out.push(finding("MX-005", `${c.name} is out of order inside ${path.split("/").pop()}; the schema wants ${order.join(", ")} in that order.`, "Reorder the elements to the schema's sequence.", `${where}/${c.name}`));
    }
    pos = Math.max(pos, idx);
    counts[c.name] = (counts[c.name] || 0) + 1;
    checkNode(c, `${path}/${c.name}`, out, ELEMENTS[`${schemaPath(path).slice(ctx.strip.length)}/${c.name}`], ctx);
  }
  for (const s of def.seq) {
    const n = counts[s.el] || 0;
    if (!def.choice && n < s.min) out.push(finding("MX-006", `${path.split("/").pop()} is missing the required element ${s.el}.`, `Add ${s.el} (required by ${ctx.xsd}).`, `${where}/${s.el}`));
    if (s.max !== -1 && n > s.max) out.push(finding("MX-006", `${s.el} appears ${n} times inside ${path.split("/").pop()}; the schema allows ${s.max}.`, `Keep at most ${s.max} ${s.el}.`, `${where}/${s.el}`));
  }
  if (def.choice && kids.length === 0 && def.seq.length) {
    out.push(finding("MX-006", `${path.split("/").pop()} is empty; it needs one of ${def.seq.map((s) => s.el).join(" or ")}.`, "Add the missing child or remove the empty element.", where));
  }
}

// The data's keys drop repeated indexes: "Comprobante/Conceptos/Concepto" for every line.
function schemaPath(path) {
  return path.replace(/\[\d+\]/g, "");
}

// ---------- numbers ----------

export function decimalsOf(s) {
  const t = String(s).trim(); // the schema collapses whitespace: " 3848.58 " has 2 decimals
  const i = t.indexOf(".");
  return i < 0 ? 0 : t.length - i - 1;
}
// The schema's decimal syntax, after its whitespace collapse: Number() alone would read
// "0x10" as 16, "1e3" as 1000 and " " as 0, values typeProblem already calls not numbers.
const num = (v) => {
  if (v === undefined) return null;
  const s = String(v).trim();
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s) ? Number(s) : null;
};
// Present but not a number: the schema check names it (MX-003), and the sums that would read it
// as 0 are skipped, so the correct values beside it are not blamed.
const unreadable = (v) => v !== undefined && num(v) === null;
function roundTo(x, d) {
  const f = 10 ** d;
  // toPrecision(12) first, as checks.mjs does: 0.285 * 100 is 28.499999999999996.
  return Math.sign(x) * Math.round(Number((Math.abs(x) * f).toPrecision(12))) / f;
}

/** Decimals SAT allows for a currency. SAT's c_Moneda carries the count; the XSD does
 * not, so this uses ISO 4217's minor units (MXN, USD, EUR 2; JPY, CLP 0; KWD 3; CLF 4).
 * Not Intl: its digits are CLDR's display digits, which give COP, HUF, IDR, PKR and IQD 0
 * (ISO: 2, 2, 2, 2, 3) and change with the runtime's ICU version (red team 2026-11-12). */
const ISO_MINOR_UNITS = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0,
  UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};
export function currencyDecimals(code) {
  return ISO_MINOR_UNITS[code] ?? 2;
}

/** Lower and upper bounds for a line's Importe from Cantidad x ValorUnitario, each widened
 * by half a unit in its last written decimal (the bound rule Anexo 20 describes for 3.3 and
 * 4.0, as documented by PAC vendors; the primary text was not read). */
export function importeBounds(cantidad, valor, importeDecimals) {
  const hc = 10 ** -decimalsOf(cantidad) / 2, hv = 10 ** -decimalsOf(valor) / 2;
  const c = Number(cantidad), v = Number(valor), f = 10 ** importeDecimals;
  const lo = Math.floor((c - hc) * (v - hv) * f + 1e-9) / f;
  const hi = Math.ceil((c + hc) * (v + hv) * f - 1e-9) / f;
  return [lo, hi];
}

/** Bounds for a tax line's Importe from Base x TasaOCuota, the same half-unit rule on Base. */
export function taxBounds(base, rate, importeDecimals) {
  const hb = 10 ** -decimalsOf(base) / 2, b = Number(base), r = Number(rate), f = 10 ** importeDecimals;
  return [Math.floor((b - hb) * r * f + 1e-9) / f, Math.ceil((b + hb) * r * f - 1e-9) / f];
}

// ---------- the checker ----------

const child = (n, name) => n?.children.find((c) => c.name === name && c.ns === CFDI_NS);
const kidsOf = (n, name) => (n ? n.children.filter((c) => c.name === name && c.ns === CFDI_NS) : []);

// ---------- regimes and uses (SAT's catCFDI spreadsheet columns) ----------

/** "fisica" for a 13-character RFC, "moral" for 12, null for a generic or unreadable one. */
export function personType(rfc) {
  const s = String(rfc || "").trim().toUpperCase();
  if (s === "XAXX010101000" || s === "XEXX010101000") return null;
  return s.length === 13 ? "fisica" : s.length === 12 ? "moral" : null;
}

const PERSON = { fisica: "a person (13-character RFC, persona física)", moral: "a company (12-character RFC, persona moral)" };
const listOf = (codes) => codes.join(", ");

// MX-015: the issuer's RegimenFiscal is one SAT allows for its kind of RFC.
// MX-016: the receiver's RegimenFiscalReceptor and UsoCFDI are ones SAT allows for its kind of RFC.
// MX-017: the UsoCFDI is one SAT allows with the receiver's regime (the c_UsoCFDI
//   "Régimen Fiscal Receptor" column). Codes outside the catalogue are MX-003's; the
//   generic RFCs are MX-014's; a payment's UsoCFDI (CP01) is pagos20.mjs's.
export function checkRegimen(e, r, tipo, findings) {
  const et = personType(e.Rfc);
  const er = REGIMEN[e.RegimenFiscal];
  if (et && er && !er[et]) {
    findings.push(finding("MX-015", `The issuer's RegimenFiscal ${e.RegimenFiscal} (${er.texto}) is not one SAT's c_RegimenFiscal allows for ${PERSON[et]}.`,
      `Use the regime on the issuer's Constancia de Situación Fiscal, or check the issuer RFC.`, "/Comprobante/Emisor/@RegimenFiscal"));
  }
  const rt = personType(r.Rfc);
  if (!rt) return;
  const rr = REGIMEN[r.RegimenFiscalReceptor];
  const regimeFits = rr && rr[rt];
  if (rr && !regimeFits) {
    findings.push(finding("MX-016", `The receiver's RegimenFiscalReceptor ${r.RegimenFiscalReceptor} (${rr.texto}) is not one SAT's c_RegimenFiscal allows for ${PERSON[rt]}.`,
      "Copy the regime from the receiver's Constancia de Situación Fiscal, or check the receiver RFC.", "/Comprobante/Receptor/@RegimenFiscalReceptor"));
  }
  if (tipo === "P") return;
  const u = USO[r.UsoCFDI];
  if (!u) return;
  if (!u[rt]) {
    findings.push(finding("MX-016", `UsoCFDI ${r.UsoCFDI} (${u.texto}) is not one SAT's c_UsoCFDI allows for ${PERSON[rt]}.`,
      rt === "moral" ? "The D01-D10 personal deductions and CN01 (payroll) are for persons only; a company usually takes G01, G03 or an I0x use." : "Pick the use the receiver asked for from c_UsoCFDI.",
      "/Comprobante/Receptor/@UsoCFDI"));
  } else if (regimeFits && !u.regimenes.includes(r.RegimenFiscalReceptor)) {
    // A regime wrong for the RFC is already MX-016; its use list would be beside the point.
    const fits = Object.keys(USO).filter((k) => k !== "CP01" && USO[k][rt] && USO[k].regimenes.includes(r.RegimenFiscalReceptor));
    findings.push(finding("MX-017", `UsoCFDI ${r.UsoCFDI} (${u.texto}) is not allowed with RegimenFiscalReceptor ${r.RegimenFiscalReceptor} (${rr.texto}); SAT's c_UsoCFDI allows it only with regimes ${listOf(u.regimenes)}.`,
      `Ask the receiver which use applies; with regime ${r.RegimenFiscalReceptor} the allowed uses are ${listOf(fits)}.`, "/Comprobante/Receptor/@UsoCFDI"));
  }
}

export function checkCfdi(text) {
  const findings = [];
  const skipped = [];
  let root;
  try {
    root = parseCfdiXml(text).root;
  } catch (e) {
    return { findings: [finding("MX-001", `The file could not be read as XML: ${e.message}.`, "Export the CFDI again from the issuing system.", "/")], skipped, meta: {} };
  }
  if (!root || root.name !== "Comprobante") {
    return { findings: [finding("MX-001", "The root element is not cfdi:Comprobante.", "Check this is a CFDI file.", "/")], skipped, meta: {} };
  }
  const version = root.attrs.Version || "";
  if (root.ns !== CFDI_NS || version !== "4.0") {
    const old = /cfd\/3/.test(root.ns) || version === "3.3";
    findings.push(finding("MX-001", old ? `This is CFDI ${version || "3.x"}. SAT stamps only version 4.0 now; this checker reads 4.0 only.` : `Version is "${version}" in namespace ${root.ns || "(none)"}; a CFDI 4.0 has Version="4.0" in ${CFDI_NS}.`,
      "Reissue the document as CFDI 4.0.", "/Comprobante/@Version"));
    return { findings, skipped, meta: { version } };
  }
  checkNode(root, "Comprobante", findings, ELEMENTS.Comprobante);

  const a = root.attrs;
  const emisor = child(root, "Emisor"), receptor = child(root, "Receptor");
  const conceptos = kidsOf(child(root, "Conceptos"), "Concepto");
  const resumen = child(root, "Impuestos");
  const tipo = a.TipoDeComprobante, moneda = a.Moneda;
  const dec = currencyDecimals(moneda);
  const complements = (child(root, "Complemento")?.children || []).filter((c) => c.name);
  const meta = {
    version, tipo, moneda, lines: conceptos.length,
    stamped: complements.some((c) => c.name === "TimbreFiscalDigital"),
    complements: complements.map((c) => c.name),
  };

  // RFC check digits (the shape is the XSD's; the digit is mexico.mjs's mod 11).
  for (const [node, who] of [[emisor, "Emisor"], [receptor, "Receptor"]]) {
    const rfc = node?.attrs.Rfc;
    if (!rfc || typeProblem({ ref: "t_RFC" }, rfc)) continue;
    const r = checkRfc(rfc);
    if (!r.ok) findings.push(finding("MX-007", `The ${who} RFC's check digit does not match the rest of the RFC; a character is probably mistyped.`,
      "Copy the RFC from the party's Constancia de Situación Fiscal. A few RFCs SAT issued carry a digit that fails this test (python-stdnum agrees on the arithmetic), so confirm before changing it.", `/Comprobante/${who}/@Rfc`));
  }

  // Currency decimals on the header amounts.
  const tooPrecise = (v) => v !== undefined && decimalsOf(v) > dec;
  for (const k of ["SubTotal", "Descuento", "Total"]) {
    if (tooPrecise(a[k])) findings.push(finding("MX-010", `${k} has ${decimalsOf(a[k])} decimals; ${moneda} allows ${dec}.`, `Round ${k} to ${dec} decimals.`, `/Comprobante/@${k}`));
  }
  for (const k of ["TotalImpuestosTrasladados", "TotalImpuestosRetenidos"]) {
    if (resumen && tooPrecise(resumen.attrs[k])) findings.push(finding("MX-010", `${k} has ${decimalsOf(resumen.attrs[k])} decimals; ${moneda} allows ${dec}.`, `Round ${k} to ${dec} decimals.`, `/Comprobante/Impuestos/@${k}`));
  }

  // Exchange rate.
  if (moneda === "MXN" && a.TipoCambio !== undefined && Number(a.TipoCambio) !== 1) {
    findings.push(finding("MX-011", "Moneda is MXN but TipoCambio is not 1.", "Drop TipoCambio or set it to 1 for an invoice in pesos.", "/Comprobante/@TipoCambio"));
  } else if (moneda === "XXX" && a.TipoCambio !== undefined) {
    findings.push(finding("MX-011", "Moneda is XXX (no currency) but TipoCambio is present.", "Remove TipoCambio.", "/Comprobante/@TipoCambio"));
  } else if (moneda && moneda !== "MXN" && moneda !== "XXX" && a.TipoCambio === undefined) {
    findings.push(finding("MX-011", `Moneda is ${moneda} but TipoCambio (pesos per unit) is missing.`, "Add TipoCambio, for example the DOF rate for the issue date.", "/Comprobante/@TipoCambio"));
  }

  // Document type rules.
  if (tipo === "T" || tipo === "P") {
    for (const k of ["FormaPago", "MetodoPago", "Descuento", "CondicionesDePago"]) {
      if (a[k] !== undefined) findings.push(finding("MX-012", `A type ${tipo} CFDI must not carry ${k}.`, `Remove ${k}.`, `/Comprobante/@${k}`));
    }
    for (const k of ["SubTotal", "Total"]) {
      if (num(a[k]) !== null && num(a[k]) !== 0) findings.push(finding("MX-012", `A type ${tipo} CFDI has ${k} 0; this one has ${a[k]}.`, `Set ${k}="0".`, `/Comprobante/@${k}`));
    }
    if (resumen) findings.push(finding("MX-012", `A type ${tipo} CFDI carries no tax summary (Impuestos).`, "Remove the Impuestos summary.", "/Comprobante/Impuestos"));
  }
  if (tipo === "N" && moneda && moneda !== "MXN") {
    findings.push(finding("MX-012", "A payroll CFDI (type N) is issued in MXN.", "Set Moneda=\"MXN\".", "/Comprobante/@Moneda"));
  }
  if (a.MetodoPago === "PPD" && a.FormaPago !== undefined && a.FormaPago !== "99") {
    findings.push(finding("MX-013", `MetodoPago is PPD (paid later or in instalments) but FormaPago is ${a.FormaPago}; with PPD the form is 99 (por definir) and the real form goes in each payment complement.`,
      "Set FormaPago=\"99\", or MetodoPago=\"PUE\" if it was paid in full at issue.", "/Comprobante/@FormaPago"));
  }

  // Receiver rules for the generic RFCs.
  const r = receptor?.attrs || {};
  if (r.Rfc === "XAXX010101000" || r.Rfc === "XEXX010101000") {
    const foreign = r.Rfc === "XEXX010101000";
    const who = foreign ? "a foreign receiver (XEXX010101000)" : "the general public (XAXX010101000)";
    // A payment (type P) uses CP01 whoever the receiver is; pagos20.mjs checks that.
    if (r.UsoCFDI && r.UsoCFDI !== "S01" && tipo !== "P") findings.push(finding("MX-014", `For ${who} UsoCFDI is S01 (sin efectos fiscales), not ${r.UsoCFDI}.`, "Set UsoCFDI=\"S01\".", "/Comprobante/Receptor/@UsoCFDI"));
    if (r.RegimenFiscalReceptor && r.RegimenFiscalReceptor !== "616") findings.push(finding("MX-014", `For ${who} RegimenFiscalReceptor is 616 (sin obligaciones fiscales), not ${r.RegimenFiscalReceptor}.`, "Set RegimenFiscalReceptor=\"616\".", "/Comprobante/Receptor/@RegimenFiscalReceptor"));
    if (r.DomicilioFiscalReceptor && a.LugarExpedicion && r.DomicilioFiscalReceptor !== a.LugarExpedicion) findings.push(finding("MX-014", `For ${who} DomicilioFiscalReceptor repeats LugarExpedicion (the issuer's postal code).`, "Set DomicilioFiscalReceptor to the LugarExpedicion value.", "/Comprobante/Receptor/@DomicilioFiscalReceptor"));
    if (foreign && !r.ResidenciaFiscal) findings.push(finding("MX-014", "A foreign receiver (XEXX010101000) needs ResidenciaFiscal, the country of tax residence.", "Add ResidenciaFiscal (c_Pais, for example USA) and NumRegIdTrib, the receiver's tax id there.", "/Comprobante/Receptor/@ResidenciaFiscal"));
    if (foreign && r.ResidenciaFiscal === "MEX") findings.push(finding("MX-014", "ResidenciaFiscal is MEX for a foreign receiver.", "Use the receiver's country of residence.", "/Comprobante/Receptor/@ResidenciaFiscal"));
    if (!foreign && /^P[UÚ]BLICO EN GENERAL$/i.test((r.Nombre || "").trim()) && !child(root, "InformacionGlobal")) {
      findings.push(finding("MX-014", "A global invoice to PUBLICO EN GENERAL needs InformacionGlobal (period, months and year it covers).", "Add InformacionGlobal with Periodicidad, Meses and Año.", "/Comprobante/InformacionGlobal"));
    }
  } else if (r.ResidenciaFiscal !== undefined) {
    findings.push(finding("MX-014", "ResidenciaFiscal is only for a foreign receiver identified as XEXX010101000.", "Remove ResidenciaFiscal and NumRegIdTrib for a Mexican receiver.", "/Comprobante/Receptor/@ResidenciaFiscal"));
  }

  checkRegimen(emisor?.attrs || {}, r, tipo, findings);

  // Lines.
  let sumImporte = 0, sumDesc = 0, anyDesc = false, importeBad = false, descBad = false;
  const trasGroups = new Map(), retGroups = new Map();
  const rateBad = new Set(); // "Traslado" / "Retencion" when a line's TasaOCuota is not a number
  conceptos.forEach((c, i) => {
    const p = `/Comprobante/Conceptos/Concepto[${i + 1}]`;
    const ca = c.attrs;
    const imp = num(ca.Importe);
    if (imp !== null) sumImporte += imp;
    else importeBad = true;
    if (ca.Descuento !== undefined) { anyDesc = true; sumDesc += num(ca.Descuento) ?? 0; }
    if (unreadable(ca.Descuento)) descBad = true;
    if (num(ca.Cantidad) !== null && num(ca.ValorUnitario) !== null && imp !== null) {
      const [lo, hi] = importeBounds(ca.Cantidad, ca.ValorUnitario, decimalsOf(ca.Importe));
      if (imp < lo || imp > hi) findings.push(finding("MX-020", `Line ${i + 1}: Importe ${ca.Importe} is outside Cantidad x ValorUnitario (${lo.toFixed(decimalsOf(ca.Importe))} to ${hi.toFixed(decimalsOf(ca.Importe))} with rounding).`,
        "Recompute Importe as Cantidad x ValorUnitario before discounts.", `${p}/@Importe`));
    }
    if (num(ca.Descuento) !== null && imp !== null && num(ca.Descuento) > imp) {
      findings.push(finding("MX-021", `Line ${i + 1}: Descuento ${ca.Descuento} is larger than Importe ${ca.Importe}.`, "A line's discount cannot exceed its amount.", `${p}/@Descuento`));
    }
    const taxes = child(c, "Impuestos");
    if (ca.ObjetoImp === "02" && !taxes) findings.push(finding("MX-022", `Line ${i + 1}: ObjetoImp is 02 (subject to tax) but the line has no Impuestos.`, "Add the line's Traslados/Retenciones, or use the ObjetoImp code that fits.", `${p}/Impuestos`));
    if (ca.ObjetoImp === "01" && taxes) findings.push(finding("MX-022", `Line ${i + 1}: ObjetoImp is 01 (not subject to tax) but the line carries Impuestos.`, "Remove the line's Impuestos, or set ObjetoImp=\"02\".", `${p}/Impuestos`));
    const tras = kidsOf(child(taxes, "Traslados"), "Traslado");
    const rets = kidsOf(child(taxes, "Retenciones"), "Retencion");
    tras.forEach((t, j) => lineTax(t, "Traslado", `${p}/Impuestos/Traslados/Traslado[${j + 1}]`, i, trasGroups));
    rets.forEach((t, j) => lineTax(t, "Retencion", `${p}/Impuestos/Retenciones/Retencion[${j + 1}]`, i, retGroups));
  });

  function lineTax(t, kind, p, i, groups) {
    const ta = t.attrs;
    if (kind === "Traslado" && ta.TipoFactor === "Exento" && (ta.TasaOCuota !== undefined || ta.Importe !== undefined)) {
      findings.push(finding("MX-023", `Line ${i + 1}: an exempt Traslado carries TasaOCuota or Importe.`, "Remove TasaOCuota and Importe from an Exento tax line.", p));
    }
    if (ta.TipoFactor && ta.TipoFactor !== "Exento" && (ta.TasaOCuota === undefined || ta.Importe === undefined)) {
      findings.push(finding("MX-023", `Line ${i + 1}: a ${ta.TipoFactor} ${kind} needs both TasaOCuota and Importe.`, "Add the rate and the tax amount.", p));
    }
    if (kind === "Retencion" && ta.TipoFactor === "Exento") findings.push(finding("MX-023", `Line ${i + 1}: a Retencion cannot be Exento.`, "Use Tasa or Cuota, or drop the withholding.", `${p}/@TipoFactor`));
    if (num(ta.Base) !== null && num(ta.Base) <= 0) findings.push(finding("MX-023", `Line ${i + 1}: the ${kind} Base must be greater than 0.`, "Set Base to the taxed amount.", `${p}/@Base`));
    if (num(ta.Base) !== null && num(ta.TasaOCuota) !== null && num(ta.Importe) !== null && ta.TipoFactor === "Tasa") {
      const [lo, hi] = taxBounds(ta.Base, ta.TasaOCuota, decimalsOf(ta.Importe));
      if (num(ta.Importe) < lo || num(ta.Importe) > hi) findings.push(finding("MX-024", `Line ${i + 1}: ${kind} Importe ${ta.Importe} is outside Base x TasaOCuota (${lo} to ${hi} with rounding).`,
        "Recompute the tax as Base x TasaOCuota.", `${p}/@Importe`));
    }
    const key = kind === "Traslado" ? `${ta.Impuesto}|${ta.TipoFactor}|${ta.TasaOCuota ?? ""}` : `${ta.Impuesto}`;
    const g = groups.get(key) || { base: 0, importe: 0, attrs: ta };
    g.base += num(ta.Base) ?? 0;
    g.importe += num(ta.Importe) ?? 0;
    // A line value the schema check already rejects makes the group's sum unknowable:
    // the summary is not blamed for disagreeing with it.
    if (num(ta.Base) === null) g.baseBad = true;
    if (unreadable(ta.TasaOCuota)) rateBad.add(kind);
    if (ta.Importe !== undefined && num(ta.Importe) === null) g.importeBad = true;
    groups.set(key, g);
  }

  // Header sums.
  const subTotal = num(a.SubTotal), descuento = num(a.Descuento) ?? 0, total = num(a.Total);
  const tt = tipo === "T" || tipo === "P";
  if (!tt && subTotal !== null && conceptos.length && !importeBad && roundTo(sumImporte, dec) !== subTotal) {
    findings.push(finding("MX-030", `SubTotal ${a.SubTotal} is not the sum of the line amounts (${roundTo(sumImporte, dec).toFixed(dec)}).`, "Set SubTotal to the sum of every Concepto Importe, before discounts.", "/Comprobante/@SubTotal"));
  }
  if (!tt && anyDesc && !descBad && !unreadable(a.Descuento) && roundTo(sumDesc, dec) !== descuento) {
    findings.push(finding("MX-031", `Descuento ${a.Descuento ?? "(missing)"} is not the sum of the line discounts (${roundTo(sumDesc, dec).toFixed(dec)}).`, "Set the header Descuento to the sum of the Concepto discounts.", "/Comprobante/@Descuento"));
  }
  if (!anyDesc && descuento > 0 && conceptos.length) {
    findings.push(finding("MX-031", "The header carries Descuento but no line does; in CFDI 4.0 a discount is given on the lines and summed in the header.", "Spread the discount over the Concepto lines.", "/Comprobante/@Descuento"));
  }
  if (subTotal !== null && descuento > subTotal) {
    findings.push(finding("MX-031", "Descuento is larger than SubTotal.", "The discount cannot exceed the subtotal.", "/Comprobante/@Descuento"));
  }

  // Tax summary against the lines.
  const hasLineTax = trasGroups.size > 0 || retGroups.size > 0;
  if (hasLineTax && !resumen && !tt) {
    findings.push(finding("MX-032", "Lines carry taxes but the CFDI has no tax summary (Comprobante/Impuestos).", "Add the Impuestos summary with the taxes grouped by tax, factor and rate.", "/Comprobante/Impuestos"));
  }
  let totTras = 0, totRet = 0, totalsBad = false;
  if (resumen) {
    const ra = resumen.attrs;
    const sTras = kidsOf(child(resumen, "Traslados"), "Traslado");
    const sRet = kidsOf(child(resumen, "Retenciones"), "Retencion");
    if (sTras.length && ra.TotalImpuestosTrasladados === undefined && sTras.some((t) => t.attrs.TipoFactor !== "Exento")) findings.push(finding("MX-032", "The summary lists Traslados but TotalImpuestosTrasladados is missing.", "Add TotalImpuestosTrasladados.", "/Comprobante/Impuestos/@TotalImpuestosTrasladados"));
    if (sRet.length && ra.TotalImpuestosRetenidos === undefined) findings.push(finding("MX-032", "The summary lists Retenciones but TotalImpuestosRetenidos is missing.", "Add TotalImpuestosRetenidos.", "/Comprobante/Impuestos/@TotalImpuestosRetenidos"));
    if (rateBad.has("Traslado") || sTras.some((t) => unreadable(t.attrs.TasaOCuota))) {
      skipped.push("MX-034 (Traslados): a TasaOCuota is not a number, so the lines' Traslados cannot be grouped by rate and the summary is not compared with them.");
    } else compareGroups(sTras, trasGroups, "Traslado", (ta) => `${ta.Impuesto}|${ta.TipoFactor}|${ta.TasaOCuota ?? ""}`, true);
    compareGroups(sRet, retGroups, "Retencion", (ta) => `${ta.Impuesto}`, false);
    const sumS = (list) => list.reduce((s, t) => s + (num(t.attrs.Importe) ?? 0), 0);
    const anyBad = (list) => list.some((t) => unreadable(t.attrs.Importe));
    totTras = num(ra.TotalImpuestosTrasladados) ?? 0;
    totRet = num(ra.TotalImpuestosRetenidos) ?? 0;
    if (unreadable(ra.TotalImpuestosTrasladados) || unreadable(ra.TotalImpuestosRetenidos) || anyBad(sTras) || anyBad(sRet)) totalsBad = true;
    if (ra.TotalImpuestosTrasladados !== undefined && !anyBad(sTras) && roundTo(sumS(sTras), dec) !== totTras) findings.push(finding("MX-033", `TotalImpuestosTrasladados ${ra.TotalImpuestosTrasladados} is not the sum of the summary's Traslado amounts (${roundTo(sumS(sTras), dec).toFixed(dec)}).`, "Set it to the sum of the summary Traslado Importe values.", "/Comprobante/Impuestos/@TotalImpuestosTrasladados"));
    if (ra.TotalImpuestosRetenidos !== undefined && !anyBad(sRet) && roundTo(sumS(sRet), dec) !== totRet) findings.push(finding("MX-033", `TotalImpuestosRetenidos ${ra.TotalImpuestosRetenidos} is not the sum of the summary's Retencion amounts (${roundTo(sumS(sRet), dec).toFixed(dec)}).`, "Set it to the sum of the summary Retencion Importe values.", "/Comprobante/Impuestos/@TotalImpuestosRetenidos"));
  }

  function compareGroups(summary, groups, kind, keyOf, withBase) {
    const seen = new Set();
    summary.forEach((t, j) => {
      const key = keyOf(t.attrs);
      const p = `/Comprobante/Impuestos/${kind === "Traslado" ? "Traslados" : "Retenciones"}/${kind}[${j + 1}]`;
      if (seen.has(key)) findings.push(finding("MX-034", `The summary repeats the ${kind} group ${key.replace(/\|/g, " ")}.`, "Merge the repeated rows into one per tax, factor and rate.", p));
      seen.add(key);
      const g = groups.get(key);
      if (!g) {
        findings.push(finding("MX-034", `The summary has a ${kind} (${key.replace(/\|/g, " ")}) that no line carries.`, "Remove it, or add the tax to the lines it applies to.", p));
        return;
      }
      if (t.attrs.Importe !== undefined && !g.importeBad && roundTo(g.importe, dec) !== num(t.attrs.Importe)) {
        findings.push(finding("MX-034", `Summary ${kind} ${key.replace(/\|/g, " ")}: Importe ${t.attrs.Importe} is not the sum of the lines' (${roundTo(g.importe, dec).toFixed(dec)}).`, "Set it to the lines' tax amounts summed and rounded to the currency's decimals.", `${p}/@Importe`));
      }
      if (withBase && t.attrs.Base !== undefined && !g.baseBad && roundTo(g.base, dec) !== num(t.attrs.Base)) {
        findings.push(finding("MX-034", `Summary ${kind} ${key.replace(/\|/g, " ")}: Base ${t.attrs.Base} is not the sum of the lines' bases (${roundTo(g.base, dec).toFixed(dec)}).`, "Set Base to the lines' bases summed and rounded.", `${p}/@Base`));
      }
    });
    for (const key of groups.keys()) {
      if (!seen.has(key)) findings.push(finding("MX-034", `Lines carry a ${kind} (${key.replace(/\|/g, " ")}) that the summary leaves out.`, "Add a summary row for it.", `/Comprobante/Impuestos`));
    }
  }

  // Total.
  if (complements.some((c) => c.name === "ImpuestosLocales")) {
    skipped.push("MX-035 (Total): the ImpuestosLocales complement adds local taxes this reader does not model.");
  } else if (!tt && subTotal !== null && total !== null && !totalsBad && !unreadable(a.Descuento)) {
    const want = roundTo(subTotal - descuento + totTras - totRet, dec);
    if (want !== total) findings.push(finding("MX-035", `Total ${a.Total} is not SubTotal - Descuento + taxes transferred - taxes withheld (${want.toFixed(dec)}).`, "Recompute Total from the header amounts.", "/Comprobante/@Total"));
  }

  // Stamping window.
  const tfd = complements.find((c) => c.name === "TimbreFiscalDigital");
  if (tfd && a.Fecha && tfd.attrs.FechaTimbrado) {
    const hours = (Date.parse(tfd.attrs.FechaTimbrado) - Date.parse(a.Fecha)) / 3.6e6;
    if (hours > 72) findings.push(finding("MX-036", `The CFDI was stamped ${Math.round(hours)} hours after its Fecha; a PAC stamps within 72 hours of issue.`, "Check the issue date; reissue if it was backdated.", "/Comprobante/@Fecha"));
    if (hours < 0) findings.push(finding("MX-036", "FechaTimbrado is earlier than Fecha.", "Check the issuing system's clock.", "/Comprobante/@Fecha"));
    meta.uuid = tfd.attrs.UUID;
  }
  Object.assign(meta, checkPagos(root, { findings, skipped, checkNode, ELEMENTS, currencyDecimals, taxBounds, CFDI_NS }));
  Object.assign(meta, checkNomina(root, { findings, skipped, checkNode, ELEMENTS, CFDI_NS, personType }));
  Object.assign(meta, checkComercioExterior(root, { findings, skipped, checkNode, ELEMENTS, CFDI_NS, typeProblem, currencyDecimals }));
  Object.assign(meta, checkCartaPorte(root, { findings, skipped, checkNode, ELEMENTS, CFDI_NS, typeProblem }));
  return { findings, skipped, meta };
}
