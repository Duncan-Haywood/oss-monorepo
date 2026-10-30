import { checkInvoice, flagDuplicateInvoiceNumbers } from "./checks.mjs";
import { inspectCreditLinks } from "./creditlink.mjs";
import { inspectXrechnungProfile, inspectPeppolProfile, inspectFrenchProfile } from "./profile.mjs";
import { looksLikeCii, parseCiiInvoice } from "./cii.mjs";
import { checkPdfEnvelope } from "./pdf-envelope.mjs";
import { envelopeNote, extractEmbeddedInvoice, looksLikePdf } from "./facturx.mjs";
import { looksLikeXml, parseUblInvoice } from "./ubl.mjs";
import { checkFatturaPa, looksLikeFatturaPa } from "./fatturapa.mjs";
import { checkFa3, looksLikeFa3 } from "./fa3.mjs";

export const DEFAULT_MAX_BYTES = 1_048_576;
export const DEFAULT_MAX_FILES = 50;

function redactValues(text) {
  return String(text).replace(/\b\d+(?:\.\d+)?\b/g, "[value]");
}

export async function inspectInvoiceSource(name, source) {
  let payload = source;
  let envelope = "";
  let pdfFindings = [];
  if (looksLikePdf(name, source)) {
    const extracted = await extractEmbeddedInvoice(source);
    payload = extracted.payload;
    const peek = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
    envelope = envelopeNote(extracted.label, looksLikeCii(peek) ? "cii" : "ubl");
    pdfFindings = checkPdfEnvelope(source, peek);
  }
  const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
  let invoice;
  let xml = "";
  if (looksLikeXml(name, text) || looksLikeCii(text)) {
    xml = text;
    invoice = looksLikeCii(text) ? parseCiiInvoice(text) : parseUblInvoice(text);
  } else {
    invoice = JSON.parse(text);
  }
  return { invoice, envelope, xml, pdfFindings };
}

export async function parseInvoiceSource(name, source) {
  return (await inspectInvoiceSource(name, source)).invoice;
}

export async function preflightDocuments(inputs, { maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES, profile = "", schematron = false } = {}) {
  const reports = [];
  const readErrors = [];
  const parsed = [];

  if (inputs.length > maxFiles) {
    return {
      reports,
      readErrors: [{
        file: "(batch)",
        error: `Batch contains ${inputs.length} invoices, exceeding the ${maxFiles}-file limit. Split the batch.`,
      }],
    };
  }

  for (const input of inputs) {
    const name = input.name || "invoice.json";
    const source = input.source ?? "";
    const bytes = typeof source === "string" ? new TextEncoder().encode(source).length : source.length;
    if (bytes > maxBytes) {
      readErrors.push({
        file: name,
        error: `File exceeds ${maxBytes} bytes; refusing to read it.`,
      });
      continue;
    }
    try {
      const peek = typeof source === "string" ? source : new TextDecoder().decode(source);
      if (!looksLikePdf(name, source) && looksLikeFatturaPa(peek)) {
        // Italy's FatturaPA is its own schema, not EN 16931: own rules, no UBL/CII reading.
        const italian = checkFatturaPa(peek);
        reports.push({ file: name, errors: italian.findings, envelope: "Read as Italian FatturaPA (SdI), not EN 16931", ...(italian.skipped.length ? { skipped: italian.skipped } : {}) });
        continue;
      }
      if (!looksLikePdf(name, source) && looksLikeFa3(peek)) {
        // Poland's KSeF FA(3) is its own schema, not EN 16931: own rules, no UBL/CII reading.
        const polish = checkFa3(peek);
        reports.push({ file: name, errors: polish.findings, envelope: "Read as Polish KSeF FA(3), not EN 16931", ...(polish.skipped.length ? { skipped: polish.skipped } : {}) });
        continue;
      }
      const { invoice, envelope, xml, pdfFindings } = await inspectInvoiceSource(name, source);
      const errors = checkInvoice(invoice);
      errors.push(...pdfFindings);
      if (profile === "xrechnung") errors.push(...inspectXrechnungProfile(invoice));
      if (profile === "peppol") errors.push(...inspectPeppolProfile(invoice));
      if (profile === "france") errors.push(...inspectFrenchProfile(invoice));
      let schematronStatus = "";
      if (schematron) {
        // The official rules, beside the built-in ones. JSON drafts have no XML to check.
        // Loaded on demand: schematron.mjs needs node:fs, which a browser page cannot import.
        const { runSchematron } = await import("./schematron.mjs");
        const official = xml ? runSchematron(xml) : { status: "unavailable", findings: [] };
        schematronStatus = official.status;
        errors.push(...official.findings);
      }
      reports.push({ file: name, errors, envelope, ...(schematron ? { schematron: schematronStatus } : {}) });
      parsed.push({ name, invoice });
    } catch (error) {
      readErrors.push({
        file: name,
        error: error instanceof Error ? error.message : "Invoice could not be read.",
      });
    }
  }

  const duplicates = flagDuplicateInvoiceNumbers(parsed);
  for (const report of reports) {
    if (duplicates.has(report.file)) {
      report.errors.push({
        rule: "INV-019",
        message: "Invoice number is repeated in this batch.",
        fix: "Use a unique invoice number or remove the duplicate before submission.",
        path: "/invoice_number",
      });
    }
  }

  const links = inspectCreditLinks(parsed);
  for (const report of reports) {
    if (links.has(report.file)) report.errors.push(...links.get(report.file));
  }

  return { reports, readErrors };
}

// A "note" is listed but does not fail a file: a style observation the standard does not require.
export const isBlocking = (finding) => finding.severity !== "note";
const blockingCount = (report) => report.errors.filter(isBlocking).length;

export function summarizePreflight({ reports, readErrors }) {
  const findings = reports.flatMap((report) => report.errors);
  const failed = reports.filter((report) => blockingCount(report) > 0).length;
  const ruleCounts = {};
  const ruleMessages = {};
  const ruleFixes = {};
  for (const error of findings) {
    ruleCounts[error.rule] = (ruleCounts[error.rule] || 0) + 1;
    ruleMessages[error.rule] = error.message;
    ruleFixes[error.rule] = error.fix;
  }
  return {
    status: findings.some(isBlocking) || readErrors.length ? "fail" : "pass",
    filesChecked: reports.length,
    filesFailed: failed,
    filesPassed: reports.length - failed,
    observations: findings.length,
    readErrors: readErrors.length,
    ruleCounts,
    ruleMessages,
    ruleFixes,
  };
}

export function buildChecklist({ reports, readErrors }) {
  const summary = summarizePreflight({ reports, readErrors });
  const lines = [
    "E-invoice preflight repair checklist",
    "",
    `Status: ${summary.status === "pass" ? "PASS" : "FAIL"}`,
    `Checked: ${summary.filesChecked} invoice(s)`,
    `Observations: ${summary.observations}`,
    `Read errors: ${summary.readErrors}`,
    "",
  ];
  for (const report of reports) {
    lines.push(`[ ] Review ${report.file}`);
    if (report.envelope) lines.push(`    ${report.envelope}`);
    if (report.errors.length === 0) {
      lines.push("    No supported defects found.");
      continue;
    }
    const grouped = new Map();
    for (const error of report.errors) {
      const item = grouped.get(error.rule) || { count: 0, paths: [], message: error.message, fix: error.fix };
      item.count += 1;
      if (!item.paths.includes(error.path)) item.paths.push(error.path);
      grouped.set(error.rule, item);
    }
    for (const rule of [...grouped.keys()].sort()) {
      const item = grouped.get(rule);
      const suffix = item.count !== 1 ? ` (${item.count} occurrence(s))` : "";
      lines.push(`    - [ ] ${rule}${suffix} at ${item.paths.join(", ")}: ${redactValues(item.message)}`);
      lines.push(`      Fix: ${redactValues(item.fix)}`);
    }
  }
  if (readErrors.length) {
    lines.push("", "Unreadable inputs:");
    for (const error of readErrors) lines.push(`- [ ] Review ${error.file}: ${error.error}`);
  }
  lines.push(
    "",
    "This is a local observation checklist, not a declaration of legal validity or compliance.",
    "Review and verify each change before submitting an invoice.",
  );
  return lines.join("\n") + "\n";
}

export function buildMarkdown({ reports, readErrors }) {
  const summary = summarizePreflight({ reports, readErrors });
  const escape = (value) => String(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("`", "\\`");
  const lines = [
    "# E-invoice preflight",
    "",
    `Overall: **${summary.status.toUpperCase()}**`,
    `Checked: ${summary.filesChecked} invoice(s)`,
    `Passed: ${summary.filesPassed}`,
    `Failed: ${summary.filesFailed}`,
    `Observations: ${summary.observations}`,
    `Read errors: ${summary.readErrors}`,
    "",
  ];
  const rules = Object.keys(summary.ruleCounts).sort();
  if (rules.length) {
    lines.push("## Finding summary", "", "| Rule | Occurrences | Check | Recommended fix |", "| --- | ---: | --- | --- |");
    for (const rule of rules) {
      lines.push(`| \`${escape(rule)}\` | ${summary.ruleCounts[rule]} | ${escape(summary.ruleMessages[rule])} | ${escape(summary.ruleFixes[rule])} |`);
    }
    lines.push("");
  }
  for (const report of reports) {
    lines.push(`## \`${escape(report.file)}\``);
    if (report.envelope) lines.push("", report.envelope);
    if (report.errors.length === 0) {
      lines.push("", "Status: **PASS**", "", "No defects found in the supported checks.", "");
      continue;
    }
    lines.push("", blockingCount(report) ? "Status: **FAIL**" : "Status: **PASS** (notes only)", "");
    for (const error of report.errors) {
      lines.push(`- ${error.severity === "note" ? "_note_ " : ""}**${escape(error.rule)}** at \`${escape(error.path || "/")}\`: ${escape(error.message)}`);
      lines.push(`  Fix: ${escape(error.fix)}`);
    }
    lines.push("");
  }
  if (readErrors.length) {
    lines.push("## Read errors", "");
    for (const error of readErrors) lines.push(`- \`${escape(error.file)}\`: ${escape(error.error)}`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

export function buildJsonReport({ reports, readErrors }) {
  const summary = summarizePreflight({ reports, readErrors });
  const errors = reports.flatMap((report) => report.errors.map((error) => ({ ...error, file: report.file })));
  const fixes = Object.keys(summary.ruleCounts).sort().map((rule) => ({
    rule,
    occurrences: summary.ruleCounts[rule],
    message: summary.ruleMessages[rule],
    fix: summary.ruleFixes[rule],
  }));
  return {
    schema_version: 1,
    status: summary.status,
    exit_code: readErrors.length ? 2 : errors.some(isBlocking) ? 1 : 0,
    files_checked: summary.filesChecked,
    files_failed: summary.filesFailed,
    observations: summary.observations,
    rules: Object.fromEntries(Object.keys(summary.ruleCounts).sort().map((rule) => [rule, summary.ruleCounts[rule]])),
    fixes,
    file: reports.length === 1 ? reports[0].file : null,
    errors,
    read_errors: readErrors,
    reports: reports.map((report) => ({
      file: report.file,
      status: blockingCount(report) ? "fail" : "pass",
      ...(report.schematron ? { schematron: report.schematron } : {}),
      observations: report.errors.length,
      errors: report.errors,
    })),
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildRemediationCsv({ reports, readErrors }) {
  const grouped = new Map();
  for (const report of reports) {
    for (const finding of report.errors) {
      const item = grouped.get(finding.rule) || {
        rule: finding.rule,
        occurrences: 0,
        message: finding.message,
        fix: finding.fix,
      };
      item.occurrences += 1;
      grouped.set(finding.rule, item);
    }
  }
  const rows = [...grouped.keys()].sort().map((rule) => grouped.get(rule));
  if (readErrors.length) {
    rows.push({
      rule: "INV-READ",
      occurrences: readErrors.length,
      message: "Invoice could not be read.",
      fix: "Resolve the read error and run the preflight again.",
    });
  }
  const header = ["rule", "occurrences", "message", "fix"];
  const lines = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvCell(row[key])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}
