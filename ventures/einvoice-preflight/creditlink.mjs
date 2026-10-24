// Batch-only checks that tie a credit note to the invoice it reverses when both
// are in the same batch. A credit note whose original is not in the batch is
// left alone: the original may have gone out in an earlier run.
// An observation, not a legal validity claim.

import { normalizeDocumentType } from "./document.mjs";

function finding(rule, message, fix) {
  return { rule, message, fix, path: "/original_invoice" };
}

function ref(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sellerOf(invoice) {
  const seller = invoice.supplier && typeof invoice.supplier === "object" ? invoice.supplier : {};
  for (const field of ["id", "vat_id", "name"]) {
    if (typeof seller[field] === "string" && seller[field].trim()) {
      return `${field}:${seller[field].trim().toLowerCase().replace(/\s+/g, " ")}`;
    }
  }
  return "";
}

function kindOf(invoice) {
  const explicit = normalizeDocumentType(invoice.document_type);
  if (explicit && explicit !== "invalid") return explicit;
  const code = normalizeDocumentType(invoice.document_code);
  return code && code !== "invalid" ? code : "invoice";
}

function cents(invoice) {
  const gross = invoice.totals && invoice.totals.gross;
  const n = typeof gross === "string" && gross.trim() !== "" ? Number(gross) : gross;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null;
}

function currencyOf(invoice) {
  return typeof invoice.currency === "string" ? invoice.currency.trim().toUpperCase() : "";
}

/** Returns Map<file name, finding[]> for the parsed batch [{name, invoice}]. */
export function inspectCreditLinks(parsed) {
  const out = new Map();
  const add = (name, f) => out.set(name, [...(out.get(name) || []), f]);
  const docs = parsed.filter(({ invoice }) => invoice && typeof invoice === "object" && !Array.isArray(invoice));
  const invoices = docs.filter(({ invoice }) => kindOf(invoice) === "invoice" && ref(invoice.invoice_number));
  const credits = docs.filter(({ invoice }) => kindOf(invoice) === "credit_note" && ref(invoice.original_invoice));

  const totals = new Map(); // original file -> credit cents so far
  const groups = new Map(); // original file -> credit entries
  for (const credit of credits) {
    const wanted = ref(credit.invoice.original_invoice);
    const seller = sellerOf(credit.invoice);
    const same = invoices.filter(({ invoice }) => ref(invoice.invoice_number) === wanted && sellerOf(invoice) === seller);
    if (same.length === 0) {
      if (invoices.some(({ invoice }) => ref(invoice.invoice_number) === wanted)) {
        add(credit.name, finding(
          "INV-058",
          "The invoice this credit note reverses is in the batch, but it was issued by a different seller.",
          "Check original_invoice and the credit note's supplier: a credit note comes from the party that issued the invoice.",
        ));
      }
      continue;
    }
    if (same.length > 1) continue; // duplicate numbers are INV-019's job
    const original = same[0];
    const have = currencyOf(original.invoice);
    const want = currencyOf(credit.invoice);
    if (have && want && have !== want) {
      add(credit.name, finding(
        "INV-056",
        "The credit note and the invoice it reverses are in different currencies.",
        "Credit in the currency of the original invoice, or name the right original in original_invoice.",
      ));
    }
    const amount = cents(credit.invoice);
    if (amount !== null && have === want) {
      totals.set(original.name, (totals.get(original.name) || 0) + amount);
      groups.set(original.name, [...(groups.get(original.name) || []), credit.name]);
    }
  }
  for (const [file, total] of totals) {
    const original = invoices.find(({ name }) => name === file);
    const gross = cents(original.invoice);
    if (gross !== null && total > gross) {
      for (const name of groups.get(file)) {
        add(name, finding(
          "INV-057",
          "Credit notes in this batch against one invoice add up to more than that invoice's gross total.",
          "Check the credit amounts and original_invoice: a credit note cannot return more than was invoiced.",
        ));
      }
    }
  }
  return out;
}
