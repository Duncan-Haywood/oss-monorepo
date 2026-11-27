// Offline invoice-period (BT-73 / BT-74) observations.
// Date-shape check only — not a Peppol profile or contract match.

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
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function inspectInvoicePeriod(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice) || !("period" in invoice)) {
    return [];
  }
  const period = invoice.period;
  if (period === null || period === "") return [];
  if (typeof period !== "object" || Array.isArray(period)) {
    return [finding(
      "INV-042",
      "Invoice period is not an object with start and end dates.",
      "Use period.start and period.end as YYYY-MM-DD, or omit period.",
      "/period",
    )];
  }

  const startRaw = period.start;
  const endRaw = period.end;
  const startMissing = startRaw === undefined || startRaw === null || startRaw === "";
  const endMissing = endRaw === undefined || endRaw === null || endRaw === "";
  if (startMissing && endMissing) {
    return [finding(
      "INV-042",
      "Invoice period is missing both start and end dates.",
      "Add period.start and period.end as YYYY-MM-DD, or omit period.",
      "/period",
    )];
  }

  const findings = [];
  const start = startMissing ? null : parseIsoDate(startRaw);
  const end = endMissing ? null : parseIsoDate(endRaw);
  if (startMissing) {
    findings.push(finding(
      "INV-042",
      "Invoice period is missing a start date.",
      "Add period.start as YYYY-MM-DD, or omit period.",
      "/period/start",
    ));
  } else if (start === null) {
    findings.push(finding(
      "INV-042",
      "Invoice period start is not an ISO date.",
      "Use YYYY-MM-DD, for example 2026-07-01.",
      "/period/start",
    ));
  }
  if (endMissing) {
    findings.push(finding(
      "INV-042",
      "Invoice period is missing an end date.",
      "Add period.end as YYYY-MM-DD, or omit period.",
      "/period/end",
    ));
  } else if (end === null) {
    findings.push(finding(
      "INV-042",
      "Invoice period end is not an ISO date.",
      "Use YYYY-MM-DD, for example 2026-07-31.",
      "/period/end",
    ));
  }
  if (start !== null && end !== null && end < start) {
    findings.push(finding(
      "INV-043",
      "Invoice period end is earlier than the start.",
      "Set period.end to period.start or a later date.",
      "/period/end",
    ));
  }
  return findings;
}
