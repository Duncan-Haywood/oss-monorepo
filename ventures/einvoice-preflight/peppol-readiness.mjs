// Peppol BIS Billing 3.1.0 readiness: which of a sender's invoices pass the release in
// force today (3.0.22) and will be rejected once access points apply 3.1.0 on 2027-02-24.
//
// Pure functions, shared by the page (peppol-bis-3-1-0-readiness.html), the CLI
// (peppol-readiness-cli.mjs) and the tests. A caller runs each file through the plain
// route twice, as shipped and with { peppolNext: true }, and hands both results here.
// Nothing here reads a file or the network.
import { PEPPOL_NEXT } from "./schematron-core.mjs";

// Does BT-24 (UBL CustomizationID, CII GuidelineSpecifiedDocumentContextParameter) name
// Peppol? Only those files get the Peppol rules at all.
export function isPeppolFile(xml) {
  return /<(?:\w+:)?(?:CustomizationID|GuidelineSpecifiedDocumentContextParameter)\b[\s\S]{0,200}peppol\.eu/i.test(xml);
}

const fatal = (r) => (r?.findings || []).some((f) => f.severity === "fatal");

// One file's verdict from its two runs. `now` is runPlain(xml), `next` is
// runPlain(xml, { peppolNext: true }). Either may be an { error } object.
export function classifyFile(name, now, next, { peppol = true } = {}) {
  if (!peppol) return { name, verdict: "not-peppol", added: [] };
  if (!now || !next || now.error || next.error || now.status !== "ok" || next.status !== "ok") {
    return { name, verdict: "unreadable", reason: now?.error || next?.error || now?.status || next?.status || "not checked", added: [] };
  }
  if (!next.sets?.some((x) => x === "peppol-next" || x === "peppol-sb-next")) return { name, verdict: "not-peppol", added: [] };
  const added = next.findings.filter((f) => f.peppolNext === "new");
  const failsNow = fatal(now), failsNext = fatal(next);
  const verdict = !failsNow && failsNext ? "newly-rejected"
    : failsNow && failsNext ? "fails-both"
    : failsNow && !failsNext ? "fixed-by-3.1.0"
    : added.length ? "new-warnings" : "ready";
  return {
    name,
    verdict,
    added: added.map((f) => ({ rule: f.rule, severity: f.severity, path: f.path, message: stripNote(f.message), fix: f.fix || "" })),
    fatalNow: now.findings.filter((f) => f.severity === "fatal").length,
    fatalNext: next.findings.filter((f) => f.severity === "fatal").length,
  };
}

// The checker appends "[New in Peppol BIS 3.1.0, rejected from ...]" to each new message;
// the report says that once, in its heading.
export function stripNote(message = "") {
  return message.replace(/\s*\[New in Peppol BIS[^\]]*\]\s*$/, "");
}

export const VERDICTS = {
  "newly-rejected": "Passes 3.0.22 today, rejected under 3.1.0",
  "fails-both": "Already fails 3.0.22 (and still fails 3.1.0)",
  "fixed-by-3.1.0": "Fails 3.0.22, passes 3.1.0",
  "new-warnings": "Passes both; 3.1.0 adds warnings",
  ready: "Passes both, nothing new",
  "not-peppol": "Not a Peppol BIS Billing or Self-Billing file (skipped)",
  unreadable: "Could not be checked",
};

// Plain-English advice for the rules 3.1.0 adds or tightens, keyed by rule id (or a
// pattern). Each is written from the rule's own test in plain/peppol-next-*.json; the
// finding's own `fix` and message are shown beside it.
const ADVICE = [
  [/^PEPPOL-COMMON-R040$/, "Scheme 0088 now takes a GLN only: exactly 13 digits with a valid GS1 check digit. If the value is not a GLN, send it under the scheme that matches it, using the identifier the receiver is registered with on the Peppol network."],
  [/^PEPPOL-COMMON-R043$/, "A Belgian enterprise number (scheme 0208) must now start with 0 or 1, as well as being 10 digits that pass the mod-97 check."],
  [/^PEPPOL-COMMON-R062$/, "Belgian VAT numbers are now checked: BE followed by 10 digits starting with 0 or 1, passing the mod-97 check (a warning, not a rejection)."],
  [/^PEPPOL-COMMON-R058$/, "Luxembourg VAT numbers are now checked: LU followed by 8 digits whose last two are the first six mod 89 (a warning)."],
  [/^PEPPOL-COMMON-R059$/, "Luxembourg Matricule numbers (scheme 0240) are now checked for their format and check digits (a warning)."],
  [/^PEPPOL-COMMON-R05[4-7]/, "The Dutch identifier formats were warnings and are now rejections: KVK 0106 is 8 digits, OIN 0190 is 20 digits, VAT 9944 and a Dutch VAT number are NL + 9 digits + B + 2 digits, establishment number 0217 is 12 digits."],
  [/^PEPPOL-EN16931-R(1[4-9]\d|2[0-7]\d)$/, "3.1.0 adds a rule for every UBL element that may occur once: the parent named in the message must hold exactly one of it. 3.0.22 let a repeated (or, in a few places, a missing) element through. Keep one occurrence, or add the missing one."],
  [/^DE-R-T02$/, "For German buyer and seller, an attachment's external location (BT-124) must be an absolute URL with a valid scheme (https://...). This was a warning."],
  [/^DK-R-003$/, "Danish suppliers giving an item classification must use UNSPSC version 19.05.01 or 26.08.01. This was a warning."],
  [/^DK-R-017$/, "For a Danish buyer, a legal registration identifier must carry scheme 0184 (CVR number). New for CII files."],
  [/^SK-R-00[1-7]$/, "New Slovak rules for domestic transactions: seller and buyer street, city and postal code, and the preceding-invoice reference on a corrected invoice (warnings)."],
  [/^(NO-R-001|SE-R-00[12])$/, "In CII files these Norwegian and Swedish VAT-number rules looked for scheme 'VAT' and so never fired; 3.1.0 looks for 'VA', the CII code, so they now apply."],
];

export function adviceFor(rule) {
  for (const [re, text] of ADVICE) if (re.test(rule)) return text;
  return "";
}

// Totals and a by-rule table across a batch of classified files.
export function summarize(rows) {
  const counts = Object.fromEntries(Object.keys(VERDICTS).map((k) => [k, 0]));
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  const byRule = new Map();
  for (const r of rows) {
    for (const f of r.added) {
      const key = `${f.rule}|${f.severity}`;
      const e = byRule.get(key) || { rule: f.rule, severity: f.severity, message: f.message, fix: f.fix, advice: adviceFor(f.rule), files: new Set(), findings: 0 };
      e.files.add(r.name);
      e.findings++;
      byRule.set(key, e);
    }
  }
  const rules = [...byRule.values()]
    .map((e) => ({ ...e, files: [...e.files] }))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fatal" ? -1 : 1) || b.files.length - a.files.length || a.rule.localeCompare(b.rule));
  const peppol = rows.length - counts["not-peppol"] - counts.unreadable;
  return { release: PEPPOL_NEXT.release, current: PEPPOL_NEXT.current, mandatory: PEPPOL_NEXT.mandatory, files: rows.length, peppol, counts, rules, rows };
}

export function headline(s) {
  if (!s.peppol) return "No Peppol BIS Billing files among these. Only files whose CustomizationID names peppol.eu are checked.";
  const n = s.counts["newly-rejected"];
  const already = s.counts["fails-both"] ? ` (${s.counts["fails-both"]} already fail${s.counts["fails-both"] === 1 ? "s" : ""} ${s.current} today)` : "";
  if (!n) return `None of ${s.peppol} Peppol file${s.peppol === 1 ? "" : "s"} would be newly rejected under ${s.release}${already}.`;
  return `${n} of ${s.peppol} Peppol file${s.peppol === 1 ? "" : "s"} pass ${s.current} today and would be rejected under ${s.release} from ${s.mandatory}.`;
}

const csvCell = (v) => {
  const s = String(v ?? "");
  // A leading =, +, - or @ is read as a formula by spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// One row per new finding (and one per file with none), for a spreadsheet.
export function toCsv(s) {
  const out = [["file", "verdict", "rule", "severity", "path", "message", "fix"].join(",")];
  for (const r of s.rows) {
    if (!r.added.length) out.push([r.name, r.verdict, "", "", "", r.reason || "", ""].map(csvCell).join(","));
    for (const f of r.added) out.push([r.name, r.verdict, f.rule, f.severity, f.path, f.message, f.fix].map(csvCell).join(","));
  }
  return out.join("\n") + "\n";
}

export function toMarkdown(s) {
  const lines = [`# Peppol BIS ${s.release} readiness`, "", headline(s), ""];
  lines.push("| Verdict | Files |", "|---|---:|");
  for (const [k, label] of Object.entries(VERDICTS)) if (s.counts[k]) lines.push(`| ${label} | ${s.counts[k]} |`);
  if (s.rules.length) {
    lines.push("", `## What ${s.release} adds, by rule`, "", "| Rule | Severity | Files | What to change |", "|---|---|---:|---|");
    for (const r of s.rules) lines.push(`| ${r.rule} | ${r.severity} | ${r.files.length} | ${(r.advice || r.fix || r.message).replace(/\|/g, "\\|")} |`);
  }
  const flagged = s.rows.filter((r) => r.verdict === "newly-rejected");
  if (flagged.length) {
    lines.push("", "## Files to fix before " + s.mandatory, "");
    for (const r of flagged) lines.push(`- ${r.name}: ${[...new Set(r.added.filter((f) => f.severity === "fatal").map((f) => f.rule))].join(", ")}`);
  }
  lines.push("", `Rules: Peppol BIS Billing ${s.release} as compiled in plain/peppol-next-*.json (see plain/manifest.json for the commit). A preflight observation, not a statement that any file is valid or will be accepted.`);
  return lines.join("\n") + "\n";
}

// What changed between two compiled rule sets (plain/peppol-*.json): rules added,
// removed, raised from warning to fatal, or with a different test. Wording-only edits
// (should -> SHOULD) and whitespace are left out.
export function ruleChanges(now, next) {
  const index = (set) => {
    const m = new Map();
    for (const p of set.patterns) for (const r of p.rules) for (const c of r.checks) if (c.id && !m.has(c.id)) m.set(c.id, c);
    return m;
  };
  const squash = (t = "") => t.replace(/\s+/g, " ").trim();
  const text = (c) => squash(c.text).replace(/^\[[^\]]+\]-?\s*/, "");
  const a = index(now), b = index(next), out = [];
  for (const [id, c] of b) {
    const old = a.get(id);
    if (!old) out.push({ id, change: "added", flag: c.flag, text: text(c) });
    else if (old.flag !== c.flag) out.push({ id, change: `${old.flag} to ${c.flag}`, flag: c.flag, text: text(c) });
    else if (squash(old.test) !== squash(c.test)) out.push({ id, change: "test changed", flag: c.flag, text: text(c) });
  }
  for (const [id, c] of a) if (!b.has(id)) out.push({ id, change: "removed", flag: c.flag, text: text(c) });
  const order = (id) => id.replace(/\d+/g, (d) => d.padStart(5, "0"));
  return out.sort((x, y) => order(x.id).localeCompare(order(y.id)));
}
