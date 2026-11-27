// @ts-check
// Deterministic rules the paid layer adds on top of the imported checker, each mirroring an
// official EN 16931 constraint the built-in INV rules do not cover. Proprietary (see ../LICENSE). No model is involved: these are string checks on the XML.
//
//   PRO-DEC-001  an amount has more than two decimals (EN 16931 BR-DEC-*).
//   PRO-DATE-001 a date is not in the XSD form (UBL xs:date YYYY-MM-DD; CII format 102 YYYYMMDD).
//   PRO-CUR-001  the document currency code is missing (BT-5, mandatory; BR-05).
//   PRO-SUM-001  totals are not exact to the cent (BR-CO-10, -13, -15, -16), see exactSums().
import { blockRanges, dateIsWellFormed, dateLeaves, decimalsOf, inside, leaves, restrictedAmounts, syntaxOf } from "./xml-scan.mjs";

/** @typedef {{ rule: string, message: string, fix: string, path: string }} ProFinding */

/** @param {string} value */
export function roundToCents(value) {
  const v = value.trim();
  const neg = v.startsWith("-");
  const [int, frac = ""] = v.replace(/^-/, "").split(".");
  // Exact half-up (away from zero) on the decimal string, so no binary floating error.
  const cents = BigInt(int + (frac + "00").slice(0, 2)) + (Number(frac[2] ?? "0") >= 5 ? 1n : 0n);
  const s = cents.toString().padStart(3, "0");
  const out = `${s.slice(0, -2)}.${s.slice(-2)}`;
  return neg && cents !== 0n ? `-${out}` : out;
}

/** @param {string} xml @param {{ readErrors?: string[] }} [ctx] @returns {ProFinding[]} */
export function proRules(xml, ctx = {}) {
  /** @type {ProFinding[]} */
  const out = [];
  if (!syntaxOf(xml)) return out;
  for (const a of restrictedAmounts(xml)) {
    if (decimalsOf(a.value) > 2) {
      out.push({
        rule: "PRO-DEC-001",
        message: `${a.name} "${a.value.trim()}" has ${decimalsOf(a.value)} decimals; EN 16931 allows at most 2 (BR-DEC).`,
        fix: `Round ${a.name} to ${roundToCents(a.value)}.`,
        path: `/${a.name}@${a.start}`,
      });
    }
  }
  for (const d of dateLeaves(xml)) {
    if (!dateIsWellFormed(d.value.trim(), d.want)) {
      const form = d.want === "iso" ? "YYYY-MM-DD" : "YYYYMMDD (format 102)";
      out.push({
        rule: "PRO-DATE-001",
        message: `${d.name} "${d.value}" is not a date in the form ${form}.`,
        fix: `Write ${d.name} as ${form}.`,
        path: `/${d.name}@${d.start}`,
      });
    }
  }
  out.push(...exactSums(xml));
  if ((ctx.readErrors ?? []).some((e) => /DocumentCurrencyCode|InvoiceCurrencyCode/.test(e) && /missing/i.test(e))) {
    out.push({
      rule: "PRO-CUR-001",
      message: "The document currency code (BT-5) is missing.",
      fix: "Add the invoice currency code, for example EUR.",
      path: "/DocumentCurrencyCode",
    });
  }
  return out;
}

// --- PRO-SUM-001: exact cent sums (EN 16931 BR-CO-10, -13, -15, -16) ---
// The built-in INV rules allow a rounding tolerance; the official rules compare exactly. This
// rule runs only when every amount involved has at most two decimals (PRO-DEC-001 covers the
// rest), so it is what catches a rounding fix that would leave the totals one cent apart.

/** @param {string | undefined} v @returns {bigint | null} */
function cents(v) {
  if (v === undefined) return null;
  const m = /^\s*(-?)(\d+)(?:\.(\d{1,2}))?\s*$/.exec(v);
  if (!m) return null;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -c : c;
}

/** @param {bigint} c */
const show = (c) => {
  const neg = c < 0n;
  const s = (neg ? -c : c).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
};

/** First leaf named `name` inside [a, b). @param {string} xml @param {string} name @param {[number, number]} range @param {Array<[number, number]>} [skip] */
function leafIn(xml, name, [a, b], skip = []) {
  return leaves(xml.slice(a, b), name).find((l) => !inside(a + l.start, skip))?.value;
}

/** @param {string} xml @returns {ProFinding[]} */
export function exactSums(xml) {
  const syntax = syntaxOf(xml);
  /** @type {Record<string, string | undefined>} */
  const t = {};
  /** @type {Array<string | undefined>} */
  let lineNets = [];
  if (syntax === "ubl") {
    const lineBlocks = blockRanges(xml, "(?:InvoiceLine|CreditNoteLine)");
    lineNets = lineBlocks.map((r) => leafIn(xml, "LineExtensionAmount", r, blockRanges(xml.slice(r[0], r[1]), "SubInvoiceLine").map(([x, y]) => [x + r[0], y + r[0]])));
    const total = blockRanges(xml, "LegalMonetaryTotal")[0];
    if (!total) return [];
    for (const k of ["LineExtensionAmount", "TaxExclusiveAmount", "TaxInclusiveAmount", "AllowanceTotalAmount", "ChargeTotalAmount", "PrepaidAmount", "PayableRoundingAmount", "PayableAmount"])
      t[k] = leafIn(xml, k, total);
    const currency = leaves(xml, "DocumentCurrencyCode")[0]?.value.trim();
    const taxTotals = blockRanges(xml, "TaxTotal").filter(([a]) => !inside(a, lineBlocks));
    const taxAmounts = taxTotals.map((r) => leaves(xml.slice(r[0], r[1]), "TaxAmount")[0]).filter(Boolean);
    const doc = taxAmounts.find((l) => currency && l.attrs.includes(`"${currency}"`)) ?? taxAmounts[0];
    t.TaxAmount = doc?.value;
  } else if (syntax === "cii") {
    lineNets = leaves(xml, "LineTotalAmount").filter((l) => {
      const before = xml.lastIndexOf("MonetarySummation", l.start);
      return xml.slice(before - 40, before).includes("SpecifiedTradeSettlementLine");
    }).map((l) => l.value);
    const header = blockRanges(xml, "SpecifiedTradeSettlementHeaderMonetarySummation")[0];
    if (!header) return [];
    const map = { LineExtensionAmount: "LineTotalAmount", TaxExclusiveAmount: "TaxBasisTotalAmount", TaxInclusiveAmount: "GrandTotalAmount", AllowanceTotalAmount: "AllowanceTotalAmount", ChargeTotalAmount: "ChargeTotalAmount", PrepaidAmount: "TotalPrepaidAmount", PayableRoundingAmount: "RoundingAmount", PayableAmount: "DuePayableAmount" };
    for (const [k, v] of Object.entries(map)) t[k] = leafIn(xml, v, header);
    const currency = leaves(xml, "InvoiceCurrencyCode")[0]?.value.trim();
    const taxes = leaves(xml.slice(header[0], header[1]), "TaxTotalAmount");
    t.TaxAmount = (taxes.find((l) => currency && l.attrs.includes(`"${currency}"`)) ?? taxes[0])?.value;
  } else return [];

  /** @type {ProFinding[]} */
  const out = [];
  /** @param {string} br @param {string} label @param {Array<string | undefined>} plus @param {Array<string | undefined>} minus @param {string | undefined} stated @param {boolean} [optionalTerms] */
  const check = (br, label, plus, minus, stated, optionalTerms = true) => {
    const s = cents(stated);
    if (s === null) return;
    let sum = 0n;
    for (const [terms, sign] of /** @type {const} */ ([[plus, 1n], [minus, -1n]])) {
      for (const v of terms) {
        if (v === undefined && optionalTerms) continue;
        const c = cents(v);
        if (c === null) return; // a term with more decimals or unreadable: other rules report it
        sum += sign * c;
      }
    }
    if (sum !== s) {
      out.push({
        rule: "PRO-SUM-001",
        message: `${label} is ${show(s)} but its parts add up to ${show(sum)} (${br}, exact to the cent).`,
        fix: `Set ${label} to ${show(sum)} or correct its parts.`,
        path: `/totals/${br}`,
      });
    }
  };
  if (lineNets.length && lineNets.every((v) => v !== undefined))
    check("BR-CO-10", "the total of line net amounts (BT-106)", lineNets, [], t.LineExtensionAmount, false);
  check("BR-CO-13", "the total without VAT", [t.LineExtensionAmount, t.ChargeTotalAmount], [t.AllowanceTotalAmount], t.TaxExclusiveAmount);
  if (t.TaxAmount !== undefined) check("BR-CO-15", "the total with VAT", [t.TaxExclusiveAmount, t.TaxAmount], [], t.TaxInclusiveAmount);
  check("BR-CO-16", "the amount due", [t.TaxInclusiveAmount, t.PayableRoundingAmount], [t.PrepaidAmount], t.PayableAmount);
  return out;
}

// --- PRO-DE-001: a ZUGFeRD / Factur-X profile that is not an e-invoice in Germany ---
// The BMF's e-invoice FAQ (cited on einvoice-site's Germany page): "XRechnung and ZUGFeRD from
// version 2.0.1 meet the requirements, except the ZUGFeRD profiles MINIMUM and BASIC-WL."
// Applies when the seller's address is in Germany (BT-40 = DE) or the German rules were chosen.
// Read from the parsed invoice, so it covers a Factur-X PDF as well as bare CII XML.

const NOT_AN_EINVOICE_IN_DE = { minimum: "MINIMUM", basicwl: "BASIC WL" };

/**
 * @param {{ specification_id?: unknown, supplier?: { country?: unknown } } | null | undefined} invoice
 * @param {string} [profile]
 * @returns {ProFinding[]}
 */
export function germanProfileRule(invoice, profile = "") {
  if (!invoice || typeof invoice !== "object") return [];
  const spec = String(invoice.specification_id ?? "").trim();
  const m = /[:#](minimum|basicwl)$/i.exec(spec);
  if (!m) return [];
  const seller = String(invoice.supplier?.country ?? "").trim().toUpperCase();
  if (seller !== "DE" && profile !== "xrechnung") return [];
  const name = NOT_AN_EINVOICE_IN_DE[/** @type {"minimum" | "basicwl"} */ (m[1].toLowerCase())];
  return [
    {
      rule: "PRO-DE-001",
      message: `The ZUGFeRD / Factur-X profile is ${name} (BT-24 "${spec}"). In Germany the BMF lists XRechnung and ZUGFeRD from 2.0.1 as e-invoices except the MINIMUM and BASIC-WL profiles, so this file does not count as an e-invoice there.`,
      fix: "Export the invoice in the ZUGFeRD EN 16931 (COMFORT), EXTENDED or XRECHNUNG profile, or as an XRechnung. The Germany page lists the transition periods during which another invoice is still allowed.",
      path: "/ExchangedDocumentContext/GuidelineSpecifiedDocumentContextParameter/ID",
    },
  ];
}

// --- Profile detection for profile=auto (the workspace's "Detect from the file") ---
// Only what the file itself declares in BT-24, plus France for a domestic French invoice:
//   an XRechnung specification identifier        -> "xrechnung" (BR-DE rules)
//   a Peppol BIS Billing 3 specification id      -> "peppol"
//   seller and buyer both in France (BT-40/BT-55) -> "france" (Code de commerce mentions, SIREN)
// Anything else gets the built-in rules only (""). The German rules are never inferred from the
// seller's country: BR-DE (buyer reference, Leitweg-ID) is for XRechnung, not every German invoice.

/** @param {{ specification_id?: unknown, supplier?: { country?: unknown }, customer?: { country?: unknown } } | null | undefined} invoice */
export function detectProfile(invoice) {
  if (!invoice || typeof invoice !== "object") return "";
  const spec = String(invoice.specification_id ?? "").toLowerCase();
  if (spec.includes("xrechnung")) return "xrechnung";
  if (spec.includes("urn:fdc:peppol.eu:2017:poacc:billing:3.0")) return "peppol";
  const country = (/** @type {{ country?: unknown } | undefined} */ p) => String(p?.country ?? "").trim().toUpperCase();
  if (country(invoice.supplier) === "FR" && country(invoice.customer) === "FR") return "france";
  return "";
}
