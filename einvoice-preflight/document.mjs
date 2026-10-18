// Offline document-type and credit-note reference observations.
// Shape check only — not a Peppol profile determination.

const TYPES = {
  invoice: "invoice",
  "commercial invoice": "invoice",
  "corrected invoice": "invoice",
  "self billed invoice": "invoice",
  "prepayment invoice": "invoice",
  380: "invoice",
  384: "invoice",
  386: "invoice",
  389: "invoice",
  "credit note": "credit_note",
  creditnote: "credit_note",
  credit: "credit_note",
  "self billed credit note": "credit_note",
  381: "credit_note",
  261: "credit_note",
  "debit note": "debit_note",
  debitnote: "debit_note",
  debit: "debit_note",
  383: "debit_note",
};

const REVERSING = new Set(["credit_note", "debit_note"]);

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeDocumentType(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return "invalid";
  let key;
  if (typeof value === "number" && Number.isInteger(value)) {
    key = String(value);
  } else if (typeof value === "string") {
    key = value.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
    if (!key) return null;
  } else {
    return "invalid";
  }
  if (Object.prototype.hasOwnProperty.call(TYPES, key)) return TYPES[key];
  const compact = key.replace(/ /g, "");
  return Object.prototype.hasOwnProperty.call(TYPES, compact) ? TYPES[compact] : "invalid";
}

function sameReference(left, right) {
  return typeof left === "string"
    && typeof right === "string"
    && left.trim() !== ""
    && left.trim().toLowerCase() === right.trim().toLowerCase();
}

function effectiveType(explicitKind, codeKind) {
  if (explicitKind === "invoice" || explicitKind === "credit_note" || explicitKind === "debit_note") {
    return explicitKind;
  }
  if (codeKind === "invoice" || codeKind === "credit_note" || codeKind === "debit_note") {
    return codeKind;
  }
  return "invoice";
}

export function inspectDocumentType(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) return [];
  const findings = [];
  const explicitKind = normalizeDocumentType(invoice.document_type);
  const codeKind = normalizeDocumentType(invoice.document_code);

  if (invoice.document_type !== undefined && invoice.document_type !== null && invoice.document_type !== "" && explicitKind === "invalid") {
    findings.push(finding(
      "INV-032",
      "Document type is not a known invoice, credit note, or debit note.",
      "Use invoice, credit_note, or debit_note, or omit document_type.",
      "/document_type",
    ));
  }
  if (invoice.document_code !== undefined && invoice.document_code !== null && invoice.document_code !== "" && codeKind === "invalid") {
    findings.push(finding(
      "INV-032",
      "Document type code is not a known invoice, credit note, or debit note code.",
      "Use a UN/CEFACT 1001 code such as 380, 381, or 383, or omit document_code.",
      "/document_code",
    ));
  }

  if (
    (explicitKind === "invoice" || explicitKind === "credit_note" || explicitKind === "debit_note")
    && (codeKind === "invoice" || codeKind === "credit_note" || codeKind === "debit_note")
    && explicitKind !== codeKind
  ) {
    findings.push(finding(
      "INV-034",
      explicitKind === "invoice"
        ? "This document is marked as a commercial invoice but its type code is a credit or debit note."
        : "This document's type and type code do not describe the same kind of document.",
      "Send a CreditNote when the type code is 381, or set document_type to match document_code.",
      "/document_code",
    ));
  }

  const effective = effectiveType(explicitKind, codeKind);
  const needsOriginal = REVERSING.has(effective)
    || (explicitKind === "invoice" && REVERSING.has(codeKind));
  if (needsOriginal) {
    const original = invoice.original_invoice;
    const missing = original === undefined || original === null || original === ""
      || (typeof original === "string" && !original.trim());
    if (missing) {
      findings.push(finding(
        "INV-033",
        "Credit or debit note is missing the original invoice it reverses.",
        "Add original_invoice with the invoice number being credited or debited.",
        "/original_invoice",
      ));
    } else if (typeof original !== "string") {
      findings.push(finding(
        "INV-033",
        "Original invoice reference is empty or not text.",
        "Provide original_invoice as text, or omit document_type if this is a commercial invoice.",
        "/original_invoice",
      ));
    } else if (sameReference(original, invoice.invoice_number)) {
      findings.push(finding(
        "INV-034",
        "This credit or debit note names itself as the invoice it reverses.",
        "Set original_invoice to the invoice being credited or debited, not this document's own number.",
        "/original_invoice",
      ));
    }
  }
  return findings;
}
