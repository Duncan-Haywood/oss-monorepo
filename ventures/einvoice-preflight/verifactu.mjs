// Checks Spain's VERI*FACTU billing records (Real Decreto 1007/2023 and Orden
// HAC/1177/2024): the RegistroAlta (an invoice issued) and RegistroAnulacion (an
// invoice cancelled) a billing system (SIF) keeps and, in VERI*FACTU mode, sends to
// the Agencia Tributaria (AEAT). A record can be read on its own, inside a
// RegFactuSistemaFacturacion batch, or inside the SOAP envelope sent to AEAT.
//
// What is checked, offline:
//   - the record's fingerprint (Huella): SHA-256 over the AEAT field string,
//     recomputed from the text exactly as written in the file. When it does not
//     match, the checker tries the usual ways billing software builds the string
//     differently (amounts reformatted, "15" hashed as "15.00", the time zone written
//     another way, the previous fingerprint left out, values trimmed or URL-encoded)
//     and names the one that reproduces the stored value, so the developer knows
//     which line of their code to change;
//   - the chain across every record in the batch: each Encadenamiento/RegistroAnterior
//     must name the record before it and carry that record's exact fingerprint; two
//     records chained to the same predecessor (a fork) and a time that runs backwards
//     are flagged;
//   - the record itself: dates, invoice type and recipients, corrective-invoice
//     fields, breakdown lines (tax rate and amount against the operation type, the
//     equivalence surcharge), CuotaTotal and ImporteTotal against the breakdown, and
//     the check letter of Spanish NIFs;
//   - the QR code URL (ValidarQR / ValidarQRNoVerifactu) each invoice must print.
//
// Sources: the hash string and its two worked examples are AEAT's "Detalle de las
// especificaciones técnicas para generación de la huella o hash" (v0.1.2, 27/08/2024),
// as quoted with its expected values by two independent MIT libraries'
// tests (squareetlabs/LaravelVerifactu, josemmo/Verifactu-PHP); sede.agenciatributaria
// and prewww2.aeat.es refuse this session's proxy, so the PDF itself is unread. The
// record rules follow the validations of josemmo/Verifactu-PHP (MIT), read
// 2026-11-15; no code is copied. The AEAT test-environment record in
// eval/verifactu-records-2026-11-15.md (entity A39200019, "CERTIFICADO ENTIDAD
// PRUEBAS") shows the fingerprint is taken over the amount as written: its
// ImporteTotal "15" hashes to the stored value, "15.00" does not.
//
// This checks the file; it is not AEAT, does not certify a billing system and is not
// tax advice. AEAT's own tolerance on totals is not modelled: differences are warnings.
import { parseXmlTree } from "./ubl.mjs";
import { sha256 } from "./zatca-stamp.mjs";
import { esOk } from "./vat.mjs";
import { COUNTRY_CODES, GENERATED_BY, ID_TYPES, REGIME_CODES, TAX_CODES } from "./verifactu-lists.mjs";

const RECORD_ROOTS = new Set(["RegistroAlta", "RegistroAnulacion"]);
const INVOICE_TYPES = {
  F1: "full invoice (factura, art. 6, 7.2 and 7.3 RD 1619/2012)",
  F2: "simplified invoice (factura simplificada, art. 6.1.d RD 1619/2012)",
  F3: "invoice that replaces simplified invoices (factura emitida en sustitución de facturas simplificadas)",
  R1: "corrective invoice (art. 80.1, 80.2 and 80.6 LIVA, error founded in law)",
  R2: "corrective invoice (art. 80.3 LIVA, insolvency)",
  R3: "corrective invoice (art. 80.4 LIVA, bad debts)",
  R4: "corrective invoice (other causes)",
  R5: "corrective simplified invoice",
};
const SUBJECT = new Set(["S1", "S2"]);
const NON_SUBJECT = new Set(["N1", "N2"]);
// E7 and E8 exist for IGIC only (validation document v1.1.5, rule 15.5: "Si Impuesto = 03 (IGIC),
// ... lista L10 y adicionalmente podrá contener los valores E7 y E8").
const EXEMPT = new Set(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);

const local = (name) => String(name || "").replace(/^[^:]*:/, "");
const kids = (node, name) => (node?.children || []).filter((c) => local(c.name) === name);
const kid = (node, name) => kids(node, name)[0] || null;
const decode = (s) => String(s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePointOr(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => codePointOr(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// The text of a leaf as written (entities decoded, whitespace kept): the fingerprint is
// computed over this, so trimming here would hide a fault.
function raw(node, ...path) {
  let cur = node;
  for (const p of path) { cur = kid(cur, p); if (!cur) return null; }
  return decode(cur.text || "");
}
const val = (node, ...path) => { const r = raw(node, ...path); return r === null ? null : r.trim(); };

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
export const huellaOf = (payload) => hex(sha256(new TextEncoder().encode(payload)));

export function looksLikeVerifactu(text) {
  const head = String(text).slice(0, 65536);
  return /<(?:[A-Za-z0-9_]+:)?(?:RegistroAlta|RegistroAnulacion)[\s>]/.test(head)
    && /tike\/cont\/ws\/Suministro|IDEmisorFactura|FechaHoraHusoGenRegistro/.test(head);
}

function findRecords(node, out = []) {
  for (const c of node.children || []) {
    if (RECORD_ROOTS.has(local(c.name))) out.push(c);
    else findRecords(c, out);
  }
  return out;
}

function readId(node, suffix = "") {
  if (!node) return null;
  return {
    issuer: val(node, `IDEmisorFactura${suffix}`),
    number: val(node, `NumSerieFactura${suffix}`),
    date: val(node, `FechaExpedicionFactura${suffix}`),
    rawIssuer: raw(node, `IDEmisorFactura${suffix}`),
    rawNumber: raw(node, `NumSerieFactura${suffix}`),
    rawDate: raw(node, `FechaExpedicionFactura${suffix}`),
  };
}

function readRecord(node, index) {
  const kind = local(node.name) === "RegistroAlta" ? "alta" : "anulacion";
  const idNode = kid(node, "IDFactura");
  const id = kind === "alta" ? readId(idNode) : readId(idNode, "Anulada");
  const enc = kid(node, "Encadenamiento");
  const prev = kid(enc, "RegistroAnterior");
  const lines = kids(kid(node, "Desglose"), "DetalleDesglose").map((d) => ({
    tax: val(d, "Impuesto") || "01",
    rawTax: val(d, "Impuesto"),
    regime: val(d, "ClaveRegimen"),
    qualification: val(d, "CalificacionOperacion"),
    exempt: val(d, "OperacionExenta"),
    rate: val(d, "TipoImpositivo"),
    base: val(d, "BaseImponibleOimporteNoSujeto"),
    baseAtCost: val(d, "BaseImponibleACoste"),
    cuota: val(d, "CuotaRepercutida"),
    surchargeRate: val(d, "TipoRecargoEquivalencia"),
    surcharge: val(d, "CuotaRecargoEquivalencia"),
  }));
  const tercero = kid(node, "Tercero");
  const generador = kid(node, "Generador");
  const otro = (n) => (kid(n, "IDOtro") ? { country: val(n, "IDOtro", "CodigoPais"), type: val(n, "IDOtro", "IDType"), id: val(n, "IDOtro", "ID") } : null);
  // AEAT code 1287: no value may contain < > " ' = (checked on the decoded text).
  const badChars = [];
  (function walk(n, path) {
    const kidsOf = n.children || [];
    if (!kidsOf.length) { const t = decode(n.text || ""); if (/[<>"'=]/.test(t)) badChars.push({ path, value: t }); return; }
    // A signed record (non-VERI*FACTU systems) carries ds:Signature, whose Base64 ends in "=".
    for (const c of kidsOf) if (local(c.name) !== "Signature") walk(c, `${path}/${local(c.name)}`);
  })(node, "");
  const recipients = kids(kid(node, "Destinatarios"), "IDDestinatario").map((d) => ({
    name: val(d, "NombreRazon"),
    nif: val(d, "NIF"),
    other: otro(d),
  }));
  return {
    index,
    kind,
    id,
    issuerName: val(node, "NombreRazonEmisor"),
    type: val(node, "TipoFactura"),
    rawType: raw(node, "TipoFactura"),
    correctiveType: val(node, "TipoRectificativa"),
    corrected: kids(kid(node, "FacturasRectificadas"), "IDFacturaRectificada").map((n) => readId(n)),
    replaced: kids(kid(node, "FacturasSustituidas"), "IDFacturaSustituida").map((n) => readId(n)),
    correctedBase: val(node, "ImporteRectificacion", "BaseRectificada"),
    correctedCuota: val(node, "ImporteRectificacion", "CuotaRectificada"),
    subsanacion: val(node, "Subsanacion"),
    rechazoPrevio: val(node, "RechazoPrevio"),
    lines,
    recipients,
    cuotaTotal: val(node, "CuotaTotal"),
    importeTotal: val(node, "ImporteTotal"),
    rawCuotaTotal: raw(node, "CuotaTotal"),
    rawImporteTotal: raw(node, "ImporteTotal"),
    first: val(enc, "PrimerRegistro"),
    hasEnc: !!enc,
    prev: prev ? { ...readId(prev), huella: val(prev, "Huella"), rawHuella: raw(prev, "Huella") } : null,
    badChars,
    operationDate: val(node, "FechaOperacion"),
    macrodato: val(node, "Macrodato"),
    art7273: val(node, "FacturaSimplificadaArticulos7273"),
    art61d: val(node, "FacturaSinIdentifDestinatarioArt61d"),
    agreement: val(node, "NumRegistroAcuerdoFacturacion"),
    issuedBy: val(node, "EmitidaPorTerceroODestinatario"),
    third: tercero ? { nif: val(tercero, "NIF"), other: !!kid(tercero, "IDOtro"), type: val(tercero, "IDOtro", "IDType"), ids: otro(tercero) } : null,
    generatedBy: val(node, "GeneradoPor"),
    generator: generador ? { nif: val(generador, "NIF"), other: otro(generador) } : null,
    systemFlags: [["TipoUsoPosibleSoloVerifactu", "1212"], ["TipoUsoPosibleMultiOT", "1213"], ["IndicadorMultiplesOT", "1226"]].map(([name, code]) => ({ name, code, value: val(node, "SistemaInformatico", name) })),
    systemNif: val(node, "SistemaInformatico", "NIF"),
    generated: val(node, "FechaHoraHusoGenRegistro"),
    rawGenerated: raw(node, "FechaHoraHusoGenRegistro"),
    hashType: val(node, "TipoHuella"),
    huella: val(node, "Huella"),
  };
}

// The AEAT field string. `f` holds the values to hash, already as text.
export function huellaPayload(kind, f) {
  if (kind === "alta") {
    return `IDEmisorFactura=${f.issuer}&NumSerieFactura=${f.number}&FechaExpedicionFactura=${f.date}&TipoFactura=${f.type}`
      + `&CuotaTotal=${f.cuota}&ImporteTotal=${f.importe}&Huella=${f.prev}&FechaHoraHusoGenRegistro=${f.generated}`;
  }
  return `IDEmisorFacturaAnulada=${f.issuer}&NumSerieFacturaAnulada=${f.number}&FechaExpedicionFacturaAnulada=${f.date}`
    + `&Huella=${f.prev}&FechaHoraHusoGenRegistro=${f.generated}`;
}

function asWritten(r) {
  return {
    issuer: r.id?.rawIssuer ?? "", number: r.id?.rawNumber ?? "", date: r.id?.rawDate ?? "",
    type: r.rawType ?? "", cuota: r.rawCuotaTotal ?? "", importe: r.rawImporteTotal ?? "",
    prev: r.prev?.rawHuella ?? "", generated: r.rawGenerated ?? "",
  };
}

const isAmount = (s) => /^-?\d+(\.\d+)?$/.test(String(s ?? "").trim());
const twoDp = (s) => (isAmount(s) ? Number(s).toFixed(2) : s);
const shortest = (s) => (isAmount(s) ? String(Number(s)) : s);
// Each variant is a way billing software is known to build the string differently.
const VARIANTS = [
  { id: "trimmed", what: "every value trimmed of surrounding spaces", apply: (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v).trim()])) },
  { id: "amounts-2dp", what: "CuotaTotal and ImporteTotal written with two decimals (e.g. 15 as 15.00), while the XML carries them another way", apply: (f) => ({ ...f, cuota: twoDp(f.cuota.trim()), importe: twoDp(f.importe.trim()) }) },
  { id: "amounts-short", what: "CuotaTotal and ImporteTotal without trailing zeros (e.g. 15.00 as 15), while the XML carries the zeros", apply: (f) => ({ ...f, cuota: shortest(f.cuota.trim()), importe: shortest(f.importe.trim()) }) },
  { id: "no-prev", what: "the previous record's fingerprint left out (Huella= empty) although the record is chained", apply: (f) => ({ ...f, prev: "" }) },
  { id: "prev-lower", what: "the previous fingerprint in lower case", apply: (f) => ({ ...f, prev: f.prev.toLowerCase() }) },
  { id: "tz-z", what: "the generation time written with Z instead of +00:00 (or the other way round)", apply: (f) => ({ ...f, generated: /Z$/.test(f.generated) ? f.generated.replace(/Z$/, "+00:00") : f.generated.replace(/\+00:00$/, "Z") }) },
  { id: "tz-none", what: "the generation time without its time-zone offset", apply: (f) => ({ ...f, generated: f.generated.replace(/(Z|[+-]\d{2}:?\d{2})$/, "") }) },
  { id: "tz-colon", what: "the time-zone offset without its colon (+0100 instead of +01:00, or the other way round)", apply: (f) => ({ ...f, generated: /[+-]\d{2}:\d{2}$/.test(f.generated) ? f.generated.replace(/([+-]\d{2}):(\d{2})$/, "$1$2") : f.generated.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") }) },
  { id: "ms", what: "the generation time with milliseconds (or without the milliseconds the XML carries)", apply: (f) => ({ ...f, generated: /\.\d+/.test(f.generated) ? f.generated.replace(/\.\d+/, "") : f.generated.replace(/(T\d{2}:\d{2}:\d{2})/, "$1.000") }) },
  { id: "iso-date", what: "the issue date as yyyy-mm-dd instead of dd-mm-yyyy", apply: (f) => ({ ...f, date: f.date.replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$2-$1") }) },
  { id: "url-encoded", what: "the values URL-encoded (AEAT's string takes them as they are, unescaped)", apply: (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, encodeURIComponent(v)])) },
];

// Which way of building the string reproduces `stored`? Single variants first, then pairs.
export function diagnoseHuella(kind, fields, stored) {
  const want = String(stored || "").trim().toUpperCase();
  for (const v of VARIANTS) {
    const f = v.apply(fields);
    if (huellaOf(huellaPayload(kind, f)) === want) return { variants: [v], payload: huellaPayload(kind, f) };
  }
  for (let i = 0; i < VARIANTS.length; i++) {
    for (let j = i + 1; j < VARIANTS.length; j++) {
      const f = VARIANTS[j].apply(VARIANTS[i].apply(fields));
      if (huellaOf(huellaPayload(kind, f)) === want) return { variants: [VARIANTS[i], VARIANTS[j]], payload: huellaPayload(kind, f) };
    }
  }
  return null;
}

const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
function validDate(s) {
  const m = DATE_RE.exec(String(s || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCFullYear() === +m[3] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1];
}
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})$/;
const cents = (s) => Math.round(Number(s) * 100);
const fmt = (c) => (c / 100).toFixed(2);
const sameId = (a, b) => !!a && !!b && a.issuer === b.issuer && a.number === b.number && a.date === b.date;
export const idText = (id) => (id ? `${id.number || "?"} of ${id.date || "?"} (issuer ${id.issuer || "?"})` : "?");
const nifLike = (s) => /^[0-9A-Z]\d{7}[0-9A-Z]$/.test(String(s || ""));

export function readVerifactu(source) {
  const t = typeof source === "string" ? source : new TextDecoder().decode(source);
  const records = findRecords(parseXmlTree(t)).map((n, i) => readRecord(n, i));
  for (const r of records) r.expectedHuella = huellaOf(huellaPayload(r.kind, asWritten(r)));
  if (!records.length) throw new Error("No VERI*FACTU RegistroAlta or RegistroAnulacion found");
  return records;
}

// Findings for one record on its own (no chain).
export function recordFindings(r, { now = new Date() } = {}) {
  const out = [];
  const at = r.kind === "alta" ? "/RegistroAlta" : "/RegistroAnulacion";
  const label = `${r.kind === "alta" ? "Record" : "Cancellation record"} ${r.index + 1} (${idText(r.id)})`;
  const push = (rule, message, fix, path, extra = {}) => out.push({ rule, message: `${label}: ${message}`, fix, path: at + path, ...extra });

  // Fingerprint.
  if (!r.huella) {
    push("VF-001", "has no Huella (fingerprint).", "Compute the SHA-256 fingerprint over AEAT's field string and write it, in upper-case hex, in Huella.", "/Huella");
  } else {
    if (!/^[0-9A-F]{64}$/.test(r.huella)) {
      push("VF-002", `Huella "${r.huella.slice(0, 70)}" is not 64 upper-case hexadecimal characters.`, "Write the SHA-256 digest as 64 upper-case hexadecimal characters (AEAT's specification asks for upper case).", "/Huella");
    }
    const fields = asWritten(r);
    const expected = r.expectedHuella;
    if (expected !== r.huella.toUpperCase()) {
      const d = diagnoseHuella(r.kind, fields, r.huella);
      r.huellaDiagnosis = d ? d.variants.map((v) => v.id) : null;
      const cause = d
        ? ` The stored value is reproduced when the string is built with ${d.variants.map((v) => v.what).join(", and ")}: the string your software hashed was "${d.payload}".`
        : " None of the usual variants (amount format, time zone, milliseconds, previous fingerprint, trimming, URL-encoding, date order) reproduces it, so a field value itself differs from what was hashed.";
      push("VF-001", `Huella does not match the fingerprint recomputed from the record as written (expected ${expected}).${cause}`,
        `Hash exactly this string, with the values as they appear in the XML: "${huellaPayload(r.kind, fields)}". AEAT recomputes it the same way and rejects or flags a record whose fingerprint differs.`, "/Huella",
        { expected, ...(d ? { diagnosis: d.variants.map((v) => v.id) } : {}) });
    }
  }
  if (r.hashType !== null && r.hashType !== "01") {
    push("VF-003", `TipoHuella is "${r.hashType}"; the only value AEAT defines is 01 (SHA-256).`, "Write TipoHuella 01 and use SHA-256.", "/TipoHuella");
  }

  // Encadenamiento.
  if (!r.hasEnc) {
    push("VF-004", "has no Encadenamiento.", "Every record carries Encadenamiento: PrimerRegistro S for the system's very first record, otherwise RegistroAnterior with the previous record's id and fingerprint.", "/Encadenamiento");
  } else if (r.prev && r.first) {
    push("VF-004", "carries both PrimerRegistro and RegistroAnterior.", "Keep one: RegistroAnterior when an earlier record exists, PrimerRegistro S only for the first.", "/Encadenamiento");
  } else if (!r.prev && r.first !== "S") {
    push("VF-004", `Encadenamiento has neither RegistroAnterior nor PrimerRegistro S${r.first ? ` (PrimerRegistro is "${r.first}")` : ""}.`, "Name the previous record (RegistroAnterior) or, for the system's first record only, write PrimerRegistro S.", "/Encadenamiento");
  } else if (r.prev && !r.prev.huella) {
    push("VF-004", "RegistroAnterior has no Huella.", "Copy the previous record's fingerprint into RegistroAnterior/Huella.", "/Encadenamiento/RegistroAnterior/Huella");
  }
  if (r.prev?.huella && !/^[0-9A-F]{64}$/.test(r.prev.huella)) {
    push("VF-002", `RegistroAnterior's Huella "${r.prev.huella.slice(0, 70)}" is not 64 upper-case hexadecimal characters.`, "Copy the previous record's fingerprint exactly: 64 upper-case hexadecimal characters (AEAT codes 1262, 1291, 2002, 2003).", "/Encadenamiento/RegistroAnterior/Huella");
  }
  if (r.prev?.huella && r.huella && r.prev.huella.toUpperCase() === r.huella.toUpperCase()) {
    push("VF-036", "RegistroAnterior carries this record's own fingerprint.", "RegistroAnterior/Huella is the previous record's fingerprint, never this one's (AEAT code 2008).", "/Encadenamiento/RegistroAnterior/Huella");
  }
  if (r.kind === "anulacion" && !r.prev) {
    push("VF-022", "is a cancellation with no previous record.", "A cancellation always follows the record it cancels, so it chains to an earlier record (RegistroAnterior).", "/Encadenamiento", { severity: "warning" });
  }

  // Dates.
  if (r.id && !validDate(r.id.date)) {
    push("VF-009", `the issue date "${r.id.date ?? ""}" is not a real date written dd-mm-yyyy.`, "Write FechaExpedicionFactura as dd-mm-yyyy (e.g. 02-04-2025).", r.kind === "alta" ? "/IDFactura/FechaExpedicionFactura" : "/IDFactura/FechaExpedicionFacturaAnulada");
  }
  if (r.prev && r.prev.date && !validDate(r.prev.date)) {
    push("VF-009", `RegistroAnterior's date "${r.prev.date}" is not a real date written dd-mm-yyyy.`, "Copy the previous record's issue date as dd-mm-yyyy.", "/Encadenamiento/RegistroAnterior/FechaExpedicionFactura");
  }
  if (!r.generated || !TS_RE.test(r.generated)) {
    push("VF-010", `FechaHoraHusoGenRegistro "${r.generated ?? ""}" is not a time with its offset (yyyy-mm-ddThh:mm:ss+hh:mm).`, "Write the generation time with seconds and the time-zone offset, e.g. 2025-04-02T09:59:12+02:00; the fingerprint is taken over it.", "/FechaHoraHusoGenRegistro");
  }
  if (r.kind === "alta" && validDate(r.id?.date) && r.generated && TS_RE.test(r.generated)) {
    const [d, m, y] = r.id.date.split("-");
    if (r.generated.slice(0, 10) < `${y}-${m}-${d}`) {
      push("VF-024", `was generated (${r.generated}) before the invoice's issue date (${r.id.date}).`, "A record is generated when the invoice is issued or later; check the system clock and the issue date.", "/FechaHoraHusoGenRegistro", { severity: "warning" });
    }
  }

  // NIF shape: nine characters, letters or digits first and last, seven digits between
  // (AEAT code 1123, which the AEAT also raises inside the Encadenamiento block).
  const idPath = r.kind === "alta" ? "/IDFactura/IDEmisorFactura" : "/IDFactura/IDEmisorFacturaAnulada";
  for (const [who, v, path] of [["the issuer", r.id?.issuer, idPath], ["RegistroAnterior's issuer", r.prev?.issuer, "/Encadenamiento/RegistroAnterior/IDEmisorFactura"], ["SistemaInformatico", r.systemNif, "/SistemaInformatico/NIF"], ...r.recipients.map((d, i) => [`recipient ${i + 1}`, d.nif, `/Destinatarios/IDDestinatario[${i + 1}]/NIF`])]) {
    if (v && !nifLike(v)) push("VF-019", `${who}'s NIF "${v}" is not shaped like a Spanish NIF (nine characters: a letter or digit, seven digits, a letter or digit).`, "Write the NIF without spaces, dashes or the ES prefix; a foreign party goes in IDOtro (AEAT code 1123).", path);
  }
  // Issuer NIF.
  if (r.id?.issuer && nifLike(r.id.issuer) && !esOk(r.id.issuer)) {
    push("VF-019", `the issuer NIF ${r.id.issuer} fails its check character.`, "Check the NIF; AEAT matches it against its census. (AEAT's test environment uses its own test NIFs, which may not pass this check.)", r.kind === "alta" ? "/IDFactura/IDEmisorFactura" : "/IDFactura/IDEmisorFacturaAnulada", { severity: "warning" });
  }

  for (const b of r.badChars || []) {
    push("VF-042", `${b.path.slice(1)} "${b.value.slice(0, 60)}" contains a character AEAT refuses (< > " ' =).`, "Remove the character or replace it (an apostrophe in a name, for example, by a plain space); AEAT rejects the record whatever the XML escaping (AEAT code 1287).", b.path);
  }
  listRules(r, push);
  if (r.kind !== "alta") return out;

  // Invoice type, recipients, corrective fields.
  const typeName = Object.hasOwn(INVOICE_TYPES, r.type || "") ? INVOICE_TYPES[r.type] : "";
  if (!typeName) {
    push("VF-011", `TipoFactura "${r.type ?? ""}" is not one of F1, F2, F3, R1, R2, R3, R4, R5.`, "Use the AEAT invoice type code (L2 list).", "/TipoFactura");
  } else {
    const simplified = r.type === "F2" || r.type === "R5";
    if (simplified && r.recipients.length) {
      push("VF-012", `is a ${typeName} but names ${r.recipients.length} recipient(s).`, "A simplified invoice (F2) or its correction (R5) carries no Destinatarios; issue an F1 (or R1-R4) when the buyer is identified.", "/Destinatarios");
    } else if (!simplified && !r.recipients.length) {
      push("VF-012", `is a ${typeName} with no recipient.`, "Name the buyer in Destinatarios/IDDestinatario (NIF or IDOtro), or issue it as a simplified invoice (F2) if the law allows.", "/Destinatarios");
    }
    const corrective = /^R/.test(r.type);
    if (corrective && !r.correctiveType) {
      push("VF-013", `is a corrective invoice (${r.type}) with no TipoRectificativa.`, "Write TipoRectificativa S (substitution) or I (by differences).", "/TipoRectificativa");
    } else if (!corrective && r.correctiveType) {
      push("VF-013", `is ${r.type}, not a corrective invoice, yet carries TipoRectificativa ${r.correctiveType}.`, "Remove TipoRectificativa, or use an R type if this corrects an invoice.", "/TipoRectificativa");
    }
    if (r.correctiveType && !["S", "I"].includes(r.correctiveType)) {
      push("VF-013", `TipoRectificativa "${r.correctiveType}" is neither S nor I.`, "Use S (substitution) or I (by differences).", "/TipoRectificativa");
    }
    if (!corrective && r.corrected.length) {
      push("VF-013", `is ${r.type} but lists FacturasRectificadas.`, "Only corrective invoices (R1-R5) list the invoices they correct.", "/FacturasRectificadas");
    }
    if (r.correctiveType === "S" && (r.correctedBase === null || r.correctedCuota === null)) {
      push("VF-014", "is a corrective invoice by substitution with no ImporteRectificacion (BaseRectificada and CuotaRectificada).", "Write the base and tax of the invoice being replaced in ImporteRectificacion.", "/ImporteRectificacion");
    } else if (r.correctiveType !== "S" && (r.correctedBase !== null || r.correctedCuota !== null)) {
      push("VF-014", "carries ImporteRectificacion but is not a corrective invoice by substitution (TipoRectificativa S).", "Remove ImporteRectificacion, or set TipoRectificativa S.", "/ImporteRectificacion");
    }
    if (r.type === "F3" && !r.replaced.length) {
      push("VF-025", "is an F3 (replacing simplified invoices) that lists no FacturasSustituidas.", "List the simplified invoices this one replaces in FacturasSustituidas.", "/FacturasSustituidas", { severity: "warning" });
    }
  }
  if (r.rechazoPrevio && r.rechazoPrevio !== "N" && r.subsanacion !== "S") {
    push("VF-020", `RechazoPrevio is "${r.rechazoPrevio}" while Subsanacion is not S.`, "RechazoPrevio S or X only goes with Subsanacion S (a correction of a record AEAT rejected or never received).", "/RechazoPrevio");
  }

  // Recipients' ids.
  r.recipients.forEach((d, i) => {
    if (d.nif && nifLike(d.nif) && !esOk(d.nif)) {
      push("VF-019", `recipient ${i + 1}'s NIF ${d.nif} fails its check character.`, "Check the buyer's NIF; AEAT matches it against its census.", `/Destinatarios/IDDestinatario[${i + 1}]/NIF`, { severity: "warning" });
    }
    if (d.other && d.other.type === "02" && d.other.country && d.other.id && !String(d.other.id).toUpperCase().startsWith(d.other.country === "GR" ? "EL" : d.other.country)) {
      push("VF-023", `recipient ${i + 1}'s VAT number (IDType 02) ${d.other.id} does not start with its CodigoPais ${d.other.country}.`, "An EU VAT number starts with its country prefix; check CodigoPais and ID.", `/Destinatarios/IDDestinatario[${i + 1}]/IDOtro`, { severity: "warning" });
    }
    if (d.other && d.other.country === "ES" && d.other.type && !["03", "07"].includes(d.other.type)) {
      push("VF-023", `recipient ${i + 1} is Spanish (CodigoPais ES) with IDType ${d.other.type}.`, "A Spanish buyer goes in NIF; IDOtro with ES is only for a passport (03) or someone not in the census (07).", `/Destinatarios/IDDestinatario[${i + 1}]/IDOtro`, { severity: "warning" });
    }
  });

  // Amounts as written.
  for (const [name, v] of [["CuotaTotal", r.cuotaTotal], ["ImporteTotal", r.importeTotal]]) {
    if (v === null) push("VF-021", `has no ${name}.`, `Write ${name}.`, `/${name}`);
    else if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(v)) push("VF-021", `${name} "${v}" is not a number with at most 12 digits and 2 decimals, a point as separator.`, `Write ${name} like 1234.56.`, `/${name}`);
  }

  // Breakdown lines.
  if (!r.lines.length) push("VF-026", "has no Desglose/DetalleDesglose line.", "Every invoice record breaks its amount down by tax treatment in Desglose.", "/Desglose");
  let base = 0, cuota = 0, ok = true;
  r.lines.forEach((l, i) => {
    const p = `/Desglose/DetalleDesglose[${i + 1}]`;
    const q = l.qualification || l.exempt || "";
    if (!l.qualification && !l.exempt) push("VF-027", `breakdown line ${i + 1} has neither CalificacionOperacion nor OperacionExenta.`, "Say whether the line is subject (S1, S2), not subject (N1, N2) or exempt (OperacionExenta E1-E6, E7-E8 under IGIC).", p);
    if (l.qualification && l.exempt) push("VF-027", `breakdown line ${i + 1} has both CalificacionOperacion and OperacionExenta.`, "Keep one.", p);
    if (SUBJECT.has(q)) {
      if (l.rate === null || l.cuota === null) push("VF-018", `breakdown line ${i + 1} is subject (${q}) but lacks ${l.rate === null ? "TipoImpositivo" : "CuotaRepercutida"}.`, "A subject line carries its tax rate and tax amount.", p);
    } else if (NON_SUBJECT.has(q) || EXEMPT.has(q)) {
      if (l.rate !== null || l.cuota !== null || l.surcharge !== null || l.surchargeRate !== null) push("VF-018", `breakdown line ${i + 1} is ${EXEMPT.has(q) ? "exempt" : "not subject"} (${q}) yet carries a tax rate or amount.`, "Remove TipoImpositivo, CuotaRepercutida and the surcharge from a non-subject or exempt line.", p);
    } else if (q) {
      push("VF-027", `breakdown line ${i + 1} has an unknown qualification "${q}".`, "Use S1, S2, N1, N2 or E1-E6 (E7, E8 under IGIC).", p);
    }
    const c18 = l.regime === "18";
    if (l.tax === "01" && l.regime && SUBJECT.has(q)) {
      if (c18 && (l.surchargeRate === null || l.surcharge === null)) push("VF-028", `breakdown line ${i + 1} is under the equivalence surcharge regime (ClaveRegimen 18) without TipoRecargoEquivalencia and CuotaRecargoEquivalencia.`, "Write the surcharge rate and amount.", p);
      if (!c18 && (l.surchargeRate !== null || l.surcharge !== null)) push("VF-028", `breakdown line ${i + 1} carries an equivalence surcharge but ClaveRegimen is ${l.regime}, not 18.`, "Use ClaveRegimen 18 for the surcharge regime, or remove the surcharge.", p);
    }
    if (q === "S1" && isAmount(l.base) && isAmount(l.rate) && isAmount(l.cuota)) {
      const want = Number(l.base) * Number(l.rate) / 100;
      if (Math.abs(cents(l.cuota) - Math.round(want * 100)) > 2) push("VF-017", `breakdown line ${i + 1}: CuotaRepercutida ${l.cuota} is not ${l.rate}% of ${l.base} (${want.toFixed(2)}).`, "Recompute the tax amount from base and rate (a difference up to 0.02 is accepted here).", p, { severity: "warning" });
    }
    if (isAmount(l.surcharge) && isAmount(l.surchargeRate) && isAmount(l.base)) {
      const want = Number(l.base) * Number(l.surchargeRate) / 100;
      if (Math.abs(cents(l.surcharge) - Math.round(want * 100)) > 2) push("VF-017", `breakdown line ${i + 1}: CuotaRecargoEquivalencia ${l.surcharge} is not ${l.surchargeRate}% of ${l.base} (${want.toFixed(2)}).`, "Recompute the surcharge from base and rate.", p, { severity: "warning" });
    }
    if (!isAmount(l.base)) ok = false;
    else base += cents(l.base);
    if (l.cuota !== null) { if (isAmount(l.cuota)) cuota += cents(l.cuota); else ok = false; }
    if (l.surcharge !== null) { if (isAmount(l.surcharge)) cuota += cents(l.surcharge); else ok = false; }
  });
  if (ok && r.lines.length && isAmount(r.cuotaTotal) && cents(r.cuotaTotal) !== cuota) {
    push("VF-015", `CuotaTotal ${r.cuotaTotal} is not the sum of the breakdown's tax and surcharge amounts (${fmt(cuota)}).`, "CuotaTotal is the sum of CuotaRepercutida and CuotaRecargoEquivalencia over the lines.", "/CuotaTotal", { severity: "warning" });
  }
  if (ok && r.lines.length && isAmount(r.importeTotal) && Math.abs(cents(r.importeTotal) - (base + cuota)) > 2) {
    push("VF-016", `ImporteTotal ${r.importeTotal} is not the breakdown's bases plus tax (${fmt(base + cuota)}).`, "ImporteTotal is the bases plus tax and surcharge (a rounding difference up to 0.02 is accepted here). A withholding (IRPF) is not deducted from it.", "/ImporteTotal", { severity: "warning" });
  }
  aeatRecordRules(r, push);
  dateAndRateRules(r, push, now);
  return out;
}

// dd-mm-yyyy to yyyy-mm-dd, so dates compare as strings; null when not a real date.
const iso = (s) => (validDate(s) ? String(s).replace(DATE_RE, "$3-$2-$1") : null);
const num = (s) => (isAmount(s) ? Number(s) : null);
const inRange = (d, from, to) => !!d && d >= from && (!to || d <= to);
// The equivalence surcharge rates AEAT accepts beside each VAT rate, by the operation's
// date (FechaOperacion, else the issue date): AEAT codes 1160 to 1170 and 1277.
// The surcharge rates the AEAT accepts at all (rule 15.3 of its validation document, as
// quoted: "Solo se permiten TipoRecargoEquivalencia = 0; 0,26; 0,5; 0,62; 1; 1,4; 1,75;
// 5,2"); any other is 1127. 4% (the surcharge beside 16% and 18% VAT) is taken as the rate
// code 1135 admits up to 2012: an inference, as the code does not name the rate.
const SURCHARGE_RATES = [0, 0.26, 0.5, 0.62, 1, 1.4, 1.75, 5.2];
const SURCHARGE_FOR_RATE = [
  { rate: 21, ok: () => [5.2, 1.75], code: "1162" },
  { rate: 10, ok: () => [1.4], code: "1163" },
  { rate: 4, ok: () => [0.5], code: "1164" },
  { rate: 5, ok: (d) => (inRange(d, "2022-07-01", "2022-12-31") ? [0.5] : inRange(d, "2023-01-01", "2024-09-30") ? [0.62] : [0.5, 0.62]), code: "1160, 1167, 1168" },
  { rate: 2, ok: (d) => (inRange(d, "2024-10-01", "2024-12-31") ? [0.26] : null), code: "1166" },
  { rate: 7.5, ok: (d) => (inRange(d, "2024-10-01", "2024-12-31") ? [1] : null), code: "1169" },
  { rate: 0, ok: (d) => (inRange(d, "2023-01-01", "2024-09-30") ? [0] : inRange(d, "2024-10-01") ? [0.26] : null), code: "1165, 1170, 1277" },
];

// Record rules taken from AEAT's own list of validation errors (errores.properties,
// read from prewww2.aeat.es on 2026-11-15; verifactu-errors-data.mjs). Each finding names
// the AEAT code it anticipates, so a developer sees the rejection before sending.
function aeatRecordRules(r, push) {
  const issued = iso(r.id?.date);
  const opDate = iso(r.operationDate) || issued;
  if (issued && issued < "2024-10-28") {
    push("VF-029", `the issue date ${r.id.date} is before 28 October 2024, the earliest date AEAT accepts.`, "Check the issue date; AEAT rejects a record issued before 28-10-2024 (code 1152).", "/IDFactura/FechaExpedicionFactura");
  }
  // Macrodato: S exactly when |ImporteTotal| >= 100,000,000 (1137, 1138, 1139).
  const total = num(r.importeTotal);
  if (r.macrodato !== null && !["S", "N"].includes(r.macrodato)) {
    push("VF-030", `Macrodato is "${r.macrodato}", not S or N.`, "Write Macrodato S or N (AEAT code 1137).", "/Macrodato");
  } else if (total !== null) {
    const big = Math.abs(total) >= 100000000;
    if (big && r.macrodato !== "S") push("VF-030", `ImporteTotal ${r.importeTotal} is 100,000,000 or more but Macrodato is not S.`, "Write Macrodato S on a record of 100 million or more (AEAT code 1139).", "/Macrodato");
    if (!big && r.macrodato === "S") push("VF-030", `Macrodato is S but ImporteTotal ${r.importeTotal} is under 100,000,000.`, "Remove Macrodato or write N (AEAT code 1138).", "/Macrodato");
  }
  // A simplified invoice is capped at 3,000 unless the buyer-less art. 61d flag or a
  // billing agreement says otherwise (1150).
  if (r.type === "F2" && r.agreement === null && r.art61d !== "S") {
    let sum = 0, ok = true;
    for (const l of r.lines) {
      for (const v of [l.base, l.cuota]) if (v !== null) { if (isAmount(v)) sum += cents(v); else ok = false; }
    }
    if (ok && sum > 300000) push("VF-031", `is a simplified invoice (F2) whose bases and tax add up to ${fmt(sum)}, over 3,000.`, "Issue a full invoice (F1) naming the buyer; an F2 above 3,000 needs FacturaSinIdentifDestinatarioArt61d S or a billing agreement (AEAT code 1150).", "/TipoFactura");
  }
  // The S/N flags and the invoice types they go with (1136, 1183, 1184, 1185).
  for (const [name, v, types, code] of [["FacturaSimplificadaArticulos7273", r.art7273, ["F1", "F3", "R1", "R2", "R3", "R4"], "1136, 1183"], ["FacturaSinIdentifDestinatarioArt61d", r.art61d, ["F2", "R5"], "1184, 1185"]]) {
    if (v === null) continue;
    if (!["S", "N"].includes(v)) push("VF-037", `${name} is "${v}", not S or N.`, `Write ${name} S or N (AEAT codes ${code}).`, `/${name}`);
    else if (v === "S" && r.type && !types.includes(r.type)) push("VF-037", `${name} is S on a ${r.type}; AEAT allows S only on ${types.join(", ")}.`, `Remove ${name} or change the invoice type (AEAT codes ${code}).`, `/${name}`);
  }
  // FacturasSustituidas belong to an F3 only (1116).
  if (r.type && r.type !== "F3" && r.replaced.length) {
    push("VF-025", `is ${r.type} but lists FacturasSustituidas.`, "Only an F3 (an invoice replacing simplified invoices) lists FacturasSustituidas (AEAT code 1116).", "/FacturasSustituidas");
  }
  // Recipients: who may receive which corrective type, and not the issuer itself.
  r.recipients.forEach((d, i) => {
    const p = `/Destinatarios/IDDestinatario[${i + 1}]`;
    const t = d.other?.type;
    if (r.type === "R3" && d.other && t !== "07") push("VF-039", `is an R3 (bad-debt correction) whose recipient ${i + 1} is identified by IDOtro type ${t ?? "?"}.`, "An R3 names the buyer by NIF or IDType 07 (not in the census) only (AEAT code 1191).", p);
    if (r.type === "R2" && d.other && !["02", "07"].includes(t)) push("VF-039", `is an R2 (insolvency correction) whose recipient ${i + 1} is identified by IDOtro type ${t ?? "?"}.`, "An R2 names the buyer by NIF, IDType 02 (VAT number) or 07 (not in the census) only (AEAT code 1192).", p);
    // Rule 13: a recipient by IDOtro IDType 02 (NIF-IVA) only on F1, F3, R1-R4 (1156).
    if (t === "02" && r.type && !["F1", "F3", "R1", "R2", "R3", "R4"].includes(r.type)) push("VF-039", `is a ${r.type} whose recipient ${i + 1} is identified by an EU VAT number (IDOtro type 02).`, "A recipient identified by NIF-IVA goes on an F1, F3 or R1-R4 only (AEAT code 1156).", p);
    if (d.nif && r.id?.issuer && d.nif.toUpperCase() === r.id.issuer.toUpperCase()) push("VF-040", `recipient ${i + 1}'s NIF is the issuer's own (${d.nif}).`, "The buyer's NIF must differ from the issuer's (AEAT code 1193).", `${p}/NIF`);
  });
  // Issued by a third party or the recipient (1151, 1155, 1158, 1159, 1186, 1187, 1188, 1211).
  if (r.issuedBy !== null && !["T", "D"].includes(r.issuedBy)) {
    push("VF-041", `EmitidaPorTerceroODestinatario is "${r.issuedBy}", not T or D.`, "Write T (issued by a third party) or D (issued by the recipient) (AEAT code 1151).", "/EmitidaPorTerceroODestinatario");
  }
  if (r.issuedBy === "T" && !r.third) push("VF-041", "says the invoice was issued by a third party (EmitidaPorTerceroODestinatario T) but has no Tercero block.", "Identify the third party in Tercero (AEAT codes 1158, 1186).", "/Tercero");
  if (r.third && r.issuedBy !== "T") push("VF-041", `has a Tercero block but EmitidaPorTerceroODestinatario is ${r.issuedBy ?? "absent"}, not T.`, "Fill Tercero only when a third party issued the invoice, with EmitidaPorTerceroODestinatario T (AEAT codes 1155, 1159, 1187).", "/Tercero");
  if (r.third?.nif && r.id?.issuer && r.third.nif.toUpperCase() === r.id.issuer.toUpperCase()) push("VF-041", `the third party's NIF is the issuer's own (${r.third.nif}).`, "The third party (Tercero) is someone other than the issuer (AEAT code 1188).", "/Tercero/NIF");
  if (r.third?.type === "07") push("VF-041", "the third party is identified as not in the census (IDType 07).", "A third party issuer cannot be IDType 07 (AEAT code 1211).", "/Tercero/IDOtro/IDType");

  // Breakdown lines against AEAT's regime and qualification rules.
  r.lines.forEach((l, i) => {
    const p = `/Desglose/DetalleDesglose[${i + 1}]`;
    const q = l.qualification, e = l.exempt;
    const vatLike = l.tax === "01" || l.tax === "03";
    const rate = num(l.rate), cuotaL = num(l.cuota), baseL = num(l.base), sRate = num(l.surchargeRate);
    const reg = (code, msg, fix) => push("VF-038", `breakdown line ${i + 1}: ${msg}`, `${fix} (AEAT code ${code}).`, p);
    if (vatLike && !l.regime) reg("1245", `tax ${l.tax} with no ClaveRegimen.`, "Write ClaveRegimen on every VAT or IGIC line");
    // 1260 allows ClaveRegimen only on VAT and IGIC, but the later 2009 (record accepted, to
    // be corrected) asks for it on IPSI (02) too; AEAT's list carries both, so IPSI is left out.
    if (!vatLike && l.tax !== "02" && l.regime) reg("1260", `ClaveRegimen ${l.regime} on tax ${l.tax}, which takes none.`, "Write ClaveRegimen only on VAT (01) or IGIC (03) lines");
    if (l.tax === "02" && !l.regime) push("VF-038", `breakdown line ${i + 1}: IPSI (tax 02) with no ClaveRegimen.`, "Write ClaveRegimen on an IPSI line; AEAT accepts the record but asks for a correction (AEAT code 2009).", p, { severity: "warning" });
    if (l.regime === "02" && vatLike && q) reg("1286", `regime 02 (export) with CalificacionOperacion ${q}.`, "A regime 02 VAT or IGIC line is exempt: write OperacionExenta, not CalificacionOperacion");
    // Rule 15.5: E7 and E8 are IGIC-only exemptions; on VAT (01 or no Impuesto) the list is L10, E1-E6.
    if (["E7", "E8"].includes(e) && l.tax === "01") reg("1182", `exemption ${e} on tax ${l.tax}; E7 and E8 exist only under IGIC (03).`, "Under VAT use E1-E6; E7 and E8 are Canary Islands IGIC exemptions");
    // Rule 15.6: VAT takes list L8A, IGIC L8B plus 20 and 21; 21 (simplified regime) is in L8B only.
    if (l.regime === "21" && l.tax === "01") reg("1246", `ClaveRegimen 21 on tax ${l.tax}; 21 (simplified regime) is an IGIC key.`, "Under VAT the simplified regime is ClaveRegimen 20; 21 goes only on IGIC (03) lines");
    if (l.regime === "20" && q !== "N2") reg("1293", `regime 20 with ${q || e || "no qualification"}.`, "Regime 20 lines carry CalificacionOperacion N2");
    if (e === "E5" && l.tax === "01" && r.recipients.some((d) => d.nif)) reg("1289", "exemption E5 (intra-EU supply) with a recipient identified by Spanish NIF.", "An E5 line's buyer is identified by IDOtro only");
    if (l.regime === "01" && vatLike && ["E2", "E3"].includes(e)) reg("1199", `general regime (01) with exemption ${e} (an export).`, "Exports (E2, E3) go under ClaveRegimen 02, not 01");
    if (l.regime === "03" && q && q !== "S1") reg("1200", `regime 03 (second-hand goods) with ${q}.`, "Regime 03 lines are S1");
    if (l.regime === "03" && e) reg("1200", `regime 03 (second-hand goods) on an exempt line (${e}).`, "Regime 03 lines are S1");
    if (l.regime === "04" && q && q !== "S2") reg("1201", `regime 04 (investment gold) with ${q}.`, "Regime 04 lines are S2 or exempt");
    if (l.regime === "06" && ["F2", "F3", "R5"].includes(r.type)) reg("1202", `regime 06 (VAT groups) on an invoice of type ${r.type}.`, "A regime 06 line cannot sit on an F2, F3 or R5");
    if (l.regime === "06" && l.baseAtCost === null) reg("1202", "regime 06 (VAT groups) without BaseImponibleACoste.", "Write BaseImponibleACoste on a regime 06 line");
    if (l.baseAtCost !== null && l.regime !== "06" && !["02", "05"].includes(l.tax)) reg("1257", `BaseImponibleACoste outside regime 06 (regime ${l.regime ?? "none"}, tax ${l.tax}).`, "BaseImponibleACoste goes only with ClaveRegimen 06 or tax 02 (IPSI) or 05 (other)");
    if (l.regime === "07" && (["E2", "E3", "E4", "E5"].includes(e) || ["S2", "N1", "N2"].includes(q))) reg("1203", `regime 07 (cash accounting) with ${e || q}.`, "Regime 07 excludes E2-E5, S2, N1 and N2");
    if (l.regime === "08" && q !== "N2") reg("1252", `regime 08 with ${q || e || "no qualification"}.`, "Regime 08 lines carry CalificacionOperacion N2");
    if (l.regime === "10") {
      if (q !== "N1") reg("1205", `regime 10 (collections for third parties) with ${q || e || "no qualification"}.`, "Regime 10 lines carry CalificacionOperacion N1");
      if (r.type !== "F1") reg("1205", `regime 10 on an invoice of type ${r.type}.`, "Regime 10 goes on an F1");
      if (!r.recipients.some((d) => d.nif)) reg("1205", "regime 10 with no recipient identified by NIF.", "Regime 10 names the buyer by NIF");
    }
    if (l.regime === "11" && l.tax === "01" && q === "S1" && rate !== null && rate !== 21) reg("1206", `regime 11 (business premises lease) at ${l.rate}%.`, "Regime 11 lines are taxed at 21%");
    if (l.regime === "14") {
      if (r.type && !["F1", "R1", "R2", "R3", "R4"].includes(r.type)) reg("1148", `regime 14 (public works certification) on an invoice of type ${r.type}.`, "Regime 14 goes on F1 or R1-R4");
      const od = iso(r.operationDate);
      if (!od) reg("1147", "regime 14 with no FechaOperacion.", "Regime 14 needs FechaOperacion, later than the issue date");
      else if (issued && od <= issued) reg("1147", `regime 14 with FechaOperacion ${r.operationDate} not after the issue date ${r.id.date}.`, "Regime 14 needs FechaOperacion later than the issue date");
    }
    if (q === "S2") {
      if (r.type && !["F1", "F3", "R1", "R2", "R3", "R4"].includes(r.type)) push("VF-034", `breakdown line ${i + 1} is S2 (reverse charge) on an invoice of type ${r.type}.`, "A reverse-charge line goes on F1, F3 or R1-R4 (AEAT code 1197).", p);
      if ((rate !== null && rate !== 0) || (cuotaL !== null && cuotaL !== 0)) push("VF-034", `breakdown line ${i + 1} is S2 (reverse charge, the buyer pays the tax) but carries rate ${l.rate} and tax ${l.cuota}.`, "Write TipoImpositivo 0 and CuotaRepercutida 0 on an S2 line (AEAT codes 1198 and 1207).", p);
    }
    if (cuotaL && baseL && Math.sign(cuotaL) !== Math.sign(baseL)) push("VF-035", `breakdown line ${i + 1}: CuotaRepercutida ${l.cuota} and BaseImponibleOimporteNoSujeto ${l.base} have opposite signs.`, "Tax and base carry the same sign; a refund makes both negative (AEAT code 1143).", p);
    const atCost = num(l.baseAtCost);
    if (cuotaL && atCost && Math.sign(cuotaL) !== Math.sign(atCost)) push("VF-035", `breakdown line ${i + 1}: CuotaRepercutida ${l.cuota} and BaseImponibleACoste ${l.baseAtCost} have opposite signs.`, "Tax and base at cost carry the same sign (AEAT code 1140).", p);
    // Equivalence surcharge (1279, 1280 are VF-028; 1281, 1284 and the rate table here).
    const hasRate = l.surchargeRate !== null, hasAmt = l.surcharge !== null;
    if (hasRate !== hasAmt) push("VF-033", `breakdown line ${i + 1} has ${hasRate ? "TipoRecargoEquivalencia without CuotaRecargoEquivalencia" : "CuotaRecargoEquivalencia without TipoRecargoEquivalencia"}.`, "Write the surcharge rate and amount together (AEAT code 1284).", p);
    if ((hasRate || hasAmt) && q && q !== "S1") push("VF-033", `breakdown line ${i + 1} carries an equivalence surcharge on a ${q} line.`, "The surcharge goes only on S1 lines (AEAT code 1281).", p);
    if (l.tax === "01" && q === "S1" && sRate !== null && !SURCHARGE_RATES.includes(sRate)) {
      const sp = `${p}/TipoRecargoEquivalencia`;
      if (sRate === 4 && opDate && opDate > "2012-12-31") push("VF-032", `breakdown line ${i + 1}: surcharge rate 4% on ${opDate}; 4% applied only up to 2012.`, "Use the surcharge rate in force on the operation's date (AEAT code 1135).", sp);
      else if (sRate !== 4) push("VF-032", `breakdown line ${i + 1}: surcharge rate ${l.surchargeRate}% is not in the AEAT's list (0, 0.26, 0.5, 0.62, 1, 1.4, 1.75, 5.2; 4 up to 2012).`, "Use one of the AEAT's surcharge rates (AEAT code 1127).", sp);
    }
    if (l.tax === "01" && sRate !== null && rate !== null) {
      const row = SURCHARGE_FOR_RATE.find((x) => x.rate === rate);
      const allowed = row?.ok(opDate);
      if (row && allowed && !allowed.includes(sRate)) push("VF-032", `breakdown line ${i + 1}: surcharge rate ${l.surchargeRate}% beside VAT ${l.rate}% on ${opDate ?? "an unknown date"}; AEAT accepts ${allowed.join(" or ")}%.`, `Use the surcharge rate that goes with the VAT rate on the operation's date (AEAT code ${row.code}).`, p);
      if (row && !allowed) push("VF-032", `breakdown line ${i + 1}: VAT ${l.rate}% with an equivalence surcharge on ${opDate ?? "an unknown date"}, a date for which AEAT lists no surcharge rate at ${l.rate}%.`, `Check the VAT rate and the operation's date (AEAT code ${row.code}).`, p);
    }
  });
}

// Values outside the schema's code lists, the S/N flags of SistemaInformatico, and the
// Generador block of a cancellation (AEAT codes 1101, 1111, 1212, 1213, 1218, 1224-1231,
// 1246, 1254, 1255). The lists are in verifactu-lists.mjs.
function listRules(r, push) {
  const parties = [
    ...r.recipients.map((d, i) => [`recipient ${i + 1}`, d.other, `/Destinatarios/IDDestinatario[${i + 1}]/IDOtro`]),
    ["the third party", r.third?.ids, "/Tercero/IDOtro"],
    ["the generator", r.generator?.other, "/Generador/IDOtro"],
  ];
  const opDate = iso(r.operationDate) || iso(r.id?.date);
  for (const [who, o, p] of parties) {
    if (!o) continue;
    if (o.country && !COUNTRY_CODES.has(o.country)) push("VF-043", `${who}'s CodigoPais "${o.country}" is not in the AEAT's country list.`, "Use the ISO 3166 two-letter code from the AEAT's list (CountryType2); Greece is GR there, Northern Ireland has no code of its own (AEAT code 1101).", `${p}/CodigoPais`);
    if (!o.country && o.type && o.type !== "02") push("VF-043", `${who} is identified by IDOtro type ${o.type} with no CodigoPais.`, "Write CodigoPais; only a VAT number (IDType 02) may leave it out, as its prefix names the country (AEAT code 1111).", `${p}/CodigoPais`);
    if (o.type && !ID_TYPES.has(o.type)) push("VF-043", `${who}'s IDType "${o.type}" is not one of 02 to 07.`, `Use 02 (VAT number), 03 (passport), 04 (official ID of the country of residence), 05 (residence certificate), 06 (other document) or 07 (not in the census) (AEAT code ${who === "the generator" ? "1231" : "1100"}).`, `${p}/IDType`);
    // NIF-IVA prefixes around Brexit: XI (Northern Ireland) from 2021, GB until January 2021.
    const id = String(o.id || "").toUpperCase();
    if (o.type === "02" && opDate) {
      if (id.startsWith("XI") && opDate < "2021-01-01") push("VF-046", `${who}'s VAT number ${o.id} starts with XI on an operation dated before 1 January 2021.`, "XI numbers (Northern Ireland) exist from 2021; use the GB number for earlier operations (AEAT code 1254).", `${p}/ID`);
      if (id.startsWith("GB") && opDate >= "2021-02-01") push("VF-046", `${who}'s VAT number ${o.id} starts with GB on an operation dated ${opDate}, after Brexit.`, "A British VAT number is no longer an EU VAT number (IDType 02): a Northern Ireland trader goes as XI, others under IDType 04 or 06 (AEAT code 1255).", `${p}/IDType`);
    }
  }
  for (const f of r.systemFlags || []) {
    if (f.value !== null && !["S", "N"].includes(f.value)) push("VF-043", `SistemaInformatico/${f.name} is "${f.value}", not S or N.`, `Write ${f.name} S or N (AEAT code ${f.code}).`, `/SistemaInformatico/${f.name}`);
  }
  r.lines.forEach((l, i) => {
    const p = `/Desglose/DetalleDesglose[${i + 1}]`;
    if (l.rawTax !== null && !TAX_CODES.has(l.rawTax)) push("VF-043", `breakdown line ${i + 1}: Impuesto "${l.rawTax}" is not 01 (VAT), 02 (IPSI), 03 (IGIC) or 05 (other).`, "Use one of the four tax codes (AEAT code 1218).", `${p}/Impuesto`);
    if (l.regime !== null && !REGIME_CODES.has(l.regime)) push("VF-043", `breakdown line ${i + 1}: ClaveRegimen "${l.regime}" is not in the AEAT's list.`, `Use one of ${[...REGIME_CODES].join(", ")}; 12, 13 and 16 are not VERI*FACTU regime keys (AEAT code 1246).`, `${p}/ClaveRegimen`);
  });
  // Generador: who generated a cancellation record (RegistroAnulacion only).
  const g = r.generator, by = r.generatedBy;
  if (by === null && !g) return;
  const P = "/Generador";
  if ((by === null) !== !g) push("VF-047", by === null ? "has a Generador block but no GeneradoPor." : `says GeneradoPor ${by} but has no Generador block.`, "Write GeneradoPor and Generador together, or neither (AEAT code 1224).", by === null ? "/GeneradoPor" : P);
  if (by !== null && !GENERATED_BY.has(by)) push("VF-047", `GeneradoPor is "${by}", not E, D or T.`, "Write E (the issuer), D (the recipient) or T (a third party) (AEAT code 1225).", "/GeneradoPor");
  if (!g) return;
  if (!!g.nif === !!g.other) push("VF-047", g.nif ? "Generador carries both NIF and IDOtro." : "Generador carries neither NIF nor IDOtro.", "Identify the generator by NIF or by IDOtro, one of the two (AEAT code 1228).", P);
  if (by === "E" && !g.nif) push("VF-047", "GeneradoPor is E (the issuer) but Generador has no NIF.", "The issuer generating its own cancellation is identified by NIF (AEAT code 1227).", `${P}/NIF`);
  if (by === "T" && g.other?.type === "07") push("VF-047", "GeneradoPor is T (a third party) with Generador IDType 07 (not in the census).", "A third party that generates the record cannot be IDType 07 (AEAT code 1229).", `${P}/IDOtro/IDType`);
  if (by === "D" && g.other?.country === "ES" && g.other.type && !["03", "07"].includes(g.other.type)) push("VF-047", `GeneradoPor is D (the recipient), Spanish (CodigoPais ES), with Generador IDType ${g.other.type}.`, "A Spanish recipient in IDOtro is a passport (03) or not in the census (07); otherwise use NIF (AEAT code 1230).", `${P}/IDOtro/IDType`);
  if (g.nif && !nifLike(g.nif)) push("VF-047", `Generador's NIF "${g.nif}" is not shaped like a Spanish NIF.`, "Write the NIF without spaces, dashes or the ES prefix (AEAT code 1258).", `${P}/NIF`);
  else if (g.nif && !esOk(g.nif)) push("VF-047", `Generador's NIF ${g.nif} fails its check character.`, "Check the NIF; AEAT matches it against its census (AEAT code 1258).", `${P}/NIF`, { severity: "warning" });
  if (g.nif && by !== "E" && r.id?.issuer && g.nif.toUpperCase() === r.id.issuer.toUpperCase()) push("VF-047", `GeneradoPor is ${by ?? "absent"} but Generador's NIF is the issuer's own (${g.nif}).`, "Only GeneradoPor E names the issuer; a recipient or third party has its own NIF (AEAT code 1259).", `${P}/NIF`);
}

// The VAT rates the AEAT accepts on an S1 line under Impuesto 01 (or none), with the
// dates each holds. The AEAT's "Validaciones y errores" document, section 3.1.3 rule
// 15.1, as quoted by two independent projects (eval/verifactu-rate-lists-2026-11-15.md):
// "Solo se permiten TipoImpositivo = 0; 2; 4; 5; 7,5; 10 y 21"; 5 only from 1 July 2022
// to 30 September 2024 (1194); 2 and 7.5 only from 1 October to 31 December 2024 (1235,
// 1236). Any other rate is 1124. 7, 8, 16 and 18 are not in that quoted list, but code
// 1132 says the AEAT admits a rate up to 2012, and these were Spain's rates then, so they
// pass up to 2012 (an inference from 1132, not the document's text).
const VAT_RATE_WINDOWS = [
  { rate: 21 }, { rate: 10 }, { rate: 4 }, { rate: 0 },
  { rate: 5, from: "2022-07-01", to: "2024-09-30", code: "1194" },
  { rate: 2, from: "2024-10-01", to: "2024-12-31", code: "1235, 1236" },
  { rate: 7.5, from: "2024-10-01", to: "2024-12-31", code: "1235, 1236" },
  ...[7, 8, 16, 18].map((rate) => ({ rate, to: "2012-12-31", code: "1132" })),
];
const ymd = (d) => d.toISOString().slice(0, 10);
const yearsBefore = (d, n) => `${String(d.getUTCFullYear() - n).padStart(4, "0")}${ymd(d).slice(4)}`;

// Dates against the AEAT's clock (1133, 1134, 1146, 1173) and the VAT rate list by date
// (1124, 1132, 1194, 1235, 1236). `now` is the day the record would be sent.
function dateAndRateRules(r, push, now) {
  const today = ymd(now), floor = yearsBefore(now, 20);
  const issued = iso(r.id?.date), op = iso(r.operationDate);
  if (issued && issued < floor) push("VF-044", `the issue date ${r.id.date} is more than twenty years before ${today}.`, "Check the issue date's year (AEAT code 1133).", "/IDFactura/FechaExpedicionFactura");
  if (op && op < floor) push("VF-044", `FechaOperacion ${r.operationDate} is more than twenty years before ${today}.`, "Check the operation date's year (AEAT code 1134).", "/FechaOperacion");
  // An operation after the issue date, or in the future, is allowed only for public works
  // certifications and similar (ClaveRegimen 14 or 15 on VAT, IGIC or an empty Impuesto).
  const deferred = r.lines.some((l) => ["14", "15"].includes(l.regime) && (l.rawTax === null || l.rawTax === "01" || l.rawTax === "03"));
  if (op && issued && op > issued && !deferred) push("VF-044", `FechaOperacion ${r.operationDate} is after the issue date ${r.id.date}, and no breakdown line is under ClaveRegimen 14 or 15.`, "An invoice is issued on or after the operation; only regimes 14 and 15 (VAT or IGIC) may invoice ahead of it (AEAT code 1146).", "/FechaOperacion");
  if (op && op > today && !deferred) push("VF-044", `FechaOperacion ${r.operationDate} is in the future (after ${today}), and no breakdown line is under ClaveRegimen 14 or 15.`, "Only regimes 14 and 15 (VAT or IGIC) may carry a future operation date (AEAT code 1173).", "/FechaOperacion");
  const when = op || issued;
  r.lines.forEach((l, i) => {
    if (l.rawTax !== null && l.rawTax !== "01") return; // IGIC and IPSI rates differ; not checked
    if (l.qualification !== "S1") return; // rule 15.1 is about S1 lines (S2 is VF-034's 0%)
    const rate = num(l.rate);
    if (rate === null) return;
    const p = `/Desglose/DetalleDesglose[${i + 1}]/TipoImpositivo`;
    const row = VAT_RATE_WINDOWS.find((w) => w.rate === rate);
    if (!row) { push("VF-045", `breakdown line ${i + 1}: VAT rate ${l.rate}% is not in the AEAT's list for an S1 line (0, 2, 4, 5, 7.5, 10, 21; 7, 8, 16, 18 up to 2012).`, "Use one of the AEAT's VAT rates; it rejects any other on an S1 line (AEAT code 1124).", p); return; }
    if (when && (row.from || row.to) && !inRange(when, row.from || "0000-01-01", row.to)) push("VF-045", `breakdown line ${i + 1}: VAT ${l.rate}% on ${when}, outside the dates it applied (${row.from ?? "until"}${row.from ? " to " : " "}${row.to}).`, `Use the rate in force on the operation's date (FechaOperacion, else the issue date) (AEAT code ${row.code}).`, p);
  });
}

// Chain findings across every record of a batch. `all` holds { record, file } pairs.
export function chainFindings(all) {
  const out = [];
  const byHuella = new Map();
  for (const e of all) if (e.record.huella) byHuella.set(e.record.huella.toUpperCase(), e);
  const recordId = (r) => r.id;
  const children = new Map();
  for (const e of all) {
    const r = e.record;
    if (!r.prev || !r.prev.huella) continue;
    const label = `${e.file}: ${r.kind === "alta" ? "record" : "cancellation record"} ${r.index + 1} (${idText(r.id)})`;
    const key = r.prev.huella.toUpperCase();
    const parent = byHuella.get(key);
    const sameIdParent = all.find((o) => o !== e && sameId(recordId(o.record), r.prev));
    if (parent) {
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(e);
      if (!sameId(recordId(parent.record), r.prev)) {
        out.push({ file: e.file, rule: "VF-006", message: `${label}: RegistroAnterior carries the fingerprint of ${idText(parent.record.id)} but names ${idText(r.prev)}.`, fix: "Copy the previous record's IDEmisorFactura, NumSerieFactura and FechaExpedicionFactura together with its Huella.", path: "/Encadenamiento/RegistroAnterior" });
      }
      const a = parent.record.generated, b = r.generated;
      if (a && b && TS_RE.test(a) && TS_RE.test(b) && Date.parse(b) < Date.parse(a)) {
        out.push({ file: e.file, rule: "VF-008", severity: "warning", message: `${label}: generated at ${b}, before the record it chains to (${a}).`, fix: "Records are chained in the order they are generated; check the system clock or the order the records were written.", path: "/FechaHoraHusoGenRegistro" });
      }
    } else if (sameIdParent) {
      const stored = sameIdParent.record.huella || "(none)";
      const recomputed = sameIdParent.record.expectedHuella;
      const hint = recomputed && recomputed === key ? " It equals that record's recomputed fingerprint, so the earlier record's own Huella is the wrong one." : "";
      out.push({ file: e.file, rule: "VF-005", message: `${label}: RegistroAnterior names ${idText(r.prev)}, which is in this batch (${sameIdParent.file}), but its fingerprint ${r.prev.huella} differs from that record's Huella ${stored}.${hint}`, fix: "Copy the previous record's Huella exactly as it was stored; the chain breaks on the first character that differs.", path: "/Encadenamiento/RegistroAnterior/Huella" });
    }
  }
  for (const [key, list] of children) {
    if (list.length > 1) {
      const parent = byHuella.get(key);
      out.push({ file: list[1].file, rule: "VF-007", message: `${list.length} records chain to the same previous record ${idText(parent.record.id)}: ${list.map((e) => idText(e.record.id)).join("; ")}. The chain has forked.`, fix: "Each record chains to the one generated just before it; two records with one predecessor mean two systems, or two threads, wrote to one chain. Rebuild the chain in generation order.", path: "/Encadenamiento/RegistroAnterior" });
    }
  }
  return out;
}

// The URL the invoice's QR code carries (Orden HAC/1177/2024 art. 21; AEAT's QR
// specification). VERI*FACTU systems print ValidarQR, others ValidarQRNoVerifactu.
export function verifactuQrUrl(r, { production = true, verifactu = true } = {}) {
  const host = production ? "https://www2.agenciatributaria.gob.es" : "https://prewww2.aeat.es";
  const path = verifactu ? "/wlpl/TIKE-CONT/ValidarQR" : "/wlpl/TIKE-CONT/ValidarQRNoVerifactu";
  const q = [["nif", r.id?.issuer], ["numserie", r.id?.number], ["fecha", r.id?.date], ["importe", r.importeTotal]]
    .map(([k, v]) => `${k}=${encodeURIComponent(v ?? "")}`).join("&");
  return `${host}${path}?${q}`;
}

// One report per file; chain findings need every file's records, so the caller passes
// the whole batch's records in `batch` (defaults to this file's).
export function verifactuReport(file, records, batch = records.map((record) => ({ record, file }))) {
  const errors = [];
  for (const r of records) errors.push(...recordFindings(r));
  errors.push(...chainFindings(batch).filter((f) => f.file === file).map(({ file: _f, ...f }) => f));
  const altas = records.filter((r) => r.kind === "alta");
  const ok = records.filter((r) => r.huella && r.expectedHuella === r.huella.toUpperCase()).length;
  const env = `Read as ${records.length} Spanish VERI*FACTU billing record(s) (${altas.length} RegistroAlta, ${records.length - altas.length} RegistroAnulacion), not an invoice: ${ok} of ${records.length} fingerprint(s) match the recomputed SHA-256.`;
  return {
    file,
    errors,
    envelope: env,
    verifactu: {
      records: records.map((r) => ({
        kind: r.kind, issuer: r.id?.issuer, number: r.id?.number, date: r.id?.date, type: r.type, generated: r.generated,
        huella: r.huella, expectedHuella: r.expectedHuella, matches: !!r.huella && r.expectedHuella === r.huella.toUpperCase(),
        ...(r.huellaDiagnosis ? { diagnosis: r.huellaDiagnosis } : {}),
        ...(r.kind === "alta" ? { qr: verifactuQrUrl(r) } : {}),
      })),
    },
  };
}

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
