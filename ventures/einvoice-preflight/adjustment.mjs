// Offline header allowance / charge (BT-92 / BT-99) observations.
// Mirrors src/einvoice_preflight/adjustment.py. Findings never repeat
// the amount, percent, or reason. Line-level AllowanceCharge is ignored.

import { looksLikePlaceholder } from "./reference.mjs";

const MAX_REASON = 100;

function roundHalfUpToCents(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "" || !Number.isFinite(Number(text))) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

function money(value) {
  const parsed = parseNumber(value);
  return parsed === null ? null : roundHalfUpToCents(parsed);
}

export function normalizeKind(value) {
  if (typeof value === "boolean") return value ? "charge" : "allowance";
  if (typeof value !== "string") return null;
  const compact = value.trim().toLowerCase();
  if (["true", "1", "charge", "surcharge"].includes(compact)) return "charge";
  if (["false", "0", "allowance", "discount"].includes(compact)) return "allowance";
  return null;
}

export function headerAdjustmentNetDelta(invoice) {
  let delta = 0;
  for (const row of rows(invoice)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const kind = normalizeKind(row.kind);
    const amount = money(row.amount);
    if (kind === null || amount === null || amount < 0) continue;
    delta = roundHalfUpToCents(delta + (kind === "charge" ? amount : -amount));
  }
  return delta;
}

export function inspectHeaderAdjustments(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice) || !("adjustments" in invoice)) {
    return [];
  }
  const raw = invoice.adjustments;
  if (raw === null || raw === "") {
    return [finding(
      "INV-050",
      "Header allowance or charge list is empty or not a list of rows.",
      "Add adjustments as a list of allowance or charge rows, or omit adjustments.",
      "/adjustments",
    )];
  }
  if (!Array.isArray(raw)) {
    return [finding(
      "INV-050",
      "Header allowance or charge list is empty or not a list of rows.",
      "Add adjustments as a list of allowance or charge rows, or omit adjustments.",
      "/adjustments",
    )];
  }
  const findings = [];
  raw.forEach((row, index) => findings.push(...inspectRow(row, index)));
  return findings;
}

function rows(invoice) {
  return invoice && Array.isArray(invoice.adjustments) ? invoice.adjustments : [];
}

function inspectRow(row, index) {
  const path = `/adjustments/${index}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return [finding(
      "INV-050",
      "Header allowance or charge row is not an object.",
      "Provide kind, amount, and a reason, or omit the row.",
      path,
    )];
  }
  const findings = [];
  const kind = "kind" in row ? normalizeKind(row.kind) : null;
  if (!("kind" in row) || kind === null) {
    findings.push(finding(
      "INV-050",
      "Header allowance or charge kind is missing or not allowance or charge.",
      "Set kind to allowance or charge, or omit the row.",
      `${path}/kind`,
    ));
  }

  let amount = null;
  if (!("amount" in row) || row.amount === null || row.amount === "") {
    findings.push(finding(
      "INV-050",
      "Header allowance or charge amount is missing or invalid.",
      "Provide a non-negative amount, or omit the row.",
      `${path}/amount`,
    ));
  } else {
    amount = money(row.amount);
    if (amount === null || amount < 0) {
      findings.push(finding(
        "INV-050",
        "Header allowance or charge amount is missing or invalid.",
        "Provide a non-negative amount, or omit the row.",
        `${path}/amount`,
      ));
      amount = null;
    }
  }

  let base = null;
  let percent = null;
  if ("base" in row && row.base !== null && row.base !== "") {
    base = money(row.base);
    if (base === null || base < 0) {
      findings.push(finding(
        "INV-051",
        "Header allowance or charge base is missing or invalid.",
        "Provide a non-negative base amount, or omit base and percent.",
        `${path}/base`,
      ));
      base = null;
    }
  }
  if ("percent" in row && row.percent !== null && row.percent !== "") {
    percent = parseNumber(row.percent);
    if (percent === null || percent < 0 || percent > 100) {
      findings.push(finding(
        "INV-051",
        "Header allowance or charge percentage is missing or invalid.",
        "Use a percentage between 0 and 100, or omit percent and base.",
        `${path}/percent`,
      ));
      percent = null;
    }
  }
  if (amount !== null && base !== null && percent !== null) {
    const expected = roundHalfUpToCents((base * percent) / 100);
    if (amount !== expected) {
      findings.push(finding(
        "INV-051",
        "Header allowance or charge amount does not match its percentage of the base.",
        `Set the amount to ${expected.toFixed(2)} or correct percent and base.`,
        `${path}/amount`,
      ));
    }
  }

  if ("reason" in row || "reason_code" in row) {
    const reason = row.reason;
    const code = row.reason_code;
    const hasReason = typeof reason === "string" && reason.trim() && !looksLikePlaceholder(reason);
    const hasCode = typeof code === "string" && code.trim() && !looksLikePlaceholder(code);
    if (typeof reason === "string" && reason.trim().length > MAX_REASON) {
      findings.push(finding(
        "INV-052",
        "Header allowance or charge reason is longer than the usual 100-character network field.",
        "Shorten the reason so a receiving system can store it, or omit the row.",
        `${path}/reason`,
      ));
    } else if (!hasReason && !hasCode) {
      findings.push(finding(
        "INV-052",
        "Header allowance or charge reason is empty or a placeholder.",
        "Add a settlement or packing reason, or omit reason and reason_code.",
        "reason" in row ? `${path}/reason` : `${path}/reason_code`,
      ));
    }
  } else {
    findings.push(finding(
      "INV-052",
      "Header allowance or charge has no reason.",
      "Add a reason such as a settlement or packing description, or omit the row.",
      `${path}/reason`,
    ));
  }
  return findings;
}

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}
