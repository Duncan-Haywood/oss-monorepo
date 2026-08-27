// Offline BIC shape and IBAN-country observations.
// Typo catch only — not a SWIFT lookup and not a claim funds can be received.

import { looksLikeCompleteIban, normalizeIban } from "./iban.mjs";

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeBic(value) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

function classify(compact) {
  if (compact.length !== 8 && compact.length !== 11) return "unknown";
  const bank = compact.slice(0, 4);
  const country = compact.slice(4, 6);
  const location = compact.slice(6, 8);
  const branch = compact.slice(8);
  if (!/^[A-Z]{4}$/.test(bank) || !/^[A-Z]{2}$/.test(country)) return "unknown";
  if (!/^[A-Z0-9]{2}$/.test(location)) return "unknown";
  if (branch && !/^[A-Z0-9]{3}$/.test(branch)) return "unknown";
  return "ok";
}

export function looksLikeCompleteBic(value) {
  const compact = normalizeBic(value);
  return compact !== null && classify(compact) === "ok";
}

function checkExplicit(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    return [finding(
      "INV-026",
      "Payment BIC is empty or not text.",
      "Provide the BIC as text, or omit payment.bic.",
      path,
    )];
  }
  const compact = normalizeBic(value);
  if (compact === null) {
    return [finding(
      "INV-026",
      "Payment BIC is empty or not text.",
      "Provide the BIC as text, or omit payment.bic.",
      path,
    )];
  }
  if (classify(compact) === "unknown") {
    return [finding(
      "INV-026",
      "Payment BIC is not an 8- or 11-character bank identifier.",
      "Use four letters, a two-letter country, a two-character location, and an optional three-character branch, or omit payment.bic.",
      path,
    )];
  }
  return [];
}

function countryMismatch(payment) {
  const compactBic = normalizeBic(payment.bic);
  const compactIban = normalizeIban(payment.iban);
  if (compactBic === null || compactIban === null) return [];
  if (!looksLikeCompleteBic(compactBic) || !looksLikeCompleteIban(compactIban)) return [];
  const bicCountry = compactBic.slice(4, 6);
  const ibanCountry = compactIban.slice(0, 2);
  if (bicCountry === ibanCountry) return [];
  return [finding(
    "INV-027",
    "Payment BIC country does not match the payment IBAN country.",
    "Correct the BIC or the IBAN so both use the same country, or omit payment.bic.",
    "/payment/bic",
  )];
}

export function inspectPaymentBic(invoice) {
  const payment = invoice.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return [];
  const bic = payment.bic;
  if (bic === undefined || bic === null || bic === "") return [];
  const findings = checkExplicit(bic, "/payment/bic");
  if (findings.length) return findings;
  return countryMismatch(payment);
}
