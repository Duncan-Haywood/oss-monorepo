// Format-neutral invoice checks. Mirrors src/einvoice_preflight/checks.py so
// the browser page and the CLI report the same rule IDs, messages, and
// cent-rounded arithmetic. This is an observation, not a legal validity claim.

import { headerAdjustmentNetDelta, inspectHeaderAdjustments } from "./adjustment.mjs";
import { inspectPaymentBic } from "./bic.mjs";
import { inspectTaxBreakdown } from "./breakdown.mjs";
import { inspectDocumentType } from "./document.mjs";
import { inspectPartyEndpoint } from "./endpoint.mjs";
import { inspectPaymentIban } from "./iban.mjs";
import { inspectPaymentMeans } from "./means.mjs";
import { inspectInvoicePeriod } from "./period.mjs";
import { inspectCommercialReferences } from "./reference.mjs";
import { inspectPaymentRemittance } from "./remittance.mjs";
import { inspectTaxExemption } from "./tax.mjs";
import { inspectPaymentTerms } from "./terms.mjs";
import { inspectPartyVat } from "./vat.mjs";

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "" || !Number.isFinite(Number(text))) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

export function roundHalfUpToCents(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

function money(value) {
  const parsed = parseNumber(value);
  return parsed === null ? null : roundHalfUpToCents(parsed);
}

function isoDate(value) {
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

export function checkInvoice(invoice) {
  const errors = [];
  const fail = (rule, message, fix, path = "") => {
    errors.push({ rule, message, fix, path });
  };

  if (invoice === null || typeof invoice !== "object" || Array.isArray(invoice)) {
    return [{
      rule: "INV-001",
      message: "Invoice must be a JSON object.",
      fix: "Provide the invoice object at the document root.",
      path: "",
    }];
  }

  for (const field of ["invoice_number", "issue_date", "currency", "supplier", "customer", "lines", "totals"]) {
    if (!(field in invoice)) {
      fail("INV-001", `Required field '${field}' is missing.`, `Add a '${field}' field.`, `/${field}`);
    }
  }

  if (typeof invoice.invoice_number !== "string" || !invoice.invoice_number.trim()) {
    fail("INV-002", "Invoice number is empty or not text.", "Provide a non-empty invoice number.", "/invoice_number");
  }

  const issueDate = isoDate(invoice.issue_date);
  if (issueDate === null) {
    fail("INV-003", "Issue date is not an ISO date.", "Use YYYY-MM-DD, for example 2026-08-24.", "/issue_date");
  }

  if ("due_date" in invoice && invoice.due_date !== null && invoice.due_date !== "") {
    const dueDate = isoDate(invoice.due_date);
    if (dueDate === null) {
      fail("INV-020", "Due date is not an ISO date.", "Use YYYY-MM-DD, for example 2026-09-23.", "/due_date");
    }
    if (dueDate !== null && issueDate !== null && dueDate < issueDate) {
      fail("INV-021", "Due date is earlier than the issue date.", "Set due date to the issue date or a later date.", "/due_date");
    }
  }

  if (
    typeof invoice.currency !== "string" ||
    invoice.currency.length !== 3 ||
    invoice.currency === invoice.currency.toLowerCase() ||
    invoice.currency !== invoice.currency.toUpperCase()
  ) {
    fail("INV-004", "Currency is not a three-letter uppercase code.", "Use an ISO-style code such as EUR or GBP.", "/currency");
  }

  for (const partyName of ["supplier", "customer"]) {
    const party = invoice[partyName];
    if (!party || typeof party !== "object" || Array.isArray(party) || typeof party.id !== "string" || !party.id.trim()) {
      fail("INV-005", `${capitalize(partyName)} identifier is missing.`, `Add the ${partyName} identifier from the source system.`, `/${partyName}/id`);
    }
    if (!party || typeof party !== "object" || Array.isArray(party) || typeof party.name !== "string" || !party.name.trim()) {
      fail("INV-006", `${capitalize(partyName)} name is missing.`, `Add the ${partyName} name.`, `/${partyName}/name`);
    }
    if (party && typeof party === "object" && !Array.isArray(party)) {
      for (const finding of inspectPartyVat(party, partyName)) {
        fail(finding.rule, finding.message, finding.fix, finding.path);
      }
      for (const finding of inspectPartyEndpoint(party, partyName)) {
        fail(finding.rule, finding.message, finding.fix, finding.path);
      }
    }
  }
  for (const finding of inspectPaymentIban(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectPaymentMeans(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectPaymentTerms(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectPaymentBic(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectPaymentRemittance(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectDocumentType(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectTaxExemption(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectTaxBreakdown(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectInvoicePeriod(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectCommercialReferences(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }
  for (const finding of inspectHeaderAdjustments(invoice)) {
    fail(finding.rule, finding.message, finding.fix, finding.path);
  }

  let lines = invoice.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    fail("INV-007", "Invoice has no line items.", "Add at least one line item.", "/lines");
    lines = [];
  }

  let expectedNet = 0;
  let expectedTax = 0;
  lines.forEach((line, index) => {
    const n = index + 1;
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      fail("INV-008", `Line ${n} is not an object.`, "Provide description, quantity, unit_price, and tax_percent.", `/lines/${index}`);
      return;
    }
    if (typeof line.description !== "string" || !line.description.trim()) {
      fail("INV-008", `Line ${n} has no description.`, "Add a human-readable line description.", `/lines/${index}/description`);
    }
    const quantity = parseNumber(line.quantity);
    const price = money(line.unit_price);
    const tax = parseNumber(line.tax_percent);
    if (quantity === null || quantity <= 0) {
      fail("INV-009", `Line ${n} quantity is invalid.`, "Use a positive numeric quantity.", `/lines/${index}/quantity`);
    }
    if (price === null || price < 0) {
      fail("INV-010", `Line ${n} unit price is invalid.`, "Use a non-negative numeric unit price.", `/lines/${index}/unit_price`);
    }
    if (tax === null || tax < 0 || tax > 100) {
      fail(
        "INV-011",
        `Line ${n} tax percentage is invalid.`,
        "Use the tax percentage supplied by your authoritative source; this tool does not choose it.",
        `/lines/${index}/tax_percent`,
      );
    }
    if (quantity !== null && price !== null && quantity > 0 && price >= 0) {
      const lineNet = roundHalfUpToCents(quantity * price);
      expectedNet = roundHalfUpToCents(expectedNet + lineNet);
      if (tax !== null && tax >= 0 && tax <= 100) {
        expectedTax = roundHalfUpToCents(expectedTax + roundHalfUpToCents((lineNet * tax) / 100));
      }
      const supplied = money(line.net);
      if (supplied === null || supplied !== lineNet) {
        fail(
          "INV-012",
          `Line ${n} net is missing or does not match quantity times unit price.`,
          `Set line net to ${formatMoney(lineNet)} or correct the inputs.`,
          `/lines/${index}/net`,
        );
      }
    }
  });
  expectedNet = roundHalfUpToCents(expectedNet + headerAdjustmentNetDelta(invoice));
  if (expectedNet < 0) expectedNet = 0;

  const totals = invoice.totals && typeof invoice.totals === "object" && !Array.isArray(invoice.totals)
    ? invoice.totals
    : {};
  const net = money(totals.net);
  const taxTotal = money(totals.tax);
  const gross = money(totals.gross);

  if (net === null || net < 0) {
    fail("INV-013", "Invoice net total is missing or invalid.", "Provide a non-negative numeric net total.", "/totals/net");
  } else if (net !== expectedNet) {
    if (invoice.adjustments) {
      fail("INV-014", "Invoice net total does not match line items after header allowances and charges.", `Set net total to ${formatMoney(expectedNet)} or correct the line items and adjustments.`, "/totals/net");
    } else {
      fail("INV-014", "Invoice net total does not match its line items.", `Set net total to ${formatMoney(expectedNet)} or correct the line items.`, "/totals/net");
    }
  }
  if (taxTotal === null || taxTotal < 0) {
    fail("INV-015", "Invoice tax total is missing or invalid.", "Provide a non-negative numeric tax total.", "/totals/tax");
  } else if (taxTotal !== expectedTax) {
    fail("INV-018", "Invoice tax total does not match its line tax percentages.", `Set tax total to ${formatMoney(expectedTax)} or correct the line inputs.`, "/totals/tax");
  }
  if (gross === null || gross < 0) {
    fail("INV-016", "Invoice gross total is missing or invalid.", "Provide a non-negative numeric gross total.", "/totals/gross");
  } else if (net !== null && taxTotal !== null && gross !== roundHalfUpToCents(net + taxTotal)) {
    fail("INV-017", "Gross total does not equal net plus tax.", `Set gross total to ${formatMoney(roundHalfUpToCents(net + taxTotal))} or correct the totals.`, "/totals/gross");
  }

  const prepaid = optionalMoney(totals, "prepaid");
  if (prepaid !== undefined) {
    if (prepaid === null || prepaid < 0) {
      fail("INV-028", "Prepaid amount is missing or invalid.", "Provide a non-negative numeric prepaid amount, or omit totals.prepaid.", "/totals/prepaid");
    } else if (gross !== null && gross >= 0 && prepaid > gross) {
      fail("INV-028", "Prepaid amount is greater than the invoice gross.", `Set prepaid to at most ${formatMoney(gross)} or correct the totals.`, "/totals/prepaid");
    }
  }
  const due = optionalMoney(totals, "due");
  if (due !== undefined) {
    if (due === null || due < 0) {
      fail("INV-029", "Amount due is missing or invalid.", "Provide a non-negative numeric amount due, or omit totals.due.", "/totals/due");
    } else if (gross !== null && gross >= 0 && (prepaid === undefined || prepaid === null || prepaid >= 0)) {
      const applied = prepaid !== undefined && prepaid !== null && prepaid >= 0 ? prepaid : 0;
      let expectedDue = roundHalfUpToCents(gross - applied);
      if (expectedDue < 0) expectedDue = 0;
      if (due !== expectedDue) {
        fail("INV-029", "Amount due does not equal gross minus prepaid.", `Set amount due to ${formatMoney(expectedDue)} or correct prepaid and gross.`, "/totals/due");
      }
    }
  }

  return errors;
}

function optionalMoney(totals, key) {
  if (!(key in totals) || totals[key] === null || totals[key] === "") return undefined;
  return money(totals[key]);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMoney(value) {
  return value.toFixed(2);
}

// Two suppliers may both issue "1001"; the same supplier issuing it twice is
// the duplicate-payment risk. Key on supplier identity + number (supplier id, VAT
// id, or name; invoices with no seller identity share one bucket).
function sellerKey(invoice) {
  const seller = invoice.supplier && typeof invoice.supplier === "object" ? invoice.supplier : {};
  for (const field of ["id", "vat_id", "name"]) {
    if (typeof seller[field] === "string" && seller[field].trim()) {
      return `${field}:${seller[field].trim().toLowerCase().replace(/\s+/g, " ")}`;
    }
  }
  return "";
}

export function flagDuplicateInvoiceNumbers(invoices) {
  const byNumber = new Map();
  for (const { name, invoice } of invoices) {
    if (invoice && typeof invoice === "object" && typeof invoice.invoice_number === "string") {
      const number = invoice.invoice_number.trim();
      if (!number) continue;
      const key = `${sellerKey(invoice)}\u0000${number}`;
      const list = byNumber.get(key) || [];
      list.push(name);
      byNumber.set(key, list);
    }
  }
  const duplicates = new Set();
  for (const names of byNumber.values()) {
    if (names.length > 1) names.forEach((name) => duplicates.add(name));
  }
  return duplicates;
}
