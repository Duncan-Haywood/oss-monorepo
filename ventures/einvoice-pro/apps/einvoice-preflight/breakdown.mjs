import { isFlatTaxRow, taxGroups, taxKey, taxPercentOf } from "./linenet.mjs";
import { parseDecimal } from "./numbers.mjs";

// Offline mixed-rate tax-breakdown observations.
// Arithmetic / document-shape only — not a tax-law determination.

function finding(rule, message, fix, path, severity) {
  return severity ? { rule, message, fix, path, severity } : { rule, message, fix, path };
}

// EN 16931 BR-CO-17 as CEN's Schematron (1.3.x) tests it: a row at a non-zero rate may differ
// from taxable x rate by less than one currency unit (UBL: strictly less; CII: up to and
// including 1, so the stricter UBL bound is used for both). A zero rate keeps the exact test.
// Only for documents that declare EN 16931 or a CIUS of it (BT-24 urn:cen.eu:en16931...: XRechnung,
// Peppol BIS 3, Factur-X / ZUGFeRD, NLCIUS, CIUS-RO/HR/PT). PINT, ZATCA and the national formats keep
// their own, stricter rules (PINT Oman's ALIGNED-IBRP-S-09-OM, baisa.test.mjs).
export function en16931Tolerance(invoice) {
  return /^urn:cen\.eu:en16931:/i.test(String(invoice?.specification_id ?? "").trim());
}

export function withinRoundingTolerance(tax, expectedTax, percent) {
  if (tax === null || expectedTax === null || !percent) return false;
  return Math.round(Math.abs(tax - expectedTax) * 100) < 100;
}

// The document tax total (BT-110) may be the sum of the breakdown rows' tax (BR-CO-14) when
// each row is within BR-CO-17's tolerance; returns that sum, or null when a row is not.
export function breakdownTaxWithinTolerance(invoice) {
  const rows = invoice?.tax_breakdown;
  if (!en16931Tolerance(invoice) || !Array.isArray(rows) || rows.length === 0) return null;
  let sum = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const tax = money(row.tax);
    if (tax === null) return null;
    if (!isFlatTaxRow(row)) {
      const percent = taxPercentOf(row);
      const taxable = money(row.taxable);
      if (percent === null || taxable === null) return null;
      const expectedTax = roundHalfUpToCents(taxable * percent / 100);
      if (tax !== expectedTax && !withinRoundingTolerance(tax, expectedTax, percent)) return null;
    }
    sum = roundHalfUpToCents(sum + tax);
  }
  return sum;
}

// numbers.mjs: the same reading as the CLI (no 0x64, no 1e400).
const parseNumber = parseDecimal;

function roundHalfUpToCents(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(value) * 100).toPrecision(15)))) / 100;
}

function money(value) {
  const parsed = parseNumber(value);
  return parsed === null ? null : roundHalfUpToCents(parsed);
}

function rateKey(value) {
  const parsed = parseNumber(value);
  return parsed === null ? null : String(parsed);
}

function checkRows(rows, expected, withCategory, unattributed, tolerant) {
  const findings = [];
  const seen = new Map();
  rows.forEach((row, index) => {
    const path = `/tax_breakdown/${index}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} is not an object.`,
        "Provide tax_percent, taxable, and tax on each breakdown row.",
        path,
      ));
      return;
    }
    const percent = taxPercentOf(row);
    const taxable = money(row.taxable);
    const tax = money(row.tax);
    // A flat-amount tax (no percentage, a scheme other than VAT/GST) has no rate to
    // check and no line group to match; only its tax amount must be readable.
    if (isFlatTaxRow(row)) {
      if (tax === null) {
        findings.push(finding(
          "INV-038",
          `Tax breakdown row ${index + 1} tax amount is missing or invalid.`,
          "Set tax to the flat amount charged under this tax scheme.",
          `${path}/tax`,
        ));
      }
      return;
    }
    if (percent === null || percent < 0 || percent > 100) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} tax percentage is missing or invalid.`,
        "Use the tax percentage supplied by your authoritative source; this tool does not choose it.",
        `${path}/tax_percent`,
      ));
      return;
    }
    const key = taxKey(row, withCategory) ?? rateKey(percent);
    if (seen.has(key)) {
      findings.push(finding(
        "INV-038",
        "Tax breakdown repeats the same tax percentage on more than one row.",
        "Keep one breakdown row per tax percentage.",
        `${path}/tax_percent`,
      ));
      return;
    }
    seen.set(key, index);
    // A negative taxable amount is a credited line group, which is allowed.
    if (taxable === null) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} taxable amount is missing or invalid.`,
        "Set taxable to the net of the lines at this rate.",
        `${path}/taxable`,
      ));
      return;
    }
    if (tax === null) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} tax amount is missing or invalid.`,
        "Set tax to taxable times the row percentage, rounded to cents.",
        `${path}/tax`,
      ));
      return;
    }
    const expectedTax = roundHalfUpToCents(taxable * percent / 100);
    // PINT Oman: the row's tax may be the sum of its lines' own VAT amounts (linenet.mjs).
    const lineTax = expected.get(key)?.lineTax ?? null;
    if (tax !== expectedTax && !(lineTax !== null && !unattributed && tax === lineTax)) {
      if (tolerant && withinRoundingTolerance(tax, expectedTax, percent)) {
        // EN 16931 BR-CO-17 accepts a row tax under one currency unit away from taxable x rate
        // (CEN Schematron 1.3.x, UBL and CII); VAT rounded per line lands here. The official
        // validators pass it, so it is a note to the sender, not a rejection (quality audit
        // 2026-11-19: 80 of 80 such files blocked here, all passed by CEN).
        const off = roundHalfUpToCents(Math.abs(tax - expectedTax));
        findings.push(finding(
          "INV-038",
          `Tax breakdown row ${index + 1} tax amount is ${off.toFixed(2)} off taxable times the percentage (${expectedTax.toFixed(2)}); EN 16931 (BR-CO-17) accepts a difference under one currency unit, usually VAT rounded per line.`,
          `No change is needed for EN 16931 receivers; set tax to ${expectedTax.toFixed(2)} if your receiver checks VAT per rate to the cent.`,
          `${path}/tax`,
          "warning",
        ));
      } else {
        findings.push(finding(
          "INV-038",
          `Tax breakdown row ${index + 1} tax amount does not equal taxable times the percentage.`,
          `Set tax to ${expectedTax} or correct taxable and tax_percent.`,
          `${path}/tax`,
        ));
      }
    }
    const group = expected.get(key);
    // A zero row with no line is how EN 16931 documents carry a zero-amount
    // header allowance or charge (BR-CO-17 still holds: 0 x rate = 0).
    if (!group && !unattributed && taxable === 0 && tax === 0) return;
    if (!group && !unattributed) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} names a tax percentage that no line uses.`,
        "Remove the extra row, or correct the line tax percentages.",
        `${path}/tax_percent`,
      ));
      return;
    }
    if (group && !unattributed && taxable !== group.taxable) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} taxable amount does not match the lines at that rate.`,
        `Set taxable to ${group.taxable} or correct the line nets.`,
        `${path}/taxable`,
      ));
    }
  });
  for (const [key, group] of expected) {
    // The mirror of the zero row above: lines whose nets sum to zero at a rate carry
    // no tax, so no row is needed (ZATCA's prepayment-deduction line at the advance's
    // old rate: quantity 0, net 0.00, its 5% detail in the line's own TaxTotal).
    if (group && group.taxable === 0) continue;
    if (!seen.has(key) && !unattributed) {
      findings.push(finding(
        "INV-038",
        "Tax breakdown is missing a row for a tax percentage used on the lines.",
        "Add one breakdown row per line tax percentage.",
        "/tax_breakdown",
      ));
    }
  }
  return findings;
}

export function inspectTaxBreakdown(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) return [];
  const { groups: expected, unattributed, withCategory } = taxGroups(invoice);
  const supplied = invoice.tax_breakdown;
  const missing = !("tax_breakdown" in invoice) || supplied === null || supplied === undefined || supplied === "";
  if (missing || (Array.isArray(supplied) && supplied.length === 0)) {
    if (expected.size > 1) {
      return [finding(
        "INV-037",
        "Invoice mixes tax rates without a per-rate tax breakdown.",
        "Add tax_breakdown with one row per rate (tax_percent, taxable, tax), or use a single tax percentage.",
        "/tax_breakdown",
      )];
    }
    return [];
  }
  if (!Array.isArray(supplied)) {
    return [finding(
      "INV-038",
      "Tax breakdown is not a list of per-rate rows.",
      "Provide tax_breakdown as an array of objects with tax_percent, taxable, and tax.",
      "/tax_breakdown",
    )];
  }
  return checkRows(supplied, expected, withCategory, unattributed, en16931Tolerance(invoice));
}
