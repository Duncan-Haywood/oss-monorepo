// @ts-check
// PDF to ZUGFeRD, part 1: a plain PDF invoice (no XML inside) in, the creator's draft out
// (../generate.mjs), every value found with the line it was read from, and what is still missing
// listed by the same buildInvoice() the creator uses. Proprietary (see ../LICENSE).
//
// Why: from 1 January 2027 (prior-year turnover above EUR 800k) and 1 January 2028 (everyone) a
// German business must issue structured e-invoices; France follows from 1 September 2027. Most
// small firms still send a PDF out of Word, Excel or an old invoicing program. This turns that PDF
// into a draft an accountant or the firm confirms, then the creator writes the Factur-X / ZUGFeRD
// or XRechnung file.
//
// The rule (pro/README.md, "The one rule"): nothing is guessed. Deterministic code reads the text
// layer (pdf-text.mjs); a value goes into the draft only when it was read from the page, IBANs only
// when their mod-97 check digits hold, VAT IDs only when ../vat.mjs knows their shape, and a table
// row only when its quantity times its unit price equals its amount to the cent. Where the reading
// is a judgment (which VAT ID is the seller's, which address block is the buyer's) the field says
// `check: true`. The totals printed on the PDF are compared with the ones the draft adds up to, and
// a mismatch is reported, not smoothed over. No model is called.

import { buildInvoice } from "../generate.mjs";
import { looksLikeCompleteVat, normalizeVat } from "../vat.mjs";
import { extractPdfLines } from "./pdf-text.mjs";

/** @typedef {import("./pdf-text.mjs").Line} Line */
/** @typedef {{ path: string, value: unknown, page: number, line: string, check?: boolean, note?: string }} Field */

// ---------------------------------------------------------------- numbers and dates

/**
 * An amount or quantity as printed: "1.234,56", "1 234,56 €", "1,234.56", "-12,00", "398.50 EUR".
 * `locale` decides only the one ambiguous case, a single separator followed by exactly three
 * digits ("1.000" is a thousand in German, "1,000" a thousand in English).
 * @param {string} raw @param {"de" | "fr" | "en"} [locale] @returns {number | null}
 */
export function parseAmount(raw, locale = "de") {
  let s = String(raw ?? "").replace(/[  ]/g, " ").trim();
  s = s.replace(/^(EUR|CHF|GBP|USD|€|£|\$)\s*/i, "").replace(/\s*(EUR|CHF|GBP|USD|€|£|\$)$/i, "").trim();
  let neg = false;
  if (/^-|^−/.test(s)) {
    neg = true;
    s = s.slice(1).trim();
  } else if (/-$/.test(s)) {
    neg = true;
    s = s.slice(0, -1).trim();
  }
  if (!/^\d{1,3}(?:[ .,']?\d{3})*(?:[.,]\d+)?$|^\d+(?:[.,]\d+)?$/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  let intPart = s;
  let frac = "";
  if (lastSep >= 0) {
    const sep = s[lastSep];
    const after = s.slice(lastSep + 1);
    const sameSepCount = s.split(sep).length - 1;
    const otherSep = sep === "," ? "." : ",";
    const thousands =
      after.length === 3 &&
      (sameSepCount > 1 || (!s.includes(otherSep) && ((sep === "." && locale !== "en") || (sep === "," && locale === "en"))));
    if (!thousands) {
      intPart = s.slice(0, lastSep);
      frac = after;
    }
  }
  const digits = intPart.replace(/[ .,']/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(`${digits}${frac ? `.${frac}` : ""}`);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const MONTHS = {
  jan: 1, januar: 1, january: 1, janvier: 1, jän: 1, jänner: 1,
  feb: 2, februar: 2, february: 2, février: 2, fevrier: 2,
  mär: 3, märz: 3, maerz: 3, mar: 3, march: 3, mars: 3,
  apr: 4, april: 4, avril: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6, juin: 6,
  jul: 7, juli: 7, july: 7, juillet: 7,
  aug: 8, august: 8, août: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  okt: 10, oct: 10, oktober: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dez: 12, dec: 12, dezember: 12, december: 12, décembre: 12, decembre: 12,
};

const iso = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * The first date in a piece of text, as YYYY-MM-DD: ISO, day-first numeric (15.10.2026,
 * 15/10/2026, 15.10.26) or written out (15. Oktober 2026, 15 octobre 2026, October 15, 2026).
 * Day-first because the customers are German and French; "10/15/2026" still reads (no month 15).
 * @param {string} s @returns {string | null}
 */
export function findDate(s) {
  const text = String(s ?? "");
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[2], +m[1]) ?? iso(y, +m[1], +m[2]);
  }
  m = /\b(\d{1,2})\.?\s+([A-Za-zÄÖÜäöüéûÉ]+)\.?\s+(\d{4})\b/.exec(text);
  if (m) {
    const mon = MONTHS[/** @type {keyof typeof MONTHS} */ (m[2].toLowerCase())];
    if (mon) return iso(+m[3], mon, +m[1]);
  }
  m = /\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(text);
  if (m) {
    const mon = MONTHS[/** @type {keyof typeof MONTHS} */ (m[1].toLowerCase())];
    if (mon) return iso(+m[3], mon, +m[2]);
  }
  return null;
}

/** ISO 13616 mod-97 check of a compact IBAN. @param {string} iban */
export function ibanChecksumOk(iban) {
  const s = iban.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const cents = (/** @type {number} */ n) => Math.round(n * 100);

/** IBAN lengths (ISO 13616 registry) for the countries whose invoices this mostly reads. */
const IBAN_LENGTH = /** @type {Record<string, number>} */ ({
  DE: 22, FR: 27, AT: 20, CH: 21, LI: 21, BE: 16, NL: 18, LU: 20, IT: 27, ES: 24, PT: 25, PL: 28, CZ: 24, SK: 24,
  HU: 28, HR: 21, SI: 19, GR: 27, MC: 27, GB: 22, IE: 22, DK: 18, SE: 24, FI: 18, NO: 15, EE: 20, LV: 21, LT: 20,
  RO: 24, BG: 22, CY: 28, MT: 31,
});

// ---------------------------------------------------------------- labels

const L = {
  number: /^(?:rechnungs?[\s-]?(?:nr|nummer|no)\.?|rechnung\s*(?:nr\.?|nummer|no\.?)|beleg(?:nummer|nr\.?)|invoice\s*(?:no\.?|number|#|nr\.?)|invoice\s+number|number|nr\.|n[°ºo]\.?\s*(?:de\s*)?facture|facture\s*n[°ºo]\.?|num[ée]ro\s*(?:de\s*)?facture)\s*[:#]?/i,
  issue: /^(?:rechnungsdatum|belegdatum|datum|invoice\s*date|issue\s*date|date\s*(?:de\s*(?:la\s*)?facture|d['’]émission|d['’]emission)|date)\s*:?/i,
  due: /^(?:fällig(?:keit|keitsdatum)?(?:\s*am)?|faellig(?:\s*am)?|zahlbar\s*bis(?:\s*zum)?|zahlungsziel|due\s*date|payment\s*due|due|(?:date\s*d['’])?[ée]ch[ée]ance|à\s*payer\s*avant\s*le|a\s*payer\s*avant\s*le)\s*:?/i,
  delivery: /^(?:leistungsdatum|lieferdatum|liefer-?\s*\/\s*leistungsdatum|delivery\s*date|date\s*de\s*(?:livraison|prestation))\s*:?/i,
  buyerRef: /^(?:leitweg-?id|buyer\s*reference|käuferreferenz|kaeuferreferenz|ihr\s*zeichen|référence\s*acheteur)\s*:?/i,
  order: /^(?:bestell(?:nummer|nr\.?|ung)|ihre\s*bestellung(?:\s*nr\.?)?|auftrags?(?:nummer|nr\.?)|order(?:\s*(?:no\.?|number|ref(?:erence)?))?|po(?:\s*(?:no\.?|number))?|bon\s*de\s*commande|commande\s*n[°ºo]?)\s*:?/i,
  vat: /(?:ust\.?[\s-]*id(?:\.?[\s-]*nr\.?)?|ust-?idnr\.?|umsatzsteuer-?\s*identifikationsnummer|vat\s*(?:id|no\.?|number|reg(?:istration)?(?:\s*no\.?)?)|tva\s*intra(?:communautaire)?|n[°ºo]\s*(?:de\s*)?tva(?:\s*intracommunautaire)?|uid(?:-?nr\.?)?)\s*:?/i,
  buyerHint: /\b(?:ihre?|your|votre|kunde|kunden|customer|client|acheteur|empfänger|leistungsempfänger)\b/i,
  taxNumber: /(?:steuer-?\s*nr\.?|steuernummer|st\.?-?\s*nr\.?)\s*:?\s*([0-9][0-9 /]{8,15}[0-9])/i,
  bic: /\b(?:bic|swift)(?:\s*code)?\s*:?\s*([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i,
  phone: /\b(?:tel(?:efon)?|phone|tél(?:éphone)?|fon)\.?\s*:?\s*(\+?[0-9][0-9 ()/\-.]{5,20}[0-9])/i,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  terms: /^(?:zahlungsbedingungen|zahlungsziel|zahlbar|payment\s*terms|terms|conditions\s*de\s*(?:paiement|règlement)|modalités\s*de\s*paiement)\s*:?\s*/i,
  net: /^(?:summe\s*netto|nettosumme|netto(?:betrag|summe)?|gesamt\s*netto|zwischensumme|summe\s*(?:der\s*)?positionen|positionssumme|warenwert|total\s*net|net\s*total|subtotal|sub-total|total\s*h\.?t\.?|montant\s*h\.?t\.?|net\s*h\.?t\.?|sous-total)(?![A-Za-zÀ-ÿ])/i,
  vatAmount: /^(?:(?:zzgl\.?\s*)?(?:\d+(?:[.,]\d+)?\s*%\s*)?(?:mwst|mehrwertsteuer|ust|umsatzsteuer|vat|tva)\b|(?:total\s*(?:vat|tva))|(?:summe|gesamt)\s*(?:mwst|ust))/i,
  gross: /^(?:gesamt(?:betrag|summe)?(?:\s*brutto)?|rechnungsbetrag|bruttobetrag|brutto|endbetrag|summe\s*brutto|zu\s*zahlen(?:der\s*betrag)?|total(?:\s*ttc|\s*amount|\s*due)?|amount\s*due|montant\s*ttc|net\s*à\s*payer|net\s*a\s*payer|total\s*à\s*payer)\b/i,
  totalVatOnly: /^(?:total\s*(?:vat|tva)|summe\s*(?:mwst|ust)|gesamt\s*(?:mwst|ust))\b/i,
  seller: /^(?:from|von|absender|rechnungssteller|lieferant|verkäufer|leistender\s*unternehmer|vendeur|émetteur|emetteur|fournisseur|seller|supplier)\s*:?$/i,
  buyer: /^(?:to|an|bill\s*to|invoice\s*to|rechnungsempfänger|rechnungsadresse|kunde|empfänger|client|acheteur|destinataire|facturé\s*à|facture\s*à|buyer|customer)\s*:?$/i,
  tableDesc: /^(?:beschreibung|bezeichnung|leistung|artikel(?:bezeichnung)?|text|description|désignation|designation|libellé|libelle|item|product|produkt)\b/i,
  tableAmount: /^(?:betrag|gesamt(?:preis)?|summe|netto|net|amount|total|montant(?:\s*h\.?t\.?)?|prix\s*total)\b/i,
  // A sum that only carries forward: the foot of a page, the head of the next, a section's subtotal.
  carry: /^(?:übertrag|uebertrag|zwischensumme\s*(?:seite|blatt|titel|los|abschnitt)|summe\s*(?:seite|blatt|titel|los|abschnitt)|seitensumme|carried\s*forward|brought\s*forward|carry\s*forward|(?:sub-?total|total)\s*(?:page|this\s*page)|à\s*reporter|a\s*reporter|report(?:é)?\b|total\s*page)/i,
  // Document-level discounts (BG-20) and charges (BG-21) between the rows and the total. Skonto is
  // not one: it is a condition of payment (BT-20), not taken off the invoice.
  allowance: /\b(?:rabatt|sonderrabatt|mengenrabatt|treuerabatt|projektrabatt|nachlass|preisnachlass|discount|rebate|remise|rabais|ristourne)\b/i,
  charge: /\b(?:versand(?:kosten|pauschale)?|fracht(?:kosten)?|porto|verpackung(?:skosten)?|liefer(?:kosten|pauschale)|anfahrt(?:skosten|spauschale)?|(?:mindermengen|energie|material|eil)?zuschlag|shipping|delivery\s*(?:charge|fee|cost)|freight|postage|packaging|handling(?:\s*fee)?|surcharge|frais\s+de\s+(?:port|livraison|transport|exp[ée]dition|d[ée]placement|dossier)|port|emballage)\b/i,
  notAllowance: /skonto|escompte|early\s*payment|anzahlung|abschlag|acompte|prepaid|bereits\s*gezahlt|déjà\s*payé/i,
};

const UNITS = /** @type {Record<string, string>} */ ({
  stk: "C62", "stk.": "C62", stück: "C62", stueck: "C62", st: "C62", "st.": "C62", pcs: "C62", pc: "C62", piece: "C62", pieces: "C62", pièce: "C62", pièces: "C62", u: "C62", unit: "C62", units: "C62", x: "C62", ea: "C62", c62: "C62",
  psch: "C62", "psch.": "C62", pauschal: "C62", pauschale: "C62", flat: "C62", forfait: "C62", lump: "C62",
  std: "HUR", "std.": "HUR", stunde: "HUR", stunden: "HUR", h: "HUR", hr: "HUR", hrs: "HUR", hour: "HUR", hours: "HUR", heure: "HUR", heures: "HUR", hur: "HUR",
  tag: "DAY", tage: "DAY", day: "DAY", days: "DAY", jour: "DAY", jours: "DAY", j: "DAY",
  monat: "MON", monate: "MON", month: "MON", months: "MON", mois: "MON", mon: "MON",
  woche: "WEE", wochen: "WEE", week: "WEE", weeks: "WEE", semaine: "WEE", semaines: "WEE",
  kg: "KGM", kgm: "KGM", l: "LTR", ltr: "LTR", liter: "LTR", litre: "LTR", m: "MTR", mtr: "MTR", "m²": "MTK", m2: "MTK", qm: "MTK", mtk: "MTK", km: "KMT",
  "m³": "MTQ", m3: "MTQ", cbm: "MTQ", mtq: "MTQ", t: "TNE", tonne: "TNE", tonnen: "TNE", tne: "TNE",
  set: "SET", satz: "SET",
});

const PERCENT = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;

// ---------------------------------------------------------------- the reader

/** @param {Line[]} lines */
function detectLocale(lines) {
  const all = lines.map((l) => l.text).join("\n").toLowerCase();
  const score = (/** @type {RegExp} */ re) => (all.match(re) ?? []).length;
  const de = score(/\b(?:rechnung|mwst|ust|netto|brutto|betrag|datum|zahlbar|gesamt|menge|einzelpreis|steuer)\b/g);
  const fr = score(/\b(?:facture|tva|montant|ht|ttc|date|échéance|quantité|prix|total|désignation)\b/g);
  const en = score(/\b(?:invoice|vat|amount|net|total|due|quantity|price|description|date)\b/g);
  if (de >= fr && de >= en) return "de";
  return fr >= en ? "fr" : "en";
}

/**
 * The value that belongs to a label on a line: the rest of the label's cell, else the next cell,
 * else the first cell of the next line on the same page.
 * @param {Line[]} lines @param {number} i @param {number} c @param {RegExp} label
 */
function valueAfter(lines, i, c, label) {
  const rest = lines[i].cells[c].replace(label, "").trim();
  if (rest) return rest;
  if (lines[i].cells[c + 1]) return lines[i].cells[c + 1];
  const next = lines[i + 1];
  if (next && next.page === lines[i].page) {
    // a value under the label: the cell nearest in x
    const x = lines[i].xs[c];
    let best = 0;
    next.xs.forEach((nx, k) => {
      if (Math.abs(nx - x) < Math.abs(next.xs[best] - x)) best = k;
    });
    return next.cells[best];
  }
  return "";
}

/** @param {Line[]} lines @param {RegExp} label @param {(v: string) => unknown} accept */
function labelled(lines, label, accept) {
  for (let i = 0; i < lines.length; i++) {
    for (let c = 0; c < lines[i].cells.length; c++) {
      if (!label.test(lines[i].cells[c])) continue;
      const raw = valueAfter(lines, i, c, label);
      const v = raw ? accept(raw) : null;
      if (v !== null && v !== undefined && v !== "") return { value: v, line: lines[i], raw };
    }
  }
  return null;
}

const POSTAL = /^(?:(?:D|F|A|DE|FR|AT|CH|B|BE|L|LU|NL)[- ])?(\d{4,5})\s+([\p{L}][\p{L}\p{M} .'’()/-]{1,40}?)(?:,\s*([A-Z]{2}))?$/u;
const STREET = /\d|stra(?:ss|ß)e|str\.|weg\b|platz\b|allee\b|gasse\b|ring\b|damm\b|rue\b|avenue\b|av\.|boulevard\b|bd\b|chemin\b|place\b|impasse\b|road\b|street\b|lane\b/i;

/** Party block lines (top to bottom) to a party. @param {string[]} block */
function partyFrom(block) {
  const at = block.findIndex((b) => POSTAL.test(b));
  if (at < 1) return null;
  const pm = /** @type {RegExpExecArray} */ (POSTAL.exec(block[at]));
  const before = block.slice(0, at);
  const name = before[0];
  const street = before.length > 1 ? before[before.length - 1] : "";
  return {
    name,
    street: street && STREET.test(street) ? street : "",
    postal_code: pm[1],
    city: pm[2].trim(),
    ...(pm[3] ? { country: pm[3] } : {}),
  };
}

/** A one-line sender address (DIN 5008 "Rücksendeangabe", or a footer): "Muster GmbH · Hauptstr. 1 · 10115 Berlin". @param {string} s */
function senderLine(s) {
  const parts = s.split(/\s*[·•|]\s*|\s+[-–]\s+|,\s+(?=\d{4,5}\s)/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const at = parts.findIndex((p) => POSTAL.test(p));
  if (at < 2) return null;
  return partyFrom(parts.slice(0, at + 1));
}

/**
 * The draft for a PDF invoice's text lines.
 * @param {Line[]} lines
 * @param {{ profile?: string }} [opts]
 */
export function draftFromLines(lines, opts = {}) {
  const profile = opts.profile || "en16931";
  const locale = detectLocale(lines);
  /** @type {Field[]} */
  const fields = [];
  /** @type {Record<string, any>} */
  const draft = { seller: {}, buyer: {}, payment: {}, lines: [] };
  /** @type {{ id: string, ok: boolean, message: string }[]} */
  const checks = [];
  const set = (/** @type {string} */ path, /** @type {unknown} */ value, /** @type {Line} */ line, /** @type {{ check?: boolean, note?: string }} */ extra = {}) => {
    const keys = path.split(".");
    /** @type {any} */
    let o = draft;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1) ?? ""] = value;
    fields.push({ path, value, page: line.page, line: line.text, ...extra });
  };
  const all = lines.map((l) => l.text).join("\n");

  // Document type
  if (/\b(?:credit\s*note|avoir|rechnungskorrektur|stornorechnung)\b/i.test(all)) {
    const line = lines.find((l) => /\b(?:credit\s*note|avoir|rechnungskorrektur|stornorechnung)\b/i.test(l.text));
    if (line) set("document_type", "credit_note", line);
  }

  // Header fields
  const num = labelled(lines, L.number, (v) => (/^[A-Za-z0-9][A-Za-z0-9/_.\-#]{0,39}$/.test(v.split(/\s+/)[0]) && /\d/.test(v.split(/\s+/)[0]) ? v.split(/\s+/)[0] : null));
  if (num) set("number", num.value, num.line);
  const issue = labelled(lines, L.issue, findDate);
  if (issue) set("issue_date", issue.value, issue.line);
  const due = labelled(lines, L.due, findDate);
  if (due) set("due_date", due.value, due.line);
  const delivery = labelled(lines, L.delivery, findDate);
  if (delivery) set("delivery_date", delivery.value, delivery.line);
  const bref = labelled(lines, L.buyerRef, (v) => (/^[A-Za-z0-9][A-Za-z0-9\-/.]{1,45}$/.test(v) ? v : null));
  if (bref) set("buyer_reference", bref.value, bref.line);
  const order = labelled(lines, L.order, (v) => (/^[A-Za-z0-9][A-Za-z0-9\-/._]{0,34}$/.test(v) && /\d/.test(v) ? v : null));
  if (order) set("order_reference", order.value, order.line);

  // Currency
  const cur = /\b(CHF|GBP|USD)\b|£|\$/.exec(all);
  const eur = /€|\bEUR\b/.test(all);
  if (cur && !eur) {
    const code = cur[1] ?? (cur[0] === "£" ? "GBP" : "USD");
    const line = lines.find((l) => l.text.includes(cur[0]));
    if (line) set("currency", code, line);
  } else if (eur) {
    const line = lines.find((l) => /€|\bEUR\b/.test(l.text));
    if (line) set("currency", "EUR", line);
  }

  // Parties: a labelled two-column block (FROM / TO, Rechnungssteller / Rechnungsempfänger), else
  // a one-line sender address with the recipient's block under it. The two labelled blocks may
  // also stand one above the other (a layout without columns), so the search goes on until both
  // parties are read.
  let partiesFound = false;
  /** @type {Set<string>} */
  const partiesRead = new Set();
  for (let i = 0; i < lines.length && partiesRead.size < 2; i++) {
    const l = lines[i];
    const sCol = l.cells.findIndex((c) => L.seller.test(c));
    const bCol = l.cells.findIndex((c) => L.buyer.test(c));
    if (sCol < 0 && bCol < 0) continue;
    /** @type {Record<"seller" | "buyer", { lines: string[], src: Line[] }>} */
    const blocks = { seller: { lines: [], src: [] }, buyer: { lines: [], src: [] } };
    const cols = /** @type {[("seller" | "buyer"), number][]} */ ([["seller", sCol], ["buyer", bCol]].filter(([, c]) => /** @type {number} */ (c) >= 0)).map(
      ([role, c]) => /** @type {[("seller" | "buyer"), number]} */ ([role, l.xs[/** @type {number} */ (c)]]),
    );
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      const n = lines[j];
      if (n.page !== l.page) break;
      if (n.cells.some((c) => L.tableDesc.test(c) || L.number.test(c) || L.seller.test(c) || L.buyer.test(c))) break;
      n.cells.forEach((cell, k) => {
        let best = cols[0];
        for (const col of cols) if (Math.abs(col[1] - n.xs[k]) < Math.abs(best[1] - n.xs[k])) best = col;
        if (Math.abs(best[1] - n.xs[k]) > 120) return;
        blocks[best[0]].lines.push(cell);
        blocks[best[0]].src.push(n);
      });
    }
    for (const role of /** @type {const} */ (["seller", "buyer"])) {
      const b = blocks[role];
      const p = partiesRead.has(role) ? null : partyFrom(b.lines);
      if (!p) continue;
      partiesFound = true;
      partiesRead.add(role);
      for (const [k, v] of Object.entries(p)) {
        const idx = b.lines.findIndex((x) => x.includes(String(v)));
        set(`${role}.${k}`, v, b.src[Math.max(0, idx)]);
      }
      for (const [k, cell] of b.lines.entries()) {
        const vm = L.vat.exec(cell);
        if (vm) {
          const id = normalizeVat(cell.slice(vm.index + vm[0].length));
          if (id && looksLikeCompleteVat(id)) set(`${role}.vat_id`, id, b.src[k]);
        }
        const em = L.email.exec(cell);
        if (em && role === "seller") set("seller.contact.email", em[0], b.src[k]);
        const ph = L.phone.exec(cell) ?? (/^\+?\d[\d ()/\-.]{6,20}\d$/.test(cell) ? [cell, cell] : null);
        if (ph && role === "seller") set("seller.contact.phone", ph[1], b.src[k]);
      }
    }
  }
  if (!partiesFound) {
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].cells.map(senderLine).find(Boolean);
      if (!s) continue;
      for (const [k, v] of Object.entries(s)) set(`seller.${k}`, v, lines[i], { check: true, note: "read from the one-line sender address" });
      // The recipient block: the next lines down to a postal-code line, left column.
      /** @type {string[]} */
      const block = [];
      /** @type {Line[]} */
      const src = [];
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        if (lines[j].page !== lines[i].page) break;
        block.push(lines[j].cells[0]);
        src.push(lines[j]);
        if (POSTAL.test(lines[j].cells[0])) break;
      }
      const b = partyFrom(block);
      if (b) for (const [k, v] of Object.entries(b)) set(`buyer.${k}`, v, src[Math.max(0, block.findIndex((x) => x.includes(String(v))))], { check: true, note: "the address block under the sender line" });
      partiesFound = true;
      break;
    }
  }

  // VAT IDs and tax number anywhere on the page (letterhead, footer) that the blocks did not give.
  /** @type {{ id: string, line: Line, buyer: boolean }[]} */
  const vatIds = [];
  for (const l of lines) {
    for (const cell of l.cells) {
      for (const m of cell.matchAll(/\b([A-Z]{2})\s?([0-9A-Z](?:[0-9A-Z ]{1,14}[0-9A-Z])?)\b/g)) {
        const id = normalizeVat(m[0]);
        if (!id || !/\d{5}/.test(id) || !looksLikeCompleteVat(id) || ibanChecksumOk(id)) continue;
        const labelledHere = L.vat.test(cell) || L.vat.test(l.text);
        if (!labelledHere && !/^(DE\d{9}|FR[0-9A-Z]{2}\d{9}|AT U\d{8}|ATU\d{8})$/.test(id)) continue;
        if (!vatIds.some((v) => v.id === id)) vatIds.push({ id, line: l, buyer: L.buyerHint.test(l.text) });
      }
    }
  }
  const known = new Set([draft.seller.vat_id, draft.buyer.vat_id].filter(Boolean));
  for (const v of vatIds.filter((x) => !known.has(x.id))) {
    if (v.buyer && !draft.buyer.vat_id) set("buyer.vat_id", v.id, v.line);
    else if (!v.buyer && !draft.seller.vat_id) set("seller.vat_id", v.id, v.line, { check: vatIds.length > 1, note: vatIds.length > 1 ? "more than one VAT ID on the page" : undefined });
    else if (!draft.buyer.vat_id) set("buyer.vat_id", v.id, v.line, { check: true, note: "the second VAT ID on the page" });
  }
  for (const l of lines) {
    const tn = L.taxNumber.exec(l.text);
    if (tn && !draft.seller.tax_number) set("seller.tax_number", tn[1].trim(), l, { check: !L.buyerHint.test(l.text) ? undefined : true });
  }
  for (const role of /** @type {const} */ (["seller", "buyer"])) {
    if (!draft[role].country && draft[role].vat_id && /^[A-Z]{2}/.test(draft[role].vat_id)) {
      const c = draft[role].vat_id.slice(0, 2) === "EL" ? "GR" : draft[role].vat_id.slice(0, 2);
      const src = fields.find((f) => f.path === `${role}.vat_id`);
      fields.push({ path: `${role}.country`, value: c, page: src?.page ?? 1, line: src?.line ?? "", note: "from the VAT ID's prefix" });
      draft[role].country = c;
    }
  }
  // A domestic letter leaves the country off the address (DIN 5008; La Poste likewise). When only
  // one party's country is known and the other's postal code has that country's shape, it is
  // assumed, and marked for checking.
  const POSTAL_SHAPE = /** @type {Record<string, RegExp>} */ ({ DE: /^\d{5}$/, FR: /^\d{5}$/, AT: /^\d{4}$/, CH: /^\d{4}$/, BE: /^\d{4}$/, LU: /^\d{4}$/ });
  for (const [a, b] of /** @type {const} */ ([["seller", "buyer"], ["buyer", "seller"]])) {
    const c = draft[a].country;
    if (c && !draft[b].country && draft[b].postal_code && POSTAL_SHAPE[c]?.test(draft[b].postal_code)) {
      const src = fields.find((f) => f.path === `${b}.postal_code`);
      draft[b].country = c;
      fields.push({ path: `${b}.country`, value: c, page: src?.page ?? 1, line: src?.line ?? "", check: true, note: `no country printed: assumed the ${a}'s (${c}), as a domestic address leaves it off` });
    }
  }
  for (const l of lines) {
    if (!draft.seller.contact?.email) {
      const em = L.email.exec(l.text);
      if (em && !L.buyerHint.test(l.text)) set("seller.contact.email", em[0], l, { check: true });
    }
    if (!draft.seller.contact?.phone) {
      const ph = L.phone.exec(l.text);
      if (ph && !L.buyerHint.test(l.text)) set("seller.contact.phone", ph[1].trim(), l, { check: true });
    }
  }

  // Payment
  for (const l of lines) {
    if (draft.payment.iban) break;
    for (const m of l.text.matchAll(/\b([A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{1,4}){3,8})\b/g)) {
      const compact = m[1].replace(/\s+/g, "");
      // The country's IBAN length when known (a BIC printed after it must not be read as part of
      // it), else the longest prefix whose check digits hold.
      const known = IBAN_LENGTH[compact.slice(0, 2)];
      const lengths = known ? [known] : Array.from({ length: compact.length - 14 }, (_, k) => compact.length - k);
      for (const len of lengths) {
        if (compact.length >= len && ibanChecksumOk(compact.slice(0, len))) {
          set("payment.iban", compact.slice(0, len), l);
          break;
        }
      }
      if (draft.payment.iban) break;
    }
  }
  for (const l of lines) {
    const bm = L.bic.exec(l.text);
    if (bm && bm[1] === bm[1].toUpperCase()) {
      set("payment.bic", bm[1], l);
      break;
    }
  }
  const terms = lines.find((l) => L.terms.test(l.cells[0]) && l.text.replace(L.terms, "").trim().length > 3);
  if (terms) {
    // "Zahlbar bis ..." is itself the term; "Zahlungsbedingungen: ..." is a label before it.
    const keep = /^(?:zahlbar|zahlungsziel)/i.test(terms.cells[0]);
    const value = (keep ? terms.text : terms.text.replace(L.terms, "")).replace(/\s{2,}/g, " ").trim().slice(0, 200);
    set("terms", value, terms);
  }

  // VAT treatment stated in words
  /** @type {{ category: string, reason: string, line: Line } | null} */
  let exemption = null;
  for (const l of lines) {
    const t = l.text;
    if (/steuerschuldnerschaft\s+des\s+leistungsempfängers|reverse\s*charge|autoliquidation|§\s*13b\s*ustg/i.test(t)) exemption = { category: "AE", reason: "Reverse charge", line: l };
    else if (/innergemeinschaftliche\s+lieferung|intra-?community\s+supply|livraison\s+intracommunautaire|§\s*4\s*nr\.?\s*1\s*b\s*ustg/i.test(t)) exemption = { category: "K", reason: "Intra-community supply", line: l };
    else if (/§\s*19\s*ustg|kleinunternehmer/i.test(t)) exemption = { category: "E", reason: "Kleinunternehmer § 19 UStG", line: l };
    else if (/tva\s+non\s+applicable.*293\s*b/i.test(t)) exemption = { category: "E", reason: "TVA non applicable, art. 293 B du CGI", line: l };
    if (exemption) {
      // The reason as the PDF words it, when that line is the statement itself.
      if (t.length <= 120) exemption.reason = t.replace(/\s{2,}/g, " ").trim();
      break;
    }
  }

  // Totals printed on the page, the lines between the rows and the total that are not rows
  // (document-level discounts and charges, BG-20 / BG-21), and the lines that only carry a sum
  // forward (a page or section subtotal with more rows after it, "Übertrag").
  /** @param {Line} l @returns {"carry" | "net" | "vatTotal" | "vatRate" | "gross" | "allowance" | "charge" | null} */
  const kindOf = (l) => {
    const head = l.cells[0];
    if (L.carry.test(head)) return "carry";
    if (L.net.test(head)) return "net";
    if (L.totalVatOnly.test(head)) return "vatTotal";
    if (L.vatAmount.test(head) && !L.vat.test(head)) return "vatRate";
    if (L.gross.test(head)) return "gross";
    if (l.cells.length >= 2 && !L.notAllowance.test(head)) {
      if (L.allowance.test(head)) return "allowance";
      if (L.charge.test(head)) return "charge";
    }
    return null;
  };
  /** @type {{ rate: number | null, amount: number, line: Line }[]} */
  const vatRows = [];
  /** @type {{ net?: { v: number, line: Line }, vat?: { v: number, line: Line }, gross?: { v: number, line: Line } }} */
  const printed = {};
  const lastAmount = (/** @type {Line} */ l) => {
    for (let k = l.cells.length - 1; k >= 1; k--) {
      const v = parseAmount(l.cells[k], locale);
      if (v !== null) return v;
    }
    const m = /(-?\d[\d .,']*\d|\d)\s*(?:€|EUR)?\s*$/.exec(l.cells[0]);
    return m && l.cells.length === 1 ? parseAmount(m[1], locale) : null;
  };
  // A table header: a description and an amount column. Rows come after it.
  const headerAt = lines.findIndex((l) => l.cells.some((c) => L.tableDesc.test(c)) && l.cells.some((c) => L.tableAmount.test(c) || /preis|price|prix|\b(?:betrag|montant|amount)\b/i.test(c)));
  const kinds = lines.map(kindOf);
  // A discount column in the table header (Rabatt, Nachlass, Remise, Discount): rows may then be
  // quantity x price less a discount (BG-27), read only where that comes out to the cent.
  // The word is searched inside the cells: LibreOffice can print a whole header row as one.
  const discountHead = headerAt >= 0 ? /(?<![\p{L}])(rabatt|nachlass|preisnachlass|remise|rabais|discount)(?![\p{L}])/iu.exec(lines[headerAt].cells.join("  ")) : null;
  const rowOpts = { discount: Boolean(discountHead) };
  const discountReason = discountHead ? discountHead[1].charAt(0).toUpperCase() + discountHead[1].slice(1).toLowerCase() : "";
  /** @type {number[]} */
  const candidateRows = [];
  lines.forEach((l, i) => {
    if (i > headerAt && headerAt >= 0 && kinds[i] === null && l.cells.length >= 2 && readRow(l.cells, locale, rowOpts)) candidateRows.push(i);
  });
  const underRow = rowAdjustments(lines, kinds, candidateRows, headerAt, locale, rowOpts, kindOf);
  // A discount or charge read as its row's is not a document-level one and does not end the table.
  for (const i of underRow.keys()) kinds[i] = null;
  // A net or VAT sum with more rows after it, before any total, only carries a sum forward
  // (bottom of page 1, a section of a bill of quantities); it is not the invoice's total.
  const intermediate = (/** @type {number} */ i) =>
    kinds[i] === "carry" ||
    (["net", "vatTotal", "vatRate"].includes(/** @type {string} */ (kinds[i])) &&
      candidateRows.some((j) => j > i && !kinds.slice(i + 1, j).includes("gross")));
  /** @type {{ v: number, line: Line, i: number }[]} */
  const carries = [];
  /** @type {{ v: number, line: Line, i: number }[]} */
  const netLines = [];
  /** @type {{ charge: boolean, v: number, line: Line, i: number, head: string }[]} */
  let adjusts = [];
  let tableEnd = -1;
  let grossAt = -1;
  // A discount or charge whose label wraps onto two lines around its amount ("zzgl." / "35,00 €" /
  // "Anfahrtspauschale"): the label lines within about a line and a half join the amount's line.
  /** @type {Map<number, Line>} */
  const joined = new Map();
  const afterRows = candidateRows.length ? /** @type {number} */ (candidateRows.at(-1)) : headerAt;
  lines.forEach((l, i) => {
    if (i <= afterRows || kinds[i] !== null || l.cells.length !== 1 || underRow.has(i)) return;
    // The label and the amount in one cell: "Remise 10 % -250,00 €".
    const one = /^(.*[^\d\s.,'-])\s+(-?\s*\d[\d.,' ]*[.,]\d{2}\s*(?:€|EUR)?\s*-?)$/.exec(l.cells[0]);
    if (one) {
      const line = { ...l, cells: [one[1].trim(), one[2].trim()], xs: [l.xs[0], l.xs[0]] };
      const kind = kindOf(line);
      if (kind === "allowance" || kind === "charge") {
        joined.set(i, line);
        kinds[i] = kind;
      }
      return;
    }
    if (!/^-?\s*\d[\d.,' ]*[.,]\d{2}\s*(?:€|EUR)?\s*-?$/.test(l.cells[0])) return;
    const near = [i - 2, i - 1, i + 1, i + 2].filter((j) => j > afterRows && j < lines.length && lines[j].page === l.page && kinds[j] === null && Math.abs(lines[j].y - l.y) <= 16 && lines[j].cells.every((c) => parseAmount(c, locale) === null && !/\d[.,]\d{2}/.test(c)));
    if (!near.length) return;
    const label = near.map((j) => lines[j]).sort((a, b) => b.y - a.y).map((n) => n.cells.join(" ")).join(" ");
    const line = { ...l, text: `${label}  ${l.cells[0]}`, cells: [label, l.cells[0]], xs: [lines[near[0]].xs[0], l.xs[0]] };
    const kind = kindOf(line);
    if (kind !== "allowance" && kind !== "charge") return;
    joined.set(i, line);
    kinds[i] = kind;
  });
  lines.forEach((l0, i) => {
    if (headerAt >= 0 && i < headerAt) return; // an amount in the address or info block above the table
    const l = joined.get(i) ?? l0;
    const kind = kinds[i];
    if (!kind) return;
    let v = lastAmount(l);
    if (kind === "vatRate" && l.cells.length === 1 && /\b(?:auf|von|on|sur|base)\s+-?\d[\d .,']*[.,]\d{2}\s*(?:€|EUR)?\s*$/i.test(l.cells[0])) {
      // "19 % USt auf 2.792,00" ends with the base, not the VAT: the VAT wrapped onto the line below.
      const n = lines[i + 1];
      v = n && n.page === l.page && kinds[i + 1] === null && Math.abs(n.y - l.y) <= 16 && n.cells.length === 1 && /^-?\d[\d.,' ]*[.,]\d{2}\s*(?:€|EUR)?$/.test(n.cells[0]) ? parseAmount(n.cells[0], locale) : null;
    }
    if (v === null) return;
    if (intermediate(i)) {
      carries.push({ v, line: l, i });
      return;
    }
    if (kind === "allowance" || kind === "charge") {
      // A money amount in its own cell ("-65,75 €"), not a reference number after a label.
      const cell = l.cells.at(-1) ?? "";
      if (!/[.,]\d{2}\s*(?:€|EUR)?\s*-?$/.test(cell)) return;
      adjusts.push({ charge: kind === "charge", v: Math.abs(v), line: l, i, head: l.cells.slice(0, -1).join(" ") });
    } else if (kind === "net") netLines.push({ v, line: l, i });
    else if (kind === "vatTotal") printed.vat = { v, line: l };
    else if (kind === "vatRate") {
      const rm = PERCENT.exec(l.text);
      vatRows.push({ rate: rm ? parseAmount(rm[1], locale) : null, amount: v, line: l });
    } else if (kind === "gross") {
      if (!printed.gross) {
        printed.gross = { v, line: l };
        grossAt = i;
      }
    }
    if (tableEnd < 0) tableEnd = i;
  });
  // Discounts and charges are those before the total; one after it is not part of the invoice sum.
  if (grossAt >= 0) adjusts = adjusts.filter((a) => a.i < grossAt);
  /** @type {{ v: number, line: Line } | undefined} */
  let lineTotal;
  if (adjusts.length) {
    // The sum before the first discount or charge is the rows' total (BT-106); the one after the
    // last is the taxable amount (BT-109).
    lineTotal = netLines.filter((n) => n.i < adjusts[0].i).at(-1);
    const after = netLines.find((n) => n.i > (adjusts.at(-1)?.i ?? 0));
    if (after) printed.net = after;
  } else if (netLines.length) printed.net = netLines[0];
  if (!printed.vat && vatRows.length) printed.vat = { v: vatRows.reduce((s, r) => s + r.amount, 0), line: vatRows[0].line };

  // Table rows: from the header to the totals, across pages. A row is kept only when quantity x
  // unit price = amount to the cent (or price = amount, qty 1).
  const rowsEnd = tableEnd >= 0 ? tableEnd : lines.length;
  const singleRate = vatRows.length === 1 && vatRows[0].rate !== null ? vatRows[0].rate : null;
  /** @type {number[]} */
  const rowNets = [];
  /** @type {number[]} */
  const rowAt = [];
  // First pass: the rows (quantity x price = amount) and the text-only lines between them, which
  // are a description wrapped onto the line above or below its row.
  /** @type {{ l: Line, i: number, row: NonNullable<ReturnType<typeof readRow>>, extra: Line[], carried: Line[] }[]} */
  const rows = [];
  /** @type {{ l: Line, i: number }[]} */
  const loose = [];
  for (let i = headerAt + 1; i < rowsEnd; i++) {
    const l = lines[i];
    if (kinds[i] === "carry" || underRow.has(i)) continue;
    const row = l.cells.length >= 2 ? readRow(l.cells, locale, rowOpts) : null;
    if (row) rows.push({ l, i, row, extra: [], carried: [] });
    else if (headerAt >= 0 && l.cells.every((c) => parseAmount(c, locale) === null) && l.cells.length <= 2) loose.push({ l, i });
  }
  attachWrapped(lines, headerAt, rows, loose);
  for (const { l, i, row, extra, carried } of rows) {
    const parts = [...extra, { y: l.y, text: row.description }].filter((p) => p.text).sort((x, y) => y.y - x.y);
    // Lines continued at the top of the next page come last, in page order.
    const description = [...parts, ...carried].map((p) => ("cells" in p ? p.cells.join(" ") : p.text)).join(" ").replace(/\s+/g, " ").trim();
    if (!description) continue;
    /** @type {Record<string, unknown>} */
    const line = { description, quantity: row.quantity, unit_price: row.unitPrice };
    if (row.unit) line.unit = row.unit;
    const disc = "discount" in row ? row.discount : undefined;
    // A percent is kept as the percent alone, so the creator works the amount out again from
    // quantity x price when either is corrected on the convert screen.
    if (disc) line.allowances = [disc.percent !== undefined ? { reason: discountReason, percent: disc.percent } : { reason: discountReason, amount: disc.amount }];
    let discNote = disc
      ? `${discountReason}: ${row.quantity} x ${row.unitPrice.toFixed(2)} = ${(cents(row.quantity * row.unitPrice) / 100).toFixed(2)}, less ${disc.percent !== undefined ? `${disc.percent} % = ` : ""}${disc.amount.toFixed(2)}, is the printed ${row.amount.toFixed(2)}`
      : "";
    // Discounts and charges printed on their own line under this row (BG-27, BG-28). A percent is
    // kept only when the row has no discount of its own, so the creator's base (quantity x price) is
    // the one the percent was checked against.
    const own = [...underRow.values()].filter((a) => a.row === i);
    let rowNet = cents(row.amount);
    for (const a of own) {
      const field = a.charge ? "charges" : "allowances";
      const entry = a.percent !== undefined && !disc ? { reason: a.reason, percent: a.percent } : { reason: a.reason, amount: a.amount };
      line[field] = [.../** @type {unknown[]} */ (line[field] ?? []), entry];
      rowNet += a.charge ? cents(a.amount) : -cents(a.amount);
      const n = `"${a.line.text}" on the line below, read as this row's ${a.charge ? "charge" : "discount"}: ${row.amount.toFixed(2)} ${a.charge ? "plus" : "less"} ${a.percent !== undefined ? `${a.percent} % = ` : ""}${a.amount.toFixed(2)} is ${(rowNet / 100).toFixed(2)}${a.note ? ` (${a.note})` : ""}`;
      discNote = discNote ? `${discNote}; ${n}` : n;
    }
    let rate = row.rate;
    let rateCheck = false;
    if (rate === null && singleRate !== null) {
      rate = singleRate;
      rateCheck = true;
    }
    if (rate === null && exemption) rate = 0;
    if (rate !== null) line.tax_percent = rate;
    if (exemption && rate === 0) {
      line.tax_category = exemption.category;
      line.tax_reason = exemption.reason;
    }
    const idx = draft.lines.length;
    draft.lines.push(line);
    rowNets.push(rowNet / 100);
    rowAt.push(i);
    fields.push({
      path: `lines.${idx}`,
      value: line,
      page: l.page,
      line: [...extra.filter((e) => e.y > l.y), l, ...extra.filter((e) => e.y <= l.y), ...carried, ...own.map((a) => a.line)].map((e) => e.text).join(" / "),
      ...(own.some((a) => a.check) || carried.length ? { check: true } : {}),
      ...(rateCheck ? { check: true, note: "VAT rate taken from the only rate in the totals" } : {}),
      ...(rate === null ? { check: true, note: "no VAT rate on the row or in the totals" } : {}),
    });
    if (carried.length) {
      const n = `description continued at the top of page ${carried[0].page}: "${carried.map((c) => c.cells.join(" ")).join(" ")}"`;
      discNote = discNote ? `${n}; ${discNote}` : n;
    }
    if (discNote) {
      const f = /** @type {Field} */ (fields.at(-1));
      f.note = f.note ? `${f.note}; ${discNote}` : discNote;
    }
  }
  const sumRows = rowNets.reduce((s, v) => s + cents(v), 0);

  // Discounts and charges into the draft, each with the VAT rate it belongs to: the exemption when
  // every row is exempt, the invoice's only rate, or, with several rates, the one assignment under
  // which every rate's printed VAT comes out to the cent. Otherwise the rate is left for a person.
  /** @type {{ path: string, message: string }[]} */
  const unresolved = [];
  if (adjusts.length) {
    const rates = [...new Set(draft.lines.map((/** @type {any} */ l) => l.tax_percent).filter((/** @type {unknown} */ r) => typeof r === "number"))];
    const allExempt = exemption && draft.lines.length > 0 && draft.lines.every((/** @type {any} */ l) => l.tax_percent === 0);
    /** @type {(number | null)[]} */
    let assigned = adjusts.map(() => null);
    let how = "";
    if (allExempt) {
      assigned = adjusts.map(() => 0);
      how = "exempt like every row";
    } else if (rates.length === 1) {
      assigned = adjusts.map(() => rates[0]);
      how = "the invoice's only VAT rate";
    } else if (rates.length > 1 && adjusts.length <= 5 && rates.every((r) => vatRows.some((v) => v.rate === r))) {
      /** @type {number[][]} */
      const fits = [];
      const tryAll = (/** @type {number[]} */ pick) => {
        if (pick.length === adjusts.length) {
          const ok = rates.every((r) => {
            let base = 0;
            draft.lines.forEach((/** @type {any} */ l, k) => {
              if (l.tax_percent === r) base += cents(rowNets[k]);
            });
            pick.forEach((pr, k) => {
              if (pr === r) base += adjusts[k].charge ? cents(adjusts[k].v) : -cents(adjusts[k].v);
            });
            const printedVat = vatRows.filter((v) => v.rate === r).reduce((s, v) => s + cents(v.amount), 0);
            return cents((base / 100) * (r / 100)) === printedVat;
          });
          if (ok) fits.push([...pick]);
          return;
        }
        for (const r of rates) tryAll([...pick, r]);
      };
      tryAll([]);
      if (fits.length === 1) {
        assigned = fits[0];
        how = "the only split under which each rate's printed VAT comes out";
      }
    }
    const base = lineTotal ? cents(lineTotal.v) : sumRows;
    adjusts.forEach((a, k) => {
      const field = a.charge ? "charges" : "allowances";
      draft[field] ??= [];
      const idx = draft[field].length;
      const reason = a.head.replace(/^(?:abzgl\.?|abzüglich|zzgl\.?|zuzüglich|\.\/\.|moins|plus|less|[-+])\s*/i, "").replace(/\s*:\s*$/, "").trim() || (a.charge ? "Charge" : "Discount");
      /** @type {Record<string, unknown>} */
      const entry = { reason, amount: a.v };
      const rate = assigned[k];
      if (rate !== null) {
        entry.tax_percent = rate;
        if (allExempt && exemption) {
          entry.tax_category = exemption.category;
          entry.tax_reason = exemption.reason;
        }
      } else {
        unresolved.push({
          path: `${field}.${idx}.tax_percent`,
          message: `"${reason}" (${a.v.toFixed(2)}) is a ${a.charge ? "charge" : "discount"} on the whole invoice, which has more than one VAT rate, and no single rate makes the printed VAT add up: set its VAT rate, or split it into one entry per rate.`,
        });
      }
      draft[field].push(entry);
      const pm = PERCENT.exec(a.head);
      const pct = pm ? parseAmount(pm[1], locale) : null;
      const pctOff = pct !== null && cents((base / 100) * (pct / 100)) !== cents(a.v);
      /** @type {string[]} */
      const notes = [];
      if (rate !== null && how) notes.push(`VAT rate: ${how}`);
      if (rate === null) notes.push("VAT rate not read");
      if (pctOff) notes.push(`${pct} % of the ${(base / 100).toFixed(2)} rows total is ${((base / 100) * (/** @type {number} */ (pct) / 100)).toFixed(2)}, not the printed ${a.v.toFixed(2)}`);
      fields.push({ path: `${field}.${idx}`, value: entry, page: a.line.page, line: a.line.text, check: true, note: notes.join("; ") });
    });
  }

  // Cross-checks: the PDF's own totals against what the rows add up to.
  const allowanceSum = adjusts.filter((a) => !a.charge).reduce((s, a) => s + cents(a.v), 0);
  const chargeSum = adjusts.filter((a) => a.charge).reduce((s, a) => s + cents(a.v), 0);
  if (draft.lines.length && carries.length) {
    // Each carried sum is the rows above it: from the start (a page's "Übertrag") or from the
    // previous carried sum (a section's subtotal).
    let prevCum = 0;
    const off = carries.filter((c) => {
      const cum = rowAt.reduce((s, at, k) => (at < c.i ? s + cents(rowNets[k]) : s), 0);
      const ok = cents(c.v) === cum || cents(c.v) === cum - prevCum;
      prevCum = cum;
      return !ok;
    });
    checks.push({
      id: "carried-forward",
      ok: off.length === 0,
      message: off.length === 0 ? `The ${carries.length} carried-forward or section sums match the rows above them.` : `The sum carried forward on "${off[0].line.text}" is not the rows read above it: a row was not read.`,
    });
  }
  if (draft.lines.length && (adjusts.length ? lineTotal || printed.net : printed.net)) {
    let target;
    let got = sumRows;
    let what = "net total";
    if (!adjusts.length) target = /** @type {{ v: number }} */ (printed.net).v;
    else if (lineTotal) {
      target = lineTotal.v;
      what = "rows total";
    } else {
      target = /** @type {{ v: number }} */ (printed.net).v;
      got = sumRows - allowanceSum + chargeSum;
      what = "net total after discounts and charges";
    }
    const ok = got === cents(target);
    checks.push({ id: "rows-sum-to-net", ok, message: ok ? `The ${draft.lines.length} rows add up to the printed ${what} ${target.toFixed(2)}.` : `The rows read add up to ${(got / 100).toFixed(2)}, the PDF prints a ${what} of ${target.toFixed(2)}: a row was not read, or the PDF has a discount or charge that is not a row.` });
  }
  if (adjusts.length && lineTotal && printed.net) {
    const ok = cents(lineTotal.v) - allowanceSum + chargeSum === cents(printed.net.v);
    checks.push({ id: "discounts-and-charges", ok, message: ok ? `${lineTotal.v.toFixed(2)} less discounts plus charges is the printed net total ${printed.net.v.toFixed(2)}.` : `${lineTotal.v.toFixed(2)} less discounts ${(allowanceSum / 100).toFixed(2)} plus charges ${(chargeSum / 100).toFixed(2)} is not the printed net total ${printed.net.v.toFixed(2)}.` });
  }
  if (printed.net && printed.vat && printed.gross) {
    const ok = cents(printed.net.v) + cents(printed.vat.v) === cents(printed.gross.v);
    checks.push({ id: "net-plus-vat-is-gross", ok, message: ok ? "Net plus VAT equals the printed total." : `Net ${printed.net.v.toFixed(2)} plus VAT ${printed.vat.v.toFixed(2)} is not the printed total ${printed.gross.v.toFixed(2)}.` });
  }

  const built = buildInvoice(draft, { profile });
  if (built.ok && built.doc?.totals) {
    // The creator's totals are in cents.
    const t = built.doc.totals;
    const compare = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ mine, /** @type {{ v: number } | undefined} */ theirs) => {
      if (!theirs) return;
      const ok = mine === cents(theirs.v);
      checks.push({ id, ok, message: ok ? `${label} ${theirs.v.toFixed(2)} matches the e-invoice.` : `${label}: the PDF prints ${theirs.v.toFixed(2)}, the e-invoice computes ${(mine / 100).toFixed(2)}. Correct the rows or rates before sending.` });
    };
    if (adjusts.length) {
      compare("net-matches", "Rows total", t.net, lineTotal);
      compare("taxable-matches", "Net total", t.taxable, printed.net);
    } else compare("net-matches", "Net total", t.net, printed.net);
    compare("vat-matches", "VAT", t.tax, printed.vat);
    compare("total-matches", "Total", t.gross, printed.gross);
  }

  const missing = [...built.errors, ...unresolved, ...beyondCreator(draft)];
  return {
    draft,
    fields,
    locale,
    exemption: exemption ? { category: exemption.category, reason: exemption.reason, line: exemption.line.text } : null,
    printedTotals: {
      net: printed.net?.v ?? null,
      vat: printed.vat?.v ?? null,
      gross: printed.gross?.v ?? null,
      vatRates: vatRows.map((r) => ({ rate: r.rate, amount: r.amount })),
      ...(adjusts.length
        ? {
            lineTotal: lineTotal?.v ?? null,
            allowances: adjusts.filter((a) => !a.charge).map((a) => a.v),
            charges: adjusts.filter((a) => a.charge).map((a) => a.v),
          }
        : {}),
    },
    checks,
    ready: built.ok && missing.length === 0 && checks.every((c) => c.ok),
    toConfirm: fields.filter((f) => f.check).map((f) => f.path),
    missing,
    warnings: built.warnings,
  };
}


/**
 * What the creator builds without but the checker refuses: a buyer known by name alone (INV-005;
 * an e-invoice identifies the buyer by VAT ID, BT-48, or electronic address, BT-49, and a German
 * B2B buyer without a VAT ID is reached at its e-invoice address anyway).
 * @param {Record<string, any>} draft
 */
function beyondCreator(draft) {
  const b = draft.buyer ?? {};
  if (b.name && !b.vat_id && !b.legal_id && !b.endpoint) {
    return [{ path: "buyer.endpoint", message: "The PDF names the buyer but prints no VAT ID or e-invoice address. Add the buyer's electronic address (BT-49: the e-mail or Peppol ID they receive e-invoices at), or their VAT ID if they have one." }];
  }
  return [];
}

// Within about a line and a half of 10-12 pt type.
const WRAP_GAP = 16;
// A running head or page number at the top of a page: not part of a description.
const PAGE_HEAD = /\b(?:seite|page|blatt|feuille)\s*\d+|^\s*-?\s*\d+\s*(?:\/|von|of|sur)\s*\d+\s*-?\s*$|\b(?:rechnung(?:s)?[-\s]?(?:nr|nummer)|facture\s*n|invoice\s*(?:no|number))\b/i;

/**
 * Text-only lines in the table to the rows they belong to: a description wrapped onto lines below
 * its row (amounts printed on the first line), above and below it (amounts centred), and a row
 * split by a page break, whose description goes on at the top of the next page under the repeated
 * header. Consecutive lines a line apart, at one x, are one run; a run goes to the row printed
 * right above or right below it. A run at the top of a page with no row beside it continues the
 * previous page's last row when it starts at that row's description column; it lands in `carried`,
 * and the row is marked for a person to confirm. Lines no run rule places go to the nearest row on
 * their page within a line and a half, as before.
 * @param {Line[]} lines @param {number} headerAt
 * @param {{ l: Line, i: number, row: { description: string }, extra: Line[], carried: Line[] }[]} rows
 * @param {{ l: Line, i: number }[]} loose
 */
function attachWrapped(lines, headerAt, rows, loose) {
  if (!loose.length || !rows.length) return;
  const rowAt = new Map(rows.map((r) => [r.i, r]));
  /** @type {{ l: Line, i: number }[][]} */
  const runs = [];
  for (const t of loose) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run && last && last.i === t.i - 1 && last.l.page === t.l.page && Math.abs(last.l.y - t.l.y) <= WRAP_GAP && Math.abs(last.l.xs[0] - t.l.xs[0]) <= 3) run.push(t);
    else runs.push([t]);
  }
  const near = (/** @type {Line} */ a, /** @type {Line} */ b) => a.page === b.page && Math.abs(a.y - b.y) <= WRAP_GAP;
  /** The x where a row's description starts: its first cell that the description begins with. */
  const descX = (/** @type {(typeof rows)[number]} */ r) => {
    const first = r.row.description.split(" ")[0];
    const k = first ? r.l.cells.findIndex((c) => c.startsWith(first)) : -1;
    return k >= 0 ? r.l.xs[k] : null;
  };
  const isHeader = (/** @type {Line} */ l) => l.cells.some((c) => L.tableDesc.test(c)) && l.cells.length >= 3;
  /** The row this run continues from the previous page, or null. */
  const carriedFrom = (/** @type {{ l: Line, i: number }[]} */ run) => {
    const page = run[0].l.page;
    if (headerAt < 0 || page <= lines[headerAt].page) return null;
    const prev = rows.filter((r) => r.i < run[0].i).at(-1);
    if (!prev || prev.l.page !== page - 1) return null;
    const x = descX(prev);
    if (x === null || Math.abs(x - run[0].l.xs[0]) > 3) return null;
    if (run.some((t) => PAGE_HEAD.test(t.l.text))) return null;
    // Only the repeated header, a carried sum or a running head (not at the description's x) above it on this page.
    let headerSeen = false;
    for (let j = prev.i + 1; j < run[0].i; j++) {
      const l = lines[j];
      if (l.page !== page) continue;
      if (rowAt.has(j)) return null;
      if (isHeader(l)) headerSeen = true;
      else if (loose.some((t) => t.i === j) && Math.abs(l.xs[0] - x) <= 3 && !PAGE_HEAD.test(l.text)) return null;
    }
    // A header repeated on this page puts the run right under it, not further down the page.
    const head = lines.findIndex((l, j) => j > prev.i && j < run[0].i && l.page === page && isHeader(l));
    if (headerSeen && head >= 0 && lines[head].y - run[0].l.y > 3 * WRAP_GAP) return null;
    return prev;
  };
  /** @type {{ run: { l: Line, i: number }[], up: (typeof rows)[number] | undefined, down: (typeof rows)[number] | undefined }[]} */
  const sided = runs.map((run) => {
    const up = rowAt.get(run[0].i - 1);
    const down = rowAt.get(/** @type {{ i: number }} */ (run.at(-1)).i + 1);
    return { run, up: up && near(up.l, run[0].l) ? up : undefined, down: down && near(down.l, /** @type {{ l: Line }} */ (run.at(-1)).l) ? down : undefined };
  });
  // Amounts on a row's first line, its description below them: a run above the first row of a page is
  // then the previous page's row going on, not the next row's first lines.
  const topAligned = sided.some((s) => s.up && !s.down) && !sided.some((s) => s.down);
  /** @type {{ l: Line, i: number }[]} */
  const rest = [];
  for (const { run, up, down } of sided) {
    if (up && !down) up.extra.push(...run.map((t) => t.l));
    else if (!up && (!down || topAligned) && carriedFrom(run)) /** @type {(typeof rows)[number]} */ (carriedFrom(run)).carried.push(...run.map((t) => t.l));
    else if (down && !up) down.extra.push(...run.map((t) => t.l));
    else rest.push(...run);
  }
  for (const { l: t } of rest) {
    let best = null;
    for (const r of rows) if (r.l.page === t.page && (!best || Math.abs(r.l.y - t.y) < Math.abs(best.l.y - t.y))) best = r;
    if (best && Math.abs(best.l.y - t.y) <= WRAP_GAP) best.extra.push(t);
  }
}

/**
 * Discounts and charges printed on their own line under a table row, EN 16931 BG-27 / BG-28:
 *
 *   2  Unterverteilung 3-reihig   1 Stk   245,00 €   245,00 €
 *      abzgl. 8 % Rabatt                             -19,60 €
 *
 * A Rabatt / Nachlass / Remise / Discount (or Zuschlag, Fracht... for a charge) line belongs to the
 * row above it when only that row's wrapped description stands between them and another row follows
 * before any total: it is then not a discount on the whole invoice, and the rows after it are still
 * read. Directly under the last row it is the row's own only when its printed percent of that row's
 * amount is its amount to the cent, or when the rows above already carry their discounts this way
 * (then the field asks to be confirmed). A printed net after the discount ("-19,60 €  225,40 €")
 * must be the row's amount less it. Returns the line index of each such discount or charge.
 * @param {Line[]} lines @param {(string | null)[]} kinds @param {number[]} candidateRows
 * @param {number} headerAt @param {"de" | "fr" | "en"} locale @param {{ discount?: boolean }} rowOpts
 * @param {(l: Line) => string | null} kindOf
 */
function rowAdjustments(lines, kinds, candidateRows, headerAt, locale, rowOpts, kindOf) {
  /** @type {Map<number, { row: number, charge: boolean, amount: number, percent?: number, reason: string, line: Line, note?: string, check?: boolean }>} */
  const out = new Map();
  if (headerAt < 0 || !candidateRows.length) return out;
  const rowSet = new Set(candidateRows);
  const ends = new Set(["net", "vatTotal", "vatRate", "gross"]);
  // How far below its row a discount line may stand: about a row's height in this table (rows are
  // 17 pt apart from Chromium, 29 pt from LibreOffice), and at least 28 pt.
  const pitches = candidateRows
    .slice(1)
    .map((r, k) => (r === candidateRows[k] + 1 && lines[r].page === lines[candidateRows[k]].page ? Math.abs(lines[candidateRows[k]].y - lines[r].y) : null))
    .filter((v) => v !== null)
    .sort((a, b) => /** @type {number} */ (a) - /** @type {number} */ (b));
  const step = Math.max(28, 1.25 * /** @type {number} */ (pitches[Math.floor(pitches.length / 2)] ?? 0));
  const money = (/** @type {string} */ c) => /[.,]\d{2}\s*(?:€|EUR)?\s*-?$/.test(c) && parseAmount(c, locale) !== null;
  const textOnly = (/** @type {Line} */ l) => l.cells.every((c) => parseAmount(c, locale) === null && !/\d[.,]\d{2}/.test(c));
  /** @type {{ i: number, row: number, charge: boolean, amount: number, percent?: number, pctOk: boolean, pctOff: number | null, rowAmount: number, between: boolean, reason: string }[]} */
  const found = [];
  const taken = new Set();
  for (let i = headerAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (rowSet.has(i)) continue;
    let cells = l.cells;
    if (cells.length === 1) {
      // The label and the amount in one cell: "Rabatt 10 % -19,60 €".
      const one = /^(.*[^\d\s.,'-])\s+(-?\s*\d[\d.,' ]*[.,]\d{2}\s*(?:€|EUR)?\s*-?)$/.exec(cells[0]);
      if (!one) continue;
      cells = [one[1].trim(), one[2].trim()];
    }
    const kind = kindOf({ ...l, cells });
    if (kind !== "allowance" && kind !== "charge") continue;
    let k = 0;
    while (k < cells.length && !money(cells[k])) k++;
    const label = cells.slice(0, k).join(" ").trim();
    const amounts = cells.slice(k);
    if (!label || !amounts.length || amounts.length > 2 || !amounts.every(money)) continue;
    // The row above: only its wrapped description (or another discount of the same row) between.
    let j = i - 1;
    while (j > headerAt && !rowSet.has(j) && lines[j].page === l.page && (taken.has(j) || (kinds[j] === null && textOnly(lines[j])))) j--;
    if (j <= headerAt || !rowSet.has(j) || lines[j].page !== l.page || Math.abs(lines[j].y - l.y) > step * (i - j)) continue;
    const row = readRow(lines[j].cells, locale, rowOpts);
    if (!row) continue;
    const charge = kind === "charge";
    const amount = Math.abs(/** @type {number} */ (parseAmount(amounts[0], locale)));
    if (!(amount > 0)) continue;
    if (amounts.length === 2) {
      const after = cents(row.amount) + (charge ? cents(amount) : -cents(amount));
      if (after !== cents(/** @type {number} */ (parseAmount(amounts[1], locale)))) continue;
    }
    const pm = PERCENT.exec(label);
    const pct = pm ? parseAmount(pm[1], locale) : null;
    const pctOk = pct !== null && pct > 0 && cents((cents(row.amount) / 100) * (pct / 100)) === cents(amount);
    let between = false;
    for (let m = i + 1; m < lines.length; m++) {
      if (kinds[m] !== null && ends.has(/** @type {string} */ (kinds[m]))) break;
      if (rowSet.has(m)) {
        between = true;
        break;
      }
    }
    const reason =
      label
        .replace(/^(?:abzgl\.?|abzüglich|zzgl\.?|zuzüglich|\.\/\.|moins|plus|less|[-+])\s*/i, "")
        .replace(/\s*(?:\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*/g, " ")
        .replace(/\s*:\s*$/, "")
        .replace(/\s+/g, " ")
        .trim() || (charge ? { de: "Zuschlag", fr: "Supplément", en: "Surcharge" } : { de: "Rabatt", fr: "Remise", en: "Discount" })[locale];
    found.push({ i, row: j, charge, amount, ...(pctOk ? { percent: /** @type {number} */ (pct) } : {}), pctOk, pctOff: pct !== null && !pctOk ? pct : null, rowAmount: row.amount, between, reason });
    taken.add(i);
  }
  const pattern = found.some((f) => f.between);
  for (const f of found) {
    if (!f.between && !f.pctOk && !pattern) continue;
    const notes = [];
    if (f.pctOff !== null) notes.push(`${f.pctOff} % of ${f.rowAmount.toFixed(2)} is ${(cents((cents(f.rowAmount) / 100) * (f.pctOff / 100)) / 100).toFixed(2)}, not the printed ${f.amount.toFixed(2)}: the amount is kept`);
    if (!f.between && !f.pctOk) notes.push("under the last row, read as its own like the rows above");
    out.set(f.i, { row: f.row, charge: f.charge, amount: f.amount, ...(f.percent !== undefined ? { percent: f.percent } : {}), reason: f.reason, line: lines[f.i], ...(notes.length ? { note: notes.join("; "), check: true } : {}) });
  }
  return out;
}

/**
 * One table row: the text cells are the description, and among the numeric cells a quantity, a
 * unit price and an amount with quantity x price = amount to the cent. A leading position number
 * ("1", "1.", "Pos. 1") is dropped.
 *
 * With `discount` (the table has a Rabatt / Remise / Discount column), a row whose quantity x price
 * is not its amount is read when one discount makes it so, to the cent: a percent cell
 * (quantity x price less that percent) or an amount cell between the price and the amount
 * (quantity x price less that amount). Exactly one reading must fit; the other percent, if any, is
 * the row's VAT rate.
 * @param {string[]} cells @param {"de" | "fr" | "en"} locale @param {{ discount?: boolean }} [opts]
 */
export function readRow(cells0, locale, opts = {}) {
  // Amounts and percents printed close together share a cell in some producers ("-9,40 € 19 %
  // 140,00 €", LibreOffice): with a discount column each is its own cell, split after € or %.
  const cells = opts.discount ? cells0.flatMap((c) => c.split(/(?<=€|%|\bEUR)\s+(?=-?\s*\d)/)) : cells0;
  /** @type {{ v: number, k: number, unit?: string }[]} */
  const nums = [];
  /** @type {string[]} */
  const words = [];
  let rate = /** @type {number | null} */ (null);
  let unit = "";
  /** @type {number[]} */
  const percents = [];
  cells.forEach((cell, k) => {
    const pm = /^-?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%$/.exec(cell);
    if (pm) {
      rate = parseAmount(pm[1], locale);
      if (rate !== null) percents.push(rate);
      return;
    }
    // A rate and an amount printed close enough to share a cell: "19 % 780,00 €", "780,00 € 19 %".
    const rateFirst = /^(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s+(\S.*)$/.exec(cell);
    const rateLast = rateFirst ? null : /^(.*\S)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*%$/.exec(cell);
    if (rateFirst || rateLast) {
      const [r, a] = rateFirst ? [rateFirst[1], rateFirst[2]] : [/** @type {RegExpExecArray} */ (rateLast)[2], /** @type {RegExpExecArray} */ (rateLast)[1]];
      const v = parseAmount(a, locale);
      if (v !== null) {
        rate = parseAmount(r, locale);
        nums.push({ v, k });
        return;
      }
    }
    const withUnit = /^(-?\d[\d.,' ]*)\s+([A-Za-zÄÖÜäöüéè²³][A-Za-z0-9ÄÖÜäöüéè²³]{0,9}\.?)$/.exec(cell);
    if (withUnit && UNITS[withUnit[2].toLowerCase()]) {
      const v = parseAmount(withUnit[1], locale);
      if (v !== null) {
        nums.push({ v, k, unit: UNITS[withUnit[2].toLowerCase()] });
        return;
      }
    }
    if (UNITS[cell.toLowerCase()]) {
      unit = UNITS[cell.toLowerCase()];
      return;
    }
    const v = parseAmount(cell, locale);
    if (v !== null) nums.push({ v, k });
    else words.push(cell);
  });
  if (nums.length < 2) return null;
  // In a table with a discount column, "0 %" there is no discount, not a 0 % VAT rate.
  if (opts.discount) {
    const nonZero = percents.filter((p) => p > 0);
    rate = nonZero.length ? /** @type {number} */ (nonZero.at(-1)) : null;
    percents.splice(0, percents.length, ...nonZero);
  }
  // A leading position number before the description. A number with a unit ("64 m²") is a
  // quantity, not a position.
  if (nums.length >= 3 && nums[0].k === 0 && !nums[0].unit && Number.isInteger(nums[0].v) && nums[0].v < 1000) nums.shift();
  const amount = nums[nums.length - 1];
  for (let a = 0; a < nums.length - 1; a++) {
    for (let b = a + 1; b < nums.length - 1; b++) {
      // quantity a, unit price b, amount last
      if (cents(nums[a].v * nums[b].v) === cents(amount.v)) {
        return { description: words.join(" "), quantity: nums[a].v, unitPrice: nums[b].v, amount: amount.v, unit: nums[a].unit ?? (unit || ""), rate };
      }
    }
  }
  if (nums.length === 2 && cents(nums[0].v) === cents(amount.v)) {
    return { description: words.join(" "), quantity: 1, unitPrice: nums[0].v, amount: amount.v, unit: unit || "", rate };
  }
  if (!opts.discount) return null;
  /** @type {{ description: string, quantity: number, unitPrice: number, amount: number, unit: string, rate: number | null, discount: { percent?: number, amount: number } }[]} */
  const fits = [];
  const target = cents(amount.v);
  for (let a = 0; a < nums.length - 1; a++) {
    for (let b = a + 1; b < nums.length - 1; b++) {
      const gross = cents(nums[a].v * nums[b].v);
      if (gross <= target) continue;
      const row = { description: words.join(" "), quantity: nums[a].v, unitPrice: nums[b].v, amount: amount.v, unit: nums[a].unit ?? (unit || "") };
      // A percent off quantity x price; any other percent on the row is its VAT rate.
      percents.forEach((p, k) => {
        const off = Math.round(Number(((gross * p) / 100).toPrecision(12)));
        if (p > 0 && gross - off === target) {
          const others = percents.filter((_, j) => j !== k);
          fits.push({ ...row, rate: others.length ? /** @type {number} */ (others.at(-1)) : null, discount: { percent: p, amount: off / 100 } });
        }
      });
      // An amount between the price and the row's amount ("-9,40 €").
      for (let d = b + 1; d < nums.length - 1; d++) {
        const off = cents(Math.abs(nums[d].v));
        if (off > 0 && gross - off === target) fits.push({ ...row, rate, discount: { amount: off / 100 } });
      }
    }
  }
  return fits.length === 1 ? fits[0] : null;
}

/**
 * A plain PDF invoice to a draft. `readable: false` when the PDF has no text layer to read (a scan:
 * part 2 will OCR it), with `reason`.
 * @param {Uint8Array} bytes @param {{ profile?: string }} [opts]
 */
export async function draftFromPdf(bytes, opts = {}) {
  const read = await extractPdfLines(bytes);
  if (!read) return { readable: false, reason: "not_pdf" };
  if (/\/AF\s*\[|factur-x\.xml|zugferd-invoice\.xml|xrechnung\.xml/i.test(new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024))))) {
    // Already a hybrid invoice: the XML inside is the invoice, so check that instead.
    return { readable: true, reason: "already_einvoice", pages: read.pages, ...draftFromLines(read.lines, opts) };
  }
  if (!read.lines.length) return { readable: false, reason: read.reason ?? "no_text", pages: read.pages };
  return { readable: true, reason: null, pages: read.pages, ...draftFromLines(read.lines, opts) };
}
