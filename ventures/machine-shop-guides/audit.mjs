// ISO 9001 internal audit checklist and checker for a small shop. Pure functions, no DOM, no network.
//
// The clauses (numbers and headings only) and the "look for" prompts are CMMC Workspace's own
// (iso-clauses.mjs, generated from apps/cmmc/src/shared/quality/iso9001.ts). The finding grades,
// the 12-month coverage window and the "auditor owns the clause" check are the workspace Audits
// tab's (apps/cmmc/src/shared/internal-audits.ts: FINDING_KINDS, AUDIT_COVERAGE_MONTHS,
// auditIssues); audit.test.mjs reads that file so the labels cannot drift. A finding CSV made here
// carries the same grades the Audits tab records.
//
// No requirement text of ISO 9001 is reproduced (ISO copyright): the page cites clause numbers
// and headings and says to read the shop's own copy of the standard. The review reads what was
// typed, not whether it is true: each finding says why it fired.
import { CLAUSES, SECTIONS } from "./iso-clauses.mjs";

export { CLAUSES, SECTIONS };

/** The grades a finding takes, labelled as the workspace labels them. */
export const FINDING_KIND_LABEL = {
  major: "Major nonconformity",
  minor: "Minor nonconformity",
  observation: "Observation",
  improvement: "Opportunity for improvement",
};
export const RESULT_LABEL = {
  "": "Not audited yet",
  conforms: "Conforms",
  ...FINDING_KIND_LABEL,
  na: "Not applicable",
};
export const findingLabel = (k) => (Object.hasOwn(FINDING_KIND_LABEL, k) ? FINDING_KIND_LABEL[k] : "");
export const isNonconformity = (k) => k === "major" || k === "minor";
const isFinding = (k) => Object.hasOwn(FINDING_KIND_LABEL, k);
export const resultLabel = (k) => (Object.hasOwn(RESULT_LABEL, k) ? RESULT_LABEL[k] : "");

/** The workspace flags an applicable clause not audited in this many months and not planned. */
export const AUDIT_COVERAGE_MONTHS = 12;
export const MAX_AUDITS = 12;

export const HEAD_FIELDS = ["title", "process", "auditor", "auditees", "owners", "plannedOn", "doneOn"];
const BY_NUMBER = new Map(CLAUSES.map((c) => [c.number, c]));
export const clauseByNumber = (n) => BY_NUMBER.get(String(n));

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s) {
  if (!ISO.test(String(s ?? ""))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const str = (v) => String(v ?? "").trim();
const names = (s) => str(s).split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/**
 * Cleans what the form holds: header fields trimmed, the scope kept to known clause numbers in
 * the standard's order, and one row per clause in scope (result, evidence, finding, reason).
 */
export function normalise(input = {}) {
  const r = {};
  for (const k of HEAD_FIELDS) r[k] = str(input[k]);
  const wanted = new Set((Array.isArray(input.scope) ? input.scope : []).map(String));
  r.scope = CLAUSES.map((c) => c.number).filter((n) => wanted.has(n));
  const rows = input.rows && typeof input.rows === "object" ? input.rows : {};
  r.rows = {};
  for (const n of r.scope) {
    const x = Object.hasOwn(rows, n) && rows[n] && typeof rows[n] === "object" ? rows[n] : {};
    const result = Object.hasOwn(RESULT_LABEL, str(x.result)) ? str(x.result) : "";
    r.rows[n] = { result, evidence: str(x.evidence), finding: str(x.finding) };
  }
  return r;
}

/**
 * What a registrar auditor, or the workspace's Audits tab, would raise about this audit record.
 * kind: "gap" (fix before you call the audit done), "action" (a corrective action to open),
 * "note" (worth a look). `today` is YYYY-MM-DD.
 */
export function review(input, today) {
  const r = normalise(input);
  const out = [];
  const add = (clause, kind, message) => out.push({ clause, kind, message });

  if (!r.scope.length) add(null, "gap", "No clause is in scope. Tick the clauses (or a section) this audit covers.");
  if (!r.auditor) add(null, "gap", "No auditor named. The record should say who audited.");
  // The workspace raises this when the auditor owns a clause in scope; here the shop types who
  // owns the process or clauses audited, and who was interviewed.
  const auditor = names(r.auditor);
  const own = [...names(r.owners), ...names(r.auditees)].filter((n) => auditor.includes(n));
  if (own.length) add(null, "gap", `The auditor (${r.auditor}) is also named as an owner or auditee of what is audited, so would be auditing their own work. Pick another auditor, or an outside one, for those clauses.`);
  if (r.doneOn && !isIsoDate(r.doneOn)) add(null, "gap", "The audit date is not a valid date.");
  else if (r.doneOn && r.doneOn > today) add(null, "gap", `The audit is dated ${r.doneOn}, after today.`);

  for (const n of r.scope) {
    const c = clauseByNumber(n);
    const row = r.rows[n];
    const label = `${n} ${c.title}`;
    if (!row.result) { add(n, "gap", `${label}: in scope with no result yet.`); continue; }
    if (row.result === "na") {
      if (!row.finding && !row.evidence) add(n, "gap", `${label}: marked not applicable with no reason. Write why (it should match the scope statement under 4.3).`);
      if (!c.oftenExcluded) add(n, "note", `${label}: not applicable is unusual here. Small shops most often exclude only 8.3 (design), and say so in the scope.`);
      continue;
    }
    if (row.result === "conforms") {
      if (!row.evidence) add(n, "note", `${label}: conforms, but nothing written about what was looked at. Name the record, sample or person, so the next audit can see what was checked.`);
      continue;
    }
    // A finding.
    if (!row.finding) add(n, "gap", `${label}: ${findingLabel(row.result).toLowerCase()} with no description. Write what was required and what was found.`);
    if (isNonconformity(row.result)) {
      if (!row.evidence) add(n, "gap", `${label}: a nonconformity needs the objective evidence behind it (the record, part, job or interview seen).`);
      add(n, "action", `${label}: open a corrective action (clause 10.2) for this ${findingLabel(row.result).toLowerCase()}.`);
    }
  }

  const applicable = CLAUSES.filter((c) => !(r.scope.includes(c.number) && r.rows[c.number].result === "na"));
  const rest = applicable.filter((c) => !r.scope.includes(c.number));
  if (r.scope.length && rest.length) {
    add(null, "note", `${rest.length} of ${CLAUSES.length} clauses are not in this audit. Plan them in another audit: CMMC Workspace flags any applicable clause not audited in ${AUDIT_COVERAGE_MONTHS} months and not planned.`);
  }
  const findings = r.scope.filter((n) => isFinding(r.rows[n].result)).map((n) => ({ clause: n, kind: r.rows[n].result, ...r.rows[n] }));
  return { record: r, findings: out, auditFindings: findings, unaudited: rest.map((c) => c.number) };
}

export function summary(res) {
  const r = res.record;
  const count = (k) => r.scope.filter((n) => r.rows[n].result === k).length;
  const gaps = res.findings.filter((f) => f.kind === "gap").length;
  const parts = [`${r.scope.length} clause${r.scope.length === 1 ? "" : "s"} in scope`];
  const c = count("conforms");
  if (c) parts.push(`${c} conform`);
  for (const k of Object.keys(FINDING_KIND_LABEL)) {
    const v = count(k);
    if (v) parts.push(`${v} ${findingLabel(k).toLowerCase()}${v === 1 ? "" : "s"}`);
  }
  const na = count("na");
  if (na) parts.push(`${na} not applicable`);
  const open = count("");
  if (open) parts.push(`${open} not audited yet`);
  return `${parts.join(", ")}. ${gaps ? `${gaps} thing${gaps === 1 ? "" : "s"} to fix before the record is complete.` : "Nothing missing from the record."}`;
}

/**
 * Splits the clauses into `n` audits for the year, in the standard's order, as even in size as they
 * can be (the first audits take one more when they do not divide). Leaves out the numbers in
 * `excluded` (the clauses the scope says do not apply).
 */
export function planProgramme(n, excluded = []) {
  const skip = new Set(excluded.map(String));
  const list = CLAUSES.map((c) => c.number).filter((x) => !skip.has(x));
  const k = Math.max(1, Math.min(MAX_AUDITS, list.length, Math.floor(Number(n) || 1)));
  const base = Math.floor(list.length / k);
  const extra = list.length % k;
  const out = [];
  let i = 0;
  for (let j = 0; j < k; j++) {
    const size = base + (j < extra ? 1 : 0);
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out;
}

const md = (s) => str(s).replace(/([\\`*_[\]#|<>])/g, "\\$1");
const cellMd = (s) => md(s).replace(/\r?\n/g, " ") || "";

export function toMarkdown(res) {
  const r = res.record;
  const L = [`# Internal audit: ${md(r.title) || "ISO 9001"}`, ""];
  const row = (k, v) => { if (str(v)) L.push(`- **${k}:** ${md(v)}`); };
  row("Process or area", r.process);
  row("Auditor", r.auditor);
  row("People interviewed", r.auditees);
  row("Owners of what was audited", r.owners);
  row("Planned", r.plannedOn);
  row("Done", r.doneOn);
  L.push("", summary(res), "", "| Clause | Heading | Result | Evidence seen | Finding or reason |", "| --- | --- | --- | --- | --- |");
  for (const n of r.scope) {
    const x = r.rows[n];
    L.push(`| ${n} | ${cellMd(clauseByNumber(n).title)} | ${resultLabel(x.result)} | ${cellMd(x.evidence)} | ${cellMd(x.finding)} |`);
  }
  if (res.findings.length) {
    L.push("", "## To do", "");
    for (const f of res.findings) L.push(`- ${f.kind === "gap" ? "Fix" : f.kind === "action" ? "Corrective action" : "Check"}: ${md(f.message)}`);
  }
  if (res.unaudited.length) L.push("", `Not in this audit: ${res.unaudited.join(", ")}.`);
  L.push("", "Clause numbers and headings of ISO 9001:2015 only; read the requirements in your own copy of the standard. Made with the free checklist at https://marisstella.app/machine-shop-guides/iso-9001-internal-audit-checklist.html. Not a certification audit.");
  return `${L.join("\n")}\n`;
}

/** A spreadsheet would run a cell starting = + - @ as a formula; such a cell gets an apostrophe. */
export function csvCell(v) {
  const s = String(v ?? "");
  const guarded = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export const CSV_HEAD = ["Audit", "Done on", "Auditor", "Clause", "Heading", "Result", "Evidence seen", "Finding or reason"];

/** Every clause in scope, one row each, for the audit file or a spreadsheet. */
export function toCsv(res) {
  const r = res.record;
  const rows = r.scope.map((n) => [r.title, r.doneOn, r.auditor, n, clauseByNumber(n).title, resultLabel(r.rows[n].result), r.rows[n].evidence, r.rows[n].finding]);
  return `${[CSV_HEAD, ...rows].map((x) => x.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * The corrective action report page, opened with this nonconformity filled in (read from the
 * fragment, so it never reaches a server log).
 */
export function carLink(res, clause) {
  const r = res.record;
  const x = r.rows[clause];
  const p = new URLSearchParams();
  p.set("source", "internal_audit");
  p.set("clause", clause);
  if (r.doneOn) p.set("raisedOn", r.doneOn);
  const nc = [x.finding, x.evidence && `Evidence: ${x.evidence}`, r.title && `Found in internal audit: ${r.title}`].filter(Boolean).join("\n");
  p.set("nonconformity", nc.slice(0, 1500));
  return `corrective-action-report.html#${p.toString()}`;
}

/** A blank checklist to print and take round the shop: the clauses in scope with "look for". */
export function blankChecklist(scope) {
  const r = normalise({ scope });
  const L = ["# ISO 9001 internal audit checklist", "", "Audit: ____________  Auditor: ____________  Date: ________", ""];
  let sec = "";
  for (const n of r.scope) {
    const c = clauseByNumber(n);
    const s = n.split(".")[0];
    if (s !== sec) { sec = s; L.push(`## ${s} ${SECTIONS[s]}`, ""); }
    L.push(`### ${n} ${md(c.title)}`, "", `Look for: ${md(c.prompt)}`, "", "- [ ] Conforms  - [ ] Major NC  - [ ] Minor NC  - [ ] Observation  - [ ] OFI  - [ ] N/A", "", "Evidence seen:", "", "Finding:", "");
  }
  L.push("Clause numbers and headings of ISO 9001:2015 only; the requirements are in your own copy of the standard.");
  return `${L.join("\n")}\n`;
}

/** An invented example with the usual faults, for the "load an example" button. */
export const EXAMPLE = {
  title: "Q3 audit: production and inspection",
  process: "Turning cell, final inspection, shipping",
  auditor: "Dana (office manager)",
  auditees: "Lead machinist, inspector",
  owners: "Lead machinist",
  plannedOn: "2026-09-15",
  doneOn: "2026-09-18",
  scope: ["7.1.5", "7.2", "7.5.3", "8.5.1", "8.6", "8.7"],
  rows: {
    "7.1.5": { result: "minor", evidence: "Gauge list GL-01; mic #14 on the turning cell", finding: "Mic #14 in use with its calibration due 2026-07-31; no record it was checked since." },
    "7.2": { result: "conforms", evidence: "", finding: "" },
    "7.5.3": { result: "observation", evidence: "Setup sheet SS-04 at the machine", finding: "Rev C at the machine, rev D on the server; the change was a note only." },
    "8.5.1": { result: "conforms", evidence: "Traveler for job 2291, first-piece record signed", finding: "" },
    "8.6": { result: "major", evidence: "", finding: "Lot of 60 shipped on 2026-09-02 with no final inspection sign-off on the traveler." },
    "8.7": { result: "", evidence: "", finding: "" },
  },
};
