// Offline payment-means (BT-81 / UNCL 4461) observations.
// Mirrors src/einvoice_preflight/means.py. Findings never repeat the
// typed code or the account. This is a typo and consistency check, not
// a Peppol profile determination.

import { looksLikeCompleteIban } from "./iban.mjs";

const KNOWN_MEANS = new Set([
  "1", "10", "20", "30", "31", "42", "48", "49", "50", "57", "58", "59", "97",
]);
const ACCOUNT_REQUIRED = new Set(["30", "31", "42", "49", "58", "59"]);
const CASH_LIKE = new Set(["10", "20", "48"]);

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeMeans(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value !== "string") return null;
  const compact = value.trim();
  return compact || null;
}

export function looksLikeKnownMeans(value) {
  return KNOWN_MEANS.has(normalizeMeans(value));
}

export function inspectPaymentMeans(invoice) {
  const payment = invoice && typeof invoice === "object" && !Array.isArray(invoice)
    ? invoice.payment
    : undefined;
  if (!payment || typeof payment !== "object" || Array.isArray(payment) || !("means" in payment)) {
    return [];
  }
  const raw = payment.means;
  if (raw === null || raw === "") {
    return [finding(
      "INV-044",
      "Payment means code is empty or not a documented UNCL 4461 code.",
      "Use a published payment means code such as 30, 58, or 10, or omit payment.means.",
      "/payment/means",
    )];
  }
  const compact = normalizeMeans(raw);
  if (compact === null || !KNOWN_MEANS.has(compact)) {
    return [finding(
      "INV-044",
      "Payment means code is empty or not a documented UNCL 4461 code.",
      "Use a published payment means code such as 30, 58, or 10, or omit payment.means.",
      "/payment/means",
    )];
  }

  const findings = [];
  const hasIban = looksLikeCompleteIban(payment.iban);
  if (ACCOUNT_REQUIRED.has(compact) && !hasIban) {
    findings.push(finding(
      "INV-045",
      "Payment means is a credit transfer, SEPA transfer, or direct debit without an IBAN.",
      "Add payment.iban for that means, switch to a cash or card means, or omit payment.means.",
      "/payment/iban",
    ));
  }
  if (CASH_LIKE.has(compact) && hasIban) {
    findings.push(finding(
      "INV-046",
      "Payment means is cash, cheque, or card but the invoice also names an IBAN.",
      "Use a credit-transfer or SEPA means with the IBAN, or omit payment.iban.",
      "/payment/means",
    ));
  }
  return findings;
}
