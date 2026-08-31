// Offline mixed-rate tax-breakdown observations.
// Arithmetic / document-shape only — not a tax-law determination.

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "" || !Number.isFinite(Number(text))) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

function roundHalfUpToCents(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

function money(value) {
  const parsed = parseNumber(value);
  return parsed === null ? null : roundHalfUpToCents(parsed);
}

function rateKey(value) {
  const parsed = parseNumber(value);
  return parsed === null ? null : String(parsed);
}

function lineGroups(lines) {
  const groups = new Map();
  if (!Array.isArray(lines)) return groups;
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const quantity = parseNumber(line.quantity);
    const price = money(line.unit_price);
    const tax = parseNumber(line.tax_percent);
    if (quantity === null || quantity <= 0 || price === null || price < 0) continue;
    if (tax === null || tax < 0 || tax > 100) continue;
    const lineNet = roundHalfUpToCents(quantity * price);
    const lineTax = roundHalfUpToCents(lineNet * tax / 100);
    const key = rateKey(tax);
    const bucket = groups.get(key) || { taxable: 0, tax: 0 };
    bucket.taxable = roundHalfUpToCents(bucket.taxable + lineNet);
    bucket.tax = roundHalfUpToCents(bucket.tax + lineTax);
    groups.set(key, bucket);
  }
  return groups;
}

function checkRows(rows, expected) {
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
    const percent = parseNumber(row.tax_percent);
    const taxable = money(row.taxable);
    const tax = money(row.tax);
    if (percent === null || percent < 0 || percent > 100) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} tax percentage is missing or invalid.`,
        "Use the tax percentage supplied by your authoritative source; this tool does not choose it.",
        `${path}/tax_percent`,
      ));
      return;
    }
    const key = rateKey(percent);
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
    if (taxable === null || taxable < 0) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} taxable amount is missing or invalid.`,
        "Set taxable to the net of the lines at this rate.",
        `${path}/taxable`,
      ));
      return;
    }
    if (tax === null || tax < 0) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} tax amount is missing or invalid.`,
        "Set tax to taxable times the row percentage, rounded to cents.",
        `${path}/tax`,
      ));
      return;
    }
    const expectedTax = roundHalfUpToCents(taxable * percent / 100);
    if (tax !== expectedTax) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} tax amount does not equal taxable times the percentage.`,
        `Set tax to ${expectedTax} or correct taxable and tax_percent.`,
        `${path}/tax`,
      ));
    }
    const group = expected.get(key);
    if (!group) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} names a tax percentage that no line uses.`,
        "Remove the extra row, or correct the line tax percentages.",
        `${path}/tax_percent`,
      ));
      return;
    }
    if (taxable !== group.taxable) {
      findings.push(finding(
        "INV-038",
        `Tax breakdown row ${index + 1} taxable amount does not match the lines at that rate.`,
        `Set taxable to ${group.taxable} or correct the line nets.`,
        `${path}/taxable`,
      ));
    }
  });
  for (const key of expected.keys()) {
    if (!seen.has(key)) {
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
  const expected = lineGroups(invoice.lines);
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
  return checkRows(supplied, expected);
}
