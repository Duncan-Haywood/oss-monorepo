import { parseIsdocInvoice } from "./isdoc.mjs";
import { checkInvoice, flagDuplicateInvoiceNumbers } from "./checks.mjs";
import { inspectCreditLinks } from "./creditlink.mjs";
import { steppedAside } from "./aside.mjs";
import { inspectXrechnungProfile, inspectPeppolProfile, inspectFrenchProfile } from "./profile.mjs";
import { looksLikeCii, parseCiiInvoice } from "./cii.mjs";
import { checkPdfEnvelope } from "./pdf-envelope.mjs";
import { envelopeNote, extractEmbeddedInvoice, looksLikePdf } from "./facturx.mjs";
import { looksLikeXml, parseUblInvoice } from "./ubl.mjs";
import { checkFatturaPa, looksLikeFatturaPa } from "./fatturapa.mjs";
import { checkFa3, looksLikeFa3 } from "./fa3.mjs";
import { checkCfdi, looksLikeCfdi } from "./cfdi.mjs";
import { checkNfe, looksLikeNfe } from "./nfe.mjs";
import { checkNfse, looksLikeNfse } from "./nfse.mjs";

export const DEFAULT_MAX_BYTES = 1_048_576;
export const DEFAULT_MAX_FILES = 50;

function redactValues(text) {
  return String(text).replace(/\b\d+(?:\.\d+)?\b/g, "[value]");
}

// ISDOC (the Czech national invoice XML) sits in the http://isdoc.cz/namespace/2013 namespace.
export function looksLikeIsdoc(text) {
  return /xmlns(?::\w+)?\s*=\s*["']http:\/\/isdoc\.cz\/namespace\/2013["']/.test(String(text).slice(0, 4096));
}

export const ISDOC_MESSAGE = "This is an ISDOC invoice (the Czech national format). The checker reads UBL, CII, Factur-X, FatturaPA, FA(3), CFDI 4.0, NF-e 4.00 and the national NFS-e, not ISDOC, and applies no Czech national rules. Export the invoice from your accounting software as Peppol BIS (UBL) or EN 16931 and check that file instead.";

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
      if (!looksLikePdf(name, source) && looksLikeIsdoc(peek)) {
        // Czech ISDOC is its own schema; reading it as UBL gives a misleading "TaxAmount is missing".
        // Best-effort read (unverified element names, see isdoc.mjs): format-neutral checks only.
        try {
          const czech = checkInvoice(parseIsdocInvoice(peek));
          reports.push({ file: name, errors: czech, envelope: "Read as Czech ISDOC (best-effort, unverified; EN 16931 arithmetic and VAT checks only, no Czech rules)" });
        } catch (e) {
          readErrors.push({ file: name, error: ISDOC_MESSAGE + " (best-effort read failed: " + e.message + ")" });
        }
        continue;
      }
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
      if (!looksLikePdf(name, source) && looksLikeCfdi(peek)) {
        // Mexico's CFDI 4.0 is its own schema, not EN 16931: own rules, no UBL/CII reading.
        const mexican = checkCfdi(peek);
        reports.push({ file: name, errors: mexican.findings, envelope: `Read as Mexican CFDI ${mexican.meta.version || ""} (SAT), not EN 16931${mexican.meta.stamped ? "; stamped by a PAC" : "; not stamped"}`, ...(mexican.skipped.length ? { skipped: mexican.skipped } : {}) });
        continue;
      }
      if (!looksLikePdf(name, source) && looksLikeNfe(peek)) {
        // Brazil's NF-e/NFC-e 4.00 is its own schema, not EN 16931: own rules, no UBL/CII reading.
        const brazilian = checkNfe(peek);
        const m = brazilian.meta;
        reports.push({ file: name, errors: brazilian.findings, envelope: `Read as Brazilian ${m.mod === "65" ? "NFC-e" : "NF-e"} ${m.versao || ""} (SEFAZ), not EN 16931${m.authorised ? "; authorised (protocol cStat 100)" : ""}${m.tpAmb === "2" ? "; test environment (tpAmb 2)" : ""}`, ...(brazilian.skipped.length ? { skipped: brazilian.skipped } : {}) });
        continue;
      }
      if (!looksLikePdf(name, source) && looksLikeNfse(peek)) {
        // Brazil's national NFS-e (Padrão Nacional, services) is its own schema: own rules.
        const nfse = checkNfse(peek);
        const m = nfse.meta;
        reports.push({ file: name, errors: nfse.findings, envelope: `Read as a Brazilian national NFS-e ${m.kind === "DPS" ? "DPS (the request)" : "(as issued)"} ${m.versao || ""}, not EN 16931${m.cStat === "100" ? "; issued (cStat 100)" : ""}${m.ambGer === "2" || m.tpAmb === "2" ? "; test environment" : ""}`, ...(nfse.skipped.length ? { skipped: nfse.skipped } : {}) });
        continue;
      }
      const { invoice, envelope, xml, pdfFindings } = await inspectInvoiceSource(name, source);
      // PINT and ZATCA files: built-in EU-convention rules that fire falsely step aside
      // on every route, whether or not the official rules run (aside.mjs).
      const aside = steppedAside(invoice);
      const errors = checkInvoice(invoice).filter((e) => !aside.has(e.rule));
      errors.push(...pdfFindings);
      if (profile === "xrechnung") errors.push(...inspectXrechnungProfile(invoice));
      if (profile === "peppol") errors.push(...inspectPeppolProfile(invoice));
      if (profile === "france") errors.push(...inspectFrenchProfile(invoice));
      let schematronStatus = "";
      if (schematron) {
        // The official rules, beside the built-in ones. JSON drafts have no XML to check.
        // Loaded on demand: schematron.mjs needs node:fs, which a browser page cannot import.
        const { runSchematron } = await import("./schematron.mjs");
        const { runPlain } = await import("./plain-node.mjs");
        // PINT (Singapore, Australia/New Zealand) and ZATCA files carry their own rule sets
        // instead of the EU base, which the Saxon route does not run: the plain-JS runner
        // does, and also stands in when the Saxon files are not built.
        let official = { status: "unavailable", findings: [] };
        let own = false;
        if (xml) {
          const plain = await runPlain(xml);
          own = plain.status === "ok" && (plain.sets || []).some((s) => /^(pint|zatca)/.test(s));
          // The national add-ons (CIUS-RO, CIUS-PT, NLCIUS) have no Saxon form either, and
          // CIUS-RO runs on an older EU base: the Saxon route would check a Romanian file
          // against the current base alone, so the plain route takes those files too.
          const national = plain.status === "ok" && (plain.sets || []).some((s) => /^(cius-ro|cius-pt|nlcius)$/.test(s));
          official = own || national ? plain : runSchematron(xml);
          if (!own && official.status !== "ok" && plain.status === "ok") official = plain;
        }
        schematronStatus = official.status;
        if (own) {
          // The built-in INV-0xx checks assume EU conventions. Where a PINT or ZATCA set
          // governs the file, drop the ones its own invoices trip falsely: local account
          // numbers (not IBANs), non-EU tax ids, and KSA's simplified invoices (no buyer id,
          // a second TaxTotal that repeats the tax with its breakdown).
          const sets = official.sets || [];
          // Under PINT also: the branch id (BT-86) carries an Australian BSB or a
          // Singapore bank code, not a BIC (INV-026); Singapore adds payment means
          // codes such as Z01 for GIRO (INV-044); and GST categories ZR, NG, OS need no
          // EU exemption reason (INV-035), PINT's own sets carry those rules.
          // Measured on OpenPeppol's examples, eval/phive-corpus.mjs (2026-11-11).
          const drop = new Set(["INV-024"]);
          if (sets.some((x) => /^pint/.test(x))) ["INV-026", "INV-044", "INV-035"].forEach((r) => drop.add(r));
          // Japan, Malaysia, the UAE and Oman (OpenPeppol's 113 examples, eval/phive-corpus.mjs,
          // 2026-11-12): the buyer's tax id (BT-48) is a JP T-number, MY TIN, AE TRN or OM VATIN,
          // not an EU VAT number (INV-022; SG and A-NZ examples carry none); a debit note is an
          // Invoice document with code 383, as under ZATCA (INV-034); and the branch id read as
          // a BIC is a local bank code, so its country is no IBAN's (INV-027, beside INV-026).
          if (sets.some((x) => /^pint-(jp|my|ae|om)-/.test(x))) ["INV-022", "INV-027", "INV-034"].forEach((r) => drop.add(r));
          // A seller not registered for Japan's consumption tax states the rate and charges no
          // tax (JP-NTR, urn:peppol:pint:nontaxinvoice-1@jp-1): its own rules check that.
          if (sets.includes("pint-jp-ntr-1")) ["INV-018", "INV-038"].forEach((r) => drop.add(r));
          // The UAE states 5% on a reverse-charge (AE) or margin-scheme (N) row and charges no
          // tax on it: the buyer accounts for it, or the margin is taxed off the invoice. Six of
          // OpenPeppol's 32 AE examples do this; PINT AE's own rules check those rows.
          const zeroAtRate = (row) => ["AE", "N"].includes(String(row?.tax_category || "").toUpperCase()) && Number(row?.tax) === 0 && Number(row?.tax_percent) > 0;
          if (sets.some((x) => /^pint-ae-/.test(x)) && (invoice?.tax_breakdown || []).some(zeroAtRate)) ["INV-018", "INV-038"].forEach((r) => drop.add(r));
          // A flat-amount tax with no percentage (Malaysia's tourism tax, 10 MYR a night) cannot
          // be checked as taxable x rate; PINT MY's rules govern those rows.
          if ((invoice?.tax_breakdown || []).some((row) => row?.tax_scheme && (row.tax_percent === undefined || row.tax_percent === ""))) ["INV-018", "INV-038"].forEach((r) => drop.add(r));
          // Under ZATCA also (ZATCA's 19 good-case examples, eval/phive-corpus.mjs --good,
          // 2026-11-11): a simplified (B2C) invoice names no buyer (INV-006; BR-KSA
          // rules require one where KSA does); credit and debit notes are Invoice
          // documents with type code 381 or 383 (INV-034); ZATCA's own cut of EN 16931
          // leaves out BR-33 (allowance reason, INV-052) and BR-61 (account for a credit
          // transfer, INV-045). INV-017, INV-018 and INV-038 used to be dropped too; they
          // came from the reader adding each line's own TaxTotal (KSA-11/12, and the
          // prepayment lines' KSA-31/32 subtotal) and BT-111's SAR repeat to the document
          // tax and breakdown. ubl.mjs reads only the root's TaxTotal since 2026-11-12,
          // so those checks run on KSA files again (19 of 19 good cases still pass).
          const zatca = sets.some((x) => /^zatca/.test(x));
          if (zatca) ["INV-022", "INV-005", "INV-006", "INV-034", "INV-045", "INV-052"].forEach((r) => drop.add(r));
          const dropped = (e) => drop.has(e.rule);
          for (let i = errors.length - 1; i >= 0; i--) if (dropped(errors[i])) errors.splice(i, 1);
        }
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
// Nor does an official rule flagged "warning": KoSIT, Peppol and phive validators pass a
// file whose only findings are warnings, and SimplerInvoicing ships its BR-NL warning
// examples as good cases (eval/phive-corpus.mjs --good, 2026-11-11).
// An "information" rule (PINT OM marks reports role="information") is the same.
export const NON_BLOCKING = new Set(["note", "warning", "information"]);
export const isBlocking = (finding) => !NON_BLOCKING.has(finding.severity);
export const severityLabel = (finding) => (NON_BLOCKING.has(finding.severity) ? finding.severity : "");
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
    lines.push("", blockingCount(report) ? "Status: **FAIL**" : "Status: **PASS** (notes and warnings only)", "");
    for (const error of report.errors) {
      lines.push(`- ${severityLabel(error) ? `_${severityLabel(error)}_ ` : ""}**${escape(error.rule)}** at \`${escape(error.path || "/")}\`: ${escape(error.message)}`);
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
