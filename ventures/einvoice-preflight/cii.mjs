// Maps a UN/CEFACT CrossIndustryInvoice (XRechnung CII / Factur-X XML)
// into the format-neutral checker shape. Mirrors
// src/einvoice_preflight/formats.py parse_cii_invoice + to_checker_invoice.
// Amounts stay the strings written in the file so the checks convert them
// once. DTD and entity declarations are rejected by parseXmlTree.

import { parseXmlTree } from "./ubl.mjs";

const CII_NS = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";

function descendants(node, name) {
  const found = [];
  const walk = (current) => {
    if (current.name === name) found.push(current);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return found;
}

function firstChild(node, name) {
  if (!node) return null;
  return node.children.find((child) => child.name === name) || null;
}

function textOf(node, name) {
  if (!node) return "";
  const match = descendants(node, name)[0];
  return match ? match.text.trim() : "";
}

function nestedText(node, ...names) {
  let current = node;
  for (const name of names) {
    current = firstChild(current, name);
    if (!current) return "";
  }
  return (current.text || "").trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return "";
}

function isoDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return value;
}

export function looksLikeCii(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  return text.includes("CrossIndustryInvoice") || text.includes(CII_NS);
}

function ciiVatId(party) {
  if (!party) return "";
  for (const registration of descendants(party, "SpecifiedTaxRegistration")) {
    const identifier = firstChild(registration, "ID");
    if (!identifier) continue;
    const scheme = (identifier.attrs && identifier.attrs.schemeID) ? identifier.attrs.schemeID.trim() : "";
    if (scheme.toUpperCase() === "VA") return identifier.text.trim();
  }
  return "";
}

function partyFrom(tradeParty) {
  const vatId = ciiVatId(tradeParty);
  const identifier = firstNonEmpty(
    nestedText(tradeParty, "ID"),
    nestedText(tradeParty, "GlobalID"),
    nestedText(tradeParty, "SpecifiedLegalOrganization", "ID"),
    nestedText(tradeParty, "URIUniversalCommunication", "URIID"),
    vatId,
  );
  const mapped = {
    id: identifier,
    name: nestedText(tradeParty, "Name"),
  };
  if (vatId) mapped.vat_id = vatId;
  const address = firstChild(tradeParty, "PostalTradeAddress");
  if (address) {
    const street = nestedText(address, "LineOne");
    const city = nestedText(address, "CityName");
    const postal = nestedText(address, "PostcodeCode");
    const country = nestedText(address, "CountryID");
    if (street) mapped.street = street;
    if (city) mapped.city = city;
    if (postal) mapped.postal_code = postal;
    if (country) mapped.country = country;
  }
  const contactNode = firstChild(tradeParty, "DefinedTradeContact");
  if (contactNode) {
    const contact = {};
    const cName = firstNonEmpty(nestedText(contactNode, "PersonName"), nestedText(contactNode, "DepartmentName"));
    const phone = nestedText(contactNode, "TelephoneUniversalCommunication", "CompleteNumber");
    const email = nestedText(contactNode, "EmailURIUniversalCommunication", "URIID");
    if (cName) contact.name = cName;
    if (phone) contact.phone = phone;
    if (email) contact.email = email;
    if (Object.keys(contact).length) mapped.contact = contact;
  }
  for (const registration of descendants(tradeParty, "SpecifiedTaxRegistration")) {
    const identifier = firstChild(registration, "ID");
    if (identifier && identifier.attrs && String(identifier.attrs.schemeID || "").trim().toUpperCase() === "FC") {
      mapped.tax_number = identifier.text.trim();
      break;
    }
  }
  return mapped;
}

function parseLine(line) {
  const agreement = firstChild(line, "SpecifiedLineTradeAgreement");
  const delivery = firstChild(line, "SpecifiedLineTradeDelivery");
  const settlement = firstChild(line, "SpecifiedLineTradeSettlement");
  const tax = firstChild(settlement, "ApplicableTradeTax");
  const price = firstChild(agreement, "NetPriceProductTradePrice");
  const mapped = {
    description: firstNonEmpty(
      nestedText(line, "SpecifiedTradeProduct", "Name"),
      nestedText(line, "SpecifiedTradeProduct", "Description"),
    ),
    quantity: nestedText(delivery, "BilledQuantity"),
    unit_price: nestedText(price, "ChargeAmount"),
    tax_percent: nestedText(tax, "RateApplicablePercent"),
    net: nestedText(settlement, "SpecifiedTradeSettlementLineMonetarySummation", "LineTotalAmount"),
  };
  const category = nestedText(tax, "CategoryCode");
  if (category) mapped.tax_category = category;
  return mapped;
}

function vatBreakdown(settlement) {
  if (!settlement) return [];
  const rows = [];
  for (const tax of descendants(settlement, "ApplicableTradeTax")) {
    // Header tax lives directly under ApplicableHeaderTradeSettlement.
    // Line tax uses the same local name, so only take siblings of the
    // header summation / payment means — i.e. children of settlement.
    if (!settlement.children.includes(tax)) continue;
    const row = {
      tax_percent: textOf(tax, "RateApplicablePercent"),
      taxable_amount: textOf(tax, "BasisAmount"),
      tax_amount: textOf(tax, "CalculatedAmount"),
      tax_category: textOf(tax, "CategoryCode"),
      exemption_reason: firstNonEmpty(textOf(tax, "ExemptionReason"), textOf(tax, "ExemptionReasonCode")),
    };
    if (row.tax_percent || row.taxable_amount || row.tax_amount || row.tax_category || row.exemption_reason) {
      rows.push(row);
    }
  }
  return rows;
}

function totalsFrom(settlement) {
  const summation = firstChild(settlement, "SpecifiedTradeSettlementHeaderMonetarySummation");
  return {
    net: textOf(summation, "LineTotalAmount"),
    tax: textOf(summation, "TaxTotalAmount"),
    gross: textOf(summation, "GrandTotalAmount"),
    prepaid: textOf(summation, "TotalPrepaidAmount"),
    payable: textOf(summation, "DuePayableAmount"),
  };
}

function paymentFrom(settlement) {
  const means = firstChild(settlement, "SpecifiedTradeSettlementPaymentMeans");
  const account = firstNonEmpty(
    nestedText(means, "PayeePartyCreditorFinancialAccount", "IBANID"),
    nestedText(means, "PayeePartyCreditorFinancialAccount", "ProprietaryID"),
  );
  const payment = {};
  if (account) payment.iban = account;
  const meansCode = textOf(means, "TypeCode");
  if (meansCode) payment.means = meansCode;
  const remittance = textOf(settlement, "PaymentReference");
  if (remittance) payment.remittance = remittance;
  const termsDays = paymentTermsDays(settlement);
  if (termsDays) payment.terms_days = termsDays;
  return Object.keys(payment).length ? payment : null;
}

function paymentTermsDays(settlement) {
  const terms = firstChild(settlement, "SpecifiedTradePaymentTerms");
  if (!terms) return "";
  const period = firstChild(terms, "SpecifiedPeriod") || terms;
  for (const measure of descendants(period, "DurationMeasure")) {
    const unit = ((measure.attrs && measure.attrs.unitCode) || "").trim().toUpperCase();
    const value = measure.text.trim();
    if (value && (unit === "DAY" || unit === "D")) return value;
  }
  return "";
}

export function parseCiiInvoice(source) {
  const tree = parseXmlTree(source);
  const root = descendants(tree, "CrossIndustryInvoice")[0];
  if (!root) throw new Error("CII document root must be CrossIndustryInvoice");

  const header = firstChild(root, "ExchangedDocument");
  const transaction = firstChild(root, "SupplyChainTradeTransaction");
  const agreement = firstChild(transaction, "ApplicableHeaderTradeAgreement");
  const settlement = firstChild(transaction, "ApplicableHeaderTradeSettlement");
  const typeCode = textOf(header, "TypeCode");
  const breakdown = vatBreakdown(settlement);
  const headerReason = breakdown.find((row) => row.exemption_reason)?.exemption_reason || "";

  const lines = descendants(transaction || { name: "", children: [] }, "IncludedSupplyChainTradeLineItem")
    .map((line) => {
      const mapped = parseLine(line);
      if (headerReason && !mapped.tax_reason) mapped.tax_reason = headerReason;
      return mapped;
    });

  const totals = totalsFrom(settlement);
  const invoice = {
    invoice_number: textOf(header, "ID"),
    issue_date: isoDate(nestedText(header, "IssueDateTime", "DateTimeString") || textOf(header, "DateTimeString")),
    currency: textOf(settlement, "InvoiceCurrencyCode"),
    document_type: typeCode === "381" ? "credit_note" : "invoice",
    supplier: partyFrom(firstChild(agreement, "SellerTradeParty")),
    customer: partyFrom(firstChild(agreement, "BuyerTradeParty")),
    lines,
    totals: {
      net: totals.net,
      tax: totals.tax,
      gross: totals.gross,
    },
  };
  const due = isoDate(nestedText(settlement, "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString")
    || nestedText(settlement, "DueDateDateTime", "DateTimeString"));
  if (due) invoice.due_date = due;
  if (typeCode) invoice.document_code = typeCode;
  const buyerRef = textOf(agreement, "BuyerReference");
  if (buyerRef) invoice.buyer_reference = buyerRef;
  const specification = nestedText(firstChild(root, "ExchangedDocumentContext"), "GuidelineSpecifiedDocumentContextParameter", "ID");
  if (specification) invoice.specification_id = specification;
  if (headerReason) invoice.tax_exemption_reason = headerReason;
  if (totals.prepaid !== "") invoice.totals.prepaid = totals.prepaid;
  if (totals.payable !== "") invoice.totals.payable = totals.payable;

  const taxBreakdown = [];
  for (const row of breakdown) {
    const mapped = {};
    if (row.tax_percent !== "") mapped.tax_percent = row.tax_percent;
    if (row.taxable_amount !== "") mapped.taxable = row.taxable_amount;
    if (row.tax_amount !== "") mapped.tax = row.tax_amount;
    if (row.tax_category) mapped.tax_category = row.tax_category;
    if (Object.keys(mapped).length) taxBreakdown.push(mapped);
  }
  if (taxBreakdown.length) invoice.tax_breakdown = taxBreakdown;

  const payment = paymentFrom(settlement);
  if (payment) invoice.payment = payment;
  return invoice;
}
