// @ts-check
// Safe auto-fixes: a closed whitelist of mechanical corrections. Proprietary (see ../LICENSE,
// part 2).
//
// A fix here never guesses business content. Each one changes the form of a value whose meaning
// is already fixed by the file itself:
//   date-format       24.08.2026 / 2026/08/24 / 20260824 -> 2026-08-24 (CII format 102: 20260824).
//                     A slash date like 03/04/2026 is ambiguous (3 April or 4 March) and is left
//                     to a human.
//   amount-decimals   48.504 -> 48.50 on amounts limited to two decimals (prices are untouched).
//   currency-case     eur -> EUR, where the upper-case form is an ISO 4217 code.
//   currency-missing  adds DocumentCurrencyCode when every amount's currencyID names one currency.
//   peppol-process    adds the Peppol billing process id (BT-23) when it is missing and the
//                     document is not self-billing: then it has exactly one valid value.
// Every fix is proposed as text edits (rendered as a diff) and is accepted only if the file then
// re-validates without the finding it targets and without any new finding (check.mjs).
import { roundToCents } from "./rules.mjs";
import { dateIsWellFormed, dateLeaves, decimalsOf, indentOf, leaves, lineAt, realDate, restrictedAmounts, syntaxOf } from "./xml-scan.mjs";

/** @typedef {import("./diff.mjs").Edit} Edit */
/** @typedef {{ element: string, before: string, after: string }} Change */
/** @typedef {{ edits: Edit[], changes: Change[], notes: string[] }} Proposal */
/** @typedef {{ id: string, rules: string[], label: Record<"en"|"de"|"fr", string>, propose(xml: string): Proposal }} Fix */

export const PEPPOL_BILLING_PROCESS = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

// ISO 4217 active codes (2026). Used only to confirm an upper-cased code exists.
const ISO_4217 = new Set(
  ("AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY " +
    "COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR " +
    "IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR " +
    "MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD " +
    "SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG " +
    "XOF XPF YER ZAR ZMW ZWG").split(" "),
);

/**
 * @param {string} value @param {"iso" | "102"} want
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
export function normaliseDate(value, want) {
  const v = value.trim();
  /** @type {[number, number, number] | null} */
  let ymd = null;
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(v))) ymd = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(v))) ymd = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(v))) ymd = [+m[1], +m[2], +m[3]];
  // Day first with dots is the German and French convention; nobody writes month.day.year.
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v))) ymd = [+m[3], +m[2], +m[1]];
  else if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v))) {
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) ymd = [+m[3], b, a];
    else if (b > 12 && a <= 12) ymd = [+m[3], a, b];
    else return { ok: false, reason: `"${v}" could be day/month or month/day; check it by hand` };
  } else return { ok: false, reason: `"${v}" is not a date form this fix knows` };
  if (!realDate(...ymd)) return { ok: false, reason: `"${v}" is not a real calendar date` };
  const [y, mo, d] = ymd;
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return { ok: true, value: want === "iso" ? `${y}-${p(mo)}-${p(d)}` : `${y}${p(mo)}${p(d)}` };
}

/** @type {Fix} */
const dateFormat = {
  id: "date-format",
  rules: ["INV-003", "INV-020", "INV-042", "PRO-DATE-001"],
  label: {
    en: "Rewrite dates in the form the schema requires",
    de: "Datumsangaben in die vom Schema verlangte Form bringen",
    fr: "Réécrire les dates sous la forme exigée par le schéma",
  },
  propose(xml) {
    /** @type {Proposal} */
    const p = { edits: [], changes: [], notes: [] };
    for (const d of dateLeaves(xml)) {
      if (dateIsWellFormed(d.value.trim(), d.want)) continue;
      const r = normaliseDate(d.value, d.want);
      if (!r.ok) {
        p.notes.push(`${d.name}: ${r.reason}`);
        continue;
      }
      p.edits.push({ start: d.valueStart, end: d.valueEnd, text: r.value });
      p.changes.push({ element: d.name, before: d.value, after: r.value });
    }
    return p;
  },
};

/** @type {Fix} */
const amountDecimals = {
  id: "amount-decimals",
  rules: ["PRO-DEC-001"],
  label: {
    en: "Round amounts to two decimals",
    de: "Beträge auf zwei Nachkommastellen runden",
    fr: "Arrondir les montants à deux décimales",
  },
  propose(xml) {
    /** @type {Proposal} */
    const p = { edits: [], changes: [], notes: [] };
    for (const a of restrictedAmounts(xml)) {
      if (decimalsOf(a.value) <= 2) continue;
      const after = roundToCents(a.value);
      p.edits.push({ start: a.valueStart, end: a.valueEnd, text: after });
      p.changes.push({ element: a.name, before: a.value, after });
    }
    return p;
  },
};

/** @type {Fix} */
const currencyCase = {
  id: "currency-case",
  rules: ["INV-004"],
  label: {
    en: "Write the currency code in capitals",
    de: "Währungscode in Großbuchstaben schreiben",
    fr: "Écrire le code devise en majuscules",
  },
  propose(xml) {
    /** @type {Proposal} */
    const p = { edits: [], changes: [], notes: [] };
    const codes = leaves(xml, "(?:DocumentCurrencyCode|InvoiceCurrencyCode)");
    for (const c of codes) {
      const v = c.value.trim();
      const up = v.toUpperCase();
      if (v === up) continue;
      if (!ISO_4217.has(up)) {
        p.notes.push(`${c.name}: "${v}" is not an ISO 4217 code even in capitals`);
        continue;
      }
      p.edits.push({ start: c.valueStart, end: c.valueEnd, text: up });
      p.changes.push({ element: c.name, before: c.value, after: up });
      // The same code written in lower case in currencyID attributes is corrected with it.
      const attr = new RegExp(`currencyID\\s*=\\s*(["'])${v.replace(/[^A-Za-z]/g, "")}\\1`, "g");
      for (const m of xml.matchAll(attr)) {
        const start = (m.index ?? 0) + m[0].indexOf(m[1]) + 1;
        p.edits.push({ start, end: start + v.length, text: up });
        p.changes.push({ element: "currencyID", before: v, after: up });
      }
    }
    return p;
  },
};

/** @type {Fix} */
const currencyMissing = {
  id: "currency-missing",
  rules: ["PRO-CUR-001"],
  label: {
    en: "Add the currency code every amount already names",
    de: "Den Währungscode ergänzen, den alle Beträge bereits nennen",
    fr: "Ajouter le code devise déjà indiqué par tous les montants",
  },
  propose(xml) {
    /** @type {Proposal} */
    const p = { edits: [], changes: [], notes: [] };
    if (syntaxOf(xml) !== "ubl") {
      p.notes.push("only UBL files are completed automatically");
      return p;
    }
    const ids = new Set([...xml.matchAll(/currencyID\s*=\s*["']([^"']*)["']/g)].map((m) => m[1].trim()));
    if (ids.size !== 1) {
      p.notes.push(ids.size ? `amounts name ${ids.size} currencies (${[...ids].join(", ")})` : "no amount names a currency");
      return p;
    }
    const code = [...ids][0];
    if (!ISO_4217.has(code)) {
      p.notes.push(`"${code}" is not an ISO 4217 code`);
      return p;
    }
    // Header elements come before the first aggregate; insert after the last of these.
    const headerEnd = xml.search(/<(?:[\w.-]+:)?(?:AccountingSupplierParty|InvoicePeriod|OrderReference|BillingReference|AdditionalDocumentReference|Signature|[A-Z]\w*Reference)\b/);
    const head = headerEnd === -1 ? xml : xml.slice(0, headerEnd);
    const anchors = leaves(head, "(?:InvoiceTypeCode|CreditNoteTypeCode|Note|TaxPointDate)");
    const anchor = anchors[anchors.length - 1];
    if (!anchor) {
      p.notes.push("no type code to place the currency after");
      return p;
    }
    const indent = indentOf(lineAt(xml, anchor.start));
    const prefix = anchor.prefix ? `${anchor.prefix}:` : "";
    const text = `\n${indent}<${prefix}DocumentCurrencyCode>${code}</${prefix}DocumentCurrencyCode>`;
    p.edits.push({ start: anchor.end, end: anchor.end, text });
    p.changes.push({ element: "DocumentCurrencyCode", before: "", after: code });
    return p;
  },
};

/** @type {Fix} */
const peppolProcess = {
  id: "peppol-process",
  rules: ["PP-001"],
  label: {
    en: "Add the Peppol billing process identifier",
    de: "Peppol-Geschäftsprozesskennung ergänzen",
    fr: "Ajouter l'identifiant de processus de facturation Peppol",
  },
  propose(xml) {
    /** @type {Proposal} */
    const p = { edits: [], changes: [], notes: [] };
    const syntax = syntaxOf(xml);
    const typeCode = leaves(xml, "(?:InvoiceTypeCode|CreditNoteTypeCode|TypeCode)")[0]?.value.trim();
    if (typeCode === "389") {
      p.notes.push("self-billing invoice: its process id is not the billing one");
      return p;
    }
    if (syntax === "ubl") {
      if (leaves(xml, "ProfileID").length) {
        p.notes.push("ProfileID is present with another value; changing it is not mechanical");
        return p;
      }
      const cust = leaves(xml, "CustomizationID")[0];
      if (!cust) {
        p.notes.push("no CustomizationID to place the process id after");
        return p;
      }
      const prefix = cust.prefix ? `${cust.prefix}:` : "";
      const text = `\n${indentOf(lineAt(xml, cust.start))}<${prefix}ProfileID>${PEPPOL_BILLING_PROCESS}</${prefix}ProfileID>`;
      p.edits.push({ start: cust.end, end: cust.end, text });
      p.changes.push({ element: "ProfileID", before: "", after: PEPPOL_BILLING_PROCESS });
      return p;
    }
    if (syntax === "cii") {
      if (/<(?:[\w.-]+:)?BusinessProcessSpecifiedDocumentContextParameter[\s>]/.test(xml)) {
        p.notes.push("a business process is present with another value; changing it is not mechanical");
        return p;
      }
      const m = /<((?:([\w.-]+):)?)GuidelineSpecifiedDocumentContextParameter[\s>]/.exec(xml);
      if (!m) {
        p.notes.push("no guideline parameter to place the process before");
        return p;
      }
      const at = m.index;
      const indent = indentOf(lineAt(xml, at));
      const pre = m[1];
      const text =
        `<${pre}BusinessProcessSpecifiedDocumentContextParameter>\n${indent}  <${pre}ID>${PEPPOL_BILLING_PROCESS}</${pre}ID>\n` +
        `${indent}</${pre}BusinessProcessSpecifiedDocumentContextParameter>\n${indent}`;
      p.edits.push({ start: at, end: at, text });
      p.changes.push({ element: "BusinessProcessSpecifiedDocumentContextParameter/ID", before: "", after: PEPPOL_BILLING_PROCESS });
      return p;
    }
    p.notes.push("not a UBL or CII file");
    return p;
  },
};

/** The whitelist, in the order fixes are tried. @type {Fix[]} */
export const FIXES = [currencyMissing, currencyCase, dateFormat, amountDecimals, peppolProcess];
