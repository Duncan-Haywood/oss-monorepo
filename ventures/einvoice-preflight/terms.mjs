// Offline payment terms-days versus due-date observations.
// Mirrors src/einvoice_preflight/terms.py. Findings never repeat party
// or account data. The expected due date may appear in the fix.

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function parseIsoDate(value) {
  if (typeof value !== "string" || value.length !== 10 || value[4] !== "-" || value[7] !== "-") {
    return null;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (![year, month, day].every((part) => Number.isInteger(part))) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
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
