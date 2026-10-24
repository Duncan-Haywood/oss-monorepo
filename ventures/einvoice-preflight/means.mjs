// Offline payment-means (BT-81 / UNCL 4461) observations.
// Mirrors src/einvoice_preflight/means.py. Findings never repeat the
// typed code or the account. This is a typo and consistency check, not
// a Peppol profile determination.

import { looksLikeCompleteIban } from "./iban.mjs";

// The UNCL 4461 list EN 16931 accepts for BT-81 (rule BR-CL-16 in the CEN
// Schematron). A typo catch, not a determination that a network will accept it.
const KNOWN_MEANS = new Set(
  "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 74 75 76 77 78 91 92 93 94 95 96 97 98 ZZZ".split(" "),
);
// Direct debits (49, 59) name the payer's account (BT-91), not the payee's, so
// only the transfers need a payee IBAN.
const ACCOUNT_REQUIRED = new Set(["30", "31", "42", "58"]);
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
      "Payment means is a credit transfer or SEPA transfer without an IBAN.",
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
