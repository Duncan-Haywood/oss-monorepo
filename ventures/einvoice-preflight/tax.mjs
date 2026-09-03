// Offline 0% / exemption-category tax-reason observations.
// Shape check only — not a tax-law determination.

const EXEMPT_CATEGORIES = new Set(["E", "AE", "K", "G", "O", "Z"]);

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeTaxCategory(value) {
  if (typeof value !== "string") return null;
  const compact = value.trim().toUpperCase();
  return compact || null;
}

export function looksLikeExemptionCategory(value) {
  const category = normalizeTaxCategory(value);
  return category !== null && EXEMPT_CATEGORIES.has(category);
}

function usableReason(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function usableReasonCode(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "") !== "";
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "" || !Number.isFinite(Number(text))) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

function needsReason(line) {
  if (looksLikeExemptionCategory(line.tax_category)) return true;
  const tax = parseNumber(line.tax_percent);
  return tax !== null && tax === 0;
}

function explicitEmpty(holder, key, path) {
  if (!(key in holder) || holder[key] === null || holder[key] === undefined) return [];
  const usable = key.endsWith("_code") ? usableReasonCode(holder[key]) : usableReason(holder[key]);
  if (usable) return [];
  const label = key.endsWith("_code") ? "Tax exemption reason code" : "Tax exemption reason";
  return [finding(
    "INV-036",
    `${label} is empty or not text.`,
    `Provide ${key} as text, or omit it if the line is not 0% or exempt.`,
    path,
  )];
}

export function inspectTaxExemption(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) return [];
  const findings = [];
  const documentOk = usableReason(invoice.tax_exemption_reason)
    || usableReasonCode(invoice.tax_exemption_reason_code);
  findings.push(...explicitEmpty(invoice, "tax_exemption_reason", "/tax_exemption_reason"));
  findings.push(...explicitEmpty(invoice, "tax_exemption_reason_code", "/tax_exemption_reason_code"));

  const lines = invoice.lines;
  if (!Array.isArray(lines)) return findings;
  lines.forEach((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) return;
    const pathReason = `/lines/${index}/tax_reason`;
    const pathCode = `/lines/${index}/tax_reason_code`;
    findings.push(...explicitEmpty(line, "tax_reason", pathReason));
    findings.push(...explicitEmpty(line, "tax_reason_code", pathCode));
    if (!needsReason(line)) return;
    if (usableReason(line.tax_reason) || usableReasonCode(line.tax_reason_code) || documentOk) {
      return;
    }
    findings.push(finding(
      "INV-035",
      "A 0% or exempt line is missing the tax exemption reason networks require.",
      "Add tax_reason or tax_reason_code on the line (or tax_exemption_reason on the invoice), or correct the tax percentage.",
      pathReason,
    ));
  });
  return findings;
}
