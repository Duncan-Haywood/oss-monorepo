// Maps a local UBL Invoice document into the format-neutral checker shape.
// Intentionally small: it is not a Peppol or EN 16931 validator. DTD and
// entity declarations are rejected so a dropped file cannot expand entities.

function localName(tag) {
  const trimmed = tag.replace(/^\/+/, "").split(/[\s>/]/, 1)[0];
  if (trimmed.includes("}")) return trimmed.slice(trimmed.lastIndexOf("}") + 1);
  return trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
}

function parseAttrs(token) {
  const attrs = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(token);
  while (match) {
    const raw = match[1];
    const key = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
    attrs[key] = match[2] !== undefined ? match[2] : match[3];
    match = pattern.exec(token);
  }
  return attrs;
}

export function parseXmlTree(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new Error("DTD and entity declarations are not supported");
  }
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g) || [];
  const root = { name: "#root", text: "", children: [] };
  const stack = [root];
  for (const token of tokens) {
    if (token.startsWith("<?") || token.startsWith("<!--") || token.startsWith("<![")) continue;
    if (token.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const selfClosing = /\/>$/.test(token);
      const node = { name: localName(token.slice(1)), text: "", children: [], attrs: parseAttrs(token) };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }
    stack[stack.length - 1].text += token;
  }
  return root;
}

function descendants(node, name) {
  const found = [];
  const walk = (current) => {
    if (current.name === name) found.push(current);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return found;
}

function textOf(node, name, required = true) {
  const match = descendants(node, name)[0];
  const value = match ? match.text.trim() : "";
  if (required && !value) throw new Error(`UBL field ${name} is missing`);
  return value;
}

function asNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`UBL number is not finite: ${value}`);
  return Number.isInteger(number) ? number : number;
}

function nestedText(node, parentName, childName) {
  const parent = descendants(node, parentName)[0];
  return parent ? textOf(parent, childName, false) : "";
}

/** The party's own identifier, in the order a receiver would resolve it.
 *
 * EN 16931 makes the seller and buyer identifiers (BT-29/BT-46) optional --
 * plenty of real Peppol invoices identify a party by its electronic address
 * and name alone. Treating the identifier as mandatory made those invoices
 * unreadable rather than reporting a finding, so this returns "" and lets
 * INV-005 decide what a missing identifier means.
 *
 * This mirrors `_party_identifier` in src/einvoice_preflight/ubl.py, which
 * already resolved it this way. The browser tool kept the stricter rule, so
 * the CLI read the shipped examples and the page they are published next to
 * refused them.
 */
function partyIdentifier(partyNode) {
  return nestedText(partyNode, "PartyIdentification", "ID")
    || textOf(partyNode, "EndpointID", false)
    || nestedText(partyNode, "PartyLegalEntity", "CompanyID")
    || nestedText(partyNode, "PartyTaxScheme", "CompanyID");
}

function party(node) {
  const partyNode = descendants(node, "Party")[0] || node;
  // XRechnung carries the legal name in PartyLegalEntity/RegistrationName and
  // may omit PartyName entirely, so that is a source for the name, not a
  // reason to refuse the document. Also matches the Python reader.
  const name = nestedText(partyNode, "PartyName", "Name")
    || nestedText(partyNode, "PartyLegalEntity", "RegistrationName")
    || textOf(partyNode, "Name", false);
  const mapped = { id: partyIdentifier(partyNode), name };
  for (const scheme of descendants(partyNode, "PartyTaxScheme")) {
    // A national tax number travels in the same element with TaxScheme/ID "FC"
    // (or similar); only a VAT scheme -- or an unlabelled one -- is a VAT ID.
    const schemeId = nestedText(scheme, "TaxScheme", "ID").toUpperCase();
    if (schemeId && schemeId !== "VAT") continue;
    const vatId = textOf(scheme, "CompanyID", false);
    if (vatId) {
      mapped.vat_id = vatId;
      break;
    }
  }
  const addressNode = descendants(partyNode, "PostalAddress")[0];
  if (addressNode) {
    const street = textOf(addressNode, "StreetName", false);
    const city = textOf(addressNode, "CityName", false);
    const postal = textOf(addressNode, "PostalZone", false);
    const country = nestedText(addressNode, "Country", "IdentificationCode");
    if (street) mapped.street = street;
    if (city) mapped.city = city;
    if (postal) mapped.postal_code = postal;
    if (country) mapped.country = country;
  }
  const contactNode = descendants(partyNode, "Contact")[0];
  if (contactNode) {
    const contact = {};
    const cName = textOf(contactNode, "Name", false);
    const phone = textOf(contactNode, "Telephone", false);
    const email = textOf(contactNode, "ElectronicMail", false);
    if (cName) contact.name = cName;
    if (phone) contact.phone = phone;
    if (email) contact.email = email;
    if (Object.keys(contact).length) mapped.contact = contact;
  }
  for (const scheme of descendants(partyNode, "PartyTaxScheme")) {
    if (nestedText(scheme, "TaxScheme", "ID").toUpperCase() === "FC") {
      const number = textOf(scheme, "CompanyID", false);
      if (number) mapped.tax_number = number;
      break;
    }
  }
  const legalNode = descendants(partyNode, "PartyLegalEntity").flatMap((entity) => descendants(entity, "CompanyID"))[0];
  if (legalNode && legalNode.text.trim()) {
    const scheme = (legalNode.attrs && legalNode.attrs.schemeID) ? legalNode.attrs.schemeID.trim() : "";
    mapped.legal_id = { id: legalNode.text.trim(), scheme };
  }
  const endpointNode = descendants(partyNode, "EndpointID")[0];
  if (endpointNode) {
    const id = endpointNode.text.trim();
    const scheme = (endpointNode.attrs && endpointNode.attrs.schemeID) ? endpointNode.attrs.schemeID.trim() : "";
    if (id || scheme) mapped.endpoint = { id, scheme };
  }
  return mapped;
}

function branchBic(branch) {
  for (const child of descendants(branch, "ID")) {
    const value = child.text.trim();
    if (value) return value;
  }
  return "";
}

function optionalMonetaryTotals(total) {
  const extras = {};
  const prepaid = textOf(total, "PrepaidAmount", false);
  if (prepaid) extras.prepaid = asNumber(prepaid);
  const payable = textOf(total, "PayableAmount", false);
  if (payable) extras.due = asNumber(payable);
  return extras;
}

function paymentReference(means) {
  for (const name of ["PaymentID", "InstructionNote"]) {
    for (const child of means.children) {
      if (child.name === name) {
        const value = child.text.trim();
        if (value) return value;
      }
    }
  }
  return "";
}

function paymentTermsDays(root) {
  for (const child of root.children) {
    if (child.name !== "PaymentTerms") continue;
    for (const period of descendants(child, "SettlementPeriod")) {
      for (const measure of period.children) {
        if (measure.name !== "DurationMeasure") continue;
        const unit = ((measure.attrs && measure.attrs.unitCode) || "").trim().toUpperCase();
        const value = measure.text.trim();
        if (value && (unit === "DAY" || unit === "D")) return value;
      }
    }
  }
  return "";
}

function payeePayment(root) {
  for (const means of descendants(root, "PaymentMeans")) {
    const payment = {};
    const code = textOf(means, "PaymentMeansCode", false);
    if (code) payment.means = code;
    const remittance = paymentReference(means);
    if (remittance) payment.remittance = remittance;
    for (const account of descendants(means, "PayeeFinancialAccount")) {
      for (const child of account.children) {
        if (child.name === "ID") {
          const value = child.text.trim();
          if (value) payment.iban = value;
        } else if (child.name === "FinancialInstitutionBranch") {
          const bic = branchBic(child);
          if (bic) payment.bic = bic;
        }
      }
    }
    if (Object.keys(payment).length) return payment;
  }
  return null;
}

const DOCUMENT_ROOTS = {
  Invoice: { type: "invoice", line: "InvoiceLine", quantity: "InvoicedQuantity" },
  CreditNote: { type: "credit_note", line: "CreditNoteLine", quantity: "CreditedQuantity" },
  DebitNote: { type: "debit_note", line: "DebitNoteLine", quantity: "DebitedQuantity" },
};

function taxCategoryFields(category) {
  const extras = {};
  for (const child of category.children) {
    if (child.name === "ID") {
      const value = child.text.trim();
      if (value) extras.tax_category = value;
    }
  }
  const reason = textOf(category, "TaxExemptionReason", false);
  if (reason) extras.tax_reason = reason;
  const reasonCode = textOf(category, "TaxExemptionReasonCode", false);
  if (reasonCode) extras.tax_reason_code = reasonCode;
  return extras;
}

function taxBreakdown(root) {
  const rows = [];
  for (const subtotal of descendants(root, "TaxSubtotal")) {
    const taxable = textOf(subtotal, "TaxableAmount", false);
    const tax = textOf(subtotal, "TaxAmount", false);
    const category = descendants(subtotal, "TaxCategory")[0];
    const percent = category ? textOf(category, "Percent", false) : "";
    let taxId = "";
    if (category) {
      for (const child of category.children) {
        if (child.name === "ID") taxId = child.text.trim();
      }
    }
    if (!taxable && !tax && !percent) continue;
    const row = {};
    if (percent) row.tax_percent = asNumber(percent);
    if (taxable) row.taxable = asNumber(taxable);
    if (tax) row.tax = asNumber(tax);
    if (taxId) row.tax_category = taxId;
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function documentExemption(root) {
  const extras = {};
  for (const subtotal of descendants(root, "TaxSubtotal")) {
    for (const category of descendants(subtotal, "TaxCategory")) {
      const reason = textOf(category, "TaxExemptionReason", false);
      if (reason && !extras.tax_exemption_reason) extras.tax_exemption_reason = reason;
      const reasonCode = textOf(category, "TaxExemptionReasonCode", false);
      if (reasonCode && !extras.tax_exemption_reason_code) extras.tax_exemption_reason_code = reasonCode;
    }
  }
  return extras;
}

function billingReference(root) {
  for (const ref of descendants(root, "BillingReference")) {
    for (const invoiceRef of descendants(ref, "InvoiceDocumentReference")) {
      const value = textOf(invoiceRef, "ID", false);
      if (value) return value;
    }
  }
  return "";
}

export function parseUblInvoice(source) {
  const tree = parseXmlTree(source);
  const root = descendants(tree, "Invoice")[0]
    || descendants(tree, "CreditNote")[0]
    || descendants(tree, "DebitNote")[0];
  if (!root) throw new Error("UBL document root must be Invoice, CreditNote, or DebitNote");
  const kind = DOCUMENT_ROOTS[root.name];

  const lines = descendants(root, kind.line).map((line) => {
    const category = descendants(line, "ClassifiedTaxCategory")[0] || line;
    return {
      description: textOf(line, "Name"),
      quantity: asNumber(textOf(line, kind.quantity)),
      unit_price: asNumber(textOf(line, "PriceAmount")),
      tax_percent: asNumber(textOf(category, "Percent")),
      net: asNumber(textOf(line, "LineExtensionAmount")),
      ...taxCategoryFields(category),
    };
  });

  const supplier = descendants(root, "AccountingSupplierParty")[0] || root;
  const customer = descendants(root, "AccountingCustomerParty")[0] || root;
  const total = descendants(root, "LegalMonetaryTotal")[0] || root;
  const taxTotals = descendants(root, "TaxTotal");
  if (taxTotals.length === 0) throw new Error("UBL field TaxAmount is missing");
  const taxTotal = taxTotals.reduce((sum, item) => sum + Number(textOf(item, "TaxAmount")), 0);
  const dueDate = textOf(root, "DueDate", false);
  const typeCode = textOf(root, "InvoiceTypeCode", false)
    || textOf(root, "CreditNoteTypeCode", false)
    || textOf(root, "DebitNoteTypeCode", false);
  const original = billingReference(root);
  const invoice = {
    invoice_number: textOf(root, "ID"),
    issue_date: textOf(root, "IssueDate"),
    ...(dueDate ? { due_date: dueDate } : {}),
    document_type: kind.type,
    ...(typeCode ? { document_code: typeCode } : {}),
    ...(original ? { original_invoice: original } : {}),
    currency: textOf(root, "DocumentCurrencyCode"),
    supplier: party(supplier),
    customer: party(customer),
    lines,
    totals: {
      net: asNumber(textOf(total, "TaxExclusiveAmount")),
      tax: asNumber(String(taxTotal)),
      gross: asNumber(textOf(total, "TaxInclusiveAmount")),
      ...optionalMonetaryTotals(total),
    },
  };
  const payment = payeePayment(root) || {};
  const termsDays = paymentTermsDays(root);
  if (termsDays) payment.terms_days = termsDays;
  if (Object.keys(payment).length) invoice.payment = payment;
  Object.assign(invoice, documentExemption(root));
  const breakdown = taxBreakdown(root);
  if (breakdown.length) invoice.tax_breakdown = breakdown;
  const period = invoicePeriod(root);
  if (period) invoice.period = period;
  Object.assign(invoice, commercialReferences(root));
  const specification = textOf(root, "CustomizationID", false);
  if (specification) invoice.specification_id = specification;
  const businessProcess = textOf(root, "ProfileID", false);
  if (businessProcess) invoice.profile_id = businessProcess;
  const adjustments = headerAdjustments(root);
  if (adjustments.length) invoice.adjustments = adjustments;
  const notes = [
    ...root.children.filter((child) => child.name === "Note").map((child) => child.text.trim()),
    ...root.children.filter((child) => child.name === "PaymentTerms").flatMap((terms) => descendants(terms, "Note").map((n) => n.text.trim())),
  ].filter(Boolean);
  if (notes.length) invoice.notes = notes;
  return invoice;
}

function headerAdjustments(root) {
  const rows = [];
  for (const child of root.children) {
    if (child.name !== "AllowanceCharge") continue;
    const indicator = textOf(child, "ChargeIndicator", false);
    const amount = textOf(child, "Amount", false);
    const base = textOf(child, "BaseAmount", false);
    const percent = textOf(child, "MultiplierFactorNumeric", false);
    const reason = textOf(child, "AllowanceChargeReason", false);
    const reasonCode = textOf(child, "AllowanceChargeReasonCode", false);
    if (!indicator && !amount && !base && !percent && !reason && !reasonCode) continue;
    const row = {};
    if (indicator) {
      const token = indicator.trim().toLowerCase();
      row.kind = token === "true" || token === "1" ? "charge" : "allowance";
    }
    if (amount) row.amount = asNumber(amount);
    if (base) row.base = asNumber(base);
    if (percent) row.percent = asNumber(percent);
    if (reason) row.reason = reason;
    if (reasonCode) row.reason_code = reasonCode;
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function commercialReferences(root) {
  const extras = {};
  for (const child of root.children) {
    if (child.name === "BuyerReference") {
      extras.buyer_reference = (child.text || "").trim();
    } else if (child.name === "OrderReference") {
      extras.order_reference = textOf(child, "ID", false);
    }
  }
  return extras;
}

function invoicePeriod(root) {
  for (const child of root.children) {
    if (child.name !== "InvoicePeriod") continue;
    const start = textOf(child, "StartDate", false);
    const end = textOf(child, "EndDate", false);
    if (!start && !end) continue;
    const period = {};
    if (start) period.start = start;
    if (end) period.end = end;
    return period;
  }
  return null;
}

export function looksLikeXml(name, source) {
  if (typeof name === "string" && name.toLowerCase().endsWith(".xml")) return true;
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  return text.trimStart().startsWith("<");
}
