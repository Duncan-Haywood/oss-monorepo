// Offline buyer / purchase-order reference (BT-10 / BT-13) observations.
// Mirrors src/einvoice_preflight/reference.py. Findings never repeat the
// typed reference. This is a shape and consistency check, not a Peppol
// profile determination.

const MAX_LENGTH = 70;
const PLACEHOLDERS = new Set(["na", "none", "null", "tbd", "todo", "unknown", "-", "--", "..."]);

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeReference(value) {
  if (typeof value !== "string") return null;
  const stripped = value.trim();
  return stripped || null;
}

export function looksLikePlaceholder(value) {
  const compact = normalizeReference(value);
  if (compact === null) return false;
  const token = compact.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (PLACEHOLDERS.has(token)) return true;
  const letters = compact.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLACEHOLDERS.has(letters);
}

export function inspectCommercialReferences(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) return [];
  const findings = [];
  if ("buyer_reference" in invoice) {
    findings.push(...checkExplicit(
      invoice.buyer_reference,
      "INV-047",
      "/buyer_reference",
      "Buyer reference",
      "Add buyer_reference as the cost-center or buyer text, or omit buyer_reference.",
    ));
  }
  if ("order_reference" in invoice) {
    const orderFindings = checkExplicit(
      invoice.order_reference,
      "INV-048",
      "/order_reference",
      "Purchase-order reference",
      "Add order_reference as the buyer purchase-order number, or omit order_reference.",
    );
    findings.push(...orderFindings);
    if (orderFindings.length === 0 && sameReference(invoice.order_reference, invoice.invoice_number)) {
      findings.push(finding(
        "INV-049",
        "Purchase-order reference repeats the invoice number.",
        "Set order_reference to the buyer purchase-order number, or omit order_reference.",
        "/order_reference",
      ));
    }
  }
  return findings;
}

function checkExplicit(value, rule, path, label, omitFix) {
  if (typeof value !== "string" || !value.trim()) {
    return [finding(rule, `${label} is empty or not text.`, omitFix, path)];
  }
  const stripped = value.trim();
  if (stripped.length > MAX_LENGTH) {
    return [finding(
      rule,
      `${label} is longer than the usual 70-character network field.`,
      `Shorten the ${label.toLowerCase()} so a receiving system can store it, or omit the field.`,
      path,
    )];
  }
  if (looksLikePlaceholder(value)) {
    return [finding(rule, `${label} is a placeholder, not a buyer or purchase-order number.`, omitFix, path)];
  }
  return [];
}

function sameReference(left, right) {
  const first = normalizeReference(left);
  const second = normalizeReference(right);
  if (first === null || second === null) return false;
  return first.toLowerCase() === second.toLowerCase();
}
