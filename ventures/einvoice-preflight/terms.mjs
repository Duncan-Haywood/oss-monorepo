// Offline payment terms-days versus due-date observations.
// Mirrors src/einvoice_preflight/terms.py. Findings never repeat party
// or account data. The expected due date may appear in the fix.

import { parseIsoDate } from "./period.mjs";

export { parseIsoDate };

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function parseTermsDays(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const compact = value.trim();
  if (!/^\d+$/.test(compact)) return null;
  const days = Number(compact);
  return Number.isInteger(days) && days >= 1 ? days : null;
}

function isoFromUtcDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inspectPaymentTerms(invoice) {
  const payment = invoice && typeof invoice === "object" && !Array.isArray(invoice)
    ? invoice.payment
    : undefined;
  if (!payment || typeof payment !== "object" || Array.isArray(payment) || !("terms_days" in payment)) {
    return [];
  }
  const raw = payment.terms_days;
  if (raw === null || raw === "") {
    return [finding(
      "INV-053",
      "Payment terms days is empty or not a positive whole number of days.",
      "Use a positive whole number of days, for example 30, or omit payment.terms_days.",
      "/payment/terms_days",
    )];
  }
  const days = parseTermsDays(raw);
  if (days === null) {
    return [finding(
      "INV-053",
      "Payment terms days is empty or not a positive whole number of days.",
      "Use a positive whole number of days, for example 30, or omit payment.terms_days.",
      "/payment/terms_days",
    )];
  }

  if (!("due_date" in invoice) || invoice.due_date === null || invoice.due_date === "") {
    return [];
  }
  const issue = parseIsoDate(invoice.issue_date);
  const due = parseIsoDate(invoice.due_date);
  if (issue === null || due === null) return [];
  const expected = new Date(issue.getTime());
  expected.setUTCDate(expected.getUTCDate() + days);
  if (due.getTime() !== expected.getTime()) {
    return [finding(
      "INV-054",
      "Payment due date does not match the issue date plus the stated terms days.",
      `Set due_date to ${isoFromUtcDate(expected)} or correct payment.terms_days.`,
      "/due_date",
    )];
  }
  return [];
}
