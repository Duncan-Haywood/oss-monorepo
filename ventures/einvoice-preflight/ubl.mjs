// Maps a local UBL Invoice document into the format-neutral checker shape.
// Intentionally small: it is not a Peppol or EN 16931 validator. DTD and
// entity declarations are rejected so a dropped file cannot expand entities.

function localName(tag) {
  const trimmed = tag.replace(/^\/+/, "").split(/[\s>/]/, 1)[0];
  if (trimmed.includes("}")) return trimmed.slice(trimmed.lastIndexOf("}") + 1);
  return trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
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
      const node = { name: localName(token.slice(1)), text: "", children: [] };
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

function party(node) {
  const partyNode = descendants(node, "Party")[0] || node;
  const mapped = { id: textOf(partyNode, "ID"), name: textOf(partyNode, "Name") };
  for (const scheme of descendants(partyNode, "PartyTaxScheme")) {
    const vatId = textOf(scheme, "CompanyID", false);
    if (vatId) {
      mapped.vat_id = vatId;
      break;
    }
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

function payeePayment(root) {
  for (const means of descendants(root, "PaymentMeans")) {
    const payment = {};
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
  const payment = payeePayment(root);
  if (payment) invoice.payment = payment;
  return invoice;
}

export function looksLikeXml(name, source) {
  if (typeof name === "string" && name.toLowerCase().endsWith(".xml")) return true;
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  return text.trimStart().startsWith("<");
}
