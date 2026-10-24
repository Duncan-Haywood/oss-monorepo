// Offline checks for an Italian FatturaPA / FatturaElettronica XML file (the
// format SdI takes, versions FPR12 for businesses and FPA12 for public bodies).
// FatturaPA is not EN 16931, so none of the UBL/CII rules apply to it. Rule ids
// are IT-nnn and are this tool's own, not SdI error codes. A check that depends
// on something this reader does not model (a pension-fund contribution, a
// document-level discount, a rounding line) is skipped and named in `skipped`,
// never counted as a pass and never raised as a defect. This is an offline
// observation, not SdI's acceptance and not tax advice. Findings never repeat a
// tax number.

import { parseXmlTree } from "./ubl.mjs";
import { checkAgainstSchema } from "./fatturapa-xsd.mjs";

const DOC_TYPES = new Set([
  "TD01", "TD02", "TD03", "TD04", "TD05", "TD06", "TD07", "TD08", "TD09",
  "TD16", "TD17", "TD18", "TD19", "TD20", "TD21", "TD22", "TD23", "TD24",
  "TD25", "TD26", "TD27", "TD28", "TD29",
]);
const REGIMES = new Set([
  "RF01", "RF02", "RF04", "RF05", "RF06", "RF07", "RF08", "RF09", "RF10",
  "RF11", "RF12", "RF13", "RF14", "RF15", "RF16", "RF17", "RF18", "RF19", "RF20",
]);
const NATURE = new Set([
  "N1", "N2.1", "N2.2", "N3.1", "N3.2", "N3.3", "N3.4", "N3.5", "N3.6", "N4",
  "N5", "N6.1", "N6.2", "N6.3", "N6.4", "N6.5", "N6.6", "N6.7", "N6.8", "N6.9", "N7",
]);
const TOLERANCE = 0.01;

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
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
const cents = (n) => Math.round(n * 100) / 100;

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

function checkBody(body, index, out, skipped, sellerCountry) {
  const p = `/FatturaElettronicaBody[${index + 1}]`;
  const general = at(body, "DatiGenerali", "DatiGeneraliDocumento");
  const type = txt(general, "TipoDocumento");
  if (!type) {
    out.push(finding("IT-008", "TipoDocumento is missing.", "Set TipoDocumento, for example TD01 for an invoice or TD04 for a credit note.", `${p}/DatiGenerali/DatiGeneraliDocumento/TipoDocumento`));
  } else if (!DOC_TYPES.has(type)) {
    out.push(finding("IT-008", "TipoDocumento is not a code this checker knows (TD01-TD09, TD16-TD29).",
      "Use a published TipoDocumento code; newer codes added after this list was built will be flagged until it is updated.", `${p}/DatiGenerali/DatiGeneraliDocumento/TipoDocumento`));
  }
  if (type === "TD29" && sellerCountry && sellerCountry !== "IT") {
    out.push(finding("IT-023", "A TD29 (omitted or irregular invoicing report) must name an Italian seller; SdI rejects it when the seller's IdPaese is not IT (its error 00473).",
      "Use TD29 only for a supplier established in Italy; for a foreign supplier use the document type that fits the case, for example TD17-TD19.", `${p}/DatiGenerali/DatiGeneraliDocumento/TipoDocumento`));
  }
  const currency = txt(general, "Divisa");
  if (!/^[A-Z]{3}$/.test(currency)) {
    out.push(finding("IT-009", "Divisa is missing or is not a three-letter currency code.", "Use an ISO 4217 code such as EUR.", `${p}/DatiGenerali/DatiGeneraliDocumento/Divisa`));
  }
  const date = txt(general, "Data");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    out.push(finding("IT-009", "Data is missing or is not a YYYY-MM-DD date.", "Write the invoice date as YYYY-MM-DD.", `${p}/DatiGenerali/DatiGeneraliDocumento/Data`));
  }
  if (!/\d/.test(txt(general, "Numero"))) {
    out.push(finding("IT-009", "Numero must contain at least one digit.", "Give the invoice a number with at least one digit, such as 2026/001.", `${p}/DatiGenerali/DatiGeneraliDocumento/Numero`));
  }

  const lines = kids(at(body, "DatiBeniServizi"), "DettaglioLinee");
  if (!lines.length) {
    out.push(finding("IT-010", "The invoice has no lines (DettaglioLinee).", "Add at least one DettaglioLinee.", `${p}/DatiBeniServizi`));
  }
  const groups = new Map();
  lines.forEach((line, i) => {
    const lp = `${p}/DatiBeniServizi/DettaglioLinee[${i + 1}]`;
    const rate = num(txt(line, "AliquotaIVA"));
    const nature = txt(line, "Natura");
    const total = num(txt(line, "PrezzoTotale"));
    const unit = num(txt(line, "PrezzoUnitario"));
    const qty = txt(line, "Quantita") === "" ? 1 : num(txt(line, "Quantita"));
    if (rate === null) {
      out.push(finding("IT-011", "A line has no numeric AliquotaIVA.", "Set AliquotaIVA (for example 22.00, or 0.00 with a Natura).", `${lp}/AliquotaIVA`));
      return;
    }
    if (rate === 0 && !nature) {
      out.push(finding("IT-011", "A line at 0% VAT has no Natura.", "Add the Natura code (N1-N7) that says why no VAT is charged.", `${lp}/Natura`));
    }
    if (rate > 0 && nature) {
      out.push(finding("IT-011", "A line charges VAT but also carries a Natura.", "Remove Natura from taxed lines, or set AliquotaIVA to 0.00.", `${lp}/Natura`));
    }
    if (nature && !NATURE.has(nature)) {
      out.push(finding("IT-011", "Natura is not a known code (N1, N2.1-N2.2, N3.1-N3.6, N4, N5, N6.1-N6.9, N7).",
        "Use a published Natura code; a bare N2, N3 or N6 is no longer accepted.", `${lp}/Natura`));
    }
    if (total !== null && unit !== null && qty !== null) {
      const expected = adjust(unit, kids(line, "ScontoMaggiorazione")) * qty;
      if (Math.abs(expected - total) > TOLERANCE + 1e-9) {
        out.push(finding("IT-012", "PrezzoTotale does not equal quantity times unit price after the line's discounts.",
          "Recompute PrezzoTotale = Quantita x PrezzoUnitario, less any ScontoMaggiorazione on the line.", `${lp}/PrezzoTotale`));
      }
    }
    if (total !== null) {
      const key = `${rate.toFixed(2)}|${nature}`;
      groups.set(key, cents((groups.get(key) || 0) + total));
    }
  });

  const summaries = kids(at(body, "DatiBeniServizi"), "DatiRiepilogo");
  const roundingNote = at(general, "Arrotondamento") || at(general, "ScontoMaggiorazione")
    || at(general, "DatiCassaPrevidenziale") || at(general, "DatiBollo") || at(general, "DatiRitenuta")
    || kids(at(body, "DatiBeniServizi"), "DatiRiepilogo").some((s) => txt(s, "Arrotondamento"))
    || at(body, "DatiGenerali", "DatiGeneraliDocumento", "DatiCassaPrevidenziale");
  if (!summaries.length && lines.length) {
    out.push(finding("IT-013", "The invoice has lines but no DatiRiepilogo (VAT summary).", "Add one DatiRiepilogo per VAT rate and Natura.", `${p}/DatiBeniServizi`));
  }
  let sumBase = 0;
  let sumTax = 0;
  let summaryReadable = summaries.length > 0;
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
    if (rate === 0 && !nature) {
      out.push(finding("IT-011", "A 0% VAT summary has no Natura.", "Add the Natura code on the summary as on its lines.", `${sp}/Natura`));
    }
    if (Math.abs(base * rate / 100 - tax) > TOLERANCE + 1e-9) {
      out.push(finding("IT-014", "Imposta is not ImponibileImporto times AliquotaIVA (to the cent).",
        "Recompute Imposta = ImponibileImporto x AliquotaIVA / 100, rounded to two decimals.", `${sp}/Imposta`));
    }
    const key = `${rate.toFixed(2)}|${nature}`;
    if (roundingNote) {
      // Pension-fund contributions, stamp duty, document discounts and rounding lines change the base.
    } else if (groups.has(key)) {
      if (Math.abs(groups.get(key) - base) > TOLERANCE * Math.max(1, lines.length) + 1e-9) {
        out.push(finding("IT-015", "ImponibileImporto is not the sum of the lines at this rate and Natura.",
          "Set ImponibileImporto to the sum of PrezzoTotale for the lines with the same AliquotaIVA and Natura.", `${sp}/ImponibileImporto`));
      }
    } else if (lines.length) {
      out.push(finding("IT-015", "A VAT summary has no line at its rate and Natura.",
        "Every DatiRiepilogo must match at least one line's AliquotaIVA and Natura, or remove it.", sp));
    }
    sumBase += base;
    sumTax += tax;
  });
  if (roundingNote) skipped.push("IT-015 (summary base vs lines) and IT-016 (document total): the file has a cassa, bollo, ritenuta, rounding or document-level discount");

  const total = num(txt(general, "ImportoTotaleDocumento"));
  if (total !== null && summaryReadable && !roundingNote) {
    if (Math.abs(sumBase + sumTax - total) > TOLERANCE * Math.max(1, summaries.length) + 1e-9) {
      out.push(finding("IT-016", "ImportoTotaleDocumento is not the sum of every taxable base plus VAT.",
        "Set ImportoTotaleDocumento to the total of ImponibileImporto and Imposta across DatiRiepilogo.", `${p}/DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento`));
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
    out.push(finding("IT-001", "FormatoTrasmissione does not match the versione attribute.", "Make both FPR12 or both FPA12.", "/FatturaElettronicaHeader/DatiTrasmissione/FormatoTrasmissione"));
  }
  const expectedLen = (format || version) === "FPA12" ? 6 : 7;
  if (!dest) {
    out.push(finding("IT-002", "CodiceDestinatario is missing.", "Enter the buyer's 7-character SdI code (6 for a public body), 0000000 with a PEC address, or XXXXXXX for a foreign buyer.", "/FatturaElettronicaHeader/DatiTrasmissione/CodiceDestinatario"));
  } else if (dest.length !== expectedLen || !/^[A-Za-z0-9]+$/.test(dest)) {
    out.push(finding("IT-002", `CodiceDestinatario must be ${expectedLen} letters or digits for this format.`,
      "Re-key the code from the buyer's invoice request; a public body's code has 6 characters, a business's 7.", "/FatturaElettronicaHeader/DatiTrasmissione/CodiceDestinatario"));
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
  const sellerCountry = txt(seller, "DatiAnagrafici", "IdFiscaleIVA", "IdPaese");
  bodies.forEach((b, i) => checkBody(b, i, out, skipped, sellerCountry));
  out.push(...checkAgainstSchema(root, text));
  return { findings: out, skipped: [...new Set(skipped)] };
}
