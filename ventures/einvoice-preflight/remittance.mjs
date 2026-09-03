// Offline remittance / payment-reference observations.
// Typo catch only — not a bank lookup and not a claim that a payment will match.

import { looksLikeCompleteIban } from "./iban.mjs";

const UNSTRUCTURED_MAX = 140;

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeRemittance(value) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

export function looksLikeStructuredRf(value) {
  const compact = normalizeRemittance(value);
  return compact !== null && classifyRf(compact) === "checksum";
}

function classifyRf(compact) {
  if (!compact.startsWith("RF") || compact.length < 5 || compact.length > 25) return "unknown";
  const check = compact.slice(2, 4);
  const body = compact.slice(4);
  if (!/^\d{2}$/.test(check) || !/^[A-Z0-9]+$/.test(body)) return "unknown";
  return "checksum";
}

function mod97Ok(compact) {
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let numeric = "";
  for (const char of rearranged) {
    numeric += parseInt(char, 36).toString(10);
  }
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function checkExplicit(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    return [finding(
      "INV-031",
      "Payment remittance reference is empty or not text.",
      "Provide the remittance as text, or omit payment.remittance.",
      path,
    )];
  }
  const stripped = value.trim();
  if (stripped.length > UNSTRUCTURED_MAX) {
    return [finding(
      "INV-031",
      "Payment remittance reference is longer than the usual 140-character transfer note.",
      "Shorten the remittance so a bank transfer can carry it, or omit payment.remittance.",
      path,
    )];
  }
  const compact = normalizeRemittance(value);
  if (compact === null) {
    return [finding(
      "INV-031",
      "Payment remittance reference is empty or not text.",
      "Provide the remittance as text, or omit payment.remittance.",
      path,
    )];
  }
  if (!compact.startsWith("RF")) return [];
  const kind = classifyRf(compact);
  if (kind === "unknown") {
    return [finding(
      "INV-031",
      "Payment remittance reference is not a structured RF creditor reference.",
      "Use RF, two check digits, and up to 21 characters, or an unstructured note that does not start with RF.",
      path,
    )];
  }
  if (kind === "checksum" && !mod97Ok(compact)) {
    return [finding(
      "INV-031",
      "Payment remittance reference fails the published RF checksum.",
      "Correct the RF check digits. This is a checksum typo check, not a bank lookup.",
      path,
    )];
  }
  return [];
}

export function inspectPaymentRemittance(invoice) {
  const payment = invoice.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return [];
  const remittance = payment.remittance;
  const missing = remittance === undefined || remittance === null || remittance === ""
    || (typeof remittance === "string" && !remittance.trim());
  if (missing) {
    if (looksLikeCompleteIban(payment.iban)) {
      return [finding(
        "INV-030",
        "Payment remittance reference is missing on an invoice that already names an IBAN.",
        "Add payment.remittance so the buyer can quote it on the transfer, or omit payment.iban.",
        "/payment/remittance",
      )];
    }
    return [];
  }
  return checkExplicit(remittance, "/payment/remittance");
}
