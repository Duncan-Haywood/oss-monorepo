// Invoice creator: a plain "draft" (who, what, how much) in, a ready-to-send
// EN 16931 e-invoice out, as UBL 2.1 or UN/CEFACT CII, with the totals and the
// VAT breakdown computed for you. It is the other half of the preflight
// checker: whatever this writes is read straight back through the same readers
// and checks the checker applies, so a draft that would be rejected says so
// before you download it.
//
// Not a certified invoicing system and not tax advice. It writes the common
// B2B/B2G cases (standard, zero, exempt, reverse-charge, intra-EU, export, and
// out-of-scope VAT; invoices and credit notes). It does not sign, archive,
// transmit, or look up a Leitweg-ID or Peppol participant.
//
// Zero dependencies. Runs in Node 20+ and in the browser (create.html).

import { roundHalfUpToCents } from "./checks.mjs";

export const PROFILES = {
  xrechnung: {
    label: "XRechnung 3.0 (Germany, B2G and B2B)",
    customization: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
  },
  peppol: {
    label: "Peppol BIS Billing 3.0",
    customization: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
    profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
  },
  en16931: {
    label: "EN 16931 core",
    customization: "urn:cen.eu:en16931:2017",
    profileId: "",
  },
};

const NEEDS_REASON = new Set(["E", "AE", "K", "G", "O"]);
const CATEGORIES = new Set(["S", "Z", ...NEEDS_REASON]);
const UNIT_CODES = new Set(["C62", "HUR", "DAY", "MON", "KGM", "LTR", "MTR", "MTK", "KMT", "WEE", "ANN", "SET", "PCE"]);
const UNIT_ALIASES = {
  piece: "C62", pieces: "C62", pcs: "C62", unit: "C62", units: "C62", item: "C62",
  hour: "HUR", hours: "HUR", h: "HUR", hr: "HUR",
  day: "DAY", days: "DAY", month: "MON", months: "MON", week: "WEE", weeks: "WEE", year: "ANN",
  kg: "KGM", l: "LTR", m: "MTR", m2: "MTK", km: "KMT", set: "SET", flat: "C62", "flat rate": "C62",
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const text = (value) => (typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim());
const cents = (value) => Math.round(roundHalfUpToCents(value) * 100);
const fixed = (centsValue) => (centsValue / 100).toFixed(2);

function num(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dateOk(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function unitCode(raw) {
  const t = text(raw);
  if (!t) return "C62";
  if (UNIT_CODES.has(t.toUpperCase())) return t.toUpperCase();
  return UNIT_ALIASES[t.toLowerCase()] || "";
}

function normalizeParty(raw, role) {
  const p = raw && typeof raw === "object" ? raw : {};
  const endpoint = p.endpoint && typeof p.endpoint === "object" ? p.endpoint : null;
  const contact = p.contact && typeof p.contact === "object" ? p.contact : {};
  return {
    role,
    name: text(p.name),
    street: text(p.street),
    street2: text(p.street2),
    city: text(p.city),
    postal_code: text(p.postal_code),
    country: text(p.country).toUpperCase(),
    vat_id: text(p.vat_id).replace(/\s+/g, "").toUpperCase(),
    tax_number: text(p.tax_number),
    company_id: text(p.company_id),
    endpoint: endpoint && text(endpoint.id) ? { scheme: text(endpoint.scheme), id: text(endpoint.id) } : null,
    contact: { name: text(contact.name), phone: text(contact.phone), email: text(contact.email) },
  };
}

/** Validate and normalize a draft; compute every amount. Throws nothing:
 *  problems come back as `errors` (cannot write a usable document) and
 *  `warnings` (writable, but the chosen profile or a receiver will want more). */
export function buildInvoice(draft, { profile = "xrechnung" } = {}) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  const d = draft && typeof draft === "object" ? draft : {};
  if (!PROFILES[profile]) err("profile", `Unknown profile "${profile}". Use xrechnung, peppol or en16931.`);

  const kind = /credit/i.test(text(d.document_type)) ? "credit_note" : "invoice";
  const currency = (text(d.currency) || "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) err("currency", "Currency must be a 3-letter ISO 4217 code such as EUR.");
  const number = text(d.number);
  if (!number) err("number", "Invoice number is required.");
  const issue = text(d.issue_date);
  if (!dateOk(issue)) err("issue_date", "Issue date must be a real date as YYYY-MM-DD.");
  const due = text(d.due_date);
  if (due && !dateOk(due)) err("due_date", "Due date must be a real date as YYYY-MM-DD.");
  if (due && dateOk(due) && dateOk(issue) && due < issue) warn("due_date", "Due date is before the issue date.");

  const seller = normalizeParty(d.seller, "seller");
  const buyer = normalizeParty(d.buyer, "buyer");
  for (const p of [seller, buyer]) {
    const path = p.role;
    if (!p.name) err(`${path}.name`, `The ${p.role}'s name is required.`);
    if (!/^[A-Z]{2}$/.test(p.country)) err(`${path}.country`, `The ${p.role}'s country must be a 2-letter ISO code such as DE.`);
  }
  if (seller.name && !seller.city) err("seller.city", "The seller's city is required.");
  if (seller.name && !seller.vat_id && !seller.tax_number) {
    err("seller.vat_id", "The seller needs a VAT ID or a national tax number (EN 16931 rule BR-CO-9 / BT-31 or BT-32).");
  }
  if (seller.vat_id && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(seller.vat_id)) {
    err("seller.vat_id", "VAT ID should start with a 2-letter country prefix, e.g. DE136695976.");
  }

  if (profile === "xrechnung") {
    if (!text(d.buyer_reference)) {
      warn("buyer_reference", "XRechnung requires a buyer reference (BT-10): the Leitweg-ID for a public body, or the customer's own routing reference.");
    }
    const c = seller.contact;
    if (!c.name || !c.phone || !c.email) {
      warn("seller.contact", "XRechnung requires a seller contact with name, phone and email (BR-DE-2, -5, -6, -7).");
    }
    if (!seller.street || !seller.postal_code) warn("seller.street", "XRechnung requires the seller's street and postal code (BR-DE-3, BR-DE-4).");
    if (!text(d.payment && d.payment.iban) && !(d.payment && d.payment.means)) {
      warn("payment", "XRechnung requires payment instructions (BR-DE-1): add an IBAN or a payment means code.");
    }
  }
  if (profile === "peppol" && !text(d.buyer_reference) && !text(d.order_reference)) {
    warn("buyer_reference", "Peppol BIS requires a buyer reference or an order reference (PEPPOL-EN16931-R003).");
  }
  if (profile !== "en16931" && !seller.endpoint) {
    warn("seller.endpoint", "Peppol and XRechnung require the seller's electronic address (BT-34), e.g. {\"scheme\":\"EM\",\"id\":\"billing@you.example\"}.");
  }
  if (profile !== "en16931" && !buyer.endpoint) {
    warn("buyer.endpoint", "Peppol and XRechnung require the buyer's electronic address (BT-49), e.g. {\"scheme\":\"EM\",\"id\":\"ap@them.example\"}.");
  }

  const rawLines = Array.isArray(d.lines) ? d.lines : [];
  if (!rawLines.length) err("lines", "At least one line is required.");

  const lines = [];
  rawLines.forEach((raw, i) => {
    const path = `lines[${i}]`;
    const l = raw && typeof raw === "object" ? raw : {};
    const description = text(l.description);
    if (!description) err(`${path}.description`, "Line description is required.");
    const quantity = num(l.quantity ?? 1);
    if (quantity === null || quantity === 0) err(`${path}.quantity`, "Quantity must be a non-zero number.");
    const price = num(l.unit_price);
    if (price === null || price < 0) err(`${path}.unit_price`, "Unit price must be a number, 0 or more (use a credit note for refunds).");
    const unit = unitCode(l.unit);
    if (!unit) err(`${path}.unit`, `Unknown unit "${text(l.unit)}". Use a UN/ECE code (C62 piece, HUR hour, DAY, MON, KGM...) or hours/days/pieces.`);
    const percent = num(l.tax_percent ?? 0);
    if (percent === null || percent < 0 || percent > 100) err(`${path}.tax_percent`, "VAT percent must be a number from 0 to 100.");
    let category = text(l.tax_category).toUpperCase();
    if (!category) category = percent > 0 ? "S" : "Z";
    if (!CATEGORIES.has(category)) err(`${path}.tax_category`, `VAT category must be one of ${[...CATEGORIES].join(", ")}.`);
    if (category === "S" && percent === 0) err(`${path}.tax_percent`, "Standard-rated (S) needs a rate above 0. For 0% pick Z, E, AE, K, G or O.");
    if (category !== "S" && percent > 0) err(`${path}.tax_percent`, `Category ${category} is a 0% category; set tax_percent to 0.`);
    const reason = text(l.tax_reason);
    if (NEEDS_REASON.has(category) && !reason) {
      err(`${path}.tax_reason`, `Category ${category} needs an exemption reason, e.g. "Reverse charge" (AE), "Intra-community supply" (K), "Kleinunternehmer § 19 UStG" (E).`);
    }
    if (quantity === null || price === null || percent === null) return;
    const net = cents(quantity * price);
    lines.push({
      id: String(i + 1), description, quantity, unit, unit_price: price, net,
      category, percent, reason, note: text(l.note),
    });
  });

  // Group into VAT breakdown rows by (category, percent): EN 16931 BG-23.
  const groups = new Map();
  for (const l of lines) {
    const key = `${l.category}|${l.percent}`;
    const g = groups.get(key) || { category: l.category, percent: l.percent, reason: "", taxable: 0, tax: 0 };
    g.taxable += l.net;
    if (l.reason && !g.reason) g.reason = l.reason;
    groups.set(key, g);
  }
  const breakdown = [...groups.values()].map((g) => ({
    ...g,
    tax: g.category === "S" ? cents((g.taxable / 100) * (g.percent / 100)) : 0,
  }));

  const netTotal = lines.reduce((s, l) => s + l.net, 0);
  const taxTotal = breakdown.reduce((s, g) => s + g.tax, 0);
  const gross = netTotal + taxTotal;
  const prepaidNum = num(d.prepaid ?? 0);
  if (prepaidNum === null || prepaidNum < 0) err("prepaid", "Prepaid amount must be a number, 0 or more.");
  const prepaid = cents(prepaidNum || 0);
  if (prepaid > gross) warn("prepaid", "Prepaid amount is larger than the invoice total.");
  const due_amount = gross - prepaid;

  if (kind === "credit_note" && !text(d.original_invoice)) {
    warn("original_invoice", "A credit note should name the invoice it corrects (BT-25).");
  }
  const period = d.period && typeof d.period === "object" ? d.period : null;
  if (period && (period.start || period.end)) {
    if ((period.start && !dateOk(text(period.start))) || (period.end && !dateOk(text(period.end)))) {
      err("period", "Period start and end must be real dates as YYYY-MM-DD.");
    } else if (period.start && period.end && text(period.end) < text(period.start)) {
      err("period", "Period end is before its start.");
    }
  }

  const pay = d.payment && typeof d.payment === "object" ? d.payment : {};
  const iban = text(pay.iban).replace(/\s+/g, "").toUpperCase();
  const payment = {
    means: text(pay.means) || (iban ? "58" : ""),
    iban,
    bic: text(pay.bic).replace(/\s+/g, "").toUpperCase(),
    account_name: text(pay.account_name),
    reference: text(pay.reference) || (iban ? number : ""),
    terms: text(d.terms) || (text(pay.terms)),
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    doc: {
      profile, kind, number, issue_date: issue, due_date: due, currency,
      buyer_reference: text(d.buyer_reference), order_reference: text(d.order_reference),
      original_invoice: text(d.original_invoice), note: text(d.note),
      period: period && (period.start || period.end) ? { start: text(period.start), end: text(period.end) } : null,
      seller, buyer, lines, breakdown, payment,
      totals: { net: netTotal, tax: taxTotal, gross, prepaid, due: due_amount },
    },
  };
}

// ---------------------------------------------------------------- UBL 2.1

function ublParty(p) {
  const x = [];
  if (p.endpoint) x.push(`      <cbc:EndpointID schemeID="${esc(p.endpoint.scheme)}">${esc(p.endpoint.id)}</cbc:EndpointID>`);
  if (p.company_id) x.push(`      <cac:PartyIdentification><cbc:ID>${esc(p.company_id)}</cbc:ID></cac:PartyIdentification>`);
  x.push(`      <cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>`);
  const addr = [];
  if (p.street) addr.push(`        <cbc:StreetName>${esc(p.street)}</cbc:StreetName>`);
  if (p.street2) addr.push(`        <cbc:AdditionalStreetName>${esc(p.street2)}</cbc:AdditionalStreetName>`);
  if (p.city) addr.push(`        <cbc:CityName>${esc(p.city)}</cbc:CityName>`);
  if (p.postal_code) addr.push(`        <cbc:PostalZone>${esc(p.postal_code)}</cbc:PostalZone>`);
  addr.push(`        <cac:Country><cbc:IdentificationCode>${esc(p.country)}</cbc:IdentificationCode></cac:Country>`);
  x.push(`      <cac:PostalAddress>\n${addr.join("\n")}\n      </cac:PostalAddress>`);
  if (p.vat_id) {
    x.push(`      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(p.vat_id)}</cbc:CompanyID>\n        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n      </cac:PartyTaxScheme>`);
  }
  if (p.tax_number) {
    x.push(`      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(p.tax_number)}</cbc:CompanyID>\n        <cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme>\n      </cac:PartyTaxScheme>`);
  }
  x.push(`      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity>`);
  const c = p.contact;
  if (c.name || c.phone || c.email) {
    const parts = [];
    if (c.name) parts.push(`        <cbc:Name>${esc(c.name)}</cbc:Name>`);
    if (c.phone) parts.push(`        <cbc:Telephone>${esc(c.phone)}</cbc:Telephone>`);
    if (c.email) parts.push(`        <cbc:ElectronicMail>${esc(c.email)}</cbc:ElectronicMail>`);
    x.push(`      <cac:Contact>\n${parts.join("\n")}\n      </cac:Contact>`);
  }
  return x.join("\n");
}

const amt = (name, value, cur, indent = "    ") => `${indent}<cbc:${name} currencyID="${esc(cur)}">${fixed(value)}</cbc:${name}>`;

function taxCategoryXml(category, percent, reason, indent) {
  const lines = [`${indent}<cac:TaxCategory>`, `${indent}  <cbc:ID>${category}</cbc:ID>`, `${indent}  <cbc:Percent>${percent}</cbc:Percent>`];
  if (reason) lines.push(`${indent}  <cbc:TaxExemptionReason>${esc(reason)}</cbc:TaxExemptionReason>`);
  lines.push(`${indent}  <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`, `${indent}</cac:TaxCategory>`);
  return lines.join("\n");
}

export function toUbl(doc) {
  const credit = doc.kind === "credit_note";
  const root = credit ? "CreditNote" : "Invoice";
  const prof = PROFILES[doc.profile];
  const cur = doc.currency;
  const o = [];
  o.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  o.push(`<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"`);
  o.push(`    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`);
  o.push(`    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`);
  o.push(`  <cbc:CustomizationID>${esc(prof.customization)}</cbc:CustomizationID>`);
  if (prof.profileId) o.push(`  <cbc:ProfileID>${esc(prof.profileId)}</cbc:ProfileID>`);
  o.push(`  <cbc:ID>${esc(doc.number)}</cbc:ID>`);
  o.push(`  <cbc:IssueDate>${doc.issue_date}</cbc:IssueDate>`);
  if (!credit && doc.due_date) o.push(`  <cbc:DueDate>${doc.due_date}</cbc:DueDate>`);
  o.push(`  <cbc:${credit ? "CreditNoteTypeCode>381</cbc:CreditNoteTypeCode" : "InvoiceTypeCode>380</cbc:InvoiceTypeCode"}>`);
  if (doc.note) o.push(`  <cbc:Note>${esc(doc.note)}</cbc:Note>`);
  o.push(`  <cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>`);
  if (doc.buyer_reference) o.push(`  <cbc:BuyerReference>${esc(doc.buyer_reference)}</cbc:BuyerReference>`);
  if (doc.period) {
    o.push(`  <cac:InvoicePeriod>`);
    if (doc.period.start) o.push(`    <cbc:StartDate>${doc.period.start}</cbc:StartDate>`);
    if (doc.period.end) o.push(`    <cbc:EndDate>${doc.period.end}</cbc:EndDate>`);
    o.push(`  </cac:InvoicePeriod>`);
  }
  if (doc.order_reference) o.push(`  <cac:OrderReference><cbc:ID>${esc(doc.order_reference)}</cbc:ID></cac:OrderReference>`);
  if (doc.original_invoice) {
    o.push(`  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(doc.original_invoice)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`);
  }
  o.push(`  <cac:AccountingSupplierParty>\n    <cac:Party>\n${ublParty(doc.seller)}\n    </cac:Party>\n  </cac:AccountingSupplierParty>`);
  o.push(`  <cac:AccountingCustomerParty>\n    <cac:Party>\n${ublParty(doc.buyer)}\n    </cac:Party>\n  </cac:AccountingCustomerParty>`);

  const p = doc.payment;
  if (p.means) {
    o.push(`  <cac:PaymentMeans>`);
    o.push(`    <cbc:PaymentMeansCode>${esc(p.means)}</cbc:PaymentMeansCode>`);
    if (p.reference) o.push(`    <cbc:PaymentID>${esc(p.reference)}</cbc:PaymentID>`);
    if (p.iban) {
      o.push(`    <cac:PayeeFinancialAccount>`);
      o.push(`      <cbc:ID>${esc(p.iban)}</cbc:ID>`);
      if (p.account_name) o.push(`      <cbc:Name>${esc(p.account_name)}</cbc:Name>`);
      if (p.bic) o.push(`      <cac:FinancialInstitutionBranch><cbc:ID>${esc(p.bic)}</cbc:ID></cac:FinancialInstitutionBranch>`);
      o.push(`    </cac:PayeeFinancialAccount>`);
    }
    o.push(`  </cac:PaymentMeans>`);
  }
  if (p.terms) o.push(`  <cac:PaymentTerms><cbc:Note>${esc(p.terms)}</cbc:Note></cac:PaymentTerms>`);

  o.push(`  <cac:TaxTotal>`);
  o.push(amt("TaxAmount", doc.totals.tax, cur));
  for (const g of doc.breakdown) {
    o.push(`    <cac:TaxSubtotal>`);
    o.push(amt("TaxableAmount", g.taxable, cur, "      "));
    o.push(amt("TaxAmount", g.tax, cur, "      "));
    o.push(taxCategoryXml(g.category, g.percent, g.reason, "      "));
    o.push(`    </cac:TaxSubtotal>`);
  }
  o.push(`  </cac:TaxTotal>`);

  const t = doc.totals;
  o.push(`  <cac:LegalMonetaryTotal>`);
  o.push(amt("LineExtensionAmount", t.net, cur));
  o.push(amt("TaxExclusiveAmount", t.net, cur));
  o.push(amt("TaxInclusiveAmount", t.gross, cur));
  if (t.prepaid) o.push(amt("PrepaidAmount", t.prepaid, cur));
  o.push(amt("PayableAmount", t.due, cur));
  o.push(`  </cac:LegalMonetaryTotal>`);

  for (const l of doc.lines) {
    const qtyTag = credit ? "CreditedQuantity" : "InvoicedQuantity";
    o.push(`  <cac:${credit ? "CreditNoteLine" : "InvoiceLine"}>`);
    o.push(`    <cbc:ID>${l.id}</cbc:ID>`);
    if (l.note) o.push(`    <cbc:Note>${esc(l.note)}</cbc:Note>`);
    o.push(`    <cbc:${qtyTag} unitCode="${l.unit}">${l.quantity}</cbc:${qtyTag}>`);
    o.push(amt("LineExtensionAmount", l.net, cur));
    o.push(`    <cac:Item>`);
    o.push(`      <cbc:Name>${esc(l.description)}</cbc:Name>`);
    o.push(`      <cac:ClassifiedTaxCategory>`);
    o.push(`        <cbc:ID>${l.category}</cbc:ID>`);
    o.push(`        <cbc:Percent>${l.percent}</cbc:Percent>`);
    o.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`);
    o.push(`      </cac:ClassifiedTaxCategory>`);
    o.push(`    </cac:Item>`);
    o.push(`    <cac:Price><cbc:PriceAmount currencyID="${esc(cur)}">${l.unit_price}</cbc:PriceAmount></cac:Price>`);
    o.push(`  </cac:${credit ? "CreditNoteLine" : "InvoiceLine"}>`);
  }
  o.push(`</${root}>`);
  return o.join("\n") + "\n";
}

// ---------------------------------------------------------------- CII

const ciiDate = (iso) => `      <udt:DateTimeString format="102">${iso.replace(/-/g, "")}</udt:DateTimeString>`;

function ciiParty(tag, p) {
  const o = [`      <ram:${tag}>`];
  if (p.company_id) o.push(`        <ram:ID>${esc(p.company_id)}</ram:ID>`);
  o.push(`        <ram:Name>${esc(p.name)}</ram:Name>`);
  const c = p.contact;
  if (c.name || c.phone || c.email) {
    o.push(`        <ram:DefinedTradeContact>`);
    if (c.name) o.push(`          <ram:PersonName>${esc(c.name)}</ram:PersonName>`);
    if (c.phone) o.push(`          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(c.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>`);
    if (c.email) o.push(`          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(c.email)}</ram:URIID></ram:EmailURIUniversalCommunication>`);
    o.push(`        </ram:DefinedTradeContact>`);
  }
  o.push(`        <ram:PostalTradeAddress>`);
  if (p.postal_code) o.push(`          <ram:PostcodeCode>${esc(p.postal_code)}</ram:PostcodeCode>`);
  if (p.street) o.push(`          <ram:LineOne>${esc(p.street)}</ram:LineOne>`);
  if (p.street2) o.push(`          <ram:LineTwo>${esc(p.street2)}</ram:LineTwo>`);
  if (p.city) o.push(`          <ram:CityName>${esc(p.city)}</ram:CityName>`);
  o.push(`          <ram:CountryID>${esc(p.country)}</ram:CountryID>`);
  o.push(`        </ram:PostalTradeAddress>`);
  if (p.endpoint) o.push(`        <ram:URIUniversalCommunication><ram:URIID schemeID="${esc(p.endpoint.scheme)}">${esc(p.endpoint.id)}</ram:URIID></ram:URIUniversalCommunication>`);
  if (p.vat_id) o.push(`        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vat_id)}</ram:ID></ram:SpecifiedTaxRegistration>`);
  if (p.tax_number) o.push(`        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.tax_number)}</ram:ID></ram:SpecifiedTaxRegistration>`);
  o.push(`      </ram:${tag}>`);
  return o.join("\n");
}

export function toCii(doc) {
  const prof = PROFILES[doc.profile];
  const cur = doc.currency;
  const o = [];
  o.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  o.push(`<rsm:CrossIndustryInvoice`);
  o.push(`    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"`);
  o.push(`    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"`);
  o.push(`    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`);
  o.push(`  <rsm:ExchangedDocumentContext>`);
  if (prof.profileId) o.push(`    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${esc(prof.profileId)}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>`);
  o.push(`    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${esc(prof.customization)}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>`);
  o.push(`  </rsm:ExchangedDocumentContext>`);
  o.push(`  <rsm:ExchangedDocument>`);
  o.push(`    <ram:ID>${esc(doc.number)}</ram:ID>`);
  o.push(`    <ram:TypeCode>${doc.kind === "credit_note" ? 381 : 380}</ram:TypeCode>`);
  o.push(`    <ram:IssueDateTime>\n${ciiDate(doc.issue_date)}\n    </ram:IssueDateTime>`);
  if (doc.note) o.push(`    <ram:IncludedNote><ram:Content>${esc(doc.note)}</ram:Content></ram:IncludedNote>`);
  o.push(`  </rsm:ExchangedDocument>`);
  o.push(`  <rsm:SupplyChainTradeTransaction>`);
  for (const l of doc.lines) {
    o.push(`    <ram:IncludedSupplyChainTradeLineItem>`);
    o.push(`      <ram:AssociatedDocumentLineDocument><ram:LineID>${l.id}</ram:LineID></ram:AssociatedDocumentLineDocument>`);
    o.push(`      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.description)}</ram:Name></ram:SpecifiedTradeProduct>`);
    o.push(`      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l.unit_price}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`);
    o.push(`      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${l.unit}">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`);
    o.push(`      <ram:SpecifiedLineTradeSettlement>`);
    o.push(`        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.category}</ram:CategoryCode><ram:RateApplicablePercent>${l.percent}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`);
    o.push(`        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${fixed(l.net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`);
    o.push(`      </ram:SpecifiedLineTradeSettlement>`);
    o.push(`    </ram:IncludedSupplyChainTradeLineItem>`);
  }
  o.push(`    <ram:ApplicableHeaderTradeAgreement>`);
  if (doc.buyer_reference) o.push(`      <ram:BuyerReference>${esc(doc.buyer_reference)}</ram:BuyerReference>`);
  o.push(ciiParty("SellerTradeParty", doc.seller));
  o.push(ciiParty("BuyerTradeParty", doc.buyer));
  if (doc.order_reference) o.push(`      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(doc.order_reference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>`);
  o.push(`    </ram:ApplicableHeaderTradeAgreement>`);
  o.push(`    <ram:ApplicableHeaderTradeDelivery/>`);
  o.push(`    <ram:ApplicableHeaderTradeSettlement>`);
  const p = doc.payment;
  if (p.reference) o.push(`      <ram:PaymentReference>${esc(p.reference)}</ram:PaymentReference>`);
  o.push(`      <ram:InvoiceCurrencyCode>${esc(cur)}</ram:InvoiceCurrencyCode>`);
  if (p.means) {
    o.push(`      <ram:SpecifiedTradeSettlementPaymentMeans>`);
    o.push(`        <ram:TypeCode>${esc(p.means)}</ram:TypeCode>`);
    if (p.iban) {
      o.push(`        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(p.iban)}</ram:IBANID>${p.account_name ? `<ram:AccountName>${esc(p.account_name)}</ram:AccountName>` : ""}</ram:PayeePartyCreditorFinancialAccount>`);
      if (p.bic) o.push(`        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(p.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>`);
    }
    o.push(`      </ram:SpecifiedTradeSettlementPaymentMeans>`);
  }
  for (const g of doc.breakdown) {
    o.push(`      <ram:ApplicableTradeTax>`);
    o.push(`        <ram:CalculatedAmount>${fixed(g.tax)}</ram:CalculatedAmount>`);
    o.push(`        <ram:TypeCode>VAT</ram:TypeCode>`);
    if (g.reason) o.push(`        <ram:ExemptionReason>${esc(g.reason)}</ram:ExemptionReason>`);
    o.push(`        <ram:BasisAmount>${fixed(g.taxable)}</ram:BasisAmount>`);
    o.push(`        <ram:CategoryCode>${g.category}</ram:CategoryCode>`);
    o.push(`        <ram:RateApplicablePercent>${g.percent}</ram:RateApplicablePercent>`);
    o.push(`      </ram:ApplicableTradeTax>`);
  }
  if (doc.period) {
    o.push(`      <ram:BillingSpecifiedPeriod>`);
    if (doc.period.start) o.push(`        <ram:StartDateTime>\n  ${ciiDate(doc.period.start)}\n        </ram:StartDateTime>`);
    if (doc.period.end) o.push(`        <ram:EndDateTime>\n  ${ciiDate(doc.period.end)}\n        </ram:EndDateTime>`);
    o.push(`      </ram:BillingSpecifiedPeriod>`);
  }
  if (p.terms || (doc.kind !== "credit_note" && doc.due_date)) {
    o.push(`      <ram:SpecifiedTradePaymentTerms>`);
    if (p.terms) o.push(`        <ram:Description>${esc(p.terms)}</ram:Description>`);
    if (doc.kind !== "credit_note" && doc.due_date) o.push(`        <ram:DueDateDateTime>\n  ${ciiDate(doc.due_date)}\n        </ram:DueDateDateTime>`);
    o.push(`      </ram:SpecifiedTradePaymentTerms>`);
  }
  const t = doc.totals;
  o.push(`      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>`);
  o.push(`        <ram:LineTotalAmount>${fixed(t.net)}</ram:LineTotalAmount>`);
  o.push(`        <ram:TaxBasisTotalAmount>${fixed(t.net)}</ram:TaxBasisTotalAmount>`);
  o.push(`        <ram:TaxTotalAmount currencyID="${esc(cur)}">${fixed(t.tax)}</ram:TaxTotalAmount>`);
  o.push(`        <ram:GrandTotalAmount>${fixed(t.gross)}</ram:GrandTotalAmount>`);
  if (t.prepaid) o.push(`        <ram:TotalPrepaidAmount>${fixed(t.prepaid)}</ram:TotalPrepaidAmount>`);
  o.push(`        <ram:DuePayableAmount>${fixed(t.due)}</ram:DuePayableAmount>`);
  o.push(`      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>`);
  if (doc.original_invoice) o.push(`      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(doc.original_invoice)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>`);
  o.push(`    </ram:ApplicableHeaderTradeSettlement>`);
  o.push(`  </rsm:SupplyChainTradeTransaction>`);
  o.push(`</rsm:CrossIndustryInvoice>`);
  return o.join("\n") + "\n";
}

/** Draft -> { ok, errors, warnings, totals, xml, format, filename }. */
export function generateInvoice(draft, { format = "ubl", profile = "xrechnung" } = {}) {
  const built = buildInvoice(draft, { profile });
  const result = { ok: built.ok, errors: built.errors, warnings: built.warnings, format };
  if (format !== "ubl" && format !== "cii") {
    result.ok = false;
    result.errors = [...result.errors, { path: "format", message: 'Format must be "ubl" or "cii".' }];
  }
  if (!result.ok) return result;
  const t = built.doc.totals;
  result.totals = { net: t.net / 100, tax: t.tax / 100, gross: t.gross / 100, prepaid: t.prepaid / 100, due: t.due / 100 };
  result.xml = format === "cii" ? toCii(built.doc) : toUbl(built.doc);
  result.filename = `${built.doc.number.replace(/[^\w.-]+/g, "_")}.xml`;
  return result;
}
