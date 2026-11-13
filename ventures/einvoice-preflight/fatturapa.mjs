// Offline checks for an Italian FatturaPA / FatturaElettronica XML file (the
// format SdI takes, versions FPR12 for businesses and FPA12 for public bodies).
// FatturaPA is not EN 16931, so none of the UBL/CII rules apply to it. Rule ids
// are IT-nnn and are this tool's own, not SdI error codes; where a rule reproduces
// a rejection that the Agenzia delle Entrate's technical specification 1.9
// (Allegato A, read 2026-11-13) names, the finding carries that code in `sdi`
// and says it, and its tolerance is the one the specification states. A check that depends
// on something this reader does not model (a pension-fund contribution, a
// document-level discount, a rounding line) is skipped and named in `skipped`,
// never counted as a pass and never raised as a defect. This is an offline
// observation, not SdI's acceptance and not tax advice. Findings never repeat a
// tax number.

import { roundHalfUpToCents } from "./checks.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { calendarDate, checkAgainstSchema, codesFor } from "./fatturapa-xsd.mjs";

// The code lists come from the Agenzia's XSD 1.2.3 (specification 1.9), read by
// build-fatturapa-schema.mjs. TD07-TD09 are not in it: they belong to the
// simplified-invoice schema (FSM10), which a FatturaElettronica file cannot use.
// Natura N2, N3 and N6 are in it but retired by its own comments from 2021-01-01.
const DOC_TYPES = new Set(codesFor("TipoDocumentoType"));
const REGIMES = new Set(codesFor("RegimeFiscaleType"));
const NATURE = new Set(codesFor("NaturaType"));
const TOLERANCE = 0.01;
// Specification 1.9: ImponibileImporto may differ from the sum of its parts by
// up to one euro before SdI rejects with 00422 ("è ammessa la tolleranza di ±1
// euro", in both the field text and the error table of the Italian original;
// the English translation's error table says "eurocent", its field text "euro").
const BASE_TOLERANCE = 1;
// TD16-TD20, TD22, TD23, TD28, TD29 need the buyer's IdFiscaleIVA (00475).
const NEEDS_BUYER_VAT = new Set(["TD16", "TD17", "TD18", "TD19", "TD20", "TD22", "TD23", "TD28", "TD29"]);
// Seller and buyer must differ (00471) or must be the same (00472).
const SELLER_NOT_BUYER = new Set(["TD01", "TD02", "TD03", "TD06", "TD16", "TD17", "TD18", "TD19", "TD20", "TD24", "TD25", "TD28", "TD29"]);
const SELLER_IS_BUYER = new Set(["TD21", "TD27"]);
// Document types that may not name an Italian seller (00473).
const FOREIGN_SELLER_ONLY = new Set(["TD17", "TD18", "TD19", "TD28"]);

function finding(rule, message, fix, path, extra) {
  return extra ? { rule, message, fix, path, ...extra } : { rule, message, fix, path };
}

export function looksLikeFatturaPa(text) {
  return /<(?:[A-Za-z0-9_]+:)?FatturaElettronica[\s>]/.test(String(text).slice(0, 4096));
}

function child(node, name) {
  return node ? node.children.find((c) => c.name === name) : undefined;
}
function kids(node, name) {
  return node ? node.children.filter((c) => c.name === name) : [];
}
function at(node, ...names) {
  let cur = node;
  for (const name of names) cur = child(cur, name);
  return cur;
}
function txt(node, ...names) {
  const found = at(node, ...names);
  return found ? found.text.trim() : "";
}
function num(value) {
  if (value === "" || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
const cents = roundHalfUpToCents;

/** Italian partita IVA: 11 digits, Luhn check digit. */
export function partitaIvaValid(value) {
  if (!/^\d{11}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let d = Number(value[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const CF_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];

/** Codice fiscale: 16 characters with a check letter, or 11 digits for a company (partita IVA rule). */
export function codiceFiscaleValid(value) {
  const cf = value.toUpperCase();
  if (/^\d{11}$/.test(cf)) return partitaIvaValid(cf);
  if (!/^[A-Z0-9]{16}$/.test(cf)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = cf[i];
    const v = /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
    const idx = /\d/.test(ch) ? v : v;
    sum += i % 2 === 0 ? CF_ODD[idx] : v;
  }
  return cf[15] === String.fromCharCode(65 + (sum % 26));
}

function checkParty(role, data, path, out) {
  const vatCountry = txt(data, "IdFiscaleIVA", "IdPaese").toUpperCase();
  const vat = txt(data, "IdFiscaleIVA", "IdCodice");
  const cf = txt(data, "CodiceFiscale");
  if (role === "buyer" && !vat && !cf) {
    out.push(finding("IT-005", "The buyer has neither a VAT number nor a codice fiscale.",
      "Add the buyer's IdFiscaleIVA or CodiceFiscale (a foreign buyer needs IdFiscaleIVA with their country code).", `${path}/IdFiscaleIVA`));
  }
  if (role === "seller" && !vat) {
    out.push(finding("IT-005", "The seller has no VAT number (IdFiscaleIVA).",
      "Add the seller's IdFiscaleIVA with IdPaese and IdCodice.", `${path}/IdFiscaleIVA`));
  }
  if (vat && vatCountry === "IT" && !partitaIvaValid(vat)) {
    out.push(finding("IT-003", `The ${role}'s Italian partita IVA does not pass its check digit.`,
      "Re-key the 11-digit partita IVA from the registration document; one digit is probably wrong.", `${path}/IdFiscaleIVA/IdCodice`));
  }
  if (vat && !vatCountry) {
    out.push(finding("IT-003", `The ${role}'s VAT number has no country code (IdPaese).`,
      "Add IdPaese, a two-letter ISO country code, beside IdCodice.", `${path}/IdFiscaleIVA/IdPaese`));
  }
  if (cf && !codiceFiscaleValid(cf)) {
    out.push(finding("IT-004", `The ${role}'s codice fiscale is not a valid 16-character code or 11-digit company number.`,
      "Check the codice fiscale against the tessera sanitaria or the company registration; a single wrong character fails the check letter.", `${path}/CodiceFiscale`));
  }
  const name = at(data, "Anagrafica");
  if (!txt(name, "Denominazione") && !(txt(name, "Nome") && txt(name, "Cognome"))) {
    out.push(finding("IT-006", `The ${role} has no name: Denominazione, or Nome and Cognome, is required.`,
      "Fill Denominazione for a company, or Nome and Cognome for a person.", `${path}/Anagrafica`));
  }
}

function checkAddress(role, sede, path, out) {
  if (!sede) {
    out.push(finding("IT-007", `The ${role} has no address (Sede).`, "Add Sede with Indirizzo, CAP, Comune and Nazione.", path));
    return;
  }
  for (const field of ["Indirizzo", "CAP", "Comune", "Nazione"]) {
    if (!txt(sede, field)) {
      out.push(finding("IT-007", `The ${role}'s address is missing ${field}.`, `Fill ${field} in Sede.`, `${path}/${field}`));
    }
  }
  if (txt(sede, "Nazione").toUpperCase() === "IT" && txt(sede, "CAP") && !/^\d{5}$/.test(txt(sede, "CAP"))) {
    out.push(finding("IT-007", `The ${role}'s Italian CAP is not five digits.`, "Use the five-digit CAP (postcode).", `${path}/CAP`));
  }
}

function adjust(price, discounts) {
  let value = price;
  for (const d of discounts) {
    const pct = num(txt(d, "Percentuale"));
    const amt = num(txt(d, "Importo"));
    const sign = txt(d, "Tipo") === "MG" ? 1 : -1;
    if (pct !== null) value += sign * Math.abs(value) * pct / 100;
    else if (amt !== null) value += sign * amt;
  }
  return value;
}

const rateKey = (rate) => rate.toFixed(2);

// Today's date in Italy (SdI's clock), as YYYY-MM-DD.
function romeToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function checkDiscountBlocks(blocks, path, code, out) {
  blocks.forEach((d, i) => {
    if (txt(d, "Tipo") && txt(d, "Percentuale") === "" && txt(d, "Importo") === "") {
      out.push(finding("IT-028", `A ScontoMaggiorazione has a Tipo but neither Percentuale nor Importo; SdI rejects it (error ${code}).`,
        "Give the discount or surcharge a Percentuale or an Importo, or remove the block.", `${path}/ScontoMaggiorazione[${i + 1}]`, { sdi: code }));
    }
  });
}

function checkBody(body, index, out, skipped, ctx) {
  const p = `/FatturaElettronicaBody[${index + 1}]`;
  const general = at(body, "DatiGenerali", "DatiGeneraliDocumento");
  const gp = `${p}/DatiGenerali/DatiGeneraliDocumento`;
  const type = txt(general, "TipoDocumento");
  if (!type) {
    out.push(finding("IT-008", "TipoDocumento is missing.", "Set TipoDocumento, for example TD01 for an invoice or TD04 for a credit note.", `${gp}/TipoDocumento`));
  } else if (!DOC_TYPES.has(type)) {
    out.push(finding("IT-008", "TipoDocumento is not a code in the FatturaPA schema 1.2.3 (TD01-TD06, TD16-TD29; TD07-TD09 are simplified-invoice codes).",
      "Use a published TipoDocumento code; newer codes added after this list was built will be flagged until it is updated.", `${gp}/TipoDocumento`));
  }
  const { sellerCountry, buyerCountry } = ctx;
  if (type === "TD29" && sellerCountry && sellerCountry !== "IT") {
    out.push(finding("IT-023", "A TD29 (omitted or irregular invoicing report) must name an Italian seller; SdI rejects it when the seller's IdPaese is not IT (error 00473).",
      "Use TD29 only for a supplier established in Italy; for a foreign supplier use the document type that fits the case, for example TD17-TD19.", `${gp}/TipoDocumento`, { sdi: "00473" }));
  }
  if (FOREIGN_SELLER_ONLY.has(type) && sellerCountry === "IT") {
    out.push(finding("IT-023", `A ${type} is a reverse-charge self-invoice for a purchase from a supplier outside Italy, so its seller's IdPaese cannot be IT; SdI rejects it (error 00473).`,
      "Put the foreign supplier in CedentePrestatore with their own country code, or use the document type for a domestic purchase.", `${gp}/TipoDocumento`, { sdi: "00473" }));
  }
  if (NEEDS_BUYER_VAT.has(type) && !ctx.buyerVat) {
    out.push(finding("IT-029", `A ${type} needs the buyer's (the self-invoicing company's) IdFiscaleIVA; a CodiceFiscale alone is rejected (error 00475).`,
      "Add IdFiscaleIVA with IdPaese and IdCodice to CessionarioCommittente.", "/FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA", { sdi: "00475" }));
  }
  if (ctx.sellerId && ctx.buyerId) {
    const same = ctx.sellerId === ctx.buyerId;
    if (same && SELLER_NOT_BUYER.has(type)) {
      out.push(finding("IT-031", `In a ${type} the seller and the buyer must be different subjects, but both carry the same tax identifier; SdI rejects it (error 00471).`,
        "Check CedentePrestatore and CessionarioCommittente: one of them is probably copied from the other. A self-invoice for own use is TD27, for exceeding the plafond TD21.", "/FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici", { sdi: "00471" }));
    }
    if (!same && SELLER_IS_BUYER.has(type)) {
      out.push(finding("IT-031", `A ${type} is a self-invoice, so the seller and the buyer must be the same subject; here their tax identifiers differ and SdI rejects it (error 00472).`,
        "Name your own company as both CedentePrestatore and CessionarioCommittente, or use the document type for an invoice to a customer.", "/FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici", { sdi: "00472" }));
    }
  }
  const currency = txt(general, "Divisa");
  if (!/^[A-Z]{3}$/.test(currency)) {
    out.push(finding("IT-009", "Divisa is missing or is not a three-letter currency code.", "Use an ISO 4217 code such as EUR.", `${gp}/Divisa`));
  }
  const date = txt(general, "Data");
  const docDate = calendarDate(date);
  if (!docDate) {
    out.push(finding("IT-009", "Data is missing or is not a YYYY-MM-DD date.", "Write the invoice date as YYYY-MM-DD.", `${gp}/Data`));
  }
  if (docDate && date > romeToday()) {
    out.push(finding("IT-009", "Data is after today's date in Italy; SdI rejects an invoice dated after the day it receives it (error 00403).",
      "Date the invoice no later than the day you send it.", `${gp}/Data`, { sdi: "00403" }));
  }
  if (!/\d/.test(txt(general, "Numero"))) {
    out.push(finding("IT-009", "Numero must contain at least one digit; SdI rejects it otherwise (error 00425).", "Give the invoice a number with at least one digit, such as 2026/001.", `${gp}/Numero`, { sdi: "00425" }));
  }
  if (docDate) {
    kids(at(body, "DatiGenerali"), "DatiFattureCollegate").forEach((linked, i) => {
      const d = txt(linked, "Data");
      if (calendarDate(d) && d > date) {
        out.push(finding("IT-033", "A linked invoice (DatiFattureCollegate) is dated after this document; SdI rejects it (error 00418).",
          "Use the date of the invoice this document corrects or refers to, which cannot be later than this document's own Data.", `${p}/DatiGenerali/DatiFattureCollegate[${i + 1}]/Data`, { sdi: "00418" }));
      }
    });
  }
  checkDiscountBlocks(kids(general, "ScontoMaggiorazione"), gp, "00437", out);
  const withholding = kids(general, "DatiRitenuta").length > 0;

  // Pension-fund contributions (cassa) enter the summary at their own rate.
  const cassaRates = [];
  kids(general, "DatiCassaPrevidenziale").forEach((c, i) => {
    const cp = `${gp}/DatiCassaPrevidenziale[${i + 1}]`;
    const rate = num(txt(c, "AliquotaIVA"));
    const nature = txt(c, "Natura");
    if (rate === 0 && !nature) {
      out.push(finding("IT-011", "A pension-fund contribution at 0% VAT has no Natura; SdI rejects it (error 00413).", "Add the Natura code that says why the contribution carries no VAT.", `${cp}/Natura`, { sdi: "00413" }));
    }
    if (rate !== null && rate > 0 && nature) {
      out.push(finding("IT-011", "A taxed pension-fund contribution also carries a Natura; SdI rejects it (error 00414).", "Remove Natura from the contribution, or set its AliquotaIVA to 0.00.", `${cp}/Natura`, { sdi: "00414" }));
    }
    if (txt(c, "Ritenuta") === "SI" && !withholding) {
      out.push(finding("IT-027", "A pension-fund contribution is marked subject to withholding (Ritenuta SI) but the document has no DatiRitenuta; SdI rejects it (error 00415).",
        "Add DatiRitenuta (type, rate, amount, causale) to DatiGeneraliDocumento, or drop Ritenuta from the contribution.", `${cp}/Ritenuta`, { sdi: "00415" }));
    }
    if (rate !== null) cassaRates.push({ rate, nature, amount: num(txt(c, "ImportoContributoCassa")) });
  });

  const lines = kids(at(body, "DatiBeniServizi"), "DettaglioLinee");
  if (!lines.length) {
    out.push(finding("IT-010", "The invoice has no lines (DettaglioLinee).", "Add at least one DettaglioLinee.", `${p}/DatiBeniServizi`));
  }
  const byRate = new Map();
  const add = (rate, amount) => byRate.set(rateKey(rate), (byRate.get(rateKey(rate)) || 0) + amount);
  const lineRates = new Set();
  const lineNatures = new Set();
  let unreadableLine = false;
  lines.forEach((line, i) => {
    const lp = `${p}/DatiBeniServizi/DettaglioLinee[${i + 1}]`;
    const rate = num(txt(line, "AliquotaIVA"));
    const nature = txt(line, "Natura");
    const total = num(txt(line, "PrezzoTotale"));
    const unit = num(txt(line, "PrezzoUnitario"));
    const qty = txt(line, "Quantita") === "" ? 1 : num(txt(line, "Quantita"));
    checkDiscountBlocks(kids(line, "ScontoMaggiorazione"), lp, "00438", out);
    if (txt(line, "Ritenuta") === "SI" && !withholding) {
      out.push(finding("IT-027", "A line is marked subject to withholding (Ritenuta SI) but the document has no DatiRitenuta; SdI rejects it (error 00411).",
        "Add DatiRitenuta (type, rate, amount, causale) to DatiGeneraliDocumento, or drop Ritenuta from the line.", `${lp}/Ritenuta`, { sdi: "00411" }));
    }
    if (rate === null) {
      unreadableLine = true;
      out.push(finding("IT-011", "A line has no numeric AliquotaIVA.", "Set AliquotaIVA (for example 22.00, or 0.00 with a Natura).", `${lp}/AliquotaIVA`));
      return;
    }
    lineRates.add(rateKey(rate));
    if (nature) lineNatures.add(nature);
    if (rate === 0 && !nature) {
      out.push(finding("IT-011", "A line at 0% VAT has no Natura; SdI rejects it (error 00400).", "Add the Natura code (N1-N7) that says why no VAT is charged.", `${lp}/Natura`, { sdi: "00400" }));
    }
    if (rate > 0 && nature && type !== "TD16") {
      out.push(finding("IT-011", "A line charges VAT but also carries a Natura; SdI rejects it (error 00401) except in a TD16.", "Remove Natura from taxed lines, or set AliquotaIVA to 0.00.", `${lp}/Natura`, { sdi: "00401" }));
    }
    if (rate === 0 && type === "TD21") {
      out.push(finding("IT-032", "A TD21 (self-invoice for exceeding the plafond) has a line at 0% VAT; every TD21 line must charge VAT (error 00474).",
        "Give the line the VAT rate that applies; the point of a TD21 is to charge the VAT the plafond did not cover.", `${lp}/AliquotaIVA`, { sdi: "00474" }));
    }
    if (nature && !NATURE.has(nature)) {
      out.push(finding("IT-011", "Natura is not a code in force (N1, N2.1-N2.2, N3.1-N3.6, N4, N5, N6.1-N6.9, N7; the schema retired the bare N2, N3 and N6 from 2021-01-01).",
        "Use a published Natura code; a bare N2, N3 or N6 is no longer accepted.", `${lp}/Natura`));
    }
    if (total !== null && unit !== null && qty !== null) {
      const expected = adjust(unit, kids(line, "ScontoMaggiorazione")) * qty;
      if (Math.abs(expected - total) > TOLERANCE + 1e-9) {
        out.push(finding("IT-012", "PrezzoTotale differs by more than one cent from quantity times unit price after the line's discounts; SdI rejects it (error 00423).",
          "Recompute PrezzoTotale = Quantita x PrezzoUnitario, less any ScontoMaggiorazione on the line.", `${lp}/PrezzoTotale`, { sdi: "00423" }));
      }
    }
    if (total !== null) add(rate, total);
    else unreadableLine = true;
  });
  for (const c of cassaRates) {
    lineRates.add(rateKey(c.rate));
    if (c.nature) lineNatures.add(c.nature);
    if (c.amount !== null) add(c.rate, c.amount);
    else unreadableLine = true;
  }

  const summaries = kids(at(body, "DatiBeniServizi"), "DatiRiepilogo");
  if (!summaries.length && lines.length) {
    out.push(finding("IT-013", "The invoice has lines but no DatiRiepilogo (VAT summary).", "Add one DatiRiepilogo per VAT rate and Natura.", `${p}/DatiBeniServizi`));
  }
  let sumBase = 0;
  let sumTax = 0;
  let summaryReadable = summaries.length > 0;
  const summaryBase = new Map();
  const summaryPath = new Map();
  const summaryRates = new Set();
  const summaryNatures = new Set();
  summaries.forEach((s, i) => {
    const sp = `${p}/DatiBeniServizi/DatiRiepilogo[${i + 1}]`;
    const rate = num(txt(s, "AliquotaIVA"));
    const nature = txt(s, "Natura");
    const base = num(txt(s, "ImponibileImporto"));
    const tax = num(txt(s, "Imposta"));
    if (rate === null || base === null || tax === null) {
      summaryReadable = false;
      out.push(finding("IT-013", "A VAT summary is missing AliquotaIVA, ImponibileImporto or Imposta.", "Fill all three on every DatiRiepilogo.", sp));
      return;
    }
    summaryRates.add(rateKey(rate));
    if (nature) summaryNatures.add(nature);
    if (rate === 0 && !nature) {
      out.push(finding("IT-011", "A 0% VAT summary has no Natura; SdI rejects it (error 00429).", "Add the Natura code on the summary as on its lines.", `${sp}/Natura`, { sdi: "00429" }));
    }
    if (rate > 0 && nature && type !== "TD16") {
      out.push(finding("IT-011", "A VAT summary charges VAT but also carries a Natura; SdI rejects it (error 00430) except in a TD16.", "Remove Natura from the summary, or set its AliquotaIVA to 0.00.", `${sp}/Natura`, { sdi: "00430" }));
    }
    if (/^N6/.test(nature) && txt(s, "EsigibilitaIVA") === "S") {
      out.push(finding("IT-026", "A reverse-charge summary (Natura N6.x) is marked split payment (EsigibilitaIVA S); the two regimes exclude each other and SdI rejects it (error 00420).",
        "Set EsigibilitaIVA to I or D on the reverse-charge summary, or drop it (it is optional).", `${sp}/EsigibilitaIVA`, { sdi: "00420" }));
    }
    // 00421: Imposta = AliquotaIVA x ImponibileImporto / 100, rounded half up to the cent, then +-1 cent.
    if (Math.abs(cents(base * rate / 100) - tax) > TOLERANCE + 1e-9) {
      out.push(finding("IT-014", "Imposta differs by more than one cent from ImponibileImporto times AliquotaIVA rounded to the cent; SdI rejects it (error 00421).",
        "Recompute Imposta = ImponibileImporto x AliquotaIVA / 100, rounded half up to two decimals.", `${sp}/Imposta`, { sdi: "00421" }));
    }
    const rounding = num(txt(s, "Arrotondamento")) || 0;
    const key = rateKey(rate);
    summaryBase.set(key, (summaryBase.get(key) || 0) + base - rounding);
    if (!summaryPath.has(key)) summaryPath.set(key, sp);
    sumBase += base;
    sumTax += tax;
  });

  // 00422, per distinct AliquotaIVA: the summaries' ImponibileImporto against the
  // lines' PrezzoTotale + the cassa contributions + the summaries' Arrotondamento.
  if (summaryReadable && !unreadableLine && lines.length) {
    for (const [key, base] of summaryBase) {
      const parts = byRate.get(key) || 0;
      const diff = Math.abs(cents(base) - cents(parts));
      const sp = `${summaryPath.get(key)}/ImponibileImporto`;
      if (diff > BASE_TOLERANCE + 1e-9) {
        out.push(finding("IT-015", `ImponibileImporto at AliquotaIVA ${key} differs by ${diff.toFixed(2)} from the sum of the lines, pension-fund contributions and Arrotondamento at that rate; past SdI's one-euro tolerance it rejects the file (error 00422).`,
          "Set ImponibileImporto to the sum of PrezzoTotale (plus any ImportoContributoCassa and Arrotondamento) at that VAT rate.", sp, { sdi: "00422" }));
      } else if (diff > TOLERANCE * Math.max(1, lines.length) + 1e-9) {
        out.push(finding("IT-025", `ImponibileImporto at AliquotaIVA ${key} differs by ${diff.toFixed(2)} from the sum of the lines, pension-fund contributions and Arrotondamento at that rate. SdI accepts up to one euro (error 00422 beyond that), but the books will not tie out.`,
          "Set ImponibileImporto to the sum of PrezzoTotale (plus any ImportoContributoCassa and Arrotondamento) at that VAT rate, or record the difference in Arrotondamento.", sp, { sdi: "00422", severity: "warning" }));
      }
    }
  }
  if (summaryReadable && !unreadableLine) {
    for (const key of lineRates) {
      if (summaryRates.has(key)) continue;
      out.push(finding("IT-024", `Lines or pension-fund contributions at AliquotaIVA ${key} have no DatiRiepilogo at that rate; SdI rejects it (errors 00419 and 00443).`,
        "Add one DatiRiepilogo for every AliquotaIVA used on the lines and contributions.", `${p}/DatiBeniServizi`, { sdi: "00443" }));
    }
    for (const nature of lineNatures) {
      if (summaryNatures.has(nature)) continue;
      out.push(finding("IT-024", `Lines or pension-fund contributions use Natura ${nature} but no DatiRiepilogo does; SdI rejects it (error 00444).`,
        "Add a DatiRiepilogo for every Natura used on the lines and contributions.", `${p}/DatiBeniServizi`, { sdi: "00444" }));
    }
  }

  // SdI does not check ImportoTotaleDocumento: specification 1.9 gives it no error
  // code, and it is optional. A mismatch is a warning about the books, not a rejection.
  const documentAdjusted = at(general, "Arrotondamento") || kids(general, "ScontoMaggiorazione").length
    || kids(general, "DatiCassaPrevidenziale").length || at(general, "DatiBollo") || withholding
    || summaries.some((s) => txt(s, "Arrotondamento"));
  if (documentAdjusted) skipped.push("IT-016 (document total): the file has a cassa, bollo, ritenuta, rounding or document-level discount");
  const total = num(txt(general, "ImportoTotaleDocumento"));
  if (total !== null && summaryReadable && !documentAdjusted) {
    if (Math.abs(sumBase + sumTax - total) > TOLERANCE * Math.max(1, summaries.length) + 1e-9) {
      out.push(finding("IT-016", "ImportoTotaleDocumento is not the sum of every taxable base plus VAT. SdI does not check this total (specification 1.9 gives it no error code), but the buyer's books and payment will.",
        "Set ImportoTotaleDocumento to the total of ImponibileImporto and Imposta across DatiRiepilogo.", `${gp}/ImportoTotaleDocumento`, { severity: "warning" }));
    }
  }

  const payment = at(body, "DatiPagamento");
  for (const detail of kids(payment, "DettaglioPagamento")) {
    const iban = txt(detail, "IBAN").replace(/\s/g, "").toUpperCase();
    const method = txt(detail, "ModalitaPagamento");
    if (/^MP05$/.test(method) && !iban) {
      out.push(finding("IT-017", "A bank-transfer payment (MP05) has no IBAN.", "Add the IBAN to the DettaglioPagamento.", `${p}/DatiPagamento/DettaglioPagamento/IBAN`));
    }
    if (iban && !ibanValid(iban)) {
      out.push(finding("IT-017", "The payment IBAN does not pass its mod-97 check.", "Re-key the IBAN from the bank statement.", `${p}/DatiPagamento/DettaglioPagamento/IBAN`));
    }
  }
}

function ibanValid(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}


/** @returns {{findings: object[], skipped: string[]}} */
export function checkFatturaPa(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const tree = parseXmlTree(text);
  const root = tree.children.find((c) => c.name === "FatturaElettronica");
  if (!root) throw new Error("Not a FatturaElettronica document");
  const out = [];
  const skipped = [];
  const version = (root.attrs && root.attrs.versione) || "";
  if (version !== "FPR12" && version !== "FPA12") {
    out.push(finding("IT-001", "The versione attribute is not FPR12 (business) or FPA12 (public body).",
      "Set versione=\"FPR12\" for invoices to businesses and consumers, or \"FPA12\" for public bodies.", "/FatturaElettronica/@versione"));
  }
  const header = child(root, "FatturaElettronicaHeader");
  const transmission = at(header, "DatiTrasmissione");
  const dest = txt(transmission, "CodiceDestinatario");
  const format = txt(transmission, "FormatoTrasmissione");
  if (format && format !== version && (version === "FPR12" || version === "FPA12")) {
    out.push(finding("IT-001", "FormatoTrasmissione does not match the versione attribute; SdI rejects it (error 00428).", "Make both FPR12 or both FPA12.", "/FatturaElettronicaHeader/DatiTrasmissione/FormatoTrasmissione", { sdi: "00428" }));
  }
  const expectedLen = (format || version) === "FPA12" ? 6 : 7;
  if (!dest) {
    out.push(finding("IT-002", "CodiceDestinatario is missing.", "Enter the buyer's 7-character SdI code (6 for a public body), 0000000 with a PEC address, or XXXXXXX for a foreign buyer.", "/FatturaElettronicaHeader/DatiTrasmissione/CodiceDestinatario"));
  } else if (dest.length !== expectedLen || !/^[A-Za-z0-9]+$/.test(dest)) {
    out.push(finding("IT-002", `CodiceDestinatario must be ${expectedLen} letters or digits for this format${dest.length === 13 - expectedLen ? `; SdI rejects a ${dest.length}-character code in an ${format || version} file (error 00427)` : ""}.`,
      "Re-key the code from the buyer's invoice request; a public body's code has 6 characters, a business's 7.", "/FatturaElettronicaHeader/DatiTrasmissione/CodiceDestinatario",
      dest.length === 13 - expectedLen ? { sdi: "00427" } : undefined));
  }
  const pec = txt(transmission, "PECDestinatario").toLowerCase();
  if (/^sdi\d*@pec\.fatturapa\.it$/.test(pec)) {
    out.push(finding("IT-002", "PECDestinatario is one of SdI's own certified-mail addresses; SdI rejects it (error 00330).",
      "Put the buyer's own PEC address here, or leave it out and let SdI deliver by CodiceDestinatario.", "/FatturaElettronicaHeader/DatiTrasmissione/PECDestinatario", { sdi: "00330" }));
  }
  const seller = at(header, "CedentePrestatore");
  checkParty("seller", at(seller, "DatiAnagrafici"), "/FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici", out);
  const regime = txt(seller, "DatiAnagrafici", "RegimeFiscale");
  if (!regime || !REGIMES.has(regime)) {
    out.push(finding("IT-006", regime ? "RegimeFiscale is not a known code (RF01-RF20, no RF03)." : "The seller's RegimeFiscale is missing.",
      "Set RegimeFiscale, for example RF01 for the ordinary regime or RF19 for the flat-rate regime.", "/FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/RegimeFiscale"));
  }
  checkAddress("seller", at(seller, "Sede"), "/FatturaElettronicaHeader/CedentePrestatore/Sede", out);
  const buyer = at(header, "CessionarioCommittente");
  checkParty("buyer", at(buyer, "DatiAnagrafici"), "/FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici", out);
  checkAddress("buyer", at(buyer, "Sede"), "/FatturaElettronicaHeader/CessionarioCommittente/Sede", out);

  const bodies = kids(root, "FatturaElettronicaBody");
  if (!bodies.length) {
    out.push(finding("IT-010", "The file has no FatturaElettronicaBody.", "Add the body with DatiGenerali and DatiBeniServizi.", "/FatturaElettronica"));
  }
  const sellerData = at(seller, "DatiAnagrafici");
  const buyerData = at(buyer, "DatiAnagrafici");
  const sellerCountry = txt(sellerData, "IdFiscaleIVA", "IdPaese").toUpperCase();
  const buyerCountry = txt(buyerData, "IdFiscaleIVA", "IdPaese").toUpperCase();
  if (dest.toUpperCase() === "XXXXXXX" && buyerCountry === "IT") {
    out.push(finding("IT-002", "CodiceDestinatario XXXXXXX is for a buyer not established in Italy, but the buyer's IdPaese is IT; SdI rejects it (error 00313).",
      "Use the Italian buyer's own SdI code, or 0000000 (with PECDestinatario if they gave one).", "/FatturaElettronicaHeader/DatiTrasmissione/CodiceDestinatario", { sdi: "00313" }));
  }
  if (sellerCountry && buyerCountry && sellerCountry !== "IT" && buyerCountry !== "IT") {
    out.push(finding("IT-030", "Neither the seller's nor the buyer's IdFiscaleIVA is Italian; a FatturaPA needs at least one Italian party and SdI rejects it (error 00476).",
      "Check the IdPaese codes: a FatturaPA goes through SdI only when the seller or the buyer is identified in Italy.", "/FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA/IdPaese", { sdi: "00476" }));
  }
  // The same subject on both sides (00471, 00472): compared on IdFiscaleIVA, else on CodiceFiscale.
  const identity = (data) => {
    const code = txt(data, "IdFiscaleIVA", "IdCodice").toUpperCase();
    if (code) return `VAT:${txt(data, "IdFiscaleIVA", "IdPaese").toUpperCase()}${code}`;
    const cf = txt(data, "CodiceFiscale").toUpperCase();
    return cf ? `CF:${cf}` : "";
  };
  let sellerId = identity(sellerData);
  let buyerId = identity(buyerData);
  if (sellerId.startsWith("VAT:") !== buyerId.startsWith("VAT:")) {
    const cfOf = (data) => txt(data, "CodiceFiscale").toUpperCase();
    sellerId = cfOf(sellerData) ? `CF:${cfOf(sellerData)}` : "";
    buyerId = cfOf(buyerData) ? `CF:${cfOf(buyerData)}` : "";
  }
  const ctx = { sellerCountry, buyerCountry, buyerVat: txt(buyerData, "IdFiscaleIVA", "IdCodice"), sellerId, buyerId };
  bodies.forEach((b, i) => checkBody(b, i, out, skipped, ctx));
  out.push(...checkAgainstSchema(root, text));
  return { findings: out, skipped: [...new Set(skipped)] };
}
