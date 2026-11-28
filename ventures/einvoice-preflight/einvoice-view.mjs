// A readable view of an EN 16931 e-invoice (XRechnung or Peppol UBL, XRechnung CII, the XML in a
// ZUGFeRD / Factur-X PDF), for the person who *receives* one and cannot read XML: every German
// business must be able to receive e-invoices since 1 January 2025 (BMF FAQ). Used by
// xrechnung-anzeigen.html, entirely in the browser.
//
// What it is: a display. It reads the fields as the file states them (amounts are not recomputed,
// codes are shown with their meaning), labels each with its EN 16931 business term (BT-/BG-), and
// escapes every value. What it is not: a check. Whether the totals add up or the file meets the
// XRechnung rules is the checker's job (index.html); the page links there.
//
// parseXmlTree (ubl.mjs) rejects DTDs and entity declarations, so a dropped file cannot expand
// entities; it keeps text raw, and xmlValue decodes character references.
import { parseXmlTree, xmlValue } from "./ubl.mjs";

// ---------- tree helpers (direct children only, so a nested ID never stands in for another) ----------

function kids(node, name) {
  return node ? node.children.filter((c) => c.name === name) : [];
}
function at(node, ...path) {
  let cur = node;
  for (const name of path) {
    cur = kids(cur, name)[0];
    if (!cur) return null;
  }
  return cur;
}
function txt(node, ...path) {
  const n = path.length ? at(node, ...path) : node;
  return n ? xmlValue(n) : "";
}
function attr(node, name, ...path) {
  const n = path.length ? at(node, ...path) : node;
  return (n && n.attrs && n.attrs[name]) || "";
}
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

// ---------- code lists (the codes a German receiver meets most; others are shown as the bare code) ----------

/** UNTDID 1001 document types (BT-3) used under EN 16931 / XRechnung. */
export const DOCUMENT_TYPES = {
  "326": "Teilrechnung",
  "380": "Rechnung",
  "381": "Gutschrift (Rechnungskorrektur)",
  "383": "Belastungsanzeige",
  "384": "Korrigierte Rechnung",
  "386": "Vorauszahlungsrechnung",
  "389": "Selbst ausgestellte Rechnung (Gutschriftsverfahren)",
  "875": "Teilrechnung für Bauleistungen",
  "876": "Teilschlussrechnung für Bauleistungen",
  "877": "Schlussrechnung für Bauleistungen",
};

/** UNTDID 4461 payment means (BT-81). */
export const PAYMENT_MEANS = {
  "1": "Nicht angegeben",
  "10": "Barzahlung",
  "20": "Scheck",
  "30": "Überweisung",
  "31": "Überweisung",
  "42": "Zahlung auf ein Bankkonto",
  "48": "Kartenzahlung",
  "49": "Lastschrift",
  "54": "Kreditkarte",
  "55": "Debitkarte",
  "57": "Dauerauftrag",
  "58": "SEPA-Überweisung",
  "59": "SEPA-Lastschrift",
  "97": "Verrechnung",
  "ZZZ": "Vereinbarte Zahlungsweise",
};

/** UNCL 5305 VAT categories (BT-118, BT-151). */
export const VAT_CATEGORIES = {
  S: "Umsatzsteuer, Regelsatz oder ermäßigt",
  Z: "Nullsatz",
  E: "Steuerbefreit",
  AE: "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)",
  K: "Innergemeinschaftliche Lieferung",
  G: "Ausfuhr außerhalb der EU",
  O: "Nicht steuerbar",
  L: "IGIC (Kanarische Inseln)",
  M: "IPSI (Ceuta und Melilla)",
};

/** UN/ECE Recommendation 20 units (BT-130) common on German invoices. */
export const UNITS = {
  C62: "Stück",
  H87: "Stück",
  EA: "Stück",
  XPP: "Stück",
  HUR: "Std.",
  MIN: "Min.",
  DAY: "Tag(e)",
  WEE: "Woche(n)",
  MON: "Monat(e)",
  ANN: "Jahr(e)",
  KGM: "kg",
  TNE: "t",
  MTR: "m",
  KMT: "km",
  MTK: "m²",
  MTQ: "m³",
  LTR: "l",
  SET: "Satz",
  LS: "pauschal",
  KWH: "kWh",
};

// ---------- reading ----------

function documentRoot(tree) {
  return tree.children[0];
}

/**
 * Read an e-invoice's XML into a display model. Throws an Error with a German message when the
 * file is not an EN 16931 UBL or CII invoice.
 */
export function readInvoiceForView(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (!/<[^>]+>/.test(text)) throw new Error("Die Datei enthält kein XML.");
  const tree = parseXmlTree(text);
  const root = documentRoot(tree);
  if (!root) throw new Error("Die Datei enthält kein XML.");
  if (root.name === "Invoice" || root.name === "CreditNote") return readUbl(root);
  if (root.name === "CrossIndustryInvoice") return readCii(root);
  if (root.name === "CrossIndustryDocument") {
    throw new Error("Das ist eine ZUGFeRD-1.0-Datei (CrossIndustryDocument). Diese Ansicht liest ZUGFeRD ab Version 2, Factur-X und XRechnung.");
  }
  throw new Error(`Das Wurzelelement „${root.name}“ ist weder eine UBL-Rechnung (Invoice, CreditNote) noch eine CII-Rechnung (CrossIndustryInvoice).`);
}

function profileLabel(id) {
  const s = String(id || "").toLowerCase();
  if (!s) return "";
  if (s.includes("xrechnung")) return "XRechnung";
  if (s.includes("peppol")) return "Peppol BIS Billing";
  if (s.includes("factur-x.eu") || s.includes("zugferd")) {
    if (s.includes("minimum")) return "ZUGFeRD / Factur-X MINIMUM";
    if (s.includes("basicwl")) return "ZUGFeRD / Factur-X BASIC WL";
    if (s.includes("basic")) return "ZUGFeRD / Factur-X BASIC";
    if (s.includes("extended")) return "ZUGFeRD / Factur-X EXTENDED";
  }
  if (s.startsWith("urn:cen.eu:en16931:2017")) return "EN 16931";
  return "";
}

// UBL

function ublParty(wrapper) {
  const p = at(wrapper, "Party");
  if (!p) return {};
  let vatId = "";
  let taxNumber = "";
  for (const scheme of kids(p, "PartyTaxScheme")) {
    const id = txt(scheme, "CompanyID");
    const schemeId = txt(scheme, "TaxScheme", "ID").toUpperCase();
    if (schemeId === "VAT" && !vatId) vatId = id;
    else if (id && !taxNumber) taxNumber = id;
  }
  const addr = at(p, "PostalAddress");
  const legal = at(p, "PartyLegalEntity");
  const contact = at(p, "Contact");
  return compact({
    name: txt(legal, "RegistrationName") || txt(p, "PartyName", "Name"),
    tradingName: txt(legal, "RegistrationName") && txt(p, "PartyName", "Name") !== txt(legal, "RegistrationName") ? txt(p, "PartyName", "Name") : "",
    street: txt(addr, "StreetName"),
    street2: txt(addr, "AdditionalStreetName"),
    postcode: txt(addr, "PostalZone"),
    city: txt(addr, "CityName"),
    country: txt(addr, "Country", "IdentificationCode"),
    vatId,
    taxNumber,
    legalId: txt(legal, "CompanyID"),
    endpoint: txt(p, "EndpointID"),
    contact: compact({ name: txt(contact, "Name"), phone: txt(contact, "Telephone"), email: txt(contact, "ElectronicMail") }),
  });
}

function readUbl(root) {
  const credit = root.name === "CreditNote";
  const lineName = credit ? "CreditNoteLine" : "InvoiceLine";
  const qtyName = credit ? "CreditedQuantity" : "InvoicedQuantity";
  const currency = txt(root, "DocumentCurrencyCode");
  const typeCode = txt(root, credit ? "CreditNoteTypeCode" : "InvoiceTypeCode") || (credit ? "381" : "380");

  const lines = kids(root, lineName).map((line) => {
    const item = at(line, "Item");
    const cat = at(item, "ClassifiedTaxCategory");
    const qty = at(line, qtyName);
    return compact({
      id: txt(line, "ID"),
      name: txt(item, "Name"),
      description: txt(item, "Description"),
      sellerItemId: txt(item, "SellersItemIdentification", "ID"),
      note: txt(line, "Note"),
      quantity: qty ? xmlValue(qty) : "",
      unit: attr(qty, "unitCode"),
      price: txt(line, "Price", "PriceAmount"),
      baseQuantity: txt(line, "Price", "BaseQuantity"),
      net: txt(line, "LineExtensionAmount"),
      vatCategory: txt(cat, "ID"),
      vatPercent: txt(cat, "Percent"),
    });
  });

  const allowances = kids(root, "AllowanceCharge").map((ac) => compact({
    kind: /^(true|1)$/i.test(txt(ac, "ChargeIndicator")) ? "charge" : "allowance",
    amount: txt(ac, "Amount"),
    percent: txt(ac, "MultiplierFactorNumeric"),
    reason: txt(ac, "AllowanceChargeReason") || txt(ac, "AllowanceChargeReasonCode"),
    vatCategory: txt(ac, "TaxCategory", "ID"),
    vatPercent: txt(ac, "TaxCategory", "Percent"),
  }));

  // BT-110 is the TaxTotal in the document currency; a second one (BT-111) repeats it in the VAT
  // accounting currency and is shown separately, never added.
  const taxTotals = kids(root, "TaxTotal");
  const inDocCurrency = (tt) => !currency || !attr(tt, "currencyID", "TaxAmount") || attr(tt, "currencyID", "TaxAmount") === currency;
  const mainTax = taxTotals.find((tt) => inDocCurrency(tt) && kids(tt, "TaxSubtotal").length) || taxTotals.find(inDocCurrency) || taxTotals[0];
  const otherTax = taxTotals.find((tt) => tt !== mainTax && !inDocCurrency(tt));
  const taxes = kids(mainTax, "TaxSubtotal").map((st) => compact({
    vatCategory: txt(st, "TaxCategory", "ID"),
    vatPercent: txt(st, "TaxCategory", "Percent"),
    basis: txt(st, "TaxableAmount"),
    amount: txt(st, "TaxAmount"),
    exemption: txt(st, "TaxCategory", "TaxExemptionReason") || txt(st, "TaxCategory", "TaxExemptionReasonCode"),
  }));

  const total = at(root, "LegalMonetaryTotal");
  const means = kids(root, "PaymentMeans");
  const payments = means.map((pm) => compact({
    code: txt(pm, "PaymentMeansCode"),
    reference: txt(pm, "PaymentID"),
    iban: txt(pm, "PayeeFinancialAccount", "ID"),
    accountName: txt(pm, "PayeeFinancialAccount", "Name"),
    bic: txt(pm, "PayeeFinancialAccount", "FinancialInstitutionBranch", "ID"),
    mandate: txt(pm, "PaymentMandate", "ID"),
    debitAccount: txt(pm, "PaymentMandate", "PayerFinancialAccount", "ID"),
    cardNumber: txt(pm, "CardAccount", "PrimaryAccountNumberID"),
  }));
  const period = at(root, "InvoicePeriod");

  return compact({
    syntax: "UBL",
    profile: profileLabel(txt(root, "CustomizationID")),
    profileId: txt(root, "CustomizationID"),
    typeCode,
    number: txt(root, "ID"),
    issueDate: txt(root, "IssueDate"),
    dueDate: txt(root, "DueDate") || (means.map((pm) => txt(pm, "PaymentDueDate")).find(Boolean) || ""),
    deliveryDate: txt(root, "Delivery", "ActualDeliveryDate"),
    period: compact({ start: txt(period, "StartDate"), end: txt(period, "EndDate") }),
    currency,
    buyerReference: txt(root, "BuyerReference"),
    orderReference: txt(root, "OrderReference", "ID"),
    contractReference: txt(root, "ContractDocumentReference", "ID"),
    projectReference: txt(root, "ProjectReference", "ID"),
    precedingInvoice: txt(root, "BillingReference", "InvoiceDocumentReference", "ID"),
    notes: kids(root, "Note").map((n) => xmlValue(n)).filter(Boolean),
    seller: ublParty(at(root, "AccountingSupplierParty")),
    buyer: ublParty(at(root, "AccountingCustomerParty")),
    payee: compact({ name: txt(root, "PayeeParty", "PartyName", "Name") }),
    lines,
    allowances,
    taxes,
    totals: compact({
      lineTotal: txt(total, "LineExtensionAmount"),
      allowanceTotal: txt(total, "AllowanceTotalAmount"),
      chargeTotal: txt(total, "ChargeTotalAmount"),
      taxExclusive: txt(total, "TaxExclusiveAmount"),
      tax: txt(mainTax, "TaxAmount"),
      taxInAccountingCurrency: otherTax ? `${txt(otherTax, "TaxAmount")} ${attr(otherTax, "currencyID", "TaxAmount")}` : "",
      taxInclusive: txt(total, "TaxInclusiveAmount"),
      prepaid: txt(total, "PrepaidAmount"),
      rounding: txt(total, "PayableRoundingAmount"),
      due: txt(total, "PayableAmount"),
    }),
    payments,
    paymentTerms: kids(root, "PaymentTerms").map((t) => txt(t, "Note")).filter(Boolean).join(" "),
  });
}

// CII

function ciiDate(node, ...path) {
  return txt(node, ...path, "DateTimeString");
}

function ciiParty(p) {
  if (!p) return {};
  let vatId = "";
  let taxNumber = "";
  for (const reg of kids(p, "SpecifiedTaxRegistration")) {
    const id = txt(reg, "ID");
    const scheme = attr(reg, "schemeID", "ID").toUpperCase();
    if (scheme === "VA" && !vatId) vatId = id;
    else if (id && !taxNumber) taxNumber = id;
  }
  const addr = at(p, "PostalTradeAddress");
  const legal = at(p, "SpecifiedLegalOrganization");
  const contact = at(p, "DefinedTradeContact");
  return compact({
    name: txt(p, "Name"),
    tradingName: txt(legal, "TradingBusinessName"),
    street: txt(addr, "LineOne"),
    street2: [txt(addr, "LineTwo"), txt(addr, "LineThree")].filter(Boolean).join(", "),
    postcode: txt(addr, "PostcodeCode"),
    city: txt(addr, "CityName"),
    country: txt(addr, "CountryID"),
    vatId,
    taxNumber,
    legalId: txt(legal, "ID"),
    endpoint: txt(p, "URIUniversalCommunication", "URIID"),
    contact: compact({
      name: txt(contact, "PersonName") || txt(contact, "DepartmentName"),
      phone: txt(contact, "TelephoneUniversalCommunication", "CompleteNumber"),
      email: txt(contact, "EmailURIUniversalCommunication", "URIID"),
    }),
  });
}

function readCii(root) {
  const doc = at(root, "ExchangedDocument");
  const tx = at(root, "SupplyChainTradeTransaction");
  const agreement = at(tx, "ApplicableHeaderTradeAgreement");
  const delivery = at(tx, "ApplicableHeaderTradeDelivery");
  const settlement = at(tx, "ApplicableHeaderTradeSettlement");
  const sum = at(settlement, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const currency = txt(settlement, "InvoiceCurrencyCode");
  const profileId = txt(root, "ExchangedDocumentContext", "GuidelineSpecifiedDocumentContextParameter", "ID");

  const lines = kids(tx, "IncludedSupplyChainTradeLineItem").map((li) => {
    const product = at(li, "SpecifiedTradeProduct");
    const lineAgreement = at(li, "SpecifiedLineTradeAgreement");
    const qty = at(li, "SpecifiedLineTradeDelivery", "BilledQuantity");
    const lineSettlement = at(li, "SpecifiedLineTradeSettlement");
    return compact({
      id: txt(li, "AssociatedDocumentLineDocument", "LineID"),
      note: txt(li, "AssociatedDocumentLineDocument", "IncludedNote", "Content"),
      name: txt(product, "Name"),
      description: txt(product, "Description"),
      sellerItemId: txt(product, "SellerAssignedID"),
      quantity: qty ? xmlValue(qty) : "",
      unit: attr(qty, "unitCode"),
      price: txt(lineAgreement, "NetPriceProductTradePrice", "ChargeAmount"),
      baseQuantity: txt(lineAgreement, "NetPriceProductTradePrice", "BasisQuantity"),
      net: txt(lineSettlement, "SpecifiedTradeSettlementLineMonetarySummation", "LineTotalAmount"),
      vatCategory: txt(lineSettlement, "ApplicableTradeTax", "CategoryCode"),
      vatPercent: txt(lineSettlement, "ApplicableTradeTax", "RateApplicablePercent"),
    });
  });

  const allowances = kids(settlement, "SpecifiedTradeAllowanceCharge").map((ac) => compact({
    kind: /^(true|1)$/i.test(txt(ac, "ChargeIndicator", "Indicator")) ? "charge" : "allowance",
    amount: txt(ac, "ActualAmount"),
    percent: txt(ac, "CalculationPercent"),
    reason: txt(ac, "Reason") || txt(ac, "ReasonCode"),
    vatCategory: txt(ac, "CategoryTradeTax", "CategoryCode"),
    vatPercent: txt(ac, "CategoryTradeTax", "RateApplicablePercent"),
  }));

  const taxes = kids(settlement, "ApplicableTradeTax").map((t) => compact({
    vatCategory: txt(t, "CategoryCode"),
    vatPercent: txt(t, "RateApplicablePercent"),
    basis: txt(t, "BasisAmount"),
    amount: txt(t, "CalculatedAmount"),
    exemption: txt(t, "ExemptionReason") || txt(t, "ExemptionReasonCode"),
  }));

  // BT-110 is the TaxTotalAmount in the invoice currency; another one is BT-111.
  const taxAmounts = kids(sum, "TaxTotalAmount");
  const mainTax = taxAmounts.find((n) => !currency || !attr(n, "currencyID") || attr(n, "currencyID") === currency) || taxAmounts[0];
  const otherTax = taxAmounts.find((n) => n !== mainTax);

  const terms = kids(settlement, "SpecifiedTradePaymentTerms");
  const mandate = terms.map((t) => txt(t, "DirectDebitMandateID")).find(Boolean) || "";
  const payments = kids(settlement, "SpecifiedTradeSettlementPaymentMeans").map((pm) => compact({
    code: txt(pm, "TypeCode"),
    reference: txt(settlement, "PaymentReference"),
    iban: txt(pm, "PayeePartyCreditorFinancialAccount", "IBANID") || txt(pm, "PayeePartyCreditorFinancialAccount", "ProprietaryID"),
    accountName: txt(pm, "PayeePartyCreditorFinancialAccount", "AccountName"),
    bic: txt(pm, "PayeeSpecifiedCreditorFinancialInstitution", "BICID"),
    mandate,
    debitAccount: txt(pm, "PayerPartyDebtorFinancialAccount", "IBANID"),
    cardNumber: txt(pm, "ApplicableTradeSettlementFinancialCard", "ID"),
  }));
  const period = at(settlement, "BillingSpecifiedPeriod");

  return compact({
    syntax: "CII",
    profile: profileLabel(profileId),
    profileId,
    typeCode: txt(doc, "TypeCode") || "380",
    number: txt(doc, "ID"),
    issueDate: ciiDate(doc, "IssueDateTime"),
    dueDate: terms.map((t) => ciiDate(t, "DueDateDateTime")).find(Boolean) || "",
    deliveryDate: ciiDate(delivery, "ActualDeliverySupplyChainEvent", "OccurrenceDateTime"),
    period: compact({ start: ciiDate(period, "StartDateTime"), end: ciiDate(period, "EndDateTime") }),
    currency,
    buyerReference: txt(agreement, "BuyerReference"),
    orderReference: txt(agreement, "BuyerOrderReferencedDocument", "IssuerAssignedID"),
    contractReference: txt(agreement, "ContractReferencedDocument", "IssuerAssignedID"),
    projectReference: txt(agreement, "SpecifiedProcuringProject", "ID"),
    precedingInvoice: txt(settlement, "InvoiceReferencedDocument", "IssuerAssignedID"),
    notes: kids(doc, "IncludedNote").map((n) => txt(n, "Content")).filter(Boolean),
    seller: ciiParty(at(agreement, "SellerTradeParty")),
    buyer: ciiParty(at(agreement, "BuyerTradeParty")),
    payee: compact({ name: txt(settlement, "PayeeTradeParty", "Name") }),
    lines,
    allowances,
    taxes,
    totals: compact({
      lineTotal: txt(sum, "LineTotalAmount"),
      allowanceTotal: txt(sum, "AllowanceTotalAmount"),
      chargeTotal: txt(sum, "ChargeTotalAmount"),
      taxExclusive: txt(sum, "TaxBasisTotalAmount"),
      tax: mainTax ? xmlValue(mainTax) : "",
      taxInAccountingCurrency: otherTax ? `${xmlValue(otherTax)} ${attr(otherTax, "currencyID")}` : "",
      taxInclusive: txt(sum, "GrandTotalAmount"),
      prepaid: txt(sum, "TotalPrepaidAmount"),
      rounding: txt(sum, "RoundingAmount"),
      due: txt(sum, "DuePayableAmount"),
    }),
    payments,
    paymentTerms: terms.map((t) => txt(t, "Description")).filter(Boolean).join(" "),
  });
}

// ---------- formatting (strings in, strings out: no floating point touches an amount) ----------

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

/** "1234.5" -> "1.234,5"; anything that is not a plain decimal is returned as written. */
export function formatDecimal(value) {
  const s = String(value ?? "").trim();
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const int = m[2].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${m[1] === "-" ? "−" : ""}${int}${m[3] !== undefined ? `,${m[3]}` : ""}`;
}

/** An amount with two decimals at least, as written otherwise ("38.5" -> "38,50"). */
export function formatAmount(value, currency = "") {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const m = /^([+-]?\d+)(?:\.(\d*))?$/.exec(s);
  const shown = m ? formatDecimal(`${m[1]}.${(m[2] || "").padEnd(2, "0")}`) : s;
  return currency ? `${shown} ${currency === "EUR" ? "€" : currency}` : shown;
}

/** "2026-08-24" or CII format 102 "20260824" -> "24.08.2026"; anything else as written. */
export function formatDate(value) {
  const s = String(value ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}

/** A code list's label for a key, own entries only ("constructor" in a file is not a label). */
function lookup(list, key) {
  const k = String(key ?? "").trim();
  if (Object.hasOwn(list, k)) return list[k];
  if (Object.hasOwn(list, k.toUpperCase())) return list[k.toUpperCase()];
  return "";
}

function codeWithLabel(code, list) {
  if (!code) return "";
  const label = lookup(list, code);
  return label ? `${label} (${code})` : `Code ${code}`;
}

// ---------- rendering ----------

const bt = (id) => ` <span class="bt">${esc(id)}</span>`;

function row(label, id, value) {
  if (value === "" || value === null || value === undefined) return "";
  return `<tr><th scope="row">${esc(label)}${bt(id)}</th><td>${esc(value)}</td></tr>`;
}

function partyBlock(title, id, p) {
  const place = [p.postcode, p.city].filter(Boolean).join(" ");
  const addr = [p.street, p.street2, place, p.country].filter(Boolean);
  const facts = [
    row("USt-IdNr.", title === "Verkäufer" ? "BT-31" : "BT-48", p.vatId),
    row("Steuernummer", "BT-32", title === "Verkäufer" ? p.taxNumber : ""),
    row("Registernummer", title === "Verkäufer" ? "BT-30" : "BT-47", p.legalId),
    row("Elektronische Adresse", title === "Verkäufer" ? "BT-34" : "BT-49", p.endpoint),
    row("Kontakt", title === "Verkäufer" ? "BT-41" : "BT-56", p.contact?.name),
    row("Telefon", title === "Verkäufer" ? "BT-42" : "BT-57", p.contact?.phone),
    row("E-Mail", title === "Verkäufer" ? "BT-43" : "BT-58", p.contact?.email),
  ].join("");
  return `<div class="party"><h3>${esc(title)}${bt(id)}</h3>`
    + `<p class="pname">${esc(p.name || "(kein Name angegeben)")}</p>`
    + (p.tradingName ? `<p>${esc(p.tradingName)}</p>` : "")
    + (addr.length ? `<p>${addr.map(esc).join("<br>")}</p>` : "")
    + (facts ? `<table class="kv">${facts}</table>` : "")
    + "</div>";
}

/**
 * The display model as an HTML fragment (German labels, EN 16931 term numbers beside them).
 * Every value from the file is escaped.
 */
export function invoiceViewHtml(v) {
  const cur = v.currency || "";
  const kind = lookup(DOCUMENT_TYPES, v.typeCode) || "Rechnung";
  const head = [
    row("Rechnungsart", "BT-3", codeWithLabel(v.typeCode, DOCUMENT_TYPES)),
    row("Rechnungsdatum", "BT-2", formatDate(v.issueDate)),
    row("Fällig am", "BT-9", formatDate(v.dueDate)),
    row("Leistungsdatum", "BT-72", formatDate(v.deliveryDate)),
    row("Leistungszeitraum", "BG-14", v.period ? [formatDate(v.period.start), formatDate(v.period.end)].filter(Boolean).join(" bis ") : ""),
    row("Währung", "BT-5", cur),
    row("Käuferreferenz / Leitweg-ID", "BT-10", v.buyerReference),
    row("Bestellnummer", "BT-13", v.orderReference),
    row("Vertragsnummer", "BT-12", v.contractReference),
    row("Projekt", "BT-11", v.projectReference),
    row("Bezug auf Rechnung", "BT-25", v.precedingInvoice),
    row("Format", "BT-24", [v.syntax, v.profile].filter(Boolean).join(", ")),
  ].join("");

  const lines = (v.lines || []).map((l) => {
    const unit = l.unit ? (lookup(UNITS, l.unit) || l.unit) : "";
    const per = l.baseQuantity && l.baseQuantity !== "1" ? ` je ${formatDecimal(l.baseQuantity)}` : "";
    const vat = l.vatPercent !== undefined && l.vatPercent !== "" ? `${formatDecimal(l.vatPercent)} %` : "";
    return "<tr>"
      + `<td>${esc(l.id || "")}</td>`
      + `<td><strong>${esc(l.name || "")}</strong>`
      + (l.description ? `<br><span class="sub">${esc(l.description)}</span>` : "")
      + (l.sellerItemId ? `<br><span class="sub">Art.-Nr. ${esc(l.sellerItemId)}</span>` : "")
      + (l.note ? `<br><span class="sub">${esc(l.note)}</span>` : "")
      + "</td>"
      + `<td class="num">${esc(formatDecimal(l.quantity || ""))}${unit ? ` ${esc(unit)}` : ""}</td>`
      + `<td class="num">${esc(formatAmount(l.price || ""))}${esc(per)}</td>`
      + `<td class="num">${esc(vat)}${l.vatCategory && l.vatCategory !== "S" ? ` <span class="sub">${esc(l.vatCategory)}</span>` : ""}</td>`
      + `<td class="num">${esc(formatAmount(l.net || ""))}</td>`
      + "</tr>";
  }).join("");

  const allowances = (v.allowances || []).map((a) => "<tr>"
    + `<td>${a.kind === "charge" ? "Zuschlag" : "Nachlass"}${bt(a.kind === "charge" ? "BG-21" : "BG-20")}</td>`
    + `<td>${esc(a.reason || "")}${a.percent ? ` (${esc(formatDecimal(a.percent))} %)` : ""}</td>`
    + `<td class="num">${a.vatPercent ? `${esc(formatDecimal(a.vatPercent))} %` : ""}</td>`
    + `<td class="num">${a.kind === "charge" ? "" : "−"}${esc(formatAmount(a.amount || "", cur))}</td>`
    + "</tr>").join("");

  const taxes = (v.taxes || []).map((t) => "<tr>"
    + `<td>${esc(codeWithLabel(t.vatCategory, VAT_CATEGORIES))}${t.exemption ? `<br><span class="sub">Grund: ${esc(t.exemption)}</span>` : ""}</td>`
    + `<td class="num">${t.vatPercent !== undefined ? `${esc(formatDecimal(t.vatPercent))} %` : ""}</td>`
    + `<td class="num">${esc(formatAmount(t.basis || "", cur))}</td>`
    + `<td class="num">${esc(formatAmount(t.amount || "", cur))}</td>`
    + "</tr>").join("");

  const T = v.totals || {};
  const totalRow = (label, id, value, cls = "") => (value ? `<tr${cls ? ` class="${cls}"` : ""}><th scope="row">${esc(label)}${bt(id)}</th><td class="num">${esc(formatAmount(value, cur))}</td></tr>` : "");
  const totals = [
    totalRow("Summe der Positionen (netto)", "BT-106", T.lineTotal),
    totalRow("Summe der Nachlässe", "BT-107", T.allowanceTotal && !/^0+(\.0*)?$/.test(T.allowanceTotal) ? T.allowanceTotal : ""),
    totalRow("Summe der Zuschläge", "BT-108", T.chargeTotal && !/^0+(\.0*)?$/.test(T.chargeTotal) ? T.chargeTotal : ""),
    totalRow("Gesamt netto", "BT-109", T.taxExclusive),
    totalRow("Umsatzsteuer", "BT-110", T.tax),
    T.taxInAccountingCurrency ? row("Umsatzsteuer in Buchungswährung", "BT-111", T.taxInAccountingCurrency) : "",
    totalRow("Gesamt brutto", "BT-112", T.taxInclusive),
    totalRow("Bereits gezahlt", "BT-113", T.prepaid && !/^0+(\.0*)?$/.test(T.prepaid) ? T.prepaid : ""),
    totalRow("Rundung", "BT-114", T.rounding && !/^[+-]?0+(\.0*)?$/.test(T.rounding) ? T.rounding : ""),
    totalRow("Zahlbetrag", "BT-115", T.due, "due"),
  ].join("");

  const payments = (v.payments || []).map((p) => `<table class="kv">${[
    row("Zahlungsart", "BT-81", codeWithLabel(p.code, PAYMENT_MEANS)),
    row("IBAN / Konto", "BT-84", p.iban),
    row("Kontoinhaber", "BT-85", p.accountName),
    row("BIC", "BT-86", p.bic),
    row("Verwendungszweck", "BT-83", p.reference),
    row("Mandatsreferenz", "BT-89", p.mandate),
    row("Belastetes Konto", "BT-91", p.debitAccount),
    row("Karte (letzte Ziffern)", "BT-87", p.cardNumber),
  ].join("")}</table>`).join("");

  const notes = (v.notes || []).map((n) => `<p>${esc(n)}</p>`).join("");

  return `<article class="invoice-view">`
    + `<header class="iv-head"><p class="iv-kind">${esc(kind)}</p><h2>Nr. ${esc(v.number || "(keine Nummer)")}${bt("BT-1")}</h2>`
    + (T.due ? `<p class="iv-due">Zahlbetrag <strong>${esc(formatAmount(T.due, cur))}</strong>${v.dueDate ? `, fällig am ${esc(formatDate(v.dueDate))}` : ""}</p>` : "")
    + "</header>"
    + `<div class="parties">${partyBlock("Verkäufer", "BG-4", v.seller || {})}${partyBlock("Käufer", "BG-7", v.buyer || {})}</div>`
    + (v.payee?.name ? `<p>Zahlungsempfänger${bt("BT-59")}: ${esc(v.payee.name)}</p>` : "")
    + `<h3>Rechnungsangaben</h3><table class="kv">${head}</table>`
    + `<h3>Positionen${bt("BG-25")}</h3><div class="table-wrap"><table class="lines"><thead><tr><th>Pos.</th><th>Bezeichnung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">USt</th><th class="num">Netto</th></tr></thead><tbody>${lines || '<tr><td colspan="6">Keine Positionen in der Datei.</td></tr>'}</tbody></table></div>`
    + (allowances ? `<h3>Nachlässe und Zuschläge auf Belegebene</h3><div class="table-wrap"><table class="lines"><tbody>${allowances}</tbody></table></div>` : "")
    + (taxes ? `<h3>Umsatzsteuer${bt("BG-23")}</h3><div class="table-wrap"><table class="lines"><thead><tr><th>Kategorie</th><th class="num">Satz</th><th class="num">Bemessungsgrundlage</th><th class="num">Steuer</th></tr></thead><tbody>${taxes}</tbody></table></div>` : "")
    + (totals ? `<h3>Summen${bt("BG-22")}</h3><table class="kv totals">${totals}</table>` : "")
    + (payments || v.paymentTerms ? `<h3>Zahlung${bt("BG-16")}</h3>${payments}${v.paymentTerms ? `<p>Zahlungsbedingungen${bt("BT-20")}: ${esc(v.paymentTerms)}</p>` : ""}` : "")
    + (notes ? `<h3>Bemerkungen${bt("BT-22")}</h3>${notes}` : "")
    + `<p class="iv-foot">Angezeigt wie in der Datei angegeben; Beträge sind nicht nachgerechnet. Ob die Rechnung die Regeln erfüllt, zeigt die Prüfung.</p>`
    + "</article>";
}
