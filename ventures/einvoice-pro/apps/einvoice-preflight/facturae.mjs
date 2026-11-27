// Offline checks for a Spanish Facturae XML file (versions 3.2.1 and 3.2.2), the
// format FACe and the regional public-sector hubs take, and one of the formats
// Spain's B2B e-invoicing regulation allows beside UBL, CII and EDIFACT.
// Facturae is not EN 16931, so none of the UBL/CII rules apply to it.
//
// Rule ids are ES-nnn and are this tool's own, not FACe error codes. Every
// arithmetic rule restates a formula from the Ministerio de Hacienda's field
// description ("Esquema castellano v3.2.x", 06/06/2017, read 2026-11-15); the
// structure rules (ES-018..022) come from the published XSDs (facturae-xsd.mjs).
// A check that depends on something this reader does not model is skipped and
// named in `skipped`, never counted as a pass. This is an offline observation,
// not FACe's acceptance and not tax advice. A signed file's XAdES signature is
// checked by facturae-signature.mjs (ES-SIG-nn); the certificate chain is not. Findings never
// repeat a tax number or an amount.

import { roundHalfUpToCents } from "./checks.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { xmlValueFindings } from "./xmlvalues.mjs";
import { checkFacturaeSchema, tableForNamespace, FACTURAE_VERSIONS } from "./facturae-xsd.mjs";
import { inspectPartyVat } from "./vat.mjs";
import { checkFacturaeSignature } from "./facturae-signature.mjs";

const TOLERANCE = 0.01;

function finding(rule, message, fix, path, extra) {
  return extra ? { rule, message, fix, path, ...extra } : { rule, message, fix, path };
}

export function looksLikeFacturae(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?Facturae[\s>]/.test(head) && /facturae/i.test(head.match(/xmlns(?::\w+)?\s*=\s*["'][^"']*["']/g)?.join(" ") ?? "");
}

const child = (node, name) => (node ? node.children.find((c) => c.name === name) : undefined);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
function at(node, ...names) {
  let cur = node;
  for (const name of names) cur = child(cur, name);
  return cur;
}
function txt(node, ...names) {
  const found = at(node, ...names);
  return found ? found.text.trim() : "";
}
function num(node, ...names) {
  const v = txt(node, ...names);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const cents = roundHalfUpToCents;
const sum = (values) => values.reduce((a, b) => a + b, 0);
const differs = (a, b, tol = TOLERANCE) => Math.abs(a - b) > tol + 1e-9;

/** The namespace the root element's prefix (or the default) is bound to. */
function rootNamespace(source) {
  const open = /<([A-Za-z0-9_]+:)?Facturae[\s>][^>]*/.exec(source);
  if (!open) return "";
  const prefix = open[1] ? open[1].slice(0, -1) : "";
  // Read the tag's namespace declarations and pick the prefix's own (no pattern built from the file).
  for (const m of open[0].matchAll(/\sxmlns(?::([A-Za-z0-9_.-]+))?\s*=\s*["']([^"']*)["']/g)) {
    if ((m[1] ?? "") === prefix) return m[2];
  }
  return "";
}

// Spanish NIF/NIE/CIF check: the same code the party VAT check uses (vat.mjs).
function spanishIdOk(id) {
  return inspectPartyVat({ vat_id: `ES${id}` }, "party").length === 0;
}

function checkParty(role, party, path, out) {
  if (!party) return;
  const tax = child(party, "TaxIdentification");
  const residence = txt(tax, "ResidenceTypeCode");
  const raw = txt(tax, "TaxIdentificationNumber").toUpperCase().replace(/[\s.-]/g, "");
  if (!raw) return;
  // A resident's number is a bare NIF; a number with the ES prefix is checked the same way.
  const body = raw.startsWith("ES") && raw.length === 11 ? raw.slice(2) : raw;
  if ((residence === "R" || raw.startsWith("ES")) && /^[0-9A-Z]{9}$/.test(body) && !spanishIdOk(body)) {
    out.push(finding("ES-032", `${role} TaxIdentificationNumber fails the Spanish NIF/NIE/CIF check character.`,
      "Correct the number; a typo here sends the invoice to the wrong taxpayer. This is a check-character test, not a registry lookup.", `${path}/TaxIdentification/TaxIdentificationNumber`));
  } else if (residence === "R" && !/^(ES)?[0-9A-Z]{9}$/.test(raw)) {
    out.push(finding("ES-032", `${role} is marked resident (ResidenceTypeCode R) but its TaxIdentificationNumber is not the nine characters of a Spanish NIF.`,
      "Give the nine-character NIF, or mark a foreign party U (EU resident) or E (outside the EU).", `${path}/TaxIdentification/TaxIdentificationNumber`));
  }
  if (residence === "R" && child(party, "LegalEntity") && child(child(party, "LegalEntity"), "OverseasAddress")) {
    out.push(finding("ES-033", `${role} is marked resident (ResidenceTypeCode R) but has an OverseasAddress.`,
      "Use AddressInSpain for a resident, or correct ResidenceTypeCode.", `${path}/LegalEntity/OverseasAddress`, { severity: "warning" }));
  }
}

const amount = (node, name) => num(node, name, "TotalAmount");
const discountTotal = (block, item, field) => sum(kids(block, item).map((d) => num(d, field) ?? 0));

function checkInvoice(inv, index, ctx, out, skipped) {
  const p = `/Facturae/Invoices/Invoice[${index + 1}]`;
  const header = child(inv, "InvoiceHeader");
  const issue = child(inv, "InvoiceIssueData");
  const totals = child(inv, "InvoiceTotals");
  const items = kids(child(inv, "Items"), "InvoiceLine");

  // Lines: TotalCost = Quantity x UnitPriceWithoutTax; GrossAmount = TotalCost - discounts + charges.
  const grossByLine = [];
  items.forEach((line, i) => {
    const lp = `${p}/Items/InvoiceLine[${i + 1}]`;
    const q = num(line, "Quantity");
    const price = num(line, "UnitPriceWithoutTax");
    const cost = num(line, "TotalCost");
    const gross = num(line, "GrossAmount");
    if (q !== null && price !== null && cost !== null && differs(q * price, cost)) {
      out.push(finding("ES-007", `Line ${i + 1}: TotalCost is not Quantity x UnitPriceWithoutTax.`,
        "Set TotalCost to Quantity times UnitPriceWithoutTax (the field description's own formula).", `${lp}/TotalCost`));
    }
    const disc = discountTotal(child(line, "DiscountsAndRebates"), "Discount", "DiscountAmount");
    const charge = discountTotal(child(line, "Charges"), "Charge", "ChargeAmount");
    if (cost !== null && gross !== null && differs(cost - disc + charge, gross)) {
      out.push(finding("ES-008", `Line ${i + 1}: GrossAmount is not TotalCost less its discounts plus its charges.`,
        "Set GrossAmount to TotalCost - DiscountAmount + ChargeAmount for the line.", `${lp}/GrossAmount`));
    }
    kids(child(line, "DiscountsAndRebates"), "Discount").forEach((d, j) => {
      const rate = num(d, "DiscountRate"); const amt = num(d, "DiscountAmount");
      if (rate !== null && amt !== null && cost !== null && differs(cost * rate / 100, amt)) {
        out.push(finding("ES-034", `Line ${i + 1}, discount ${j + 1}: DiscountAmount is not DiscountRate percent of TotalCost.`,
          "Make the amount match the rate, or drop the rate.", `${lp}/DiscountsAndRebates/Discount[${j + 1}]/DiscountAmount`, { severity: "warning" }));
      }
    });
    if (gross !== null) grossByLine.push(gross);
  });

  if (!totals) return;
  const tp = `${p}/InvoiceTotals`;
  const tga = num(totals, "TotalGrossAmount");
  if (tga !== null && grossByLine.length === items.length && items.length && differs(sum(grossByLine), tga)) {
    out.push(finding("ES-009", "TotalGrossAmount is not the sum of the lines' GrossAmount.",
      "Set TotalGrossAmount to the sum of every InvoiceLine's GrossAmount.", `${tp}/TotalGrossAmount`));
  }
  const gd = discountTotal(child(totals, "GeneralDiscounts"), "Discount", "DiscountAmount");
  const gs = discountTotal(child(totals, "GeneralSurcharges"), "Charge", "ChargeAmount");
  const tgd = num(totals, "TotalGeneralDiscounts");
  const tgs = num(totals, "TotalGeneralSurcharges");
  if (child(totals, "GeneralDiscounts") && (tgd === null || differs(gd, tgd))) {
    out.push(finding("ES-010", tgd === null ? "GeneralDiscounts are listed but TotalGeneralDiscounts is missing." : "TotalGeneralDiscounts is not the sum of the GeneralDiscounts amounts.",
      "Set TotalGeneralDiscounts to the sum of the DiscountAmount values in GeneralDiscounts.", `${tp}/TotalGeneralDiscounts`));
  }
  if (child(totals, "GeneralSurcharges") && (tgs === null || differs(gs, tgs))) {
    out.push(finding("ES-011", tgs === null ? "GeneralSurcharges are listed but TotalGeneralSurcharges is missing." : "TotalGeneralSurcharges is not the sum of the GeneralSurcharges amounts.",
      "Set TotalGeneralSurcharges to the sum of the ChargeAmount values in GeneralSurcharges.", `${tp}/TotalGeneralSurcharges`));
  }
  const tgabt = num(totals, "TotalGrossAmountBeforeTaxes");
  if (tga !== null && tgabt !== null && differs(tga - (tgd ?? 0) + (tgs ?? 0), tgabt)) {
    out.push(finding("ES-012", "TotalGrossAmountBeforeTaxes is not TotalGrossAmount - TotalGeneralDiscounts + TotalGeneralSurcharges.",
      "Recompute TotalGrossAmountBeforeTaxes from the three totals.", `${tp}/TotalGrossAmountBeforeTaxes`));
  }

  // Taxes: each TaxAmount is TaxableBase x TaxRate / 100; TotalTaxOutputs is the sum of cuotas and recargos.
  const outputs = kids(child(inv, "TaxesOutputs"), "Tax");
  let taxSum = 0;
  outputs.forEach((tax, i) => {
    const xp = `${p}/TaxesOutputs/Tax[${i + 1}]`;
    const rate = num(tax, "TaxRate");
    const base = amount(tax, "TaxableBase");
    const due = amount(tax, "TaxAmount");
    const re = num(tax, "EquivalenceSurcharge");
    const reAmt = amount(tax, "EquivalenceSurchargeAmount");
    if (rate !== null && base !== null && due !== null && differs(cents(base * rate / 100), due)) {
      out.push(finding("ES-013", `TaxesOutputs tax ${i + 1}: TaxAmount is not TaxableBase x TaxRate / 100.`,
        "Recompute the cuota from the base and the rate, rounded to the cent.", `${xp}/TaxAmount/TotalAmount`));
    }
    if (re !== null && base !== null && reAmt !== null && differs(cents(base * re / 100), reAmt)) {
      out.push(finding("ES-013", `TaxesOutputs tax ${i + 1}: EquivalenceSurchargeAmount is not TaxableBase x EquivalenceSurcharge / 100.`,
        "Recompute the recargo de equivalencia from the base and its rate.", `${xp}/EquivalenceSurchargeAmount/TotalAmount`));
    }
    if (re !== null && reAmt === null) {
      out.push(finding("ES-013", `TaxesOutputs tax ${i + 1}: an EquivalenceSurcharge rate is given without its EquivalenceSurchargeAmount.`,
        "Add EquivalenceSurchargeAmount, or drop the rate.", `${xp}/EquivalenceSurchargeAmount`));
    }
    taxSum += (due ?? 0) + (reAmt ?? 0);
  });
  const tto = num(totals, "TotalTaxOutputs");
  if (tto !== null && differs(taxSum, tto)) {
    out.push(finding("ES-014", "TotalTaxOutputs is not the sum of the TaxesOutputs cuotas and recargos de equivalencia.",
      "Set TotalTaxOutputs to the sum of every TaxAmount and EquivalenceSurchargeAmount in the invoice's TaxesOutputs.", `${tp}/TotalTaxOutputs`));
  }
  const withheld = kids(child(inv, "TaxesWithheld"), "Tax");
  withheld.forEach((tax, i) => {
    const rate = num(tax, "TaxRate"); const base = amount(tax, "TaxableBase"); const due = amount(tax, "TaxAmount");
    if (rate !== null && base !== null && due !== null && differs(cents(base * rate / 100), due)) {
      out.push(finding("ES-013", `TaxesWithheld tax ${i + 1}: TaxAmount is not TaxableBase x TaxRate / 100.`,
        "Recompute the withheld amount (IRPF, for example) from its base and rate.", `${p}/TaxesWithheld/Tax[${i + 1}]/TaxAmount/TotalAmount`));
    }
  });
  const ttw = num(totals, "TotalTaxesWithheld");
  const withheldSum = sum(withheld.map((t) => amount(t, "TaxAmount") ?? 0));
  if (ttw !== null && differs(withheldSum, ttw)) {
    out.push(finding("ES-015", "TotalTaxesWithheld is not the sum of the TaxesWithheld amounts.",
      "Set TotalTaxesWithheld to the sum of the TaxAmount values in TaxesWithheld (0.00 when nothing is withheld).", `${tp}/TotalTaxesWithheld`));
  }

  // Invoice-level bases against the lines, per tax type and rate, when no general discount or charge moves them.
  if (!child(totals, "GeneralDiscounts") && !child(totals, "GeneralSurcharges")) {
    const group = (taxes) => {
      const m = new Map();
      for (const t of taxes) {
        const key = `${txt(t, "TaxTypeCode")}@${(num(t, "TaxRate") ?? 0).toFixed(2)}`;
        m.set(key, (m.get(key) ?? 0) + (amount(t, "TaxableBase") ?? 0));
      }
      return m;
    };
    const head = group(outputs);
    const lines = group(items.flatMap((l) => kids(child(l, "TaxesOutputs"), "Tax")));
    for (const [key, base] of head) {
      if (lines.has(key) && differs(base, lines.get(key), Math.max(TOLERANCE, 0.005 * items.length))) {
        const [code, rate] = key.split("@");
        out.push(finding("ES-026", `The TaxableBase for tax type ${code} at ${rate}% is not the sum of the lines' bases at that rate.`,
          "Make the invoice-level TaxableBase equal the lines' bases for the same tax and rate.", `${p}/TaxesOutputs`, { severity: "warning" }));
      }
    }
  } else if (outputs.length) {
    skipped.push({ rule: "ES-026", path: `${p}/TaxesOutputs`, reason: "General discounts or charges move the tax bases away from the lines; how they are spread over rates is not modelled." });
  }

  const total = num(totals, "InvoiceTotal");
  if (tgabt !== null && tto !== null && ttw !== null && total !== null && differs(tgabt + tto - ttw, total)) {
    out.push(finding("ES-016", "InvoiceTotal is not TotalGrossAmountBeforeTaxes + TotalTaxOutputs - TotalTaxesWithheld.",
      "Recompute InvoiceTotal from those three totals.", `${tp}/InvoiceTotal`));
  }
  const subsidies = sum(kids(child(totals, "Subsidies"), "Subsidy").map((s) => num(s, "SubsidyAmount") ?? 0));
  const advances = sum(kids(child(totals, "PaymentsOnAccount"), "PaymentOnAccount").map((s) => num(s, "PaymentOnAccountAmount") ?? 0));
  const tpoa = num(totals, "TotalPaymentsOnAccount");
  if (child(totals, "PaymentsOnAccount") && (tpoa === null || differs(advances, tpoa))) {
    out.push(finding("ES-023", tpoa === null ? "PaymentsOnAccount are listed but TotalPaymentsOnAccount is missing." : "TotalPaymentsOnAccount is not the sum of the PaymentOnAccountAmount values.",
      "Set TotalPaymentsOnAccount to the sum of the advances listed.", `${tp}/TotalPaymentsOnAccount`));
  }
  const toa = num(totals, "TotalOutstandingAmount");
  if (total !== null && toa !== null && differs(total - (subsidies + (tpoa ?? advances)), toa)) {
    out.push(finding("ES-017", "TotalOutstandingAmount is not InvoiceTotal - (subsidies + TotalPaymentsOnAccount).",
      "Recompute the total to pay: the invoice total less subsidies and advances already paid.", `${tp}/TotalOutstandingAmount`));
  }
  const reimb = sum(kids(child(totals, "ReimbursableExpenses"), "ReimbursableExpenses").map((r) => num(r, "ReimbursableExpensesAmount") ?? 0));
  const tre = num(totals, "TotalReimbursableExpenses");
  if (child(totals, "ReimbursableExpenses") && (tre === null || differs(reimb, tre))) {
    out.push(finding("ES-025", tre === null ? "ReimbursableExpenses (suplidos) are listed but TotalReimbursableExpenses is missing." : "TotalReimbursableExpenses is not the sum of the ReimbursableExpensesAmount values.",
      "Set TotalReimbursableExpenses to the sum of the suplidos listed.", `${tp}/TotalReimbursableExpenses`));
  }
  const withheldAmounts = num(totals, "AmountsWithheld", "WithholdingAmount") ?? 0;
  const inKind = num(totals, "PaymentInKind", "PaymentInKindAmount") ?? 0;
  const financial = num(totals, "TotalFinancialExpenses") ?? 0;
  const tea = num(totals, "TotalExecutableAmount");
  if (toa !== null && tea !== null && differs(toa - withheldAmounts - inKind + (tre ?? reimb) + financial, tea)) {
    out.push(finding("ES-024", "TotalExecutableAmount is not TotalOutstandingAmount - AmountsWithheld - PaymentInKindAmount + TotalReimbursableExpenses + TotalFinancialExpenses.",
      "Recompute the total to execute (the amount actually to be paid) from those fields.", `${tp}/TotalExecutableAmount`));
  }
  const installments = kids(child(inv, "PaymentDetails"), "Installment");
  if (installments.length && tea !== null && differs(sum(installments.map((x) => num(x, "InstallmentAmount") ?? 0)), tea)) {
    out.push(finding("ES-035", "The PaymentDetails installments do not add up to TotalExecutableAmount.",
      "Make the InstallmentAmount values sum to the total to execute, or explain the difference to the buyer.", `${p}/PaymentDetails`, { severity: "warning" }));
  }

  // Corrective invoices (rectificativas) and summary invoices (recapitulativas).
  const cls = txt(header, "InvoiceClass");
  const corrective = child(header, "Corrective");
  if ((cls === "OR" || cls === "CR") && !corrective) {
    out.push(finding("ES-027", "InvoiceClass marks a corrective invoice (rectificativa) but there is no Corrective block.",
      "Add Corrective with the reason code, the tax period and the correction method of the invoice being corrected.", `${p}/InvoiceHeader/Corrective`));
  }
  if (corrective && cls && cls !== "OR" && cls !== "CR") {
    out.push(finding("ES-027", "A Corrective block is present but InvoiceClass is not OR or CR.",
      "Set InvoiceClass to OR (original rectificativa), or remove the Corrective block.", `${p}/InvoiceHeader/InvoiceClass`));
  }
  if (corrective) {
    const method = txt(corrective, "CorrectionMethod");
    if ((method === "01" || method === "02") && !txt(corrective, "InvoiceNumber")) {
      out.push(finding("ES-028", "CorrectionMethod 01 or 02 needs the number of the invoice being corrected (Corrective/InvoiceNumber).",
        "Add the corrected invoice's number.", `${p}/InvoiceHeader/Corrective/InvoiceNumber`));
    }
    if (ctx.version === "3.2.2" && (method === "01" || method === "02") && !txt(corrective, "InvoiceIssueDate")) {
      out.push(finding("ES-028", "In Facturae 3.2.2, CorrectionMethod 01 or 02 needs the corrected invoice's issue date (Corrective/InvoiceIssueDate).",
        "Add the issue date of the invoice being corrected.", `${p}/InvoiceHeader/Corrective/InvoiceIssueDate`));
    }
    const pair = (codeEl, descEl, codeType, descType) => {
      const codes = ctx.schema.enums[codeType] ?? [];
      const descs = ctx.schema.enums[descType] ?? [];
      const code = txt(corrective, codeEl);
      const desc = txt(corrective, descEl);
      const ci = codes.indexOf(code);
      const di = descs.indexOf(desc);
      if (ci >= 0 && di >= 0 && ci !== di) {
        out.push(finding("ES-029", `${descEl} is not the description the schema pairs with ${codeEl} ${code}.`,
          `Use "${descs[ci]}" for code ${code}, or change the code.`, `${p}/InvoiceHeader/Corrective/${descEl}`));
      }
    };
    pair("ReasonCode", "ReasonDescription", "ReasonCodeType", "ReasonDescriptionType");
    pair("CorrectionMethod", "CorrectionMethodDescription", "CorrectionMethodType", "CorrectionMethodDescriptionType");
  }
  if ((cls === "OC" || cls === "CC") && !child(issue, "InvoicingPeriod")) {
    out.push(finding("ES-030", "A summary invoice (recapitulativa, InvoiceClass OC or CC) needs InvoicingPeriod.",
      "Add InvoicingPeriod with the start and end dates the summary covers.", `${p}/InvoiceIssueData/InvoicingPeriod`));
  }

  // Currency: a foreign-currency invoice needs the exchange rate and the euro equivalents.
  const currency = txt(issue, "InvoiceCurrencyCode");
  const taxCurrency = txt(issue, "TaxCurrencyCode");
  if (currency && taxCurrency && currency !== taxCurrency && !child(issue, "ExchangeRateDetails")) {
    out.push(finding("ES-031", "InvoiceCurrencyCode differs from TaxCurrencyCode but ExchangeRateDetails is missing.",
      "Add ExchangeRateDetails with the ExchangeRate and ExchangeRateDate used.", `${p}/InvoiceIssueData/ExchangeRateDetails`));
  }
  if (currency && currency !== "EUR") {
    const missing = outputs.some((t) => !at(t, "TaxableBase", "EquivalentInEuros") || (child(t, "TaxAmount") && !at(t, "TaxAmount", "EquivalentInEuros")));
    if (missing) {
      out.push(finding("ES-031", "The invoice is not in euros but a tax base or cuota has no EquivalentInEuros.",
        "Give EquivalentInEuros for every TaxableBase and TaxAmount (Art. 10.1 of the invoicing regulation, as the field description cites).", `${p}/TaxesOutputs`));
    }
  }
  if (ctx.batchCurrency && currency && currency !== ctx.batchCurrency) {
    out.push(finding("ES-036", "This invoice's InvoiceCurrencyCode differs from the Batch's InvoiceCurrencyCode.",
      "Use one currency for every invoice in a file, or split the batch.", `${p}/InvoiceIssueData/InvoiceCurrencyCode`));
  }
  const issued = txt(issue, "IssueDate");
  if (/^\d{4}-\d{2}-\d{2}$/.test(issued) && issued > ctx.today) {
    out.push(finding("ES-037", "IssueDate is in the future.",
      "Use the date the invoice is issued; the field description says it may not be later than the electronic signature's date.", `${p}/InvoiceIssueData/IssueDate`, { severity: "warning" }));
  }
  return { total, toa, tea };
}

function madridToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** @returns {{findings: object[], skipped: object[], version: string, signature: object|null}} */
export function checkFacturae(source, { today = madridToday() } = {}) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const findings = [];
  const skipped = [];
  const tree = parseXmlTree(text);
  const root = tree.children.find((c) => c.name === "Facturae");
  if (!root) return { findings: [finding("ES-022", "No Facturae root element was found.", "Check the file is a Facturae invoice.", "/")], skipped, version: "" };
  const namespace = rootNamespace(text);
  const schema = tableForNamespace(namespace);
  const declared = txt(root, "FileHeader", "SchemaVersion");
  const version = schema ? schema.version : declared;
  if (!schema) {
    skipped.push({ rule: "ES-018..022", path: "/Facturae", reason: `The root namespace is not the Facturae ${FACTURAE_VERSIONS.join(" or ")} namespace${/v3\.2\/|3_2\.xml|v3\.[01]/.test(namespace) ? " (an older version)" : ""}, so the schema check did not run.` });
    findings.push(finding("ES-001", `The root namespace is not one this checker knows (Facturae ${FACTURAE_VERSIONS.join(" or ")}).`,
      "Export as Facturae 3.2.2 (namespace http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml), the version FACe documents now.", "/Facturae", { severity: "warning" }));
  } else {
    findings.push(...checkFacturaeSchema(schema, root, text));
    if (declared && declared !== schema.version) {
      findings.push(finding("ES-001", `SchemaVersion says ${declared} but the root namespace is Facturae ${schema.version}'s.`,
        "Make SchemaVersion and the namespace name the same version; hubs read the version from both.", "/Facturae/FileHeader/SchemaVersion"));
    }
  }
  // INV-065 (2026-11-17): a number or date with a no-break space (xmlvalues.mjs).
  findings.push(...xmlValueFindings({ children: [root] }));
  if (findings.some((f) => f.rule === "ES-022")) return { findings, skipped, version };

  const header = child(root, "FileHeader");
  const batch = child(header, "Batch");
  const invoices = kids(child(root, "Invoices"), "Invoice");
  const modality = txt(header, "Modality");
  const count = num(batch, "InvoicesCount");
  if (count !== null && count !== invoices.length) {
    findings.push(finding("ES-003", "Batch InvoicesCount is not the number of Invoice elements in the file.",
      "Set InvoicesCount to the number of invoices the file holds.", "/Facturae/FileHeader/Batch/InvoicesCount"));
  }
  if (modality === "I" && invoices.length !== 1) {
    findings.push(finding("ES-002", "Modality I (individual) files hold exactly one invoice.",
      "Use Modality L (lote) for several invoices, or send one invoice per file.", "/Facturae/FileHeader/Modality"));
  }
  if (modality === "L" && invoices.length < 2) {
    findings.push(finding("ES-002", "Modality L (lote) needs more than one invoice; the field description says InvoicesCount is then always above 1.",
      "Use Modality I for a single invoice.", "/Facturae/FileHeader/Modality"));
  }
  const parties = child(root, "Parties");
  checkParty("Seller", child(parties, "SellerParty"), "/Facturae/Parties/SellerParty", findings);
  checkParty("Buyer", child(parties, "BuyerParty"), "/Facturae/Parties/BuyerParty", findings);

  const ctx = { schema: schema ?? { enums: {} }, version, today, batchCurrency: txt(batch, "InvoiceCurrencyCode") };
  const results = invoices.map((inv, i) => checkInvoice(inv, i, ctx, findings, skipped));
  const batchSum = (key, el, rule, label) => {
    const declaredSum = amount(batch, el);
    if (declaredSum === null || results.some((r) => r[key] === null)) return;
    if (differs(sum(results.map((r) => r[key])), declaredSum)) {
      findings.push(finding(rule, `Batch ${el} is not the sum of the invoices' ${label}.`,
        `Set Batch/${el}/TotalAmount to the sum of every invoice's ${label}.`, `/Facturae/FileHeader/Batch/${el}/TotalAmount`));
    }
  };
  batchSum("total", "TotalInvoicesAmount", "ES-004", "InvoiceTotal");
  batchSum("toa", "TotalOutstandingAmount", "ES-005", "TotalOutstandingAmount");
  batchSum("tea", "TotalExecutableAmount", "ES-006", "TotalExecutableAmount");
  let signature = null;
  if (!child(root, "Signature")) {
    skipped.push({ rule: "signature", path: "/Facturae/Signature", reason: "The file carries no XAdES signature. FACe and most hubs need a signed file; signing happens after this check." });
  } else {
    // ES-SIG-nn: digests, SignatureValue and the XAdES-EPES properties (facturae-signature.mjs).
    const sig = checkFacturaeSignature(text);
    findings.push(...sig.findings);
    skipped.push(...sig.skipped);
    signature = sig.summary;
  }
  return { findings, skipped, version, signature };
  return { findings, skipped, version };
}
