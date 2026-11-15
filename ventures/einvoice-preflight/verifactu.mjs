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
const EXEMPT = new Set(["E1", "E2", "E3", "E4", "E5", "E6"]);

const local = (name) => String(name || "").replace(/^[^:]*:/, "");
const kids = (node, name) => (node?.children || []).filter((c) => local(c.name) === name);
const kid = (node, name) => kids(node, name)[0] || null;
const decode = (s) => String(s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
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
  const recipients = kids(kid(node, "Destinatarios"), "IDDestinatario").map((d) => ({
    name: val(d, "NombreRazon"),
    nif: val(d, "NIF"),
    other: kid(d, "IDOtro") ? { country: val(d, "IDOtro", "CodigoPais"), type: val(d, "IDOtro", "IDType"), id: val(d, "IDOtro", "ID") } : null,
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
const idText = (id) => (id ? `${id.number || "?"} of ${id.date || "?"} (issuer ${id.issuer || "?"})` : "?");
const nifLike = (s) => /^[0-9A-Z]\d{7}[0-9A-Z]$/.test(String(s || ""));

export function readVerifactu(source) {
  const t = typeof source === "string" ? source : new TextDecoder().decode(source);
  const records = findRecords(parseXmlTree(t)).map((n, i) => readRecord(n, i));
  for (const r of records) r.expectedHuella = huellaOf(huellaPayload(r.kind, asWritten(r)));
  if (!records.length) throw new Error("No VERI*FACTU RegistroAlta or RegistroAnulacion found");
  return records;
}

// Findings for one record on its own (no chain).
export function recordFindings(r) {
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

  // Issuer NIF.
  if (r.id?.issuer && nifLike(r.id.issuer) && !esOk(r.id.issuer)) {
    push("VF-019", `the issuer NIF ${r.id.issuer} fails its check character.`, "Check the NIF; AEAT matches it against its census. (AEAT's test environment uses its own test NIFs, which may not pass this check.)", r.kind === "alta" ? "/IDFactura/IDEmisorFactura" : "/IDFactura/IDEmisorFacturaAnulada", { severity: "warning" });
  }

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
    if (!l.qualification && !l.exempt) push("VF-027", `breakdown line ${i + 1} has neither CalificacionOperacion nor OperacionExenta.`, "Say whether the line is subject (S1, S2), not subject (N1, N2) or exempt (OperacionExenta E1-E6).", p);
    if (l.qualification && l.exempt) push("VF-027", `breakdown line ${i + 1} has both CalificacionOperacion and OperacionExenta.`, "Keep one.", p);
    if (SUBJECT.has(q)) {
      if (l.rate === null || l.cuota === null) push("VF-018", `breakdown line ${i + 1} is subject (${q}) but lacks ${l.rate === null ? "TipoImpositivo" : "CuotaRepercutida"}.`, "A subject line carries its tax rate and tax amount.", p);
    } else if (NON_SUBJECT.has(q) || EXEMPT.has(q)) {
      if (l.rate !== null || l.cuota !== null || l.surcharge !== null || l.surchargeRate !== null) push("VF-018", `breakdown line ${i + 1} is ${EXEMPT.has(q) ? "exempt" : "not subject"} (${q}) yet carries a tax rate or amount.`, "Remove TipoImpositivo, CuotaRepercutida and the surcharge from a non-subject or exempt line.", p);
    } else if (q) {
      push("VF-027", `breakdown line ${i + 1} has an unknown qualification "${q}".`, "Use S1, S2, N1, N2 or E1-E6.", p);
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
  return out;
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
