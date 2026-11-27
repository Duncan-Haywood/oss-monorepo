// @ts-check
// One invoice through the paid pipeline: validate -> explain -> propose safe fixes -> re-validate.
// Proprietary (see ../LICENSE).
//
// Validity is decided only by the deterministic checker (../report.mjs, the imported baseline)
// plus the deterministic PRO-* rules (rules.mjs). The model, if any, only writes explanations.
import { createHash } from "node:crypto";
import { inspectInvoiceSource, isBlocking, preflightDocuments } from "../report.mjs";
import { applyEdits, unifiedDiff } from "./diff.mjs";
import { explainFindings } from "./explain.mjs";
import { normaliseLang } from "./explain-catalog.mjs";
import { FIXES } from "./fixes.mjs";
import { detectProfile, germanProfileRule, proRules } from "./rules.mjs";
import { syntaxOf } from "./xml-scan.mjs";

/** @typedef {{ rule: string, message: string, fix?: string, path?: string, severity?: string }} Finding */
/** @typedef {{ profile?: string, schematron?: boolean }} ValidateOptions */
/** @typedef {{ findings: Finding[], readErrors: string[], schematron?: string }} Validation */

export const PROFILES = new Set(["", "xrechnung", "peppol", "france", "slovakia"]);

/** The parsed invoice, or null when the file cannot be read (the checker reports why). @param {string} name @param {string | Uint8Array} source */
async function parsedInvoice(name, source) {
  try {
    return (await inspectInvoiceSource(name, source)).invoice;
  } catch {
    return null;
  }
}

/**
 * The profile to apply: a known one as given, "auto" resolved from the file (detectProfile in
 * rules.mjs), anything else the built-in rules only.
 * @param {string} name @param {string | Uint8Array} source @param {string | undefined} requested
 */
export async function resolveProfile(name, source, requested) {
  if (requested === "auto") return { profile: detectProfile(await parsedInvoice(name, source)), detected: true };
  return { profile: PROFILES.has(requested ?? "") ? /** @type {string} */ (requested ?? "") : "", detected: false };
}

/** @param {string} name @param {string | Uint8Array} source @param {ValidateOptions} [opts] @returns {Promise<Validation>} */
export async function validate(name, source, opts = {}) {
  const r = await preflightDocuments([{ name, source }], { profile: opts.profile ?? "", schematron: Boolean(opts.schematron) });
  const report = r.reports[0];
  const readErrors = r.readErrors.map((/** @type {{error: string}} */ e) => e.error);
  /** @type {Finding[]} */
  const findings = [...(report?.errors ?? [])];
  if (typeof source === "string") findings.push(...proRules(source, { readErrors }));
  findings.push(...germanProfileRule(await parsedInvoice(name, source), opts.profile ?? ""));
  return { findings, readErrors, ...(report?.schematron ? { schematron: report.schematron } : {}) };
}

/** Identity of a finding across edits: rule plus message (pro-rule paths carry offsets). @param {Finding} f */
const keyOf = (f) => `${f.rule}\u0000${f.message}`;

/** @param {Validation} v */
export const passes = (v) => v.readErrors.length === 0 && !v.findings.some((f) => isBlocking(f));

/**
 * @param {string} name @param {string} xml @param {Validation} initial @param {ValidateOptions} opts
 */
export async function proposeFixes(name, xml, initial, opts) {
  /** @type {Array<{ id: string, label: Record<string, string>, resolves: string[], changes: import("./fixes.mjs").Change[], diff: string }>} */
  const applied = [];
  /** @type {Array<{ id: string, reason: string, introduced?: string[] }>} */
  const skipped = [];
  if (!syntaxOf(xml)) return { applied, skipped, content: xml, diff: "", after: initial };

  /** @type {import("./diff.mjs").Edit[]} */
  let accepted = [];
  let state = initial;
  // Read errors (e.g. a missing currency) are findings too for targeting purposes.
  const targetedRules = new Set(state.findings.map((f) => f.rule));
  for (const fix of FIXES) {
    if (!fix.rules.some((r) => targetedRules.has(r))) continue;
    const proposal = fix.propose(xml);
    if (!proposal.edits.length) {
      skipped.push({ id: fix.id, reason: proposal.notes.join("; ") || "nothing mechanical to change" });
      continue;
    }
    let candidate;
    try {
      candidate = applyEdits(xml, [...accepted, ...proposal.edits]);
    } catch {
      skipped.push({ id: fix.id, reason: "overlaps an earlier fix" });
      continue;
    }
    const next = await validate(name, candidate, opts);
    const before = new Set(state.findings.map(keyOf));
    const after = new Set(next.findings.map(keyOf));
    const introduced = next.findings.filter((f) => !before.has(keyOf(f)));
    const resolved = state.findings.filter((f) => !after.has(keyOf(f)) && fix.rules.includes(f.rule));
    if (introduced.length || next.readErrors.some((e) => !state.readErrors.includes(e))) {
      skipped.push({
        id: fix.id,
        reason: "the corrected file raised a new finding, so this fix needs a human",
        introduced: introduced.map((f) => `${f.rule}: ${f.message}`),
      });
      continue;
    }
    if (!resolved.length) {
      skipped.push({ id: fix.id, reason: "did not clear the finding it targets" });
      continue;
    }
    applied.push({
      id: fix.id,
      label: fix.label,
      resolves: [...new Set(resolved.map((f) => f.rule))],
      changes: proposal.changes,
      diff: unifiedDiff(xml, proposal.edits, { name }),
    });
    if (proposal.notes.length) skipped.push({ id: fix.id, reason: `partly applied: ${proposal.notes.join("; ")}` });
    accepted = [...accepted, ...proposal.edits];
    state = next;
  }
  const content = accepted.length ? applyEdits(xml, accepted) : xml;
  return { applied, skipped, content, diff: unifiedDiff(xml, accepted, { name }), after: state };
}

/** @param {string | Uint8Array} source */
export const sha256 = (source) => createHash("sha256").update(source).digest("hex");

/**
 * @param {{ name: string, source: string | Uint8Array }} input
 * @param {{ lang?: string, profile?: string, schematron?: boolean, fix?: boolean,
 *   llm?: import("./llm.mjs").Llm | null, cache?: import("./explain.mjs").ExplainCache, onLlmCall?: () => void }} [opts]
 */
export async function checkInvoice(input, opts = {}) {
  const lang = normaliseLang(opts.lang);
  const chosen = await resolveProfile(input.name, input.source, opts.profile);
  const vopts = { profile: chosen.profile, schematron: opts.schematron };
  const initial = await validate(input.name, input.source, vopts);
  const explain = (/** @type {Finding[]} */ f) => explainFindings(f, { lang, llm: opts.llm, cache: opts.cache, onLlmCall: opts.onLlmCall });
  const readErrorFindings = initial.readErrors
    .filter(() => !initial.findings.some((f) => f.rule === "PRO-CUR-001"))
    .map((e) => ({ rule: "READ", message: e, fix: "Export the invoice again as UBL or CII XML, or as a Factur-X PDF." }));
  const result = {
    file: input.name,
    sha256: sha256(input.source),
    bytes: typeof input.source === "string" ? Buffer.byteLength(input.source) : input.source.length,
    lang,
    profile: vopts.profile,
    ...(chosen.detected ? { profileDetected: true } : {}),
    status: passes(initial) ? "pass" : "fail",
    findings: await explain([...initial.findings, ...readErrorFindings]),
    ...(initial.schematron ? { schematron: initial.schematron } : {}),
  };
  if (!opts.fix || result.status === "pass" && !initial.findings.length) return result;
  if (typeof input.source !== "string" || !syntaxOf(input.source)) {
    return { ...result, fixes: { applied: [], skipped: [{ id: "*", reason: "safe fixes cover UBL and CII XML; PDFs and JSON are reported only" }] } };
  }
  const fixed = await proposeFixes(input.name, input.source, initial, vopts);
  if (!fixed.applied.length) return { ...result, fixes: { applied: [], skipped: fixed.skipped } };
  return {
    ...result,
    fixes: {
      applied: fixed.applied,
      skipped: fixed.skipped,
      diff: fixed.diff,
      content: fixed.content,
      sha256: sha256(fixed.content),
      revalidation: {
        status: passes(fixed.after) ? "pass" : "fail",
        findings: await explain(fixed.after.findings),
      },
    },
  };
}
