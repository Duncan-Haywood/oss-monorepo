// Offline checks for a Hungarian NAV Online Számla 3.0 invoice data report: the
// InvoiceData XML (namespace http://schemas.nav.gov.hu/OSA/3.0/data) a Hungarian
// invoicing program sends to the National Tax and Customs Administration (NAV),
// either on its own or Base64-wrapped inside a manageInvoice API request.
//
// NAV's format is not EN 16931, so none of the UBL/CII rules apply. Rule ids are
// HU-nnn and are this tool's own; each finding names the NAV code it mirrors.
// Sources, all read for this module (nav-gov-hu/Online-Invoice on GitHub, MIT
// licence, (c) 2019 Nemzeti Adó- és Vámhivatal):
//   - "Online Invoice System 3.0 Interface Specification" (2026.02.12), section
//     3.3.2 "Blocking validation error codes" (codes 1-80 and their actions) and
//     3.3.3 "Warnings", which sets the arithmetic tolerance used here: "The
//     greatest deviation thus 'tolerated' is 1% of the net price, but no less
//     than 1 unit."
//   - invoiceData.xsd / invoiceBase.xsd 3.0 for element names and nesting (the full
//     schema gate, with NTCA common 1.0, is hu-xsd.mjs: HU-027..HU-032);
//   - Annex I of the same specification (in the 2026.02.12 English PDF, about
//     pages 300-320) for the product fee warnings, HU-033;
//   - Annex I sections I.1 and I.2 (pages 237-300) for the header and line-data
//     warnings a file can show, HU-034 and HU-035 (eval/nav-annex1-head-lines-2026-11-15.md);
//   - the 29 InvoiceData files in sample/Data sample, which all pass (see
//     eval/hungary-nav-samples-2026-11-15.md).
// Blocking codes come out as errors; the arithmetic checks mirror NAV's WARN
// family (INCORRECT_LINE_CALCULATION_*, INCORRECT_SUMMARY_*), which NAV accepts
// with a warning, so they come out with severity "warning". What NAV checks
// against its own records (unique invoice numbers, the referenced base invoice,
// the technical user's customers, the taxpayer register) cannot be checked from
// the file and is listed in `skipped`. The VAT WARN arithmetic (HU-020..026) follows
// Annex I of the same PDF warning by warning (re-read 2026-11-15: formulas, "only runs if"
// conditions, the per-warning tolerance reference; eval/nav-annex1-calculations-2026-11-15.md);
// each finding's `nav` field names the warning, or is null for this tool's own extra checks.
// This is an offline observation, not NAV's acceptance and not tax advice.
// Findings never repeat a tax number.

import { base64Bytes, sha3_512Hex } from "./sha3.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { xmlValueFindings } from "./xmlvalues.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";
import { checkAgainstNavSchema } from "./hu-xsd.mjs";

export const NAV_DATA_NS = "http://schemas.nav.gov.hu/OSA/3.0/data";
export const NAV_API_NS = "http://schemas.nav.gov.hu/OSA/3.0/api";

/** True for a NAV 3.0 InvoiceData file or a manageInvoice request that carries them. */
export function looksLikeNavInvoice(text) {
  const head = String(text).slice(0, 4096);
  if (/<(?:[A-Za-z0-9_]+:)?InvoiceData[\s>]/.test(head) && head.includes("schemas.nav.gov.hu/OSA/3.0/data")) return true;
  return /<(?:[A-Za-z0-9_]+:)?ManageInvoiceRequest[\s>]/.test(head) && head.includes("schemas.nav.gov.hu/OSA/3.0/api");
}

const finding = (rule, message, fix, path, extra = {}) => ({ rule, message, fix, path, ...extra });
const warn = { severity: "warning" };
const child = (node, name) => (node ? node.children.find((c) => c.name === name) : undefined);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const at = (node, ...names) => {
  let cur = node;
  for (const name of names) cur = child(cur, name);
  return cur;
};
const raw = (node, ...names) => {
  const n = at(node, ...names);
  return n ? n.text : "";
};
const txt = (node, ...names) => raw(node, ...names).trim();
// xs:decimal's lexical form; Number() alone would also take "0x10FE", "1e3", "Infinity" and " ".
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const num = (value) => {
  if (value === "" || value === undefined || !DECIMAL.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
// The decimal-typed leaves of invoiceData.xsd that this module reads (amounts, prices, quantities, rates).
const DECIMAL_LEAVES = new Set(["quantity", "unitPrice", "unitPriceHUF", "vatPercentage", "vatContent", "vatRate", "discountValue", "discountRate"]);
const decimalLeaf = (node) => !node.children.length && (DECIMAL_LEAVES.has(node.name) || /(?:Amount|AmountHUF|ExchangeRate|exchangeRate)$/.test(node.name));
/** Every decimal-typed leaf under `node` whose text is not an xs:decimal, with its path. */
function badDecimals(node, path, found = []) {
  const counts = {};
  for (const c of node.children) counts[c.name] = (counts[c.name] || 0) + 1;
  const seen = {};
  for (const c of node.children) {
    seen[c.name] = (seen[c.name] || 0) + 1;
    const p = `${path}/${c.name}${counts[c.name] > 1 ? `[${seen[c.name]}]` : ""}`;
    if (decimalLeaf(c)) {
      const t = c.text.trim();
      if (t !== "" && num(t) === null) found.push([p, t]);
    } else badDecimals(c, p, found);
  }
  return found;
}
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

// Annex I (2026.02.12), every calculation warning: "1% of the [reference] value expressed in
// HUF, but at least 1 HUF or 0.01 units of the invoice currency, whichever is greater". In the
// invoice currency 1 HUF is 1/r units; in forints 0.01 units is 0.01 x r HUF (r, the exchange
// rate, is 1 for a forint invoice, which leaves the floor at one unit). The reference is the
// computed value unless the warning names the stated one (`ref`).
const tolerance = (reference, { huf = false, r = 1 } = {}) =>
  Math.max(Math.abs(reference) * 0.01, huf ? Math.max(1, 0.01 * r) : Math.max(0.01, 1 / r));
const off = (stated, computed, opts = {}) => Math.abs(stated - computed) > tolerance(opts.ref ?? computed, opts) + 1e-9;
// Each HU-020..026 finding carries `nav`: the Annex I warning code it mirrors, or null when
// NAV has no such warning and the check is this tool's own (the message then says so).
const navWarn = (code) => ({ severity: "warning", nav: code });
const OWN = " (this tool's own check: NAV's Annex I has no warning for it, so NAV accepts it silently)";
// A line's net (or simplified gross) before VAT by Annex I 740 and 750: quantity x unit price,
// less discountValue, or less quantity x unit price x discountRate.
function lineBase(qty, price, line) {
  const d = child(line, "lineDiscountData");
  const value = num(txt(d, "discountValue"));
  const pct = num(txt(d, "discountRate"));
  if (value !== null) return qty * price - value;
  if (pct !== null) return qty * price * (1 - pct);
  return qty * price;
}

// Section 3.3.2, code 14 (INVALID_VAT_DATA).
const NORMAL_RATES = new Map([["0.05", null], ["0.07", null], ["0.12", null], ["0.18", null], ["0.27", null], ["0.2", "old"], ["0.25", "old"], ["0", "2024"]]);
const SIMPLIFIED_CONTENTS = new Map([["0.0476", null], ["0.1525", null], ["0.2126", null], ["0.1667", "old"], ["0.2", "old"], ["0", "2024"]]);
// Codes 48 and 49: the vatRate inside vatAmountMismatch.
const MISMATCH_RATES = new Set(["0.27", "0.18", "0.05", "0.2126", "0.1525", "0.0476", "0"]);
// Codes 31-37.
const EXEMPTION_CASES = new Set(["AAM", "TAM", "KBAET", "KBAUK", "EAM", "NAM", "UNKNOWN"]);
const OUT_OF_SCOPE_CASES = new Set(["ATK", "EUFAD37", "EUFADE", "EUE", "HO", "UNKNOWN"]);
const MISMATCH_CASES = new Set(["REFUNDABLE_VAT", "NONREFUNDABLE_VAT", "UNKNOWN"]);
// Code 78: monitored currencies (limits "may change without prior notice").
const RATE_LIMITS = { EUR: [250, 600], USD: [200, 600], GBP: [250, 720], CHF: [200, 600], BGN: [120, 360], RON: [50, 180], PLN: [50, 180], SEK: [20, 72], NOK: [20, 72], CZK: [5, 48], ILS: [40, 240], DKK: [20, 120], BAM: [100, 360] };
// The 3.0 UnitOfMeasureType enumeration, read from invoiceData.xsd (the spec's English text says LITRE; the XSD and NAV's samples say LITER).
const UNITS = new Set(["PIECE", "KILOGRAM", "TON", "KWH", "DAY", "HOUR", "MINUTE", "MONTH", "LITER", "KILOMETER", "CUBIC_METER", "METER", "LINEAR_METER", "CARTON", "PACK", "OWN"]);

/** Hungarian tax number (adószám) base: 8 digits, weights 9,7,3,1 repeated, sum divisible by 10. */
export function huTaxpayerIdOk(id) {
  if (!/^\d{8}$/.test(id)) return false;
  const w = [9, 7, 3, 1, 9, 7, 3, 1];
  return [...id].reduce((s, d, i) => s + Number(d) * w[i], 0) % 10 === 0;
}

/** A stable key for one VAT "bucket": the rate, or the exemption / out-of-scope / reverse-charge marker. */
function rateKey(vatRate) {
  if (!vatRate) return null;
  const pct = txt(vatRate, "vatPercentage");
  if (pct) return `pct:${Number(pct)}`;
  const content = txt(vatRate, "vatContent");
  if (content) return `content:${Number(content)}`;
  if (child(vatRate, "vatExemption")) return `exempt:${txt(vatRate, "vatExemption", "case")}`;
  if (child(vatRate, "vatOutOfScope")) return `oos:${txt(vatRate, "vatOutOfScope", "case")}`;
  if (txt(vatRate, "vatDomesticReverseCharge") === "true") return "reverse";
  if (txt(vatRate, "marginSchemeIndicator")) return `margin:${txt(vatRate, "marginSchemeIndicator")}`;
  if (child(vatRate, "vatAmountMismatch")) return `mismatch:${txt(vatRate, "vatAmountMismatch", "case")}:${Number(txt(vatRate, "vatAmountMismatch", "vatRate"))}`;
  if (txt(vatRate, "noVatCharge") === "true") return "novat";
  return null;
}
// A row whose vatRate is empty or missing (a schema fault, reported as HU-029/HU-030) has no key.
const keyLabel = (key) => !key ? "unnamed VAT rate" : key.startsWith("pct:") ? `${fmt(Number(key.slice(4)) * 100).replace(/\.00$/, "")}%` : key.startsWith("content:") ? `VAT content ${key.slice(8)}` : key;
// Annex I: the summary markers no line carries, normal (680, 710, 720, 733) and simplified (910-916).
const SUMMARY_MARKER_CODE = [["pct:", "INCORRECT_SUMMARY_DATA_VAT_PERCENTAGE"], ["reverse", "INCORRECT_SUMMARY_DATA_VAT_DOMESTIC_REVERSE_CHARGE"], ["margin:", "INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR"], ["mismatch:", "INCORRECT_SUMMARY_DATA_VAT_AMOUNT_MISMATCH_NORMAL"]];
const SIMPLIFIED_MARKER_CODE = [["content:", "INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_SUMMARY_SIMPLIFIED"], ["exempt:", "INCORRECT_SUMMARY_CALCULATION_VAT_EXEMPTION_SUMMARY_SIMPLIFIED"], ["oos:", "INCORRECT_SUMMARY_CALCULATION_VAT_OUT_OF_SCOPE_SUMMARY_SIMPLIFIED"], ["reverse", "INCORRECT_SUMMARY_CALCULATION_VAT_DOMESTIC_REVERSE_CHARGE_SUMMARY_SIMPLIFIED"], ["margin:", "INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR_SUMMARY_SIMPLIFIED"], ["mismatch:", "INCORRECT_SUMMARY_CALCULATION_VAT_AMOUNT_MISMATCH_SUMMARY_SIMPLIFIED"]];
// Every line with that amounts node names a VAT rate (an unnamed one is a schema fault, and would make a marker look unused).
const allKeyed = (lines, node) => lines.every((line) => !child(line, node) || rateKey(child(child(line, node), "lineVatRate")) !== null);
const ratePercent = (key) => (key && key.startsWith("pct:") ? Number(key.slice(4)) : null);

/** The VAT-rate code list checks (codes 14, 31-37, 41-44, 48, 49) for one vatRate / lineVatRate node. */
function checkVatRate(vatRate, { simplified, level, path, deliveryDate, modifying }, out) {
  if (!vatRate) return;
  const pct = txt(vatRate, "vatPercentage");
  const content = txt(vatRate, "vatContent");
  if (pct && simplified) {
    out.push(finding("HU-006", `A simplified ${level} carries vatPercentage; simplified data takes vatContent (NAV ${level === "line" ? "INVALID_LINE_VAT_RATE_SIMPLIFIED" : "INVALID_SUMMARY_VAT_RATE_SIMPLIFIED"}).`,
      "Give simplified invoice lines and summaries the VAT content (0.2126, 0.1525, 0.0476), not the rate.", `${path}/vatPercentage`));
  }
  if (content && !simplified) {
    out.push(finding("HU-006", `A normal ${level} carries vatContent; vatContent can only be read on simplified data (NAV ${level === "line" ? "INVALID_LINE_VAT_RATE_NORMAL" : "INVALID_SUMMARY_VAT_RATE_NORMAL"}).`,
      "Give normal and aggregate invoice lines the VAT rate (vatPercentage), or report the invoice as SIMPLIFIED.", `${path}/vatContent`));
  }
  const checkList = (value, list, element) => {
    const key = String(Number(value));
    if (!list.has(key)) {
      out.push(finding("HU-005", `${element} ${value} is not a Hungarian VAT ${element === "vatPercentage" ? "rate" : "content"} NAV accepts (NAV INVALID_VAT_DATA).`,
        element === "vatPercentage" ? "Use 0.27, 0.18 or 0.05 (or 0 on supplies from 2024)." : "Use 0.2126, 0.1525 or 0.0476 (or 0 on supplies from 2024).", `${path}/${element}`));
      return;
    }
    const limit = list.get(key);
    if (limit === "old" && !modifying && deliveryDate && deliveryDate >= "2013-01-01") {
      out.push(finding("HU-005", `${element} ${value} is a pre-2013 rate; NAV takes it only on modifications or on supplies delivered before 1 January 2013, and this delivery date is ${deliveryDate} (NAV INVALID_VAT_DATA).`,
        "Use the rate in force on the delivery date.", `${path}/${element}`));
    }
    if (limit === "2024" && deliveryDate && deliveryDate < "2024-01-01") {
      out.push(finding("HU-005", `A 0 ${element === "vatPercentage" ? "rate" : "VAT content"} is accepted only on supplies delivered on or after 1 January 2024, and this delivery date is ${deliveryDate} (NAV INVALID_VAT_DATA).`,
        "Before 2024 a non-taxed supply is reported as an exemption (vatExemption) or as outside the scope (vatOutOfScope).", `${path}/${element}`));
    }
  };
  if (pct && !simplified) checkList(pct, NORMAL_RATES, "vatPercentage");
  if (content && simplified) checkList(content, SIMPLIFIED_CONTENTS, "vatContent");
  const caseCheck = (node, list, name, codeLine, codeSummary) => {
    if (!node) return;
    const c = txt(node, "case");
    if (!list.has(c)) {
      out.push(finding("HU-007", `${name}/case "${c || "(empty)"}" is not one of ${[...list].join(", ")} (NAV ${level === "line" ? codeLine : codeSummary}).`,
        `Use one of NAV's ${name} codes in capitals, with the legal ground in reason.`, `${path}/${name}/case`));
    } else if (c === "UNKNOWN" && !modifying) {
      out.push(finding("HU-007", `${name}/case UNKNOWN is accepted only on a modification or cancellation of an invoice with no 3.0 history (NAV ${level === "line" ? codeLine : codeSummary}).`,
        `Name the actual ${name} code on a new invoice.`, `${path}/${name}/case`));
    }
  };
  caseCheck(child(vatRate, "vatExemption"), EXEMPTION_CASES, "vatExemption", "INVALID_LINE_VAT_EXEMPTION_CODE", "INVALID_SUMMARY_VAT_EXEMPTION_CODE");
  caseCheck(child(vatRate, "vatOutOfScope"), OUT_OF_SCOPE_CASES, "vatOutOfScope", "INVALID_LINE_VAT_OUT_OF_SCOPE_CODE", "INVALID_SUMMARY_VAT_OUT_OF_SCOPE_CODE");
  const mm = child(vatRate, "vatAmountMismatch");
  caseCheck(mm, MISMATCH_CASES, "vatAmountMismatch", "INVALID_LINE_VAT_AMOUNT_MISMATCH_CODE", "INVALID_SUMMARY_VAT_AMOUNT_MISMATCH_CODE");
  if (mm && txt(mm, "vatRate") !== "") {
    const r = String(Number(txt(mm, "vatRate")));
    if (!MISMATCH_RATES.has(r) || (r === "0" && deliveryDate && deliveryDate < "2024-01-01")) {
      out.push(finding("HU-007", `vatAmountMismatch/vatRate ${txt(mm, "vatRate")} is not one NAV accepts (NAV ${level === "line" ? "INVALID_LINE_VAT_AMOUNT_MISMATCH_VAT_RATE" : "INVALID_SUMMARY_VAT_AMOUNT_MISMATCH_VAT_RATE"}).`,
        "Use 0.27, 0.18, 0.05, 0.2126, 0.1525 or 0.0476 (0 only on supplies from 2024).", `${path}/vatAmountMismatch/vatRate`));
    }
  }
}

/** One invoice (an invoiceMain/invoice, or one batchInvoice/invoice) and its header facts. */
function checkInvoice(inv, ctx, out, skipped) {
  const base = ctx.base;
  const head = child(inv, "invoiceHead");
  const detail = child(head, "invoiceDetail");
  const customer = at(head, "customerInfo");
  const reference = child(inv, "invoiceReference");
  const modifying = ctx.operation ? ctx.operation !== "CREATE" : Boolean(reference);
  const category = txt(detail, "invoiceCategory");
  const simplified = category === "SIMPLIFIED";
  const currency = txt(detail, "currencyCode");
  const statedRate = num(txt(detail, "exchangeRate"));
  // ExchangeRateType is minExclusive 0 (the schema gate names it); forint conversions at 0 or below would only repeat it.
  const rate = statedRate !== null && statedRate > 0 ? statedRate : null;
  const r = rate || 1;
  const firstFinding = out.length;
  const deliveryDate = txt(detail, "invoiceDeliveryDate") || txt(detail, "invoiceDeliveryPeriodEnd");
  const issueDate = ctx.issueDate;
  const vatStatus = txt(customer, "customerVatStatus");

  // --- Header: currency and exchange rate (codes 77, 78).
  if (currency === "HUF" && statedRate !== null && statedRate !== 1) {
    out.push(finding("HU-012", `The invoice is in HUF but exchangeRate is ${txt(detail, "exchangeRate")} (NAV INCORRECT_HEAD_DATA_CURRENCY_CODE_HUF).`,
      "A forint invoice takes exchangeRate 1.", `${base}/invoiceHead/invoiceDetail/exchangeRate`));
  }
  if (RATE_LIMITS[currency] && rate !== null) {
    const [lo, hi] = RATE_LIMITS[currency];
    if (rate < lo || rate > hi) {
      out.push(finding("HU-012", `exchangeRate ${txt(detail, "exchangeRate")} for ${currency} is outside the ${lo}-${hi} HUF band NAV accepts (NAV INCORRECT_HEAD_DATA_EXCHANGERATE_EXTREME).`,
        `Give the forint value of one ${currency} (for example the MNB rate on the delivery date), not its inverse or a rate per 100.`, `${base}/invoiceHead/invoiceDetail/exchangeRate`));
    }
  }
  // --- Dates (codes 54, 64).
  const ps = txt(detail, "invoiceDeliveryPeriodStart");
  const pe = txt(detail, "invoiceDeliveryPeriodEnd");
  if (ps && pe && pe < ps) {
    out.push(finding("HU-014", `invoiceDeliveryPeriodEnd ${pe} is before invoiceDeliveryPeriodStart ${ps} (NAV INCORRECT_DATE_INVOICE_DELIVERY_TO_FROM).`,
      "Swap or correct the period dates.", `${base}/invoiceHead/invoiceDetail/invoiceDeliveryPeriodEnd`));
  }
  const delivery = txt(detail, "invoiceDeliveryDate");
  if (delivery && /^\d{4}-\d{2}-\d{2}$/.test(issueDate || "")) {
    const limit = `${Number(issueDate.slice(0, 4)) + 5}${issueDate.slice(4)}`;
    if (delivery > limit) {
      out.push(finding("HU-014", `invoiceDeliveryDate ${delivery} is more than five years after the issue date ${issueDate} (NAV INVOICE_DELIVERY_DATE_LATE).`,
        "Check the delivery date's year.", `${base}/invoiceHead/invoiceDetail/invoiceDeliveryDate`));
    }
  }
  // --- Customer (codes 17, 24, 25, 46, 47).
  if (!modifying && !customer) {
    out.push(finding("HU-008", "A new invoice (CREATE) has no customerInfo (NAV CUSTOMER_INFO_MISSING).", "Add customerInfo with customerVatStatus.", `${base}/invoiceHead/customerInfo`));
  }
  if (customer) {
    const cp = `${base}/invoiceHead/customerInfo`;
    if (vatStatus === "PRIVATE_PERSON") {
      const extra = ["customerVatData", "customerName", "customerAddress"].filter((n) => child(customer, n));
      if (extra.length) {
        out.push(finding("HU-008", `The customer is a private person but the report gives ${extra.join(", ")} (NAV CUSTOMER_DATA_NOT_EXPECTED).`,
          "Leave out the name, address and tax data of a private-person customer; NAV must not receive them.", `${cp}/${extra[0]}`));
      }
    } else if (vatStatus) {
      const missing = ["customerName", "customerAddress"].filter((n) => !child(customer, n));
      if (missing.length) {
        out.push(finding("HU-008", `A ${vatStatus} customer needs ${missing.join(" and ")} (NAV CUSTOMER_DATA_EXPECTED).`,
          "Add the customer's name and address.", `${cp}/${missing[0]}`));
      }
    }
    if (vatStatus === "DOMESTIC") {
      if (at(customer, "customerVatData", "communityVatNumber")) {
        out.push(finding("HU-008", "A DOMESTIC customer is given an EU VAT number (NAV CUSTOMER_COMMUNITY_TAXNUMBER_NOT_EXPECTED).",
          "Report a domestic VAT-registered buyer by its Hungarian tax number (customerTaxNumber).", `${cp}/customerVatData/communityVatNumber`));
      }
      if (at(customer, "customerVatData", "thirdStateTaxId")) {
        out.push(finding("HU-008", "A DOMESTIC customer is given a non-EU tax number (NAV CUSTOMER_THIRD_STATE_TAXNUMBER_NOT_EXPECTED).",
          "Report a domestic VAT-registered buyer by its Hungarian tax number (customerTaxNumber).", `${cp}/customerVatData/thirdStateTaxId`));
      }
    }
  }
  // --- Tax-number check digits (CDV): supplier, customer, group members.
  const taxNumbers = [
    [at(head, "supplierInfo", "supplierTaxNumber"), "/invoiceHead/supplierInfo/supplierTaxNumber", "the supplier's"],
    [at(head, "supplierInfo", "groupMemberTaxNumber"), "/invoiceHead/supplierInfo/groupMemberTaxNumber", "the supplier's group member"],
    [at(customer, "customerVatData", "customerTaxNumber"), "/invoiceHead/customerInfo/customerVatData/customerTaxNumber", "the customer's"],
    [at(customer, "customerVatData", "customerTaxNumber", "groupMemberTaxNumber"), "/invoiceHead/customerInfo/customerVatData/customerTaxNumber/groupMemberTaxNumber", "the customer's group member"],
  ];
  for (const [node, p, who] of taxNumbers) {
    const id = txt(node, "taxpayerId");
    if (id && !huTaxpayerIdOk(id)) {
      out.push(finding("HU-018", `taxpayerId of ${who} tax number fails the Hungarian check digit (8 digits, weights 9-7-3-1).`,
        "Copy the first eight digits of the tax number again; one digit is wrong or two are swapped.", `${base}${p}/taxpayerId`));
    }
  }
  // --- Electronic-invoice indicator (codes 29, 38, 39).
  if (ctx.complete) {
    if (txt(detail, "invoiceAppearance") && txt(detail, "invoiceAppearance") !== "ELECTRONIC") {
      out.push(finding("HU-016", `completenessIndicator is true (the report is the e-invoice itself) but invoiceAppearance is ${txt(detail, "invoiceAppearance")} (NAV INVOICE_APPEARANCE_MISMATCH).`,
        "Set invoiceAppearance to ELECTRONIC, or completenessIndicator to false.", `${base}/invoiceHead/invoiceDetail/invoiceAppearance`));
    }
    if (vatStatus === "PRIVATE_PERSON") {
      out.push(finding("HU-016", "completenessIndicator is true but the customer is a private person (NAV INVOICE_COMPLETENESS_PRIVATE_PERSON_INDICATOR_MISMATCH).",
        "An invoice to a private person cannot be reported as the e-invoice itself; set completenessIndicator to false.", `${ctx.root}/completenessIndicator`));
    }
    if (txt(inv, "invoiceLines", "mergedItemIndicator") === "true") {
      out.push(finding("HU-016", "completenessIndicator is true but mergedItemIndicator is true (NAV INVOICE_COMPLETENESS_MERGED_ITEM_INDICATOR_MISMATCH).",
        "A report with merged lines cannot be the e-invoice itself; set completenessIndicator to false.", `${ctx.root}/completenessIndicator`));
    }
  }
  // --- Modification structure (codes 18, 19, 66, 76, 79).
  if (reference) {
    const rp = `${base}/invoiceReference`;
    const orig = raw(reference, "originalInvoiceNumber");
    if (orig && orig !== orig.trim()) {
      out.push(finding("HU-013", "originalInvoiceNumber starts or ends with whitespace (NAV INVALID_ORIGINAL_INVOICE_NUMBER).", "Trim spaces, tabs and line breaks around the number.", `${rp}/originalInvoiceNumber`));
    }
    if (orig && orig.trim() === ctx.invoiceNumber && !ctx.predecessorPotlas) {
      out.push(finding("HU-013", "The modifying document has the same number as the invoice it modifies (NAV INCORRECT_HEAD_DATA_MOD_REF_INVOICE_NUMBER).",
        "Give the modifying document its own number; originalInvoiceNumber names the base invoice.", `${rp}/originalInvoiceNumber`));
    }
    const idx = num(txt(reference, "modificationIndex"));
    if (idx !== null && idx > 1000) {
      out.push(finding("HU-013", `modificationIndex ${idx} is above 1000 (NAV INCONSISTENT_MODIFICATION_DATA_MODIFICATIONINDEX_UNREAL).`,
        "Number modifications of one base invoice 1, 2, 3, ... in order.", `${rp}/modificationIndex`));
    }
    if (ctx.operation === "CREATE") {
      out.push(finding("HU-017", "The request's invoiceOperation is CREATE but the invoice has an invoiceReference (NAV INVOICE_REFERENCE_NOT_EXPECTED).",
        "Send a modifying document as MODIFY (or STORNO), or drop invoiceReference from a new invoice.", rp));
    }
  } else if (ctx.operation === "MODIFY" || ctx.operation === "STORNO") {
    out.push(finding("HU-017", `The request's invoiceOperation is ${ctx.operation} but the invoice has no invoiceReference (NAV INVOICE_REFERENCE_EXPECTED).`,
      "Add invoiceReference with originalInvoiceNumber, modifyWithoutMaster and modificationIndex.", `${base}/invoiceReference`));
  }

  // --- Lines.
  const linesNode = child(inv, "invoiceLines");
  const lines = kids(linesNode, "line");
  const lp = (i) => `${base}/invoiceLines/line[${i + 1}]`;
  if (!modifying && !lines.length && !(ctx.operation === "STORNO")) {
    out.push(finding("HU-003", "The invoice has no invoice lines; NAV refuses a new invoice without lines (NAV INVOICE_LINE_MISSING).",
      "Report every line of the invoice.", `${base}/invoiceLines`));
  }
  lines.forEach((line, i) => {
    const n = num(txt(line, "lineNumber"));
    if (n !== i + 1) {
      out.push(finding("HU-002", `Line ${i + 1} has lineNumber ${txt(line, "lineNumber") || "(none)"}; NAV wants 1, 2, 3, ... with no gap or repeat (NAV LINE_NUMBER_NOT_SEQUENTIAL).`,
        "Renumber the lines from 1 in order.", `${lp(i)}/lineNumber`));
    }
  });
  const refs = new Map();
  let reverseCharge = false;
  const byKey = new Map(); // rate key -> {net, netHUF, vat, vatHUF, gross, grossHUF, n}
  const lineRate = ctx.aggregate ? null : rate;
  // Whole-invoice line sums for Annex I 941 (forint nets) and 900/901 (simplified gross).
  const lt = { nNormal: 0, netHUF: 0, netHUFok: true, nSimple: 0, gross: 0, grossOk: true, grossHUF: 0, grossHUFok: true };
  lines.forEach((line, i) => {
    const p = lp(i);
    const mod = child(line, "lineModificationReference");
    if (modifying && !mod) {
      out.push(finding("HU-017", `Line ${i + 1} of a modifying document has no lineModificationReference (NAV LINE_MODIFICATION_EXPECTED).`,
        "Give each line of a modification its lineNumberReference and lineOperation CREATE.", `${p}/lineModificationReference`));
    }
    if (!modifying && mod) {
      out.push(finding("HU-017", `Line ${i + 1} of a new invoice carries lineModificationReference (NAV LINE_MODIFICATION_NOT_EXPECTED).`,
        "Drop lineModificationReference from a new invoice's lines.", `${p}/lineModificationReference`));
    }
    if (mod) {
      if (txt(mod, "lineOperation") === "MODIFY") {
        out.push(finding("HU-017", `Line ${i + 1}: lineOperation MODIFY; NAV takes only CREATE on modifying documents (NAV INVALID_LINE_OPERATION).`,
          "Report the change as a new line (lineOperation CREATE) with the difference, pointing at the line it corrects.", `${p}/lineModificationReference/lineOperation`));
      }
      const r = txt(mod, "lineNumberReference");
      if (r && refs.has(r)) {
        out.push(finding("HU-017", `Lines ${refs.get(r)} and ${i + 1} both have lineNumberReference ${r} (NAV LINE_NUMBER_REFERENCE_NOT_UNIQUE).`,
          "Show repeated changes to one line as a single aggregated line.", `${p}/lineModificationReference/lineNumberReference`));
      } else if (r) refs.set(r, i + 1);
    }
    // Code 13.
    const expression = txt(line, "lineExpressionIndicator");
    const missing = (expression === "true" ? ["lineDescription", "quantity", "unitOfMeasure", "unitPrice"] : ["lineDescription"]).filter((e) => !txt(line, e));
    if (expression && missing.length) {
      out.push(finding("HU-004", `Line ${i + 1} (lineExpressionIndicator ${expression}) is missing ${missing.join(", ")} (NAV MANDATORY_LINE_CONTENT_MISSING).`,
        expression === "true" ? "A line expressed in natural units needs its description, quantity, unit and unit price." : "Every line needs its description.", `${p}/${missing[0]}`));
    }
    // Code 65 and the unit list.
    const unit = txt(line, "unitOfMeasure");
    if (unit === "OWN" && !txt(line, "unitOfMeasureOwn")) {
      out.push(finding("HU-015", `Line ${i + 1} uses unitOfMeasure OWN without unitOfMeasureOwn (NAV INCORRECT_LINE_DATA_UOM_INCOMPLETE).`,
        "Name the unit in unitOfMeasureOwn (for example \"dkg\"), or pick a listed unit.", `${p}/unitOfMeasureOwn`));
    } else if (unit && !UNITS.has(unit)) {
      out.push(finding("HU-015", `Line ${i + 1}: unitOfMeasure "${unit}" is not in NAV's list.`,
        "Use one of PIECE, KILOGRAM, HOUR, ... or OWN with unitOfMeasureOwn.", `${p}/unitOfMeasure`));
    }
    // Code 75.
    if (ctx.aggregate && !child(line, "aggregateInvoiceLineData")) {
      out.push(finding("HU-011", `Line ${i + 1} of an AGGREGATE invoice has no aggregateInvoiceLineData (NAV INCORRECT_LINE_DATA_AGGREGATE_INV_LINE_DATA_MANDATORY).`,
        "Give each line of an aggregate invoice its own lineExchangeRate and lineDeliveryDate.", `${p}/aggregateInvoiceLineData`));
    }
    const lr = ctx.aggregate ? num(txt(line, "aggregateInvoiceLineData", "lineExchangeRate")) : lineRate;
    const lr1 = lr || 1;
    // Annex I 740 and 750 run on a modification's lineOperation CREATE lines only.
    const created = !modifying || txt(line, "lineModificationReference", "lineOperation") !== "MODIFY";
    const lDelivery = ctx.aggregate ? txt(line, "aggregateInvoiceLineData", "lineDeliveryDate") || deliveryDate : deliveryDate;
    const normal = child(line, "lineAmountsNormal");
    const simple = child(line, "lineAmountsSimplified");
    // Codes 56, 58.
    if (simplified && normal) {
      out.push(finding("HU-006", `Line ${i + 1} of a SIMPLIFIED invoice carries normal amounts (NAV LINE_SUMMARY_TYPE_MISMATCH_LINE_NORMAL).`,
        "Give simplified invoice lines lineAmountsSimplified.", `${p}/lineAmountsNormal`));
    }
    if (!simplified && category && simple) {
      out.push(finding("HU-006", `Line ${i + 1} of a ${category} invoice carries simplified amounts (NAV LINE_SUMMARY_TYPE_MISMATCH_LINE_SIMPLIFIED).`,
        "Give normal and aggregate invoice lines lineAmountsNormal, or report the invoice as SIMPLIFIED.", `${p}/lineAmountsSimplified`));
    }
    const qty = num(txt(line, "quantity"));
    const price = num(txt(line, "unitPrice"));
    const priceHUF = num(txt(line, "unitPriceHUF"));
    if (price !== null && priceHUF !== null && lr !== null && off(priceHUF, price * lr, { huf: true, r: lr1 })) {
      const code = `INCORRECT_LINE_CALCULATION_${ctx.aggregate ? "AGGREGATE_" : ""}LINE_UNIT_PRICE_HUF`;
      out.push(finding("HU-023", `Line ${i + 1}: unitPriceHUF is ${fmt(priceHUF)} but unitPrice x exchange rate is ${fmt(price * lr)} (NAV ${code}).`,
        "Convert the unit price at the invoice's (or the line's) exchange rate.", `${p}/unitPriceHUF`, navWarn(code)));
    }
    if (normal) {
      const vr = child(normal, "lineVatRate");
      checkVatRate(vr, { simplified: false, level: "line", path: `${p}/lineAmountsNormal/lineVatRate`, deliveryDate: lDelivery, modifying }, out);
      const key = rateKey(vr);
      const net = num(txt(normal, "lineNetAmountData", "lineNetAmount"));
      const netHUF = num(txt(normal, "lineNetAmountData", "lineNetAmountHUF"));
      const vatNode = child(normal, "lineVatData");
      const vat = num(txt(vatNode, "lineVatAmount"));
      const vatHUF = num(txt(vatNode, "lineVatAmountHUF"));
      const gross = num(txt(normal, "lineGrossAmountData", "lineGrossAmountNormal"));
      const grossHUF = num(txt(normal, "lineGrossAmountData", "lineGrossAmountNormalHUF"));
      if (txt(vr, "vatDomesticReverseCharge") === "true") reverseCharge = true;
      lt.nNormal += 1;
      if (netHUF === null) lt.netHUFok = false; else lt.netHUF += netHUF;
      // Codes 71, 72.
      if (vatNode && ((vat !== null && vat !== 0) || (vatHUF !== null && vatHUF !== 0))) {
        if (child(vr, "vatExemption")) {
          out.push(finding("HU-010", `Line ${i + 1} is marked tax-exempt (${txt(vr, "vatExemption", "case")}) but carries a VAT amount (NAV INCORRECT_LINE_DATA_VAT_EXEMPTION_NORMAL).`,
            "An exempt line's lineVatAmount and lineVatAmountHUF must be 0.", `${p}/lineAmountsNormal/lineVatData`));
        }
        if (child(vr, "vatOutOfScope")) {
          out.push(finding("HU-010", `Line ${i + 1} is marked outside the scope of VAT (${txt(vr, "vatOutOfScope", "case")}) but carries a VAT amount (NAV INCORRECT_LINE_DATA_VAT_OUT_OF_SCOPE_NORMAL).`,
            "An out-of-scope line's lineVatAmount and lineVatAmountHUF must be 0.", `${p}/lineAmountsNormal/lineVatData`));
        }
      }
      // Codes 67-70.
      const exemption = txt(vr, "vatExemption", "case");
      const oos = txt(vr, "vatOutOfScope", "case");
      if (vatStatus && exemption === "KBAET" && vatStatus !== "OTHER") {
        out.push(finding("HU-009", `Line ${i + 1} is a tax-exempt intra-Community supply (KBAET) but the customer's VAT status is ${vatStatus}, not OTHER (NAV INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAET).`,
          "KBAET goes only to a buyer registered in another member state (customerVatStatus OTHER, with its EU VAT number).", `${p}/lineAmountsNormal/lineVatRate/vatExemption/case`));
      }
      if (vatStatus && exemption === "KBAUK" && vatStatus === "DOMESTIC") {
        out.push(finding("HU-009", `Line ${i + 1} is an intra-Community supply of a new means of transport (KBAUK) but the customer is DOMESTIC (NAV INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAUK).`,
          "KBAUK goes only to a PRIVATE_PERSON or OTHER buyer.", `${p}/lineAmountsNormal/lineVatRate/vatExemption/case`));
      }
      if (vatStatus && (oos === "EUFAD37" || oos === "EUFADE") && vatStatus !== "OTHER") {
        out.push(finding("HU-009", `Line ${i + 1} is a reverse-charge supply in another member state (${oos}) but the customer's VAT status is ${vatStatus}, not OTHER (NAV INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_${oos}).`,
          `${oos} goes only to a buyer outside Hungary (customerVatStatus OTHER).`, `${p}/lineAmountsNormal/lineVatRate/vatOutOfScope/case`));
      }
      // Arithmetic (NAV WARN family).
      const calcNet = qty !== null && price !== null ? lineBase(qty, price, line) : null;
      if (!ctx.merged && created && calcNet !== null && net !== null && off(net, calcNet, { r: lr1 })) {
        const less = child(line, "lineDiscountData") && calcNet !== qty * price ? " less the discount" : "";
        out.push(finding("HU-020", `Line ${i + 1}: lineNetAmount is ${fmt(net)} but quantity x unitPrice${less} is ${fmt(calcNet)} (NAV INCORRECT_LINE_CALCULATION_NET_AMOUNT).`,
          "Make the net amount the quantity times the unit price, less any discount reported in lineDiscountData (discountValue, or discountRate as a fraction).", `${p}/lineAmountsNormal/lineNetAmountData/lineNetAmount`, navWarn("INCORRECT_LINE_CALCULATION_NET_AMOUNT")));
      }
      const pctRate = ratePercent(key);
      if (pctRate !== null && net !== null && vat !== null && off(vat, net * pctRate, { r: lr1 })) {
        out.push(finding("HU-021", `Line ${i + 1}: lineVatAmount is ${fmt(vat)} but ${keyLabel(key)} of the net ${fmt(net)} is ${fmt(net * pctRate)}${OWN}; the VAT-rate summary row is (INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_SUMMARY).`,
          "Compute the VAT from the net amount at the line's rate.", `${p}/lineAmountsNormal/lineVatData/lineVatAmount`, navWarn(null)));
      }
      if (net !== null && gross !== null && off(gross, net + (vat || 0), { r: lr1 })) {
        out.push(finding("HU-022", `Line ${i + 1}: lineGrossAmountNormal is ${fmt(gross)} but net plus VAT is ${fmt(net + (vat || 0))}${OWN}; NAV checks the forint amounts (INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_NORMAL_SUM).`,
          "Make the gross amount the net plus the VAT.", `${p}/lineAmountsNormal/lineGrossAmountData/lineGrossAmountNormal`, navWarn(null)));
      }
      // Annex I 754: the forint gross against the forint net plus VAT; NORMAL and AGGREGATE, all three filled.
      if (netHUF !== null && vatHUF !== null && grossHUF !== null && off(grossHUF, netHUF + vatHUF, { huf: true, r: lr1, ref: grossHUF })) {
        out.push(finding("HU-022", `Line ${i + 1}: lineGrossAmountNormalHUF is ${fmt(grossHUF)} but lineNetAmountHUF plus lineVatAmountHUF is ${fmt(netHUF + vatHUF)} (NAV INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_NORMAL_SUM).`,
          "Make the forint gross the forint net plus the forint VAT.", `${p}/lineAmountsNormal/lineGrossAmountData/lineGrossAmountNormalHUF`, navWarn("INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_NORMAL_SUM")));
      }
      const huf = (name, value, valueHUF, element, code) => {
        if (lr !== null && value !== null && valueHUF !== null && off(valueHUF, value * lr, { huf: true, r: lr1 })) {
          const navCode = `INCORRECT_LINE_CALCULATION_${ctx.aggregate ? "AGGREGATE_" : ""}${code}`;
          out.push(finding("HU-023", `Line ${i + 1}: ${element} is ${fmt(valueHUF)} but ${name} x exchange rate ${lr} is ${fmt(value * lr)} (NAV ${navCode}).`,
            "Convert every line amount to forints at the same exchange rate.", `${p}/lineAmountsNormal/${element === "lineNetAmountHUF" ? "lineNetAmountData" : element === "lineVatAmountHUF" ? "lineVatData" : "lineGrossAmountData"}/${element}`, navWarn(navCode)));
        }
      };
      huf("the net", net, netHUF, "lineNetAmountHUF", "LINE_NET_AMOUNT_HUF");
      huf("the VAT", vat, vatHUF, "lineVatAmountHUF", "LINE_VAT_AMOUNT_HUF");
      huf("the gross", gross, grossHUF, "lineGrossAmountNormalHUF", "LINE_GROSS_AMOUNT_NORMAL_HUF");
      if (key) {
        const b = byKey.get(key) || { net: 0, netHUF: 0, vat: 0, vatHUF: 0, gross: 0, grossHUF: 0, n: 0, ok: true, vatOk: true, kind: "normal" };
        b.n += 1;
        if (net === null || netHUF === null) b.ok = false;
        // lineVatData is optional (an advance deduction line often has none): VAT sums need it on every line.
        if (vat === null) b.vatOk = false;
        b.net += net || 0; b.netHUF += netHUF || 0; b.vat += vat || 0; b.vatHUF += vatHUF || 0;
        b.gross += gross ?? (net || 0) + (vat || 0); b.grossHUF += grossHUF ?? (netHUF || 0) + (vatHUF || 0);
        byKey.set(key, b);
      }
    }
    if (simple) {
      const vr = child(simple, "lineVatRate");
      checkVatRate(vr, { simplified: true, level: "line", path: `${p}/lineAmountsSimplified/lineVatRate`, deliveryDate: lDelivery, modifying }, out);
      const key = rateKey(vr);
      const gross = num(txt(simple, "lineGrossAmountSimplified"));
      const grossHUF = num(txt(simple, "lineGrossAmountSimplifiedHUF"));
      lt.nSimple += 1;
      if (gross === null) lt.grossOk = false; else lt.gross += gross;
      if (grossHUF === null) lt.grossHUFok = false; else lt.grossHUF += grossHUF;
      if (lr !== null && gross !== null && grossHUF !== null && off(grossHUF, gross * lr, { huf: true, r: lr1 })) {
        out.push(finding("HU-023", `Line ${i + 1}: lineGrossAmountSimplifiedHUF is ${fmt(grossHUF)} but the gross x exchange rate is ${fmt(gross * lr)} (NAV INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_SIMPLIFIED_HUF).`,
          "Convert the line's gross amount to forints at the invoice's exchange rate.", `${p}/lineAmountsSimplified/lineGrossAmountSimplifiedHUF`, navWarn("INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_SIMPLIFIED_HUF")));
      }
      const calcGross = qty !== null && price !== null ? lineBase(qty, price, line) : null;
      if (!ctx.merged && created && calcGross !== null && gross !== null && off(gross, calcGross, { r: lr1 })) {
        const less = child(line, "lineDiscountData") && calcGross !== qty * price ? " less the discount" : "";
        out.push(finding("HU-020", `Line ${i + 1}: lineGrossAmountSimplified is ${fmt(gross)} but quantity x unitPrice${less} is ${fmt(calcGross)}; on a simplified invoice the unit price includes VAT (NAV INCORRECT_LINE_CALCULATION_GROSS_AMOUNT).`,
          "Make the gross amount the quantity times the gross unit price, less any discount reported in lineDiscountData.", `${p}/lineAmountsSimplified/lineGrossAmountSimplified`, navWarn("INCORRECT_LINE_CALCULATION_GROSS_AMOUNT")));
      }
      if (key) {
        const b = byKey.get(key) || { gross: 0, grossHUF: 0, n: 0, ok: true, hufOk: true, kind: "simplified" };
        b.n += 1;
        if (gross === null) b.ok = false;
        if (grossHUF === null) b.hufOk = false;
        b.gross += gross || 0; b.grossHUF += grossHUF || 0;
        byKey.set(key, b);
      }
    }
  });
  // Codes 50, 73.
  if (reverseCharge) {
    if (vatStatus && vatStatus !== "DOMESTIC") {
      out.push(finding("HU-009", `Lines are marked domestic reverse charge but the customer's VAT status is ${vatStatus} (NAV INCORRECT_LINE_DATA_VAT_DOMESTIC_REVERSE_CHARGE).`,
        "Domestic reverse charge applies only to a Hungarian VAT-registered buyer (DOMESTIC).", `${base}/invoiceHead/customerInfo/customerVatStatus`));
    } else if (customer && !at(customer, "customerVatData", "customerTaxNumber")) {
      out.push(finding("HU-009", "Lines are marked domestic reverse charge but the customer has no Hungarian tax number (NAV DOMESTIC_TAXNUMBER_EXPECTED_REVERSE_CHARGE).",
        "Give the buyer's Hungarian tax number in customerVatData/customerTaxNumber.", `${base}/invoiceHead/customerInfo/customerVatData`));
    }
  }

  // --- Summary.
  const summary = child(inv, "invoiceSummary");
  const sNormal = child(summary, "summaryNormal");
  const sSimple = kids(summary, "summarySimplified");
  const sp = `${base}/invoiceSummary`;
  const gInvoice = num(txt(summary, "summaryGrossData", "invoiceGrossAmount"));
  if (simplified && sNormal) {
    out.push(finding("HU-006", "A SIMPLIFIED invoice has a summaryNormal (NAV LINE_SUMMARY_TYPE_MISMATCH_SUMMARY_NORMAL).", "Summarise a simplified invoice in summarySimplified, by VAT content.", `${sp}/summaryNormal`));
  }
  if (!simplified && category && sSimple.length) {
    out.push(finding("HU-006", `A ${category} invoice has summarySimplified (NAV LINE_SUMMARY_TYPE_MISMATCH_SUMMARY_SIMPLIFIED).`, "Summarise a normal or aggregate invoice in summaryNormal, by VAT rate.", `${sp}/summarySimplified`));
  }
  const rows = kids(sNormal, "summaryByVatRate");
  const summed = { net: 0, netHUF: 0, vat: 0, vatHUF: 0 };
  let rowsComplete = true;
  const seenKeys = new Set();
  rows.forEach((row, j) => {
    const rp = `${sp}/summaryNormal/summaryByVatRate[${j + 1}]`;
    const vr = child(row, "vatRate");
    checkVatRate(vr, { simplified: false, level: "summary", path: `${rp}/vatRate`, deliveryDate, modifying }, out);
    const key = rateKey(vr);
    const net = num(txt(row, "vatRateNetData", "vatRateNetAmount"));
    const netHUF = num(txt(row, "vatRateNetData", "vatRateNetAmountHUF"));
    const vatData = child(row, "vatRateVatData");
    const vat = num(txt(vatData, "vatRateVatAmount"));
    const vatHUF = num(txt(vatData, "vatRateVatAmountHUF"));
    const gross = num(txt(row, "vatRateGrossData", "vatRateGrossAmount"));
    const grossHUF = num(txt(row, "vatRateGrossData", "vatRateGrossAmountHUF"));
    if (net === null || netHUF === null) rowsComplete = false;
    summed.net += net || 0; summed.netHUF += netHUF || 0; summed.vat += vat || 0; summed.vatHUF += vatHUF || 0;
    if (vatData && ((vat || 0) !== 0 || (vatHUF || 0) !== 0)) {
      if (child(vr, "vatOutOfScope")) {
        out.push(finding("HU-010", `The ${keyLabel(key)} summary row is outside the scope of VAT but carries a VAT amount (NAV INCORRECT_SUMMARY_DATA_VAT_OUT_OF_SCOPE_NORMAL).`, "An out-of-scope summary row's VAT amounts must be 0.", `${rp}/vatRateVatData`));
      }
      if (child(vr, "vatExemption")) {
        out.push(finding("HU-010", `The ${keyLabel(key)} summary row is tax-exempt but carries a VAT amount (NAV INCORRECT_SUMMARY_DATA_VAT_EXEMPTION_NORMAL).`, "An exempt summary row's VAT amounts must be 0.", `${rp}/vatRateVatData`));
      }
    }
    // Annex I 711 and 731 (warnings): a reverse-charge or margin-scheme row with non-zero VAT.
    // 731's text says it skips "utilitySettlementIndicator values <> TRAVEL_AGENCY"; TRAVEL_AGENCY
    // is a marginSchemeIndicator value, so that is the field read here.
    if (vatData && ((vat || 0) !== 0 || (vatHUF || 0) !== 0)) {
      if (txt(vr, "vatDomesticReverseCharge") === "true") {
        out.push(finding("HU-010", `The domestic reverse-charge summary row carries a VAT amount (NAV INCORRECT_SUMMARY_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL).`, "Under domestic reverse charge the buyer accounts for the VAT: the row's VAT amounts are 0.", `${rp}/vatRateVatData`, navWarn("INCORRECT_SUMMARY_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL")));
      }
      const margin = txt(vr, "marginSchemeIndicator");
      if (margin && margin !== "TRAVEL_AGENCY") {
        out.push(finding("HU-010", `The margin-scheme summary row (${margin}) carries a VAT amount (NAV INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR_NORMAL).`, "A margin-scheme invoice shows no VAT: the row's VAT amounts are 0.", `${rp}/vatRateVatData`, navWarn("INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR_NORMAL")));
      }
    }
    if (key && seenKeys.has(key)) {
      out.push(finding("HU-024", `Two summaryByVatRate rows are for ${keyLabel(key)}.`, "Give each VAT rate one summary row.", `${rp}/vatRate`, navWarn(null)));
    }
    if (key) seenKeys.add(key);
    const pctRate = ratePercent(key);
    // Annex I 890 and 891: only when the base is not zero; the reference is the stated VAT.
    if (pctRate !== null && net !== null && net !== 0 && vat !== null && off(vat, net * pctRate, { r, ref: vat })) {
      out.push(finding("HU-025", `The ${keyLabel(key)} summary row: vatRateVatAmount is ${fmt(vat)} but ${keyLabel(key)} of ${fmt(net)} is ${fmt(net * pctRate)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_SUMMARY).`,
        "Compute the row's VAT from its net amount.", `${rp}/vatRateVatData/vatRateVatAmount`, navWarn("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_SUMMARY")));
    }
    if (pctRate !== null && netHUF !== null && netHUF !== 0 && vatHUF !== null && off(vatHUF, netHUF * pctRate, { huf: true, r, ref: vatHUF })) {
      out.push(finding("HU-025", `The ${keyLabel(key)} summary row: vatRateVatAmountHUF is ${fmt(vatHUF)} but ${keyLabel(key)} of ${fmt(netHUF)} HUF is ${fmt(netHUF * pctRate)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_HUF_SUMMARY).`,
        "Compute the row's forint VAT from its forint net amount.", `${rp}/vatRateVatData/vatRateVatAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_HUF_SUMMARY")));
    }
    if (gross !== null && net !== null && off(gross, net + (vat || 0), { r })) {
      out.push(finding("HU-025", `The ${keyLabel(key)} summary row: vatRateGrossAmount is ${fmt(gross)} but net plus VAT is ${fmt(net + (vat || 0))}${OWN}.`,
        "Make the row's gross the net plus the VAT.", `${rp}/vatRateGrossData/vatRateGrossAmount`, navWarn(null)));
    }
    if (rate !== null && !ctx.aggregate) {
      // Annex I 1074 and 1075; the row's forint gross has no NAV warning.
      for (const [v, h, el, code] of [[net, netHUF, "vatRateNetAmountHUF", "INCORRECT_SUMMARY_DATA_INVOICE_VAT_RATE_NET_AMOUNT_HUF"], [vat, vatHUF, "vatRateVatAmountHUF", "INCORRECT_SUMMARY_DATA_INVOICE_VAT_RATE_VAT_AMOUNT_HUF"], [gross, grossHUF, "vatRateGrossAmountHUF", null]]) {
        if (v !== null && h !== null && off(h, v * rate, { huf: true, r })) {
          out.push(finding("HU-023", `The ${keyLabel(key)} summary row: ${el} is ${fmt(h)} but the amount x exchange rate ${rate} is ${fmt(v * rate)}${code ? ` (NAV ${code})` : OWN}.`,
            "Convert the summary to forints at the invoice's exchange rate.", `${rp}/${el.startsWith("vatRateNet") ? "vatRateNetData" : el.startsWith("vatRateVat") ? "vatRateVatData" : "vatRateGrossData"}/${el}`, navWarn(code)));
        }
      }
    }
    // Each row against its lines (INCORRECT_SUMMARY_CALCULATION_VAT_RATE_*_LINE).
    const b = key && byKey.get(key);
    if (lines.length && !ctx.merged && b && b.ok) {
      // Annex I 820 and 821: only when the row's base is not zero; the reference is the row's.
      if (net !== null && net !== 0 && off(net, b.net, { r, ref: net })) {
        out.push(finding("HU-024", `The ${keyLabel(key)} summary row says net ${fmt(net)} but its ${b.n} line${b.n === 1 ? " adds" : "s add"} up to ${fmt(b.net)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_LINE).`,
          "Make each rate's summary the sum of the lines at that rate.", `${rp}/vatRateNetData/vatRateNetAmount`, navWarn("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_LINE")));
      }
      if (netHUF !== null && netHUF !== 0 && off(netHUF, b.netHUF, { huf: true, r, ref: netHUF })) {
        out.push(finding("HU-024", `The ${keyLabel(key)} summary row says net ${fmt(netHUF)} HUF but its lines add up to ${fmt(b.netHUF)} HUF (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_HUF_LINE).`,
          "Make each rate's forint summary the sum of the lines' forint amounts.", `${rp}/vatRateNetData/vatRateNetAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_HUF_LINE")));
      }
      if (vat !== null && b.vatOk && off(vat, b.vat, { r })) {
        out.push(finding("HU-024", `The ${keyLabel(key)} summary row says VAT ${fmt(vat)} but its lines add up to ${fmt(b.vat)}${OWN}.`,
          "Make each rate's VAT the sum of the lines' VAT at that rate.", `${rp}/vatRateVatData/vatRateVatAmount`, navWarn(null)));
      }
    }
    // Annex I 680, 710, 720 and 733: a marker in the summary that no line carries (690 and 700,
    // the exemption and out-of-scope versions, are marked inactive).
    const markerCode = key && SUMMARY_MARKER_CODE.find(([prefix]) => key.startsWith(prefix));
    if (lines.length && !ctx.merged && markerCode && lt.nNormal && allKeyed(lines, "lineAmountsNormal") && ![...byKey.keys()].includes(key)) {
      out.push(finding("HU-024", `The summary has a ${keyLabel(key)} row but no line is at ${keyLabel(key)} (NAV ${markerCode[1]}).`,
        "Give the summary only the VAT rates and markers its lines use.", `${rp}/vatRate`, navWarn(markerCode[1])));
    }
  });
  if (lines.length && !ctx.merged && sNormal) {
    for (const [key, b] of byKey) {
      if (b.kind === "normal" && !seenKeys.has(key) && b.ok && (b.net !== 0 || b.vat !== 0)) {
        out.push(finding("HU-024", `${b.n} line${b.n === 1 ? " is" : "s are"} at ${keyLabel(key)} (net ${fmt(b.net)}) but no summaryByVatRate row is (NAV INCORRECT_SUMMARY_DATA_BY_VATRATE).`,
          "Add a summary row for every VAT rate the lines use.", `${sp}/summaryNormal`, navWarn("INCORRECT_SUMMARY_DATA_BY_VATRATE")));
      }
    }
  }
  if (sNormal) {
    if (!rows.length && !ctx.aggregate) {
      out.push(finding("HU-024", "summaryNormal has no summaryByVatRate row; NAV wants at least one on a non-aggregate invoice (a line-less modification reports 27% and 0).",
        "Add a summaryByVatRate row for each VAT rate.", `${sp}/summaryNormal`));
    }
    const tNet = num(txt(sNormal, "invoiceNetAmount"));
    const tNetHUF = num(txt(sNormal, "invoiceNetAmountHUF"));
    const tVat = num(txt(sNormal, "invoiceVatAmount"));
    const tVatHUF = num(txt(sNormal, "invoiceVatAmountHUF"));
    if (rows.length && rowsComplete) {
      // Annex I 840, 841, 850, 860; the reference is the stated total.
      const cmp = (stated, computed, el, code, what, huf) => {
        if (stated !== null && off(stated, computed, { huf, r, ref: stated })) {
          out.push(finding("HU-025", `${el} is ${fmt(stated)} but the summaryByVatRate rows add up to ${fmt(computed)} (NAV ${code}).`,
            `Make the invoice ${what} the sum of the VAT-rate rows.`, `${sp}/summaryNormal/${el}`, navWarn(code)));
        }
      };
      cmp(tNet, summed.net, "invoiceNetAmount", "INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT", "net", false);
      cmp(tNetHUF, summed.netHUF, "invoiceNetAmountHUF", "INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_HUF", "forint net", true);
      cmp(tVat, summed.vat, "invoiceVatAmount", "INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_SUMMARY", "VAT", false);
      // 860 runs only when the rows give vatRateVatAmountHUF.
      if (rows.some((row) => txt(row, "vatRateVatData", "vatRateVatAmountHUF"))) {
        cmp(tVatHUF, summed.vatHUF, "invoiceVatAmountHUF", "INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_HUF_SUMMARY", "forint VAT", true);
      }
    }
    // Annex I 941: the lines' forint nets against the forint net total.
    if (lines.length && !ctx.merged && lt.nNormal === lines.length && lt.netHUFok && tNetHUF !== null && off(tNetHUF, lt.netHUF, { huf: true, r, ref: tNetHUF })) {
      out.push(finding("HU-025", `invoiceNetAmountHUF is ${fmt(tNetHUF)} but the lines' lineNetAmountHUF add up to ${fmt(lt.netHUF)} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_LINE_HUF).`,
        "Make the forint net total the sum of the lines' forint nets.", `${sp}/summaryNormal/invoiceNetAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_LINE_HUF")));
    }
    // Annex I 1090: a new (CREATE) normal or aggregate invoice with a negative net total.
    if (!modifying && tNet !== null && tNet < 0) {
      out.push(finding("HU-025", `invoiceNetAmount is ${fmt(tNet)} on a new invoice; NAV warns that an original (CREATE) invoice's net total cannot be negative (NAV INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT).`,
        "Report a reduction as a modification (invoiceReference to the base invoice), or check the signs.", `${sp}/summaryNormal/invoiceNetAmount`, navWarn("INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT")));
    }
    const g = num(txt(summary, "summaryGrossData", "invoiceGrossAmount"));
    const gHUF = num(txt(summary, "summaryGrossData", "invoiceGrossAmountHUF"));
    // Annex I 880 and 881; the reference is the stated gross.
    if (g !== null && tNet !== null && off(g, tNet + (tVat || 0), { r, ref: g })) {
      out.push(finding("HU-025", `invoiceGrossAmount is ${fmt(g)} but invoiceNetAmount plus invoiceVatAmount is ${fmt(tNet + (tVat || 0))} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_SUMMARY).`,
        "Make the gross total the net total plus the VAT total.", `${sp}/summaryGrossData/invoiceGrossAmount`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_SUMMARY")));
    }
    if (gHUF !== null && tNetHUF !== null && off(gHUF, tNetHUF + (tVatHUF || 0), { huf: true, r, ref: gHUF })) {
      out.push(finding("HU-025", `invoiceGrossAmountHUF is ${fmt(gHUF)} but the forint net plus VAT is ${fmt(tNetHUF + (tVatHUF || 0))} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_SUMMARY).`,
        "Make the forint gross total the forint net plus the forint VAT.", `${sp}/summaryGrossData/invoiceGrossAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_SUMMARY")));
    }
    if (rate !== null && !ctx.aggregate) {
      // Annex I 1071, 1070 and 1073 (1073 also runs on simplified invoices, below).
      for (const [v, h, el, code, path] of [[tNet, tNetHUF, "invoiceNetAmountHUF", "INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT_HUF", "summaryNormal"], [tVat, tVatHUF, "invoiceVatAmountHUF", "INCORRECT_SUMMARY_DATA_INVOICE_VAT_AMOUNT_HUF", "summaryNormal"], [g, gHUF, "invoiceGrossAmountHUF", "INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT_HUF", "summaryGrossData"]]) {
        if (v !== null && h !== null && off(h, v * rate, { huf: true, r })) {
          out.push(finding("HU-023", `${el} is ${fmt(h)} but the amount x exchange rate ${rate} is ${fmt(v * rate)} (NAV ${code}).`,
            "Convert the totals to forints at the invoice's exchange rate.", `${sp}/${path}/${el}`, navWarn(code)));
        }
      }
    }
  }
  if (sSimple.length) {
    let total = 0;
    let totalHUF = 0;
    const seen = new Set();
    sSimple.forEach((row, j) => {
      const rp = `${sp}/summarySimplified[${j + 1}]`;
      const vr = child(row, "vatRate");
      checkVatRate(vr, { simplified: true, level: "summary", path: `${rp}/vatRate`, deliveryDate, modifying }, out);
      const key = rateKey(vr);
      const gross = num(txt(row, "vatContentGrossAmount"));
      const grossHUF = num(txt(row, "vatContentGrossAmountHUF"));
      total += gross || 0; totalHUF += grossHUF || 0;
      if (key) seen.add(key);
      if (rate !== null && gross !== null && grossHUF !== null && off(grossHUF, gross * rate, { huf: true, r })) {
        out.push(finding("HU-023", `The ${keyLabel(key)} simplified summary: vatContentGrossAmountHUF is ${fmt(grossHUF)} but the amount x exchange rate is ${fmt(gross * rate)} (NAV INCORRECT_SUMMARY_DATA_INVOICE_VAT_CONTENT_GROSS_AMOUNT_HUF).`,
          "Convert the summary to forints at the invoice's exchange rate.", `${rp}/vatContentGrossAmountHUF`, navWarn("INCORRECT_SUMMARY_DATA_INVOICE_VAT_CONTENT_GROSS_AMOUNT_HUF")));
      }
      const b = key && byKey.get(key);
      // Annex I 920 (reference: the invoice's gross) and 921 (reference: the row's forint gross).
      if (lines.length && !ctx.merged && b && b.ok && gross !== null && off(gross, b.gross, { r, ref: gInvoice ?? b.gross })) {
        out.push(finding("HU-026", `The ${keyLabel(key)} simplified summary says ${fmt(gross)} but its ${b.n} line${b.n === 1 ? " adds" : "s add"} up to ${fmt(b.gross)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_SUMMARY_SIMPLIFIED).`,
          "Make each VAT content's summary the sum of the lines with that content.", `${rp}/vatContentGrossAmount`, navWarn("INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_SUMMARY_SIMPLIFIED")));
      }
      if (lines.length && !ctx.merged && b && b.hufOk && grossHUF !== null && off(grossHUF, b.grossHUF, { huf: true, r, ref: grossHUF })) {
        out.push(finding("HU-026", `The ${keyLabel(key)} simplified summary says ${fmt(grossHUF)} HUF but its lines' lineGrossAmountSimplifiedHUF add up to ${fmt(b.grossHUF)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_HUF_SUMMARY_SIMPLIFIED).`,
          "Make each VAT content's forint summary the sum of the lines' forint gross amounts.", `${rp}/vatContentGrossAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_HUF_SUMMARY_SIMPLIFIED")));
      }
      // Annex I 910-916: a VAT content or marker in the summary that no line carries.
      const markerCode = key && SIMPLIFIED_MARKER_CODE.find(([prefix]) => key.startsWith(prefix));
      if (lines.length && !ctx.merged && markerCode && lt.nSimple && allKeyed(lines, "lineAmountsSimplified") && !byKey.has(key)) {
        out.push(finding("HU-026", `The simplified summary has a ${keyLabel(key)} row but no line is at ${keyLabel(key)} (NAV ${markerCode[1]}).`,
          "Give the summary only the VAT contents and markers its lines use.", `${rp}/vatRate`, navWarn(markerCode[1])));
      }
    });
    if (lines.length && !ctx.merged) {
      for (const [key, b] of byKey) {
        if (b.kind === "simplified" && !seen.has(key) && b.ok && b.gross !== 0) {
          out.push(finding("HU-026", `${b.n} line${b.n === 1 ? " is" : "s are"} at ${keyLabel(key)} (gross ${fmt(b.gross)}) but no summarySimplified row is (NAV INCORRECT_SUMMARY_DATA_BY_VATRATE).`,
            "Add a simplified summary row for every VAT content the lines use.", `${sp}`, navWarn("INCORRECT_SUMMARY_DATA_BY_VATRATE")));
        }
      }
    }
    const g = gInvoice;
    // Annex I 930 and 931 (NAV's names say VAT_AMOUNT; the checks are on the gross).
    if (g !== null && off(g, total, { r, ref: g })) {
      out.push(finding("HU-026", `invoiceGrossAmount is ${fmt(g)} but the simplified summary rows add up to ${fmt(total)} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT).`,
        "Make the gross total the sum of the simplified summary rows.", `${sp}/summaryGrossData/invoiceGrossAmount`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT")));
    }
    const gHUF = num(txt(summary, "summaryGrossData", "invoiceGrossAmountHUF"));
    if (gHUF !== null && off(gHUF, totalHUF, { huf: true, r, ref: gHUF })) {
      out.push(finding("HU-026", `invoiceGrossAmountHUF is ${fmt(gHUF)} but the simplified summary rows add up to ${fmt(totalHUF)} HUF (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_HUF).`,
        "Make the forint gross total the sum of the simplified summary rows.", `${sp}/summaryGrossData/invoiceGrossAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_HUF")));
    }
  }
  if (simplified) {
    const g = gInvoice;
    const gHUF = num(txt(summary, "summaryGrossData", "invoiceGrossAmountHUF"));
    // Annex I 900 and 901: the lines' gross against the invoice's gross, straight from the lines.
    if (lines.length && !ctx.merged && lt.nSimple === lines.length) {
      if (lt.grossOk && g !== null && off(g, lt.gross, { r, ref: g })) {
        out.push(finding("HU-026", `invoiceGrossAmount is ${fmt(g)} but the lines' lineGrossAmountSimplified add up to ${fmt(lt.gross)} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_LINE).`,
          "Make the gross total the sum of the lines' gross amounts.", `${sp}/summaryGrossData/invoiceGrossAmount`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_LINE")));
      }
      if (lt.grossHUFok && gHUF !== null && off(gHUF, lt.grossHUF, { huf: true, r, ref: gHUF })) {
        out.push(finding("HU-026", `invoiceGrossAmountHUF is ${fmt(gHUF)} but the lines' lineGrossAmountSimplifiedHUF add up to ${fmt(lt.grossHUF)} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_LINE).`,
          "Make the forint gross total the sum of the lines' forint gross amounts.", `${sp}/summaryGrossData/invoiceGrossAmountHUF`, navWarn("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_LINE")));
      }
    }
    // Annex I 1073 on a simplified invoice.
    if (rate !== null && g !== null && gHUF !== null && off(gHUF, g * rate, { huf: true, r })) {
      out.push(finding("HU-023", `invoiceGrossAmountHUF is ${fmt(gHUF)} but the amount x exchange rate ${rate} is ${fmt(g * rate)} (NAV INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT_HUF).`,
        "Convert the gross total to forints at the invoice's exchange rate.", `${sp}/summaryGrossData/invoiceGrossAmountHUF`, navWarn("INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT_HUF")));
    }
    // Annex I 1100: a new (CREATE) simplified invoice with a negative gross total.
    if (!modifying && g !== null && g < 0) {
      out.push(finding("HU-026", `invoiceGrossAmount is ${fmt(g)} on a new simplified invoice; NAV warns that an original (CREATE) invoice's gross total cannot be negative (NAV INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT).`,
        "Report a reduction as a modification (invoiceReference to the base invoice), or check the signs.", `${sp}/summaryGrossData/invoiceGrossAmount`, navWarn("INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT")));
    }
  }
  checkAnnexHeadAndLines(inv, ctx, out, skipped);
  checkProductFee(inv, lines, { base, modifying, rate }, out, skipped);
  if (ctx.merged && lines.length) skipped.push({ rule: "HU-020/HU-024/HU-026", path: `${base}/invoiceLines`, reason: "mergedItemIndicator is true (lines are merged), so line-to-summary sums were not compared." });
  // An amount that is not an xs:decimal fails NAV's schema check (HU-030 names it) before any
  // arithmetic, and a sum built around an unreadable amount names a wrong total; drop the sums.
  const bad = badDecimals(inv, base);
  if (bad.length) {
    for (let i = out.length - 1; i >= firstFinding; i--) if (/^HU-02[0-6]$/.test(out[i].rule)) out.splice(i, 1);
    skipped.push({ rule: "HU-020..026", path: base, reason: `${bad.length} amount${bad.length === 1 ? " is" : "s are"} not a decimal number (${bad.slice(0, 3).map(([p]) => p.split("/").pop()).join(", ")}), so the line and summary arithmetic was not checked.` });
  }
}

// --- Annex I sections I.1 (invoice header) and I.2 (line data): the warnings a file can show.
// Read warning by warning from the 2026.02.12 English specification (eval/nav-annex1-head-lines-2026-11-15.md).
// HU-034 is I.1, HU-035 is I.2; each finding names its Annex I code in `nav`. What NAV checks
// against its taxpayer register or the stored base invoice (60, 71, 81, 91, 113, 1311, 510, 540,
// 342, 11400, 11401, 632, 1030) is listed in `skipped`. 11, 72, 85, 112, 161, 180, 190, 210, 220,
// 1301, 431-433 are marked deprecated or inactive and are left out.
export const ANNEX_I_HEAD_LINE_CODES = [
  "SUPPLIER_CUSTOMER_MATCH_TAXPAYER", "SUPPLIER_CUSTOMER_MATCH_BANKACCOUNT", "SUPPLIER_FISCAL_MATCH_TAXPAYER", "SUPPLIER_FISCAL_MATCH_NAME",
  "INCORRECT_HEAD_DATA_FISCALREPRESENTATIVE", "INCORRECT_VAT_CODE_SUPPLIER", "INCORRECT_HEAD_DATA_CUSTOMER_GROUPMEMBER_TAXNUMBER",
  "INCORRECT_VAT_CODE_FISCALREPRESENTATIVE", "INCORRECT_COUNTY_CODE_SUPPLIER", "INCORRECT_COUNTY_CODE_SUPPLIER_GROUPMEMBER",
  "INCORRECT_COUNTY_CODE_CUSTOMER", "INCORRECT_COUNTY_CODE_CUSTOMER_GROUPMEMBER", "INCORRECT_COUNTY_CODE_FISCALREPRESENTATIVE",
  "INCORRECT_COUNTRY_CODE_FISCALREPRESENTATIVEADDRESS", "INCORRECT_HEAD_DATA_SUPPLIER_COMMUNITY_VAT_NUMBER",
  "INCORRECT_DATE_INVOICE_ISSUE_DATE_LATE", "INCORRECT_DATE_INVOICE_DELIVERY_DATE_EARLY", "INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE",
  "INCORRECT_DATE_AGGREGATE_INVOICE_ISSUE_DATE", "INCORRECT_DATE_AGGREGATE_INVOICE_DELIVERY_DATE",
  "INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_LATE", "INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_EARLY",
  "INCORRECT_HEAD_DATA_PERIODICAL_SETTLEMENT",
  // Annex II INFO 10311 (not a warning: severity "information").
  "INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY",
  "INCORRECT_LINE_DATA_BY_VATRATE", "INCORRECT_LINE_DATA_SELF_LINE_NUMBER", "INCORRECT_LINE_DATA_MARGIN_SCHEME_INDICATOR_NORMAL",
  "INCORRECT_LINE_DATA_LINE_AMOUNTS_NORMAL_MANDATORY", "INCORRECT_LINE_DATA_LINE_AMOUNTS_SIMPLIFIED_MANDATORY",
  "INCORRECT_LINE_DATA_LINE_AMOUNTS_SIMPLIFIED_NOT_ALLOWED",
  "INCORRECT_LINE_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL", "INCORRECT_LINE_DATA_AGGREGATE_INVOICE_LINE_DATA",
  "INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAET_SIMPLIFIED", "INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAUK_SIMPLIFIED",
  "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAET", "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAET_SIMPLIFIED",
  "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAUK", "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAUK_SIMPLIFIED",
  "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EAM", "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EAM_SIMPLIFIED",
  "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EUFAD37", "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EUFADE", "INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EUE",
];
// Annex I 120-160: "value list: 02-20; 22-44; 51".
const countyOk = (c) => /^\d{2}$/.test(c) && ((c >= "02" && c <= "20") || (c >= "22" && c <= "44") || c === "51");
const DAY = 86400000;
// A real calendar day: Date.parse would roll 2026-02-30 over to March, so round-trip the day.
const isDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
  if (!m) return false;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, day));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === day;
};
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** Today's date in Hungary (Europe/Budapest), yyyy-mm-dd: the day a report sent now reaches NAV. */
export function budapestToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function checkAnnexHeadAndLines(inv, ctx, out, skipped) {
  const { base } = ctx;
  const head = child(inv, "invoiceHead");
  const detail = child(head, "invoiceDetail");
  const supplier = child(head, "supplierInfo");
  const customer = child(head, "customerInfo");
  const fiscal = child(head, "fiscalRepresentativeInfo");
  const custVat = child(customer, "customerVatData");
  const category = txt(detail, "invoiceCategory");
  const modifying = ctx.operation ? ctx.operation !== "CREATE" : Boolean(child(inv, "invoiceReference"));
  const vatStatus = txt(customer, "customerVatStatus");
  const hp = `${base}/invoiceHead`;
  const w = (code, message, fix, path) => out.push(finding("HU-034", `${message} (NAV ${code}).`, fix, path, navWarn(code)));

  const supTax = child(supplier, "supplierTaxNumber");
  const supGroup = child(supplier, "groupMemberTaxNumber");
  const custTax = child(custVat, "customerTaxNumber");
  const custGroup = child(custTax, "groupMemberTaxNumber");
  const fisTax = child(fiscal, "fiscalRepresentativeTaxNumber");
  const supId = txt(supTax, "taxpayerId");
  const supCounty = txt(supTax, "countyCode");

  // 10, 20, 30, 40: the seller's data repeated as the customer's or the fiscal representative's.
  if (supId && txt(custTax, "taxpayerId") && supId === txt(custTax, "taxpayerId")) {
    w("SUPPLIER_CUSTOMER_MATCH_TAXPAYER", "The seller's and the customer's tax numbers have the same first eight digits",
      "Check the customer's tax number: the seller's was probably copied into it.", `${hp}/customerInfo/customerVatData/customerTaxNumber/taxpayerId`);
  }
  const supBank = txt(supplier, "supplierBankAccountNumber");
  if (vatStatus === "OTHER" && supBank && supBank === txt(customer, "customerBankAccountNumber")) {
    w("SUPPLIER_CUSTOMER_MATCH_BANKACCOUNT", "The seller's and the customer's bank account numbers are identical",
      "Give the customer's own account, or leave customerBankAccountNumber out.", `${hp}/customerInfo/customerBankAccountNumber`);
  }
  if (supId && txt(fisTax, "taxpayerId") && supId === txt(fisTax, "taxpayerId")) {
    w("SUPPLIER_FISCAL_MATCH_TAXPAYER", "The seller's and the fiscal representative's tax numbers have the same first eight digits",
      "Give the fiscal representative's own Hungarian tax number.", `${hp}/supplierInfo/supplierTaxNumber/taxpayerId`);
  }
  const supName = txt(supplier, "supplierName");
  if (supName && supName === txt(fiscal, "fiscalRepresentativeName")) {
    w("SUPPLIER_FISCAL_MATCH_NAME", "The seller's and the fiscal representative's names are identical",
      "Give the fiscal representative's own name.", `${hp}/fiscalRepresentativeInfo/fiscalRepresentativeName`);
  }
  // 530: a fiscal representative only for a seller whose county code is 51.
  if (supCounty && txt(fisTax, "taxpayerId") && supCounty !== "51") {
    w("INCORRECT_HEAD_DATA_FISCALREPRESENTATIVE", `A fiscal representative is given but the seller's county code is ${supCounty}, not 51`,
      "Only a foreign seller registered through a fiscal representative (county code 51) reports one; drop fiscalRepresentativeInfo or check the county code.", `${hp}/supplierInfo/supplierTaxNumber/countyCode`);
  }
  // 50, 100: VAT codes.
  const supCode = txt(supTax, "vatCode");
  if (supCode && !["1", "2", "3", "5"].includes(supCode)) {
    w("INCORRECT_VAT_CODE_SUPPLIER", `The seller's VAT code is ${supCode}; NAV takes 1, 2, 3 or 5`,
      "Copy the ninth digit of the seller's tax number again (4 marks a group member, which goes in groupMemberTaxNumber).", `${hp}/supplierInfo/supplierTaxNumber/vatCode`);
  }
  const fisCode = txt(fisTax, "vatCode");
  if (fisCode && !["1", "2", "4"].includes(fisCode)) {
    w("INCORRECT_VAT_CODE_FISCALREPRESENTATIVE", `The fiscal representative's VAT code is ${fisCode}; NAV takes 1, 2 or 4`,
      "Copy the ninth digit of the fiscal representative's tax number again.", `${hp}/fiscalRepresentativeInfo/fiscalRepresentativeTaxNumber/vatCode`);
  }
  // 82: a VAT group's own id (NAV: "starting with 177") given as the customer's group member.
  if (custVat && txt(custGroup, "taxpayerId").startsWith("177")) {
    w("INCORRECT_HEAD_DATA_CUSTOMER_GROUPMEMBER_TAXNUMBER", "The customer's groupMemberTaxNumber starts with 177, which NAV reads as a VAT group's own number, not a member's",
      "Put the VAT group's number in customerTaxNumber and the member's own tax number in groupMemberTaxNumber (NAV says this warning will become an error).", `${hp}/customerInfo/customerVatData/customerTaxNumber/groupMemberTaxNumber/taxpayerId`);
  }
  // 120-160: county codes.
  for (const [node, code, p, who] of [
    [supTax, "INCORRECT_COUNTY_CODE_SUPPLIER", "/supplierInfo/supplierTaxNumber", "seller's"],
    [supGroup, "INCORRECT_COUNTY_CODE_SUPPLIER_GROUPMEMBER", "/supplierInfo/groupMemberTaxNumber", "seller's group member's"],
    [custTax, "INCORRECT_COUNTY_CODE_CUSTOMER", "/customerInfo/customerVatData/customerTaxNumber", "customer's"],
    [custGroup, "INCORRECT_COUNTY_CODE_CUSTOMER_GROUPMEMBER", "/customerInfo/customerVatData/customerTaxNumber/groupMemberTaxNumber", "customer's group member's"],
    [fisTax, "INCORRECT_COUNTY_CODE_FISCALREPRESENTATIVE", "/fiscalRepresentativeInfo/fiscalRepresentativeTaxNumber", "fiscal representative's"],
  ]) {
    const c = txt(node, "countyCode");
    if (c && !countyOk(c)) {
      w(code, `The ${who} county code is ${c}; NAV's list is 02-20, 22-44 and 51`, "Copy the last two digits of the tax number again.", `${hp}${p}/countyCode`);
    }
  }
  // 200: a fiscal representative's address is in Hungary.
  const fisAddr = child(fiscal, "fiscalRepresentativeAddress");
  const fisCountry = txt(fisAddr, "simpleAddress", "countryCode") || txt(fisAddr, "detailedAddress", "countryCode");
  if (fisCountry && fisCountry !== "HU") {
    w("INCORRECT_COUNTRY_CODE_FISCALREPRESENTATIVEADDRESS", `The fiscal representative's country code is ${fisCountry}, not HU`,
      "A fiscal representative is established in Hungary: give its Hungarian address.", `${hp}/fiscalRepresentativeInfo/fiscalRepresentativeAddress`);
  }
  // 500: the seller's EU VAT number ends with its tax number's first eight digits.
  const supEu = txt(supplier, "communityVatNumber");
  if (supEu && supId && supEu.slice(-8) !== supId) {
    w("INCORRECT_HEAD_DATA_SUPPLIER_COMMUNITY_VAT_NUMBER", "The last eight characters of the seller's EU VAT number are not the first eight digits of its tax number",
      "A Hungarian EU VAT number is HU followed by the tax number's first eight digits.", `${hp}/supplierInfo/communityVatNumber`);
  }

  // Dates. 313, 320, 321 compare dates in the file; 310, 312, 340, 341 compare with the day of reporting.
  const issue = ctx.issueDate;
  const delivery = txt(detail, "invoiceDeliveryDate");
  const dp = `${hp}/invoiceDetail`;
  if (isDate(issue) && isDate(delivery) && daysBetween(issue, delivery) >= 397) {
    w("INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE", `invoiceDeliveryDate ${delivery} is ${daysBetween(issue, delivery)} days after the issue date ${issue}; NAV warns at 397 days (13 months). Annex I (2026.02.12) still lists this warning, but the specification's change log for application version 3.11 says it was deprecated when the blocking INVOICE_DELIVERY_DATE_LATE (over 5 years, HU-014) came in, so NAV may no longer send it`,
      "Check the delivery date's year and month.", `${dp}/invoiceDeliveryDate`);
  }
  if (category === "AGGREGATE") {
    const lineDates = kids(child(inv, "invoiceLines"), "line").map((l) => txt(l, "aggregateInvoiceLineData", "lineDeliveryDate")).filter(isDate);
    const latest = lineDates.length ? lineDates.reduce((a, b) => (b > a ? b : a)) : null;
    if (latest && isDate(issue) && ctx.operation !== "STORNO" && issue < latest) {
      w("INCORRECT_DATE_AGGREGATE_INVOICE_ISSUE_DATE", `The aggregate invoice is issued ${issue}, before its latest line delivery date ${latest}`,
        "An aggregate invoice is issued after the deliveries it sums: check the issue date or the line dates.", `${ctx.root}/invoiceIssueDate`);
    }
    if (latest && isDate(delivery) && !modifying && delivery !== latest) {
      w("INCORRECT_DATE_AGGREGATE_INVOICE_DELIVERY_DATE", `invoiceDeliveryDate ${delivery} is not the latest line delivery date ${latest}`,
        "On an aggregate invoice the header delivery date is technical: make it the latest lineDeliveryDate.", `${dp}/invoiceDeliveryDate`);
    }
  }
  const rd = ctx.reportDate;
  if (isDate(rd)) {
    const when = ctx.reportDateFrom === "request" ? `the request's timestamp (${rd})` : `the day of reporting (taken as ${rd})`;
    if (isDate(issue) && daysBetween(rd, issue) > 5) {
      w("INCORRECT_DATE_INVOICE_ISSUE_DATE_LATE", `The issue date ${issue} is ${daysBetween(rd, issue)} days after ${when}; NAV tolerates 5`,
        "Check the issue date's year and month; an invoice is reported after it is issued.", `${ctx.root}/invoiceIssueDate`);
    }
    // Annex II INFO 10311 (CREATE only): issued more than 10 days before the report.
    if (!modifying && isDate(issue) && daysBetween(issue, rd) > 10) {
      out.push(finding("HU-034", `The invoice was issued ${issue}, ${daysBetween(issue, rd)} days before ${when}; NAV notes a report more than 10 days after issue (NAV INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY, information).`,
        "Report invoices to NAV as soon as they are issued (in general without delay); if the date is right, the note only records a late report.", `${ctx.root}/invoiceIssueDate`, { severity: "information", nav: "INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY" }));
    }
    const lapsed = `${Number(rd.slice(0, 4)) - 6}-01-01`;
    if (isDate(delivery) && delivery < lapsed) {
      w("INCORRECT_DATE_INVOICE_DELIVERY_DATE_EARLY", `invoiceDeliveryDate ${delivery} is before ${lapsed}, the first day of the sixth year before ${when}`,
        "Check the delivery date's year; a supply that old is in a lapsed period.", `${dp}/invoiceDeliveryDate`);
    }
    if (modifying && isDate(issue)) {
      if (daysBetween(rd, issue) > 5) {
        w("INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_LATE", `The modifying document's issue date ${issue} is ${daysBetween(rd, issue)} days after ${when}; NAV tolerates 5`,
          "Check the modifying document's issue date.", `${ctx.root}/invoiceIssueDate`);
      }
      if (daysBetween(issue, rd) >= 15) {
        w("INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_EARLY", `The modifying document was issued ${issue}, ${daysBetween(issue, rd)} days before ${when}; NAV warns at 15`,
          "Report a modifying document within days of issuing it; if the date is right, the warning only records the late report.", `${ctx.root}/invoiceIssueDate`);
      }
    }
  } else {
    skipped.push({ rule: "HU-034", path: `${ctx.root}/invoiceIssueDate`, reason: "No day of reporting was given (a bare InvoiceData file carries none), so NAV's issue-date and lapsed-delivery warnings (310, 312, 340, 341) and the late-report note (Annex II 10311) were not run." });
  }
  // 561: periodic settlement dates without periodicalSettlement true.
  const ps = txt(detail, "invoiceDeliveryPeriodStart");
  const pe = txt(detail, "invoiceDeliveryPeriodEnd");
  if ((ps || pe) && txt(detail, "periodicalSettlement") !== "true") {
    w("INCORRECT_HEAD_DATA_PERIODICAL_SETTLEMENT", `A delivery period is given (${[ps, pe].filter(Boolean).join(" to ")}) but periodicalSettlement is ${txt(detail, "periodicalSettlement") || "missing"}, not true`,
      "Set periodicalSettlement to true for an invoice that settles a period.", `${dp}/periodicalSettlement`);
  }

  // --- I.2: line data.
  const lines = kids(child(inv, "invoiceLines"), "line");
  const lp = (i) => `${base}/invoiceLines/line[${i + 1}]`;
  const l = (code, message, fix, path) => out.push(finding("HU-035", `${message} (NAV ${code}).`, fix, path, navWarn(code)));
  const simplified = category === "SIMPLIFIED";
  const once = new Map(); // customer-tax-number mismatches: one finding per code, naming the lines
  const hasEu = Boolean(child(custVat, "communityVatNumber"));
  const hasThird = Boolean(child(custVat, "thirdStateTaxId"));
  const hasDomestic = Boolean(custTax);
  const lineKeys = new Set();
  lines.forEach((line, i) => {
    const p = lp(i);
    const own = txt(line, "lineNumber");
    // 590.
    const selfRefs = kids(child(line, "referencesToOtherLines"), "referenceToOtherLine").map((r) => r.text.trim());
    if (own && selfRefs.includes(own)) {
      l("INCORRECT_LINE_DATA_SELF_LINE_NUMBER", `Line ${i + 1} lists its own number ${own} among its references to other lines`,
        "referenceToOtherLine names the other line this one belongs to (a discount's goods line, say), never itself.", `${p}/referencesToOtherLines`);
    }
    const created = !modifying || txt(line, "lineModificationReference", "lineOperation") === "CREATE";
    const normal = child(line, "lineAmountsNormal");
    const simple = child(line, "lineAmountsSimplified");
    // 600, 610.
    if (created && category && !simplified && !normal) {
      l("INCORRECT_LINE_DATA_LINE_AMOUNTS_NORMAL_MANDATORY", `Line ${i + 1} of a ${category} invoice has no lineAmountsNormal`,
        "Give the line its net, VAT rate, VAT and gross in lineAmountsNormal.", `${p}/lineAmountsNormal`);
    }
    if (created && simplified && !simple) {
      l("INCORRECT_LINE_DATA_LINE_AMOUNTS_SIMPLIFIED_MANDATORY", `Line ${i + 1} of a SIMPLIFIED invoice has no lineAmountsSimplified`,
        "Give the line its VAT content and gross amount in lineAmountsSimplified.", `${p}/lineAmountsSimplified`);
    }
    // 630.
    if (category && !simplified && simple) {
      l("INCORRECT_LINE_DATA_LINE_AMOUNTS_SIMPLIFIED_NOT_ALLOWED", `Line ${i + 1} of a ${category} invoice carries simplified-invoice amounts`,
        "Give normal and aggregate invoice lines lineAmountsNormal only.", `${p}/lineAmountsSimplified/lineVatContent`);
    }
    const amounts = simplified ? simple : normal;
    const vr = child(amounts, "lineVatRate");
    const key = rateKey(vr);
    if (key) lineKeys.add(key.replace(/^(exempt|oos):.*/, "$1"));
    // 631: aggregate line data on a normal or simplified invoice.
    if (category && category !== "AGGREGATE" && child(line, "aggregateInvoiceLineData")) {
      l("INCORRECT_LINE_DATA_AGGREGATE_INVOICE_LINE_DATA", `Line ${i + 1} of a ${category} invoice carries aggregateInvoiceLineData`,
        "Only an AGGREGATE invoice gives lines their own exchange rate and delivery date; drop the block or report the invoice as AGGREGATE.", `${p}/aggregateInvoiceLineData`);
    }
    // 5810, 5820: the simplified-invoice versions of the KBAET / KBAUK customer status checks.
    if (simplified && simple && vatStatus) {
      const sc = txt(vr, "vatExemption", "case");
      if (sc === "KBAET" && vatStatus !== "OTHER") {
        l("INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAET_SIMPLIFIED", `Line ${i + 1} is a tax-exempt intra-Community supply (KBAET) but the customer's VAT status is ${vatStatus}, not OTHER`,
          "KBAET goes only to a buyer registered in another member state (customerVatStatus OTHER).", `${p}/lineAmountsSimplified/lineVatRate/vatExemption/case`);
      }
      if (sc === "KBAUK" && vatStatus === "DOMESTIC") {
        l("INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAUK_SIMPLIFIED", `Line ${i + 1} is an intra-Community supply of a new means of transport (KBAUK) but the customer is DOMESTIC`,
          "KBAUK goes only to a PRIVATE_PERSON or OTHER buyer.", `${p}/lineAmountsSimplified/lineVatRate/vatExemption/case`);
      }
    }
    // 595 and 597: domestic reverse charge or margin scheme with VAT on a normal or aggregate line.
    if (!simplified && normal) {
      const margin = txt(vr, "marginSchemeIndicator");
      const vat = num(txt(normal, "lineVatData", "lineVatAmount"));
      const vatHUF = num(txt(normal, "lineVatData", "lineVatAmountHUF"));
      if (txt(vr, "vatDomesticReverseCharge") === "true" && ((vat !== null && vat !== 0) || (vatHUF !== null && vatHUF !== 0))) {
        l("INCORRECT_LINE_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL", `Line ${i + 1} is marked domestic reverse charge but carries a VAT amount`,
          "Under domestic reverse charge the buyer accounts for the VAT: make lineVatAmount and lineVatAmountHUF 0.", `${p}/lineAmountsNormal/lineVatRate/vatDomesticReverseCharge`);
      }
      if (margin && margin !== "TRAVEL_AGENCY" && ((vat !== null && vat !== 0) || (vatHUF !== null && vatHUF !== 0))) {
        l("INCORRECT_LINE_DATA_MARGIN_SCHEME_INDICATOR_NORMAL", `Line ${i + 1} is under the margin scheme (${margin}) but carries a VAT amount`,
          "A margin-scheme line shows no VAT: make lineVatAmount and lineVatAmountHUF 0.", `${p}/lineAmountsNormal/lineVatData`);
      }
    }
    // 585-592 and the simplified 5850, 5860, 5870: the exemption or out-of-scope case against the customer's tax number.
    const ex = txt(vr, "vatExemption", "case");
    const oos = txt(vr, "vatOutOfScope", "case");
    const note = (code, why) => {
      const e = once.get(code) || { lines: [], why, path: `${p}/${simplified ? "lineAmountsSimplified" : "lineAmountsNormal"}/lineVatRate` };
      e.lines.push(i + 1);
      once.set(code, e);
    };
    const notEu = hasDomestic || hasThird;
    const sfx = simplified ? "_SIMPLIFIED" : "";
    if (ex === "KBAET" && notEu && (simplified || category === "NORMAL")) note(`INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAET${sfx}`, "KBAET (exempt intra-Community supply) but the customer is given a tax number other than an EU VAT number");
    if (ex === "KBAUK" && notEu && (simplified || category === "NORMAL")) note(`INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAUK${sfx}`, "KBAUK (new means of transport to another member state) but the customer is given a tax number other than an EU VAT number");
    if (ex === "EAM" && hasEu && category) note(`INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EAM${sfx}`, "EAM (export outside the EU) but the customer is given an EU VAT number");
    if (category === "NORMAL" && oos === "EUFAD37" && notEu) note("INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EUFAD37", "EUFAD37 (reverse charge in another member state) but the customer is given a tax number other than an EU VAT number");
    if (category === "NORMAL" && oos === "EUFADE" && hasThird) note("INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EUFADE", "EUFADE (reverse charge in another member state) but the customer is given a non-EU tax number");
    if (category === "NORMAL" && oos === "EUE" && hasThird) note("INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EUE", "EUE (supply taxed in another member state) but the customer is given a non-EU tax number");
  });
  for (const [code, e] of once) {
    const which = e.lines.length === 1 ? `Line ${e.lines[0]} is` : `Lines ${e.lines.slice(0, 5).join(", ")}${e.lines.length > 5 ? ", ..." : ""} are`;
    l(code, `${which} ${e.why}`, "Report the customer by the tax number that fits the supply: an EU VAT number for KBAET, KBAUK and EUFAD37; no EU VAT number for EAM; no third-country number for EUFADE and EUE.", `${hp}/customerInfo/customerVatData`);
  }
  // 435: a VAT rate (or marker) with a non-zero summary value that no line carries. Exemptions and
  // out-of-scope cases are matched by node, not by case. On a MODIFY it runs only when some line has amounts.
  const anyAmounts = lines.some((ln) => child(ln, "lineAmountsNormal") || child(ln, "lineAmountsSimplified"));
  if (lines.length && (!modifying || anyAmounts)) {
    const summary = child(inv, "invoiceSummary");
    const rows = [
      ...kids(child(summary, "summaryNormal"), "summaryByVatRate").map((r, k) => [r, num(txt(r, "vatRateNetData", "vatRateNetAmount")), `${base}/invoiceSummary/summaryNormal/summaryByVatRate[${k + 1}]/vatRate`]),
      ...kids(summary, "summarySimplified").map((r, k) => [r, num(txt(r, "vatContentGrossAmount")), `${base}/invoiceSummary/summarySimplified[${k + 1}]/vatRate`]),
    ];
    for (const [row, value, path] of rows) {
      const key = rateKey(child(row, "vatRate"));
      if (!key || value === null || value === 0) continue;
      if (!lineKeys.has(key.replace(/^(exempt|oos):.*/, "$1"))) {
        l("INCORRECT_LINE_DATA_BY_VATRATE", `The summary has ${fmt(value)} at ${keyLabel(key)} but no line is at ${keyLabel(key)}`,
          "Give the summary only the VAT rates its lines use, or add the missing line.", path);
      }
    }
  }
}

// --- Product fee (termékdíj, Act LXXXV of 2011): the line contents against productFeeSummary.
// Annex I of the interface specification (2026.02.12), warnings 270-290, 450-490, 651, 670,
// 780, 790 and 810; NAV accepts the report with a warning, so these are warnings too. The
// tolerance is NAV's for these codes: 1% of the forint value, at least 1 HUF or 0.01 of the
// invoice currency, whichever is greater. On a modification only lineOperation CREATE lines
// count (as NAV says for 480, 490, 790 and 810).
const FEE_CODES = new Set(["CSK", "KT"]);
const feeTol = (value, rate) => Math.max(Math.abs(value) * 0.01, 1, 0.01 * (rate || 1));
const feeOff = (stated, computed, rate) => Math.abs(stated - computed) > feeTol(computed, rate) + 1e-9;
const feeCode = (node) => {
  const c = child(node, "productFeeCode");
  const cat = txt(c, "productCodeCategory");
  return { cat, key: `${cat}:${txt(c, "productCodeValue") || txt(c, "productCodeOwnValue")}` };
};
const cents = (n) => Math.round(n * 100);

function checkProductFee(inv, lines, { base, modifying, rate }, out, skipped) {
  const summaries = kids(inv, "productFeeSummary");
  const lp = (i) => `${base}/invoiceLines/line[${i + 1}]`;
  const lineData = []; // { i, j, code, qty, unit, amount }
  let obligated = false;
  let anyContent = false;
  lines.forEach((line, i) => {
    const contents = kids(line, "lineProductFeeContent");
    const ob = txt(line, "obligatedForProductFee");
    if (ob === "true" || ob === "1") obligated = true;
    if (contents.length) anyContent = true;
    if ((ob === "true" || ob === "1") && !contents.length) {
      out.push(finding("HU-033", `Line ${i + 1} is marked obligatedForProductFee but carries no lineProductFeeContent (NAV MISSING_PRODUCT_FEE_DATA_LINE_OBLIGATED_CONTENT_EMPTY).`,
        "Give the line its product fee code, quantity, unit, rate and amount, or set obligatedForProductFee to false.", `${lp(i)}/lineProductFeeContent`, warn));
    }
    if (contents.length && !(ob === "true" || ob === "1")) {
      out.push(finding("HU-033", `Line ${i + 1} carries product fee content but obligatedForProductFee is ${ob || "missing"}; it must be true (NAV INCORRECT_PRODUCT_FEE_DATA_OBLIGATED_LINE).`,
        "Set obligatedForProductFee to true on every line that reports product fee content.", `${lp(i)}/obligatedForProductFee`, warn));
    }
    const op = txt(line, "lineModificationReference", "lineOperation");
    contents.forEach((c, j) => {
      const code = feeCode(c);
      const where = `${lp(i)}/lineProductFeeContent${contents.length > 1 ? `[${j + 1}]` : ""}`;
      if (code.cat && !FEE_CODES.has(code.cat)) {
        out.push(finding("HU-033", `Line ${i + 1}: the product fee code type is ${code.cat}; a product fee is coded under CSK (packaging) or KT (environmental product fee) only (NAV INCORRECT_PRODUCT_CODE_FEE_CATEGORY).`,
          "Use the CSK or KT code from the product fee act's annex.", `${where}/productFeeCode/productCodeCategory`, warn));
      }
      if (!modifying || op === "CREATE") {
        lineData.push({ i, code, qty: num(txt(c, "productFeeQuantity")), unit: txt(c, "productFeeMeasuringUnit"), amount: num(txt(c, "productFeeAmount")) });
      }
    });
  });
  const sp = (k) => `${base}/productFeeSummary${summaries.length > 1 ? `[${k + 1}]` : ""}`;
  if (!summaries.length) {
    if (obligated) {
      out.push(finding("HU-033", "A line is marked obligatedForProductFee but the invoice has no productFeeSummary (NAV MISSING_PRODUCT_FEE_DATA_LINE_OBLIGATED_SUMMARY_EMPTY).",
        "Add a productFeeSummary with one productFeeData per product fee code and the productChargeSum.", `${base}/productFeeSummary`, warn));
    } else if (anyContent) {
      out.push(finding("HU-033", "Lines carry product fee content but the invoice has no productFeeSummary (NAV MISSING_PRODUCT_FEE_DATA_LINE_CONTENT_SUMMARY_EMPTY).",
        "Add a productFeeSummary with one productFeeData per product fee code and the productChargeSum.", `${base}/productFeeSummary`, warn));
    }
    return;
  }
  if (!anyContent) {
    out.push(finding("HU-033", "The invoice has a productFeeSummary but no line carries lineProductFeeContent (NAV MISSING_LINE_PRODUCT_FEE_CONTENT, INCORRECT_PRODUCT_FEE_DATA_CHARGE_SUM).",
      "Report the product fee on the lines it belongs to, or drop the summary.", sp(0), warn));
  }
  const summaryByCode = new Map();
  summaries.forEach((summary, k) => {
    const data = kids(summary, "productFeeData");
    let sum = 0;
    let sumOk = true;
    data.forEach((d, j) => {
      const where = `${sp(k)}/productFeeData${data.length > 1 ? `[${j + 1}]` : ""}`;
      const code = feeCode(d);
      if (code.cat && !FEE_CODES.has(code.cat)) {
        out.push(finding("HU-033", `A product fee summary row is coded ${code.cat}; summary rows take CSK or KT only (NAV INCORRECT_PRODUCT_CODE_FEE_SUMMARY_CATEGORY).`,
          "Use the CSK or KT code from the product fee act's annex.", `${where}/productFeeCode/productCodeCategory`, warn));
      }
      const q = num(txt(d, "productFeeQuantity"));
      const r = num(txt(d, "productFeeRate"));
      const a = num(txt(d, "productFeeAmount"));
      if (a === null) sumOk = false; else sum += a;
      if (q !== null && r !== null && a !== null && feeOff(a, q * r, rate)) {
        out.push(finding("HU-033", `Product fee ${code.key.replace(":", " ")}: quantity ${q} x rate ${r} is ${fmt(q * r)} HUF but productFeeAmount says ${fmt(a)} (NAV INCORRECT_PRODUCT_FEE_CALCULATION_PRODUCT_FEE_AMOUNT).`,
          "Make productFeeAmount the quantity times the rate (HUF per unit); check the unit is the one the rate is set for (kg or piece).", `${where}/productFeeAmount`, warn));
      }
      if (summaries.length === 1) summaryByCode.set(code.key, { where, q, unit: txt(d, "productFeeMeasuringUnit"), a, cat: code.cat });
    });
    // Not a NAV code: productChargeSum against the summary's own rows (NAV's 790 compares it with the lines, below).
    const charge = num(txt(summary, "productChargeSum"));
    if (charge !== null && sumOk && data.length && feeOff(charge, sum, rate) && summaries.length > 1) {
      out.push(finding("HU-033", `productChargeSum is ${fmt(charge)} HUF but this summary's productFeeData rows add up to ${fmt(sum)}.`,
        "Make productChargeSum the sum of the summary's productFeeAmount values.", `${sp(k)}/productChargeSum`, warn));
    }
  });
  if (summaries.length > 1) {
    skipped.push({ rule: "HU-033", path: `${base}/productFeeSummary`, reason: "The invoice has two productFeeSummary blocks (REFUND and DEPOSIT); a line does not say which one it belongs to, so the line-to-summary comparisons (NAV 290, 480, 490, 790, 810) were not run." });
    return;
  }
  if (!lineData.length) return;
  // Code 290: a line's code type that no summary row shows.
  const summaryCats = new Set([...summaryByCode.values()].map((v) => v.cat));
  const reported = new Set();
  for (const l of lineData) {
    if (l.code.cat && !summaryCats.has(l.code.cat) && !reported.has(l.code.cat)) {
      reported.add(l.code.cat);
      out.push(finding("HU-033", `Line ${l.i + 1} has product fee code type ${l.code.cat}, which no productFeeData row in the summary shows (NAV INCORRECT_PRODUCT_CODE_FEE_CATEGORY_MISSING).`,
        "Add a summary row for every product fee code the lines use.", `${sp(0)}/productFeeData`, warn));
    }
  }
  // Codes 480, 490, 810: per product fee code, lines against the summary row.
  const byCode = new Map();
  for (const l of lineData) {
    const b = byCode.get(l.code.key) ?? { qty: 0, qtyOk: true, amount: 0, amountOk: true, units: new Set(), lines: [] };
    if (l.qty === null) b.qtyOk = false; else b.qty += l.qty;
    if (l.amount === null) b.amountOk = false; else b.amount += l.amount;
    if (l.unit) b.units.add(l.unit);
    b.lines.push(l.i + 1);
    byCode.set(l.code.key, b);
  }
  const label = (key) => key.replace(":", " ");
  const lineWord = (b) => `line${b.lines.length === 1 ? "" : "s"} ${b.lines.join(", ")}`;
  for (const [key, b] of byCode) {
    const row = summaryByCode.get(key);
    if (!row) {
      if (summaryCats.has(key.split(":")[0])) {
        out.push(finding("HU-033", `Product fee ${label(key)} on ${lineWord(b)} has no row in productFeeSummary (NAV MISSING_PRODUCT_FEE_DATA_LINE_QUANTITY_SUMMARY_QUANTITY).`,
          "Add a productFeeData row for this code with the lines' total quantity and amount.", `${sp(0)}/productFeeData`, warn));
      }
      continue;
    }
    if (b.qtyOk && row.q !== null && Math.abs(b.qty - row.q) > 1e-6 * Math.max(1, Math.abs(row.q))) {
      out.push(finding("HU-033", `Product fee ${label(key)}: the summary quantity is ${row.q} but ${lineWord(b)} add up to ${Number(b.qty.toFixed(10))} (NAV MISSING_PRODUCT_FEE_DATA_LINE_QUANTITY_SUMMARY_QUANTITY).`,
        "Make each summary row's quantity the sum of the line quantities with that code.", `${row.where}/productFeeQuantity`, warn));
    }
    if (row.unit && [...b.units].some((u) => u !== row.unit)) {
      out.push(finding("HU-033", `Product fee ${label(key)}: the summary gives the quantity in ${row.unit} but ${lineWord(b)} use ${[...b.units].join(" and ")} (NAV MISSING_PRODUCT_FEE_DATA_LINE_MEASURING_SUMMARY).`,
        "Use the same unit (KG or DARAB) for a code on the lines and in the summary.", `${row.where}/productFeeMeasuringUnit`, warn));
    }
    if (b.amountOk && row.a !== null && feeOff(row.a, b.amount, rate)) {
      out.push(finding("HU-033", `Product fee ${label(key)}: the summary amount is ${fmt(row.a)} HUF but ${lineWord(b)} add up to ${fmt(b.amount)} (NAV INCORRECT_PRODUCT_FEE_CALCULATION_PRODUCT_FEE_AMOUNT_SUMMARY).`,
        "Make each summary row's productFeeAmount the sum of the line amounts with that code.", `${row.where}/productFeeAmount`, warn));
    }
  }
  // Code 790: productChargeSum against the lines' product fee amounts.
  const charge = num(txt(summaries[0], "productChargeSum"));
  if (charge !== null && lineData.every((l) => l.amount !== null)) {
    const total = lineData.reduce((s2, l) => s2 + cents(l.amount), 0) / 100;
    if (feeOff(charge, total, rate)) {
      out.push(finding("HU-033", `productChargeSum is ${fmt(charge)} HUF but the lines' product fee amounts add up to ${fmt(total)} (NAV INCORRECT_PRODUCT_FEE_CALCULATION_AGGREGATE_PRODUCT_CHARGE_SUM).`,
        "Make productChargeSum the sum of every line's productFeeAmount.", `${sp(0)}/productChargeSum`, warn));
    }
  }
}

/** Check one InvoiceData document (the decoded XML). `operation` is the request's invoiceOperation when known. */
export function checkNavInvoiceData(source, { operation = null, electronicInvoiceHash = null, invoiceDataBytes = null, pathPrefix = "/InvoiceData", reportDate = null, reportDateFrom = "option" } = {}) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const findings = [];
  const skipped = [];
  if (!wellFormed(text)) {
    return { findings: [finding("HU-001", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.", "Export the file again; if it was edited by hand, close every tag in the order it was opened.", "/")], skipped, meta: {} };
  }
  const tree = parseXmlTree(text);
  const root = tree.children.find((c) => c.name === "InvoiceData");
  if (!root) return { findings: [finding("HU-001", "No InvoiceData root element was found.", "Check the file is a NAV Online Számla 3.0 invoice data report.", "/")], skipped, meta: {} };
  // The schema gate first (HU-027..HU-032, hu-xsd.mjs): NAV aborts a report that breaks
  // invoiceData.xsd before any business rule, so these are listed ahead of the rest.
  findings.push(...checkAgainstNavSchema(root, pathPrefix, text));
  // INV-065 (2026-11-17): a number or date with a no-break space (xmlvalues.mjs);
  // the path follows pathPrefix so a manageInvoice operation's finding names its operation.
  for (const f of xmlValueFindings({ children: [root] })) findings.push({ ...f, path: `${pathPrefix}${f.path.replace(/^\/InvoiceData\[1\]/, "")}` });
  const invoiceNumberRaw = raw(root, "invoiceNumber");
  const invoiceNumber = invoiceNumberRaw.trim();
  const issueDate = txt(root, "invoiceIssueDate");
  const complete = txt(root, "completenessIndicator") === "true";
  if (invoiceNumberRaw && invoiceNumberRaw !== invoiceNumber) {
    findings.push(finding("HU-013", "invoiceNumber starts or ends with whitespace (NAV INVALID_INVOICE_NUMBER).", "Trim spaces, tabs and line breaks around the invoice number.", `${pathPrefix}/invoiceNumber`));
  }
  const main = child(root, "invoiceMain");
  const single = child(main, "invoice");
  const batch = kids(main, "batchInvoice");
  const invoices = single ? [[single, `${pathPrefix}/invoiceMain/invoice`]] : batch.map((b, i) => [child(b, "invoice"), `${pathPrefix}/invoiceMain/batchInvoice[${i + 1}]/invoice`]).filter(([inv]) => inv);
  if (!invoices.length) {
    findings.push(finding("HU-001", "invoiceMain holds neither an invoice nor a batchInvoice.", "Check the export; the invoice body is missing.", `${pathPrefix}/invoiceMain`));
    return { findings, skipped, meta: { invoiceNumber } };
  }
  const additional = (inv) => kids(at(inv, "invoiceHead", "invoiceDetail"), "additionalInvoiceData").map((d) => txt(d, "dataName"));
  for (const [inv, base] of invoices) {
    const detail = at(inv, "invoiceHead", "invoiceDetail");
    const category = txt(detail, "invoiceCategory");
    const ctx = {
      base, root: pathPrefix, operation, complete, issueDate, invoiceNumber, reportDate, reportDateFrom,
      aggregate: category === "AGGREGATE",
      merged: txt(inv, "invoiceLines", "mergedItemIndicator") === "true",
      predecessorPotlas: additional(inv).some((n) => /JOGELOD_POTLAS$/.test(n)),
    };
    checkInvoice(inv, ctx, findings, skipped);
  }
  // Batch modifications (codes 23, 62).
  if (batch.length > 1) {
    const sup = invoices.map(([inv]) => txt(inv, "invoiceHead", "supplierInfo", "supplierTaxNumber", "taxpayerId"));
    if (new Set(sup).size > 1) {
      findings.push(finding("HU-017", "The batchInvoice entries name different suppliers (NAV SUPPLIER_NOT_IDENTICAL).", "One batch modification can only be for one seller's invoices.", `${pathPrefix}/invoiceMain`));
    }
    const cus = invoices.map(([inv]) => txt(inv, "invoiceHead", "customerInfo", "customerVatData", "customerTaxNumber", "taxpayerId")).filter(Boolean);
    if (new Set(cus).size > 1) {
      findings.push(finding("HU-017", "The batchInvoice entries name different customer tax numbers (NAV CUSTOMER_NOT_IDENTICAL).", "Give the same customer tax number in every batch entry, or report them separately.", `${pathPrefix}/invoiceMain`));
    }
  }
  // Electronic invoice hash (codes 26-28).
  if (complete) {
    if (!electronicInvoiceHash) {
      if (operation) findings.push(finding("HU-016", "completenessIndicator is true but the request has no electronicInvoiceHash (NAV ELECTRONIC_INVOICE_HASH_EXPECTED).", "Send the SHA3-512 hash of the Base64 invoiceData.", "/ManageInvoiceRequest/invoiceOperations/invoiceOperation/electronicInvoiceHash"));
      else skipped.push({ rule: "HU-016", path: `${pathPrefix}/completenessIndicator`, reason: "completenessIndicator is true; the electronicInvoiceHash sits in the manageInvoice request, which was not supplied, so the hash was not checked." });
    }
  }
  if (electronicInvoiceHash) {
    const algo = electronicInvoiceHash.attrs?.cryptoType || "";
    const value = electronicInvoiceHash.text.trim();
    const allowed = complete ? ["SHA3-512"] : ["SHA-256", "SHA3-512"];
    const hp = "/ManageInvoiceRequest/invoiceOperations/invoiceOperation/electronicInvoiceHash";
    if (!allowed.includes(algo)) {
      findings.push(finding("HU-016", `electronicInvoiceHash cryptoType is "${algo || "(none)"}"; ${complete ? "an e-invoice report takes SHA3-512" : "NAV takes SHA-256 or SHA3-512"} (NAV INVALID_INVOICE_HASH_CRYPTO).`,
        "Set cryptoType to SHA3-512.", hp));
    } else if (complete && invoiceDataBytes) {
      // The spec says "the hash value of the BASE64 encoded value of the invoiceData node"; NAV's own
      // manageInvoice.xml sample matches SHA3-512 over the decoded XML bytes (3 of 3 operations), not
      // over the Base64 text (0 of 3), so the decoded bytes are what is hashed here.
      const want = sha3_512Hex(invoiceDataBytes).toUpperCase();
      if (value.toUpperCase() !== want) {
        findings.push(finding("HU-016", "electronicInvoiceHash does not match the SHA3-512 of the invoice data in the request (NAV INVALID_INVOICE_HASH).",
          "Hash the invoice XML bytes exactly as they are Base64-encoded into invoiceData, with SHA3-512, and write the hex digest in capitals.", hp));
      } else if (value !== want) {
        findings.push(finding("HU-016", "electronicInvoiceHash is the right SHA3-512 digest but in lower case; NAV compares the all-caps value (NAV INVALID_INVOICE_HASH).",
          "Write the hex digest in capitals.", hp));
      }
    }
  }
  skipped.push({ rule: "NAV register", path: pathPrefix, reason: "NAV also checks against its own records (a unique invoice number per seller, the referenced base invoice and its modificationIndex, the sender's tax number, the technical user's customers), and Annex I warnings 60, 71, 81, 91, 113, 510, 540 and 1311 (the taxpayer register) and 342, 632, 1030, 11400 and 11401 (the stored base invoice); a file cannot show those. Dropped together with its base invoice, a modification is checked against it (hungary-nav-chain.mjs, HU-036/HU-037)." });
  const first = invoices[0][0];
  return {
    findings, skipped,
    meta: {
      invoiceNumber, issueDate, complete, invoices: invoices.length,
      category: txt(first, "invoiceHead", "invoiceDetail", "invoiceCategory"),
      currency: txt(first, "invoiceHead", "invoiceDetail", "currencyCode"),
      modification: Boolean(child(first, "invoiceReference")),
    },
  };
}

/** Check a NAV InvoiceData file, or every invoiceOperation of a manageInvoice request. */
// reportDate (yyyy-mm-dd) is the day the report reaches NAV, for Annex I 310, 312, 340 and 341. A
// manageInvoice request carries its own (header/timestamp, read in Budapest time) and that wins; a bare
// InvoiceData file carries none, so those four warnings run only when the caller names the day.
export function checkNavInvoice(source, { reportDate = null } = {}) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (/<(?:[A-Za-z0-9_]+:)?InvoiceData[\s>]/.test(text.slice(0, 4096))) return checkNavInvoiceData(text, { reportDate });
  if (!wellFormed(text)) return { findings: [finding("HU-001", "The XML is not well formed: a tag is never closed or closes out of order.", "Export the request again.", "/")], skipped: [], meta: {} };
  const tree = parseXmlTree(text);
  const req = tree.children.find((c) => c.name === "ManageInvoiceRequest");
  const ops = kids(at(req, "invoiceOperations"), "invoiceOperation");
  const stamp = Date.parse(txt(req, "header", "timestamp"));
  const requestDate = Number.isNaN(stamp) ? null : budapestToday(new Date(stamp));
  const findings = [];
  const skipped = [];
  const metas = [];
  if (!ops.length) return { findings: [finding("HU-001", "The manageInvoice request has no invoiceOperation.", "Add the invoice operations.", "/ManageInvoiceRequest/invoiceOperations")], skipped, meta: {} };
  ops.forEach((op, i) => {
    const b64 = txt(op, "invoiceData");
    const operation = txt(op, "invoiceOperation");
    const prefix = `/ManageInvoiceRequest/invoiceOperations/invoiceOperation[${i + 1}]/invoiceData`;
    const compressed = txt(req, "invoiceOperations", "compressedContent") === "true";
    let bytes = new Uint8Array(0);
    try { bytes = base64Bytes(b64); } catch { /* reported below */ }
    if (compressed) {
      // gzip cannot be undone synchronously in a browser without a library; name it instead of guessing.
      skipped.push({ rule: "HU-001..032", path: prefix, reason: "compressedContent is true (gzip); compressed operations are not read by this checker. Paste the uncompressed InvoiceData XML instead." });
      return;
    }
    const decoded = new TextDecoder().decode(bytes);
    if (!decoded.includes("InvoiceData")) {
      findings.push(finding("HU-001", `Operation ${i + 1}: invoiceData does not decode (Base64) to an InvoiceData document.`, "Base64-encode the UTF-8 InvoiceData XML into invoiceData.", prefix));
      return;
    }
    const r = checkNavInvoiceData(decoded, { operation, electronicInvoiceHash: child(op, "electronicInvoiceHash"), invoiceDataBytes: bytes, pathPrefix: prefix, reportDate: requestDate || reportDate, reportDateFrom: requestDate ? "request" : "option" });
    findings.push(...r.findings.map((f) => ({ ...f, path: f.path.replace(/^\/ManageInvoiceRequest\/invoiceOperations\/invoiceOperation\//, `/ManageInvoiceRequest/invoiceOperations/invoiceOperation[${i + 1}]/`) })));
    skipped.push(...r.skipped);
    metas.push({ ...r.meta, operation });
  });
  return { findings, skipped, meta: { request: true, operations: metas.length, ...(metas[0] || {}) } };
}
