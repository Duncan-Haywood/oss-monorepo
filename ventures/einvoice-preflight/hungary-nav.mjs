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
//   - invoiceData.xsd / invoiceBase.xsd 3.0 for element names and nesting, and, with
//     the NTCA common 1.0 common.xsd it imports, for the schema pass in nav-xsd.mjs
//     (HU-027..HU-032, NAV SCHEMA_VIOLATION);
//   - Annex I of the same specification for the product fee warnings (HU-033);
//   - the 29 InvoiceData files in sample/Data sample, which all pass (see
//     eval/hungary-nav-samples-2026-11-15.md).
// Blocking codes come out as errors; the arithmetic checks mirror NAV's WARN
// family (INCORRECT_LINE_CALCULATION_*, INCORRECT_SUMMARY_*), which NAV accepts
// with a warning, so they come out with severity "warning". What NAV checks
// against its own records (unique invoice numbers, the referenced base invoice,
// the technical user's customers, the taxpayer register) cannot be checked from
// the file and is listed in `skipped`. The VAT WARN arithmetic (HU-020..026) was
// written from the code names and the tolerance sentence above; Annex I, which
// the 2026.02.12 English PDF does carry (pages 300-320), was read for the product
// fee family (HU-033) on 2026-11-15.
// This is an offline observation, not NAV's acceptance and not tax advice.
// Findings never repeat a tax number.

import { base64Bytes, sha3_512Hex } from "./sha3.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";
import { checkAgainstNavSchema } from "./nav-xsd.mjs";

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
const num = (value) => {
  if (value === "" || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

// NAV section 3.3.3: rounding is tolerated up to 1% of the amount, never less than one unit.
const tolerance = (reference) => Math.max(1, Math.abs(reference) * 0.01);
const off = (stated, computed) => Math.abs(stated - computed) > tolerance(computed) + 1e-9;

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
const keyLabel = (key) => key.startsWith("pct:") ? `${fmt(Number(key.slice(4)) * 100).replace(/\.00$/, "")}%` : key.startsWith("content:") ? `VAT content ${key.slice(8)}` : key;
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
  const rate = num(txt(detail, "exchangeRate"));
  const deliveryDate = txt(detail, "invoiceDeliveryDate") || txt(detail, "invoiceDeliveryPeriodEnd");
  const issueDate = ctx.issueDate;
  const vatStatus = txt(customer, "customerVatStatus");

  // --- Header: currency and exchange rate (codes 77, 78).
  if (currency === "HUF" && rate !== null && rate !== 1) {
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
    if (price !== null && priceHUF !== null && lr !== null && off(priceHUF, price * lr)) {
      out.push(finding("HU-023", `Line ${i + 1}: unitPriceHUF is ${fmt(priceHUF)} but unitPrice x exchange rate is ${fmt(price * lr)} (NAV INCORRECT_LINE_CALCULATION_${ctx.aggregate ? "AGGREGATE_" : ""}LINE_UNIT_PRICE_HUF).`,
        "Convert the unit price at the invoice's (or the line's) exchange rate.", `${p}/unitPriceHUF`, warn));
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
      if (!ctx.merged && qty !== null && price !== null && net !== null && !child(line, "lineDiscountData") && off(net, qty * price)) {
        out.push(finding("HU-020", `Line ${i + 1}: lineNetAmount is ${fmt(net)} but quantity x unitPrice is ${fmt(qty * price)} (NAV INCORRECT_LINE_CALCULATION_NET_AMOUNT).`,
          "Make the net amount the quantity times the unit price, or report the discount in lineDiscountData.", `${p}/lineAmountsNormal/lineNetAmountData/lineNetAmount`, warn));
      }
      const pctRate = ratePercent(key);
      if (pctRate !== null && net !== null && vat !== null && off(vat, net * pctRate)) {
        out.push(finding("HU-021", `Line ${i + 1}: lineVatAmount is ${fmt(vat)} but ${keyLabel(key)} of the net ${fmt(net)} is ${fmt(net * pctRate)} (NAV INCORRECT_LINE_CALCULATION_VAT_AMOUNT).`,
          "Compute the VAT from the net amount at the line's rate.", `${p}/lineAmountsNormal/lineVatData/lineVatAmount`, warn));
      }
      if (net !== null && gross !== null && off(gross, net + (vat || 0))) {
        out.push(finding("HU-022", `Line ${i + 1}: lineGrossAmountNormal is ${fmt(gross)} but net plus VAT is ${fmt(net + (vat || 0))} (NAV INCORRECT_LINE_CALCULATION_GROSS_AMOUNT).`,
          "Make the gross amount the net plus the VAT.", `${p}/lineAmountsNormal/lineGrossAmountData/lineGrossAmountNormal`, warn));
      }
      const huf = (name, value, valueHUF, element, code) => {
        if (lr !== null && value !== null && valueHUF !== null && off(valueHUF, value * lr)) {
          out.push(finding("HU-023", `Line ${i + 1}: ${element} is ${fmt(valueHUF)} but ${name} x exchange rate ${lr} is ${fmt(value * lr)} (NAV INCORRECT_LINE_CALCULATION_${ctx.aggregate ? "AGGREGATE_" : ""}${code}).`,
            "Convert every line amount to forints at the same exchange rate.", `${p}/lineAmountsNormal/${element === "lineNetAmountHUF" ? "lineNetAmountData" : element === "lineVatAmountHUF" ? "lineVatData" : "lineGrossAmountData"}/${element}`, warn));
        }
      };
      huf("the net", net, netHUF, "lineNetAmountHUF", "LINE_NET_AMOUNT_HUF");
      huf("the VAT", vat, vatHUF, "lineVatAmountHUF", "LINE_VAT_AMOUNT_HUF");
      huf("the gross", gross, grossHUF, "lineGrossAmountNormalHUF", "LINE_GROSS_AMOUNT_NORMAL_HUF");
      if (key) {
        const b = byKey.get(key) || { net: 0, netHUF: 0, vat: 0, vatHUF: 0, gross: 0, grossHUF: 0, n: 0, ok: true, vatOk: true };
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
      if (lr !== null && gross !== null && grossHUF !== null && off(grossHUF, gross * lr)) {
        out.push(finding("HU-023", `Line ${i + 1}: lineGrossAmountSimplifiedHUF is ${fmt(grossHUF)} but the gross x exchange rate is ${fmt(gross * lr)} (NAV INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_SIMPLIFIED_HUF).`,
          "Convert the line's gross amount to forints at the invoice's exchange rate.", `${p}/lineAmountsSimplified/lineGrossAmountSimplifiedHUF`, warn));
      }
      if (!ctx.merged && qty !== null && price !== null && gross !== null && !child(line, "lineDiscountData") && off(gross, qty * price)) {
        out.push(finding("HU-020", `Line ${i + 1}: lineGrossAmountSimplified is ${fmt(gross)} but quantity x unitPrice is ${fmt(qty * price)} (on a simplified invoice the unit price includes VAT).`,
          "Make the gross amount the quantity times the gross unit price, or report the discount in lineDiscountData.", `${p}/lineAmountsSimplified/lineGrossAmountSimplified`, warn));
      }
      if (key) {
        const b = byKey.get(key) || { gross: 0, grossHUF: 0, n: 0, ok: true };
        b.n += 1;
        if (gross === null) b.ok = false;
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
    if (key && seenKeys.has(key)) {
      out.push(finding("HU-024", `Two summaryByVatRate rows are for ${keyLabel(key)}.`, "Give each VAT rate one summary row.", `${rp}/vatRate`, warn));
    }
    if (key) seenKeys.add(key);
    const pctRate = ratePercent(key);
    if (pctRate !== null && net !== null && vat !== null && off(vat, net * pctRate)) {
      out.push(finding("HU-025", `The ${keyLabel(key)} summary row: vatRateVatAmount is ${fmt(vat)} but ${keyLabel(key)} of ${fmt(net)} is ${fmt(net * pctRate)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT).`,
        "Compute the row's VAT from its net amount.", `${rp}/vatRateVatData/vatRateVatAmount`, warn));
    }
    if (gross !== null && net !== null && off(gross, net + (vat || 0))) {
      out.push(finding("HU-025", `The ${keyLabel(key)} summary row: vatRateGrossAmount is ${fmt(gross)} but net plus VAT is ${fmt(net + (vat || 0))} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_GROSS_AMOUNT).`,
        "Make the row's gross the net plus the VAT.", `${rp}/vatRateGrossData/vatRateGrossAmount`, warn));
    }
    if (rate !== null && !ctx.aggregate) {
      for (const [v, h, el, code] of [[net, netHUF, "vatRateNetAmountHUF", "VAT_RATE_NET_AMOUNT_HUF"], [vat, vatHUF, "vatRateVatAmountHUF", "VAT_RATE_VAT_AMOUNT_HUF"], [gross, grossHUF, "vatRateGrossAmountHUF", "VAT_RATE_GROSS_AMOUNT_HUF"]]) {
        if (v !== null && h !== null && off(h, v * rate)) {
          out.push(finding("HU-023", `The ${keyLabel(key)} summary row: ${el} is ${fmt(h)} but the amount x exchange rate ${rate} is ${fmt(v * rate)} (NAV INCORRECT_SUMMARY_DATA_INVOICE_${code}).`,
            "Convert the summary to forints at the invoice's exchange rate.", `${rp}/${el.startsWith("vatRateNet") ? "vatRateNetData" : el.startsWith("vatRateVat") ? "vatRateVatData" : "vatRateGrossData"}/${el}`, warn));
        }
      }
    }
    // Each row against its lines (INCORRECT_SUMMARY_CALCULATION_VAT_RATE_*_LINE).
    const b = key && byKey.get(key);
    if (lines.length && !ctx.merged && b && b.ok) {
      if (net !== null && off(net, b.net)) {
        out.push(finding("HU-024", `The ${keyLabel(key)} summary row says net ${fmt(net)} but its ${b.n} line${b.n === 1 ? " adds" : "s add"} up to ${fmt(b.net)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_LINE).`,
          "Make each rate's summary the sum of the lines at that rate.", `${rp}/vatRateNetData/vatRateNetAmount`, warn));
      }
      if (netHUF !== null && off(netHUF, b.netHUF)) {
        out.push(finding("HU-024", `The ${keyLabel(key)} summary row says net ${fmt(netHUF)} HUF but its lines add up to ${fmt(b.netHUF)} HUF (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_HUF_LINE).`,
          "Make each rate's forint summary the sum of the lines' forint amounts.", `${rp}/vatRateNetData/vatRateNetAmountHUF`, warn));
      }
      if (vat !== null && b.vatOk && off(vat, b.vat)) {
        out.push(finding("HU-024", `The ${keyLabel(key)} summary row says VAT ${fmt(vat)} but its lines add up to ${fmt(b.vat)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_LINE).`,
          "Make each rate's VAT the sum of the lines' VAT at that rate.", `${rp}/vatRateVatData/vatRateVatAmount`, warn));
      }
    }
  });
  if (lines.length && !ctx.merged && sNormal) {
    for (const [key, b] of byKey) {
      if (!seenKeys.has(key) && b.ok && (b.net !== 0 || b.vat !== 0)) {
        out.push(finding("HU-024", `${b.n} line${b.n === 1 ? " is" : "s are"} at ${keyLabel(key)} (net ${fmt(b.net)}) but no summaryByVatRate row is.`,
          "Add a summary row for every VAT rate the lines use.", `${sp}/summaryNormal`, warn));
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
      const cmp = (stated, computed, el, code, what) => {
        if (stated !== null && off(stated, computed)) {
          out.push(finding("HU-025", `${el} is ${fmt(stated)} but the summaryByVatRate rows add up to ${fmt(computed)} (NAV ${code}).`,
            `Make the invoice ${what} the sum of the VAT-rate rows.`, `${sp}/summaryNormal/${el}`, warn));
        }
      };
      cmp(tNet, summed.net, "invoiceNetAmount", "INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT", "net");
      cmp(tNetHUF, summed.netHUF, "invoiceNetAmountHUF", "INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_HUF", "forint net");
      cmp(tVat, summed.vat, "invoiceVatAmount", "INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_SUMMARY", "VAT");
      cmp(tVatHUF, summed.vatHUF, "invoiceVatAmountHUF", "INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_HUF_SUMMARY", "forint VAT");
    }
    const g = num(txt(summary, "summaryGrossData", "invoiceGrossAmount"));
    const gHUF = num(txt(summary, "summaryGrossData", "invoiceGrossAmountHUF"));
    if (g !== null && tNet !== null && off(g, tNet + (tVat || 0))) {
      out.push(finding("HU-025", `invoiceGrossAmount is ${fmt(g)} but invoiceNetAmount plus invoiceVatAmount is ${fmt(tNet + (tVat || 0))} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT).`,
        "Make the gross total the net total plus the VAT total.", `${sp}/summaryGrossData/invoiceGrossAmount`, warn));
    }
    if (gHUF !== null && tNetHUF !== null && off(gHUF, tNetHUF + (tVatHUF || 0))) {
      out.push(finding("HU-025", `invoiceGrossAmountHUF is ${fmt(gHUF)} but the forint net plus VAT is ${fmt(tNetHUF + (tVatHUF || 0))} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF).`,
        "Make the forint gross total the forint net plus the forint VAT.", `${sp}/summaryGrossData/invoiceGrossAmountHUF`, warn));
    }
    if (rate !== null && !ctx.aggregate) {
      for (const [v, h, el, code] of [[tNet, tNetHUF, "invoiceNetAmountHUF", "INVOICE_NET_AMOUNT_HUF"], [tVat, tVatHUF, "invoiceVatAmountHUF", "INVOICE_VAT_AMOUNT_HUF"]]) {
        if (v !== null && h !== null && off(h, v * rate)) {
          out.push(finding("HU-023", `${el} is ${fmt(h)} but the amount x exchange rate ${rate} is ${fmt(v * rate)} (NAV INCORRECT_SUMMARY_DATA_${code}).`,
            "Convert the totals to forints at the invoice's exchange rate.", `${sp}/summaryNormal/${el}`, warn));
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
      if (rate !== null && gross !== null && grossHUF !== null && off(grossHUF, gross * rate)) {
        out.push(finding("HU-023", `The ${keyLabel(key)} simplified summary: vatContentGrossAmountHUF is ${fmt(grossHUF)} but the amount x exchange rate is ${fmt(gross * rate)}.`,
          "Convert the summary to forints at the invoice's exchange rate.", `${rp}/vatContentGrossAmountHUF`, warn));
      }
      const b = key && byKey.get(key);
      if (lines.length && !ctx.merged && b && b.ok && gross !== null && off(gross, b.gross)) {
        out.push(finding("HU-026", `The ${keyLabel(key)} simplified summary says ${fmt(gross)} but its ${b.n} line${b.n === 1 ? " adds" : "s add"} up to ${fmt(b.gross)} (NAV INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_SUMMARY_SIMPLIFIED).`,
          "Make each VAT content's summary the sum of the lines with that content.", `${rp}/vatContentGrossAmount`, warn));
      }
    });
    if (lines.length && !ctx.merged) {
      for (const [key, b] of byKey) {
        if (!seen.has(key) && b.ok && b.gross !== 0) {
          out.push(finding("HU-026", `${b.n} line${b.n === 1 ? " is" : "s are"} at ${keyLabel(key)} (gross ${fmt(b.gross)}) but no summarySimplified row is.`,
            "Add a simplified summary row for every VAT content the lines use.", `${sp}`, warn));
        }
      }
    }
    const g = num(txt(summary, "summaryGrossData", "invoiceGrossAmount"));
    if (g !== null && off(g, total)) {
      out.push(finding("HU-026", `invoiceGrossAmount is ${fmt(g)} but the simplified summary rows add up to ${fmt(total)} (NAV INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT).`,
        "Make the gross total the sum of the simplified summary rows.", `${sp}/summaryGrossData/invoiceGrossAmount`, warn));
    }
    const gHUF = num(txt(summary, "summaryGrossData", "invoiceGrossAmountHUF"));
    if (gHUF !== null && off(gHUF, totalHUF)) {
      out.push(finding("HU-026", `invoiceGrossAmountHUF is ${fmt(gHUF)} but the simplified summary rows add up to ${fmt(totalHUF)} HUF.`,
        "Make the forint gross total the sum of the simplified summary rows.", `${sp}/summaryGrossData/invoiceGrossAmountHUF`, warn));
    }
  }
  checkProductFee(inv, lines, { base, modifying, rate }, out, skipped);
  if (ctx.merged && lines.length) skipped.push({ rule: "HU-020/HU-024/HU-026", path: `${base}/invoiceLines`, reason: "mergedItemIndicator is true (lines are merged), so line-to-summary sums were not compared." });
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
export function checkNavInvoiceData(source, { operation = null, electronicInvoiceHash = null, invoiceDataBytes = null, pathPrefix = "/InvoiceData" } = {}) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const findings = [];
  const skipped = [];
  if (!wellFormed(text)) {
    return { findings: [finding("HU-001", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.", "Export the file again; if it was edited by hand, close every tag in the order it was opened.", "/")], skipped, meta: {} };
  }
  const tree = parseXmlTree(text);
  // The XSD pass first (NAV SCHEMA_VIOLATION, blocking): nav-xsd.mjs, read from NAV's own schemas.
  findings.push(...checkAgainstNavSchema(text, pathPrefix));
  const root = tree.children.find((c) => c.name === "InvoiceData");
  if (!root) return { findings: [finding("HU-001", "No InvoiceData root element was found.", "Check the file is a NAV Online Számla 3.0 invoice data report.", "/")], skipped, meta: {} };
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
      base, root: pathPrefix, operation, complete, issueDate, invoiceNumber,
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
  skipped.push({ rule: "NAV register", path: pathPrefix, reason: "NAV also checks against its own records (a unique invoice number per seller, the referenced base invoice and its modificationIndex, the sender's tax number, the technical user's customers); a file cannot show those." });
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
export function checkNavInvoice(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (/<(?:[A-Za-z0-9_]+:)?InvoiceData[\s>]/.test(text.slice(0, 4096))) return checkNavInvoiceData(text);
  if (!wellFormed(text)) return { findings: [finding("HU-001", "The XML is not well formed: a tag is never closed or closes out of order.", "Export the request again.", "/")], skipped: [], meta: {} };
  const tree = parseXmlTree(text);
  const req = tree.children.find((c) => c.name === "ManageInvoiceRequest");
  const ops = kids(at(req, "invoiceOperations"), "invoiceOperation");
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
      skipped.push({ rule: "HU-001..026", path: prefix, reason: "compressedContent is true (gzip); compressed operations are not read by this checker. Paste the uncompressed InvoiceData XML instead." });
      return;
    }
    const decoded = new TextDecoder().decode(bytes);
    if (!decoded.includes("InvoiceData")) {
      findings.push(finding("HU-001", `Operation ${i + 1}: invoiceData does not decode (Base64) to an InvoiceData document.`, "Base64-encode the UTF-8 InvoiceData XML into invoiceData.", prefix));
      return;
    }
    const r = checkNavInvoiceData(decoded, { operation, electronicInvoiceHash: child(op, "electronicInvoiceHash"), invoiceDataBytes: bytes, pathPrefix: prefix });
    findings.push(...r.findings.map((f) => ({ ...f, path: f.path.replace(/^\/ManageInvoiceRequest\/invoiceOperations\/invoiceOperation\//, `/ManageInvoiceRequest/invoiceOperations/invoiceOperation[${i + 1}]/`) })));
    skipped.push(...r.skipped);
    metas.push({ ...r.meta, operation });
  });
  return { findings, skipped, meta: { request: true, operations: metas.length, ...(metas[0] || {}) } };
}
