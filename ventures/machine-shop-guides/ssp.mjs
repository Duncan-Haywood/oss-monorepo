/**
 * System security plan (SSP) builder for NIST SP 800-171 Rev. 2.
 *
 * A shop fills in its system description and, for each of the 110
 * requirements, a status, an implementation statement, who is responsible,
 * where the evidence is, and (for gaps) the planned action and milestone
 * date. This module turns that into:
 *
 *   - a review: what an assessor or the affirming official would bounce
 *     (no boundary, a "met" with no statement, a gap with no date ...);
 *   - the SPRS-style score of the same statuses (sprs.mjs);
 *   - the SSP as Markdown and as a standalone, print-ready HTML file;
 *   - the POA&M as CSV, one row per gap, filled from the plan.
 *
 * Everything is pure and runs in the browser. Nothing is transmitted.
 *
 * What the SSP has to cover comes from requirement 3.12.4 itself: "system
 * boundaries, system environments of operation, how security requirements
 * are implemented, and the relationships with or connections to other
 * systems" (NIST SP 800-171 Rev. 2; see ssp-and-poam.html and SOURCES.md).
 * The section layout below is ours, not a mandated format: NIST prescribes
 * none.
 *
 * Statuses: met, not_met, partial (only 3.5.3 and 3.13.11, which have
 * partial credit), and na. 32 CFR 170.24(b) treats a not-applicable
 * assessment objective as equivalent to MET; a requirement is marked na here
 * only when the shop says all of its objectives are, and the review asks for
 * the reason. For scoring, na counts as met.
 */
import { REQUIREMENTS, FAMILIES, PARTIAL, POAM_PROHIBITED } from "./sprs-data.mjs";
import { scoreSprs, compareIds, POAM_RULE_TEXT } from "./sprs.mjs";

export const STATUSES = ["met", "not_met", "partial", "na"];
export const STATUS_LABEL = { met: "Met", not_met: "Not met", partial: "Partially met", na: "Not applicable" };

/** System-level fields, in document order. `long` fields are paragraphs. */
export const SYSTEM_FIELDS = [
  { key: "name", label: "System name", hint: "What you call the in-scope system, e.g. \"Acme Machine CUI enclave\"." },
  { key: "organization", label: "Organization", hint: "Legal name of the company." },
  { key: "cage", label: "CAGE code(s)", hint: "The CAGE codes this plan covers, comma separated." },
  { key: "version", label: "Plan version", hint: "e.g. 1.0" },
  { key: "date", label: "Plan date", hint: "YYYY-MM-DD", date: true },
  { key: "nextReview", label: "Next review date", hint: "YYYY-MM-DD. Review at least yearly and whenever the system changes.", date: true },
  { key: "description", label: "System description and purpose", long: true, hint: "What the business does with CUI: quoting, programming, machining, inspection, shipping." },
  { key: "cui", label: "CUI handled", long: true, hint: "The kinds of CUI you receive and create, e.g. export-controlled drawings, technical data packages, inspection reports." },
  { key: "boundary", label: "System boundary", long: true, hint: "Exactly which people, computers, accounts, cloud services and machines store, process or transmit CUI, and what is outside." },
  { key: "environment", label: "Environment of operation", long: true, hint: "Where it runs: office and shop-floor locations, network segments, cloud tenants (e.g. a GCC High tenant), remote work." },
  { key: "assets", label: "Hardware, software and services in scope", long: true, hint: "One per line: item, owner, what it does with CUI. Requirement 3.4.1 asks for this inventory anyway." },
  { key: "dataFlow", label: "How CUI moves", long: true, hint: "From the customer to the spindle to the inspection report: where it arrives, where it is stored at each step, how it leaves." },
  { key: "connections", label: "Connections to other systems", long: true, hint: "Managed service provider, ERP or quoting software, customer portals, vendors with remote access to a machine." },
  { key: "users", label: "Users and roles", long: true, hint: "Roles (owner, estimator, programmer, machinist, IT provider), how many people in each, which are privileged." },
];

/** Contact roles listed in the plan. */
export const CONTACT_ROLES = ["System owner", "Senior official who affirms", "Security / IT contact", "Managed service provider"];

const LIMITS = { short: 200, long: 8000 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const REQ_FIELDS = ["implementation", "responsible", "evidence", "provider", "plannedAction", "milestone", "naReason"];

export function emptySsp() {
  const system = {};
  for (const f of SYSTEM_FIELDS) system[f.key] = "";
  return {
    format: "machine-shop-guides-ssp",
    formatVersion: 1,
    system,
    contacts: CONTACT_ROLES.map((role) => ({ role, name: "", email: "", phone: "" })),
    requirements: {},
  };
}

function clean(v, max) {
  if (typeof v !== "string") return "";
  // Drop control characters except tab and newline; normalise line ends.
  let out = "";
  for (const ch of v.replace(/\r\n?/g, "\n")) {
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c >= 32) out += ch;
  }
  return out.slice(0, max);
}

/**
 * Rebuild a plan from anything read back (an imported JSON file, saved
 * browser storage), keeping only known fields as bounded strings, so a
 * hand-edited or hostile file cannot inject structure the renderers do not
 * expect.
 */
export function normaliseSsp(raw) {
  const doc = emptySsp();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return doc;
  const sys = raw.system && typeof raw.system === "object" ? raw.system : {};
  for (const f of SYSTEM_FIELDS) {
    let v = clean(sys[f.key], f.long ? LIMITS.long : LIMITS.short);
    if (f.date && v && !DATE_RE.test(v.trim())) v = "";
    doc.system[f.key] = f.date ? v.trim() : v;
  }
  if (Array.isArray(raw.contacts)) {
    doc.contacts = doc.contacts.map((c, i) => {
      const r = raw.contacts[i] && typeof raw.contacts[i] === "object" ? raw.contacts[i] : {};
      return { role: c.role, name: clean(r.name, LIMITS.short), email: clean(r.email, LIMITS.short), phone: clean(r.phone, LIMITS.short) };
    });
  }
  const reqs = raw.requirements && typeof raw.requirements === "object" ? raw.requirements : {};
  for (const req of REQUIREMENTS) {
    const r = Object.prototype.hasOwnProperty.call(reqs, req.id) ? reqs[req.id] : null;
    if (!r || typeof r !== "object") continue;
    const entry = {};
    const status = typeof r.status === "string" && STATUSES.includes(r.status) ? r.status : "";
    entry.status = status === "partial" && !PARTIAL[req.id] ? "" : status;
    for (const k of REQ_FIELDS) entry[k] = clean(r[k], k === "milestone" ? 10 : LIMITS.long);
    if (entry.milestone && !DATE_RE.test(entry.milestone)) entry.milestone = "";
    if (entry.status || REQ_FIELDS.some((k) => entry[k])) doc.requirements[req.id] = entry;
  }
  return doc;
}

/**
 * Start (or update) a plan's statuses from the SPRS calculator's saved
 * answers, without touching any statement already written.
 */
export function applySprsAnswers(doc, answers) {
  const out = normaliseSsp(doc);
  if (!answers || typeof answers !== "object") return out;
  for (const req of REQUIREMENTS) {
    const a = Object.prototype.hasOwnProperty.call(answers, req.id) ? answers[req.id] : null;
    if (a !== "met" && a !== "not_met" && a !== "partial") continue;
    if (a === "partial" && !PARTIAL[req.id]) continue;
    const cur = out.requirements[req.id] || {};
    out.requirements[req.id] = { ...Object.fromEntries(REQ_FIELDS.map((k) => [k, cur[k] || ""])), status: a };
  }
  return out;
}

function statusesForScore(doc) {
  const s = {};
  for (const [id, r] of Object.entries(doc.requirements)) {
    if (!r.status) continue;
    s[id] = r.status === "na" ? "met" : r.status;
  }
  return s;
}

const blank = (v) => !v || !String(v).trim();

/**
 * What an assessor, or the official who affirms the score, would send back.
 * `block` issues mean the plan does not yet describe the system (3.12.4
 * itself); `warn` issues are requirement rows that would not survive a read.
 */
export function reviewSsp(input, { today } = {}) {
  const doc = normaliseSsp(input);
  const issues = [];
  const add = (level, where, message) => issues.push({ level, where, message });

  for (const key of ["name", "organization", "boundary", "environment", "connections"]) {
    if (blank(doc.system[key])) {
      const f = SYSTEM_FIELDS.find((x) => x.key === key);
      add("block", f.label, key === "connections"
        ? "Describe connections to other systems, or write \"None\" if there are none. 3.12.4 asks for them."
        : `Missing. 3.12.4 asks the plan to describe ${key === "boundary" ? "the system boundary" : key === "environment" ? "the environment of operation" : "which system and organization it covers"}.`);
    }
  }
  if (blank(doc.contacts[0].name)) add("warn", "Contacts", "Name the system owner.");
  if (blank(doc.contacts[1].name)) add("warn", "Contacts", "Name the senior official who will affirm the score.");
  if (blank(doc.system.nextReview)) add("warn", "Next review date", "Set a review date. A plan that is never updated stops describing the shop.");
  else if (today && doc.system.nextReview < today) add("warn", "Next review date", `The review date ${doc.system.nextReview} has passed.`);

  let answered = 0;
  let statements = 0;
  for (const req of REQUIREMENTS) {
    const r = doc.requirements[req.id] || {};
    if (!r.status) continue;
    answered += 1;
    if (!blank(r.implementation)) statements += 1;
    if (r.status === "met" && blank(r.implementation)) {
      add("warn", req.id, "Marked met with no implementation statement. Say how it is done, so someone can go and see it working.");
    }
    if (r.status === "met" && !blank(r.implementation) && blank(r.evidence)) {
      add("warn", req.id, "Met, but no evidence location. Name the setting, log, record or signed form that shows it.");
    }
    if (r.status === "na" && blank(r.naReason)) {
      add("warn", req.id, "Marked not applicable with no reason. Not-applicable is scored as met, so the reason must hold up.");
    }
    if ((r.status === "not_met" || r.status === "partial") && (blank(r.plannedAction) || blank(r.milestone))) {
      add("warn", req.id, "A gap with no " + (blank(r.plannedAction) ? "planned action" : "milestone date") + ". The POA&M row needs both.");
    }
    if ((r.status === "not_met" || r.status === "partial") && POAM_PROHIBITED[req.id] && req.id !== "3.12.4") {
      add("warn", req.id, "Open, but 32 CFR 170.21(a)(2)(iii) never allows this requirement on a POA&M. It must be met before a CMMC Level 2 assessment can end in Conditional status.");
    }
    if ((r.status === "not_met" || r.status === "partial") && r.milestone && today && r.milestone < today) {
      add("warn", req.id, `Milestone ${r.milestone} has passed and the requirement is still open.`);
    }
  }
  const r3124 = doc.requirements["3.12.4"];
  if (r3124 && r3124.status === "not_met") {
    add("block", "3.12.4", "3.12.4 (the SSP itself) is marked not met. Once this plan describes the system, mark it met.");
  }
  if (answered < REQUIREMENTS.length) {
    add("warn", "Requirements", `${REQUIREMENTS.length - answered} of ${REQUIREMENTS.length} requirements have no status yet.`);
  }

  const score = scoreSprs(statusesForScore(doc));
  let latestMilestone = "";
  for (const g of score.gaps) {
    const m = doc.requirements[g.id]?.milestone || "";
    if (m > latestMilestone) latestMilestone = m;
  }
  const gapsWithoutDates = score.gaps.filter((g) => blank(doc.requirements[g.id]?.milestone)).length;
  return {
    issues,
    blocking: issues.filter((i) => i.level === "block").length,
    answered,
    statements,
    score,
    // The date SPRS asks for ("date 110 will be achieved") can come only
    // from the milestones, and only when every gap has one.
    fullScoreDate: score.gaps.length === 0 ? null : gapsWithoutDates ? null : latestMilestone,
    gapsWithoutDates,
  };
}

function sortedReqs() {
  return [...REQUIREMENTS].sort((a, b) => compareIds(a.id, b.id));
}

function statusText(id, status) {
  if (!status) return "No status";
  if (status === "partial") return "Partially met: " + (PARTIAL[id]?.label ?? "");
  return STATUS_LABEL[status];
}

// --- Markdown ---------------------------------------------------------------

/** Escape text so Markdown renders it literally (no headings, links, HTML). */
export function mdText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}[\]()#+!|<>~])/g, "\\$1")
    .replace(/^(\s*)([-=]{3,}|\d+\.)/gm, "$1\\$2")
    .replace(/&/g, "&amp;");
}

function mdBlock(s) {
  const t = String(s ?? "").trim();
  return t ? t.split(/\n/).map(mdText).join("  \n") : "_Not yet written._";
}

function mdCell(s) {
  return mdText(String(s ?? "").replace(/\s*\n\s*/g, " ")) || " ";
}

export function sspToMarkdown(input, { today } = {}) {
  const doc = normaliseSsp(input);
  const rv = reviewSsp(doc, { today });
  const s = doc.system;
  const L = [];
  L.push(`# System Security Plan: ${mdText(s.name || "Untitled system")}`);
  L.push("");
  L.push(`NIST SP 800-171 Rev. 2. ${mdText(s.organization || "Organization not named")}` + (s.cage ? `, CAGE ${mdText(s.cage)}` : "") + ".");
  L.push("");
  L.push(`| Plan version | Plan date | Next review |`);
  L.push(`|---|---|---|`);
  L.push(`| ${mdCell(s.version || "-")} | ${mdCell(s.date || "-")} | ${mdCell(s.nextReview || "-")} |`);
  L.push("");
  L.push("> Draft prepared with a free self-help tool. It is not an assessment, a certification or an SPRS submission. Requirement titles are short paraphrases: read each against the full text of NIST SP 800-171 Rev. 2.");
  L.push("");
  L.push("## 1. Contacts");
  L.push("");
  L.push("| Role | Name | Email | Phone |");
  L.push("|---|---|---|---|");
  for (const c of doc.contacts) L.push(`| ${mdCell(c.role)} | ${mdCell(c.name)} | ${mdCell(c.email)} | ${mdCell(c.phone)} |`);
  L.push("");
  L.push("## 2. System");
  let n = 0;
  for (const f of SYSTEM_FIELDS.filter((x) => x.long)) {
    n += 1;
    L.push("");
    L.push(`### 2.${n} ${f.label}`);
    L.push("");
    L.push(mdBlock(s[f.key]));
  }
  L.push("");
  L.push("## 3. Summary");
  L.push("");
  const sc = rv.score;
  L.push(`- Requirements with a status: ${rv.answered} of ${REQUIREMENTS.length}; with an implementation statement: ${rv.statements}.`);
  L.push(`- Self-calculated score (DoD Assessment Methodology arithmetic): ${sc.sspMissing ? "none, 3.12.4 not met" : sc.score + (sc.complete ? "" : " (incomplete)")}.`);
  L.push(`- Open gaps: ${sc.gaps.length}. Date all gaps are planned to close: ${rv.fullScoreDate || (sc.gaps.length ? "not set (a gap has no milestone)" : "none open")}.`);
  L.push("");
  L.push("## 4. Requirements");
  for (const [fam, name] of Object.entries(FAMILIES)) {
    L.push("");
    L.push(`### ${fam} ${name}`);
    for (const req of sortedReqs().filter((r) => r.family === fam)) {
      const r = doc.requirements[req.id] || {};
      L.push("");
      L.push(`#### ${req.id} ${mdText(req.label)}`);
      L.push("");
      L.push(`- **Status:** ${mdText(statusText(req.id, r.status))}` + (req.weight === null ? " (no point value; the SSP itself)" : ` (${req.weight} point${req.weight === 1 ? "" : "s"} if not met)`));
      if (r.status === "na") L.push(`- **Why not applicable:** ${mdCell(r.naReason || "Not given.")}`);
      if (!blank(r.responsible)) L.push(`- **Responsible:** ${mdCell(r.responsible)}`);
      if (!blank(r.provider)) L.push(`- **Provided or shared by:** ${mdCell(r.provider)}`);
      if (!blank(r.evidence)) L.push(`- **Evidence:** ${mdCell(r.evidence)}`);
      if (r.status === "not_met" || r.status === "partial") {
        L.push(`- **Planned action:** ${mdCell(r.plannedAction || "Not yet planned.")}`);
        L.push(`- **Milestone:** ${mdCell(r.milestone || "Not set.")}`);
      }
      L.push("");
      L.push(mdBlock(r.implementation));
    }
  }
  L.push("");
  L.push("## 5. Plan of action and milestones (requirement 3.12.2)");
  L.push("");
  if (!sc.gaps.length) {
    L.push("No open gaps.");
  } else {
    L.push("| Requirement | Points | Status | Planned action | Responsible | Milestone |");
    L.push("|---|---|---|---|---|---|");
    for (const g of sc.gaps) {
      const r = doc.requirements[g.id] || {};
      L.push(`| ${g.id} ${mdCell(g.label)} | ${g.weight === null ? "-" : g.deduct} | ${mdCell(statusText(g.id, r.status))} | ${mdCell(r.plannedAction)} | ${mdCell(r.responsible)} | ${mdCell(r.milestone)} |`);
    }
  }
  L.push("");
  return L.join("\n");
}

// --- HTML -------------------------------------------------------------------

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function para(s) {
  const t = String(s ?? "").trim();
  if (!t) return '<p class="empty">Not yet written.</p>';
  return t.split(/\n{2,}/).map((p) => "<p>" + p.split("\n").map(esc).join("<br>") + "</p>").join("\n");
}

/** A standalone HTML file: opens in any browser or word processor, prints cleanly. */
export function sspToHtml(input, { today } = {}) {
  const doc = normaliseSsp(input);
  const rv = reviewSsp(doc, { today });
  const s = doc.system;
  const sc = rv.score;
  const H = [];
  H.push("<!doctype html>");
  H.push('<html lang="en"><head><meta charset="utf-8">');
  H.push(`<title>System Security Plan: ${esc(s.name || "Untitled system")}</title>`);
  H.push("<style>body{font:11pt/1.45 Georgia,serif;max-width:52em;margin:2em auto;padding:0 1em;color:#111}h1{font-size:20pt}h2{font-size:14pt;border-bottom:1px solid #999;margin-top:1.6em}h3{font-size:12pt;margin-top:1.2em}h4{font-size:11pt;margin:1em 0 .2em}table{border-collapse:collapse;width:100%;margin:.5em 0}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top;font-size:10pt}.meta{color:#444}.empty{color:#888;font-style:italic}.note{border-left:3px solid #999;padding-left:.8em;color:#333}dl{margin:.2em 0}dt{font-weight:bold;float:left;clear:left;margin-right:.4em}dd{margin:0 0 .1em}section.req{page-break-inside:avoid;border-top:1px solid #ddd}</style>");
  H.push("</head><body>");
  H.push(`<h1>System Security Plan: ${esc(s.name || "Untitled system")}</h1>`);
  H.push(`<p class="meta">NIST SP 800-171 Rev. 2. ${esc(s.organization || "Organization not named")}${s.cage ? ", CAGE " + esc(s.cage) : ""}.</p>`);
  H.push(`<table><tr><th>Plan version</th><th>Plan date</th><th>Next review</th></tr><tr><td>${esc(s.version || "-")}</td><td>${esc(s.date || "-")}</td><td>${esc(s.nextReview || "-")}</td></tr></table>`);
  H.push('<p class="note">Draft prepared with a free self-help tool. It is not an assessment, a certification or an SPRS submission. Requirement titles are short paraphrases: read each against the full text of NIST SP 800-171 Rev. 2.</p>');
  H.push("<h2>1. Contacts</h2><table><tr><th>Role</th><th>Name</th><th>Email</th><th>Phone</th></tr>");
  for (const c of doc.contacts) H.push(`<tr><td>${esc(c.role)}</td><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td></tr>`);
  H.push("</table><h2>2. System</h2>");
  let n = 0;
  for (const f of SYSTEM_FIELDS.filter((x) => x.long)) {
    n += 1;
    H.push(`<h3>2.${n} ${esc(f.label)}</h3>`);
    H.push(para(s[f.key]));
  }
  H.push("<h2>3. Summary</h2><ul>");
  H.push(`<li>Requirements with a status: ${rv.answered} of ${REQUIREMENTS.length}; with an implementation statement: ${rv.statements}.</li>`);
  H.push(`<li>Self-calculated score (DoD Assessment Methodology arithmetic): ${sc.sspMissing ? "none, 3.12.4 not met" : sc.score + (sc.complete ? "" : " (incomplete)")}.</li>`);
  H.push(`<li>Open gaps: ${sc.gaps.length}. Date all gaps are planned to close: ${esc(rv.fullScoreDate || (sc.gaps.length ? "not set (a gap has no milestone)" : "none open"))}.</li></ul>`);
  H.push("<h2>4. Requirements</h2>");
  for (const [fam, name] of Object.entries(FAMILIES)) {
    H.push(`<h3>${esc(fam)} ${esc(name)}</h3>`);
    for (const req of sortedReqs().filter((r) => r.family === fam)) {
      const r = doc.requirements[req.id] || {};
      H.push(`<section class="req"><h4>${esc(req.id)} ${esc(req.label)}</h4><dl>`);
      H.push(`<dt>Status:</dt><dd>${esc(statusText(req.id, r.status))}${req.weight === null ? " (no point value; the SSP itself)" : ` (${req.weight} point${req.weight === 1 ? "" : "s"} if not met)`}</dd>`);
      if (r.status === "na") H.push(`<dt>Why not applicable:</dt><dd>${esc(r.naReason || "Not given.")}</dd>`);
      if (!blank(r.responsible)) H.push(`<dt>Responsible:</dt><dd>${esc(r.responsible)}</dd>`);
      if (!blank(r.provider)) H.push(`<dt>Provided or shared by:</dt><dd>${esc(r.provider)}</dd>`);
      if (!blank(r.evidence)) H.push(`<dt>Evidence:</dt><dd>${esc(r.evidence)}</dd>`);
      if (r.status === "not_met" || r.status === "partial") {
        H.push(`<dt>Planned action:</dt><dd>${esc(r.plannedAction || "Not yet planned.")}</dd>`);
        H.push(`<dt>Milestone:</dt><dd>${esc(r.milestone || "Not set.")}</dd>`);
      }
      H.push("</dl>" + para(r.implementation) + "</section>");
    }
  }
  H.push("<h2>5. Plan of action and milestones (requirement 3.12.2)</h2>");
  if (!sc.gaps.length) H.push("<p>No open gaps.</p>");
  else {
    H.push("<table><tr><th>Requirement</th><th>Points</th><th>Status</th><th>Planned action</th><th>Responsible</th><th>Milestone</th></tr>");
    for (const g of sc.gaps) {
      const r = doc.requirements[g.id] || {};
      H.push(`<tr><td>${esc(g.id)} ${esc(g.label)}</td><td>${g.weight === null ? "-" : g.deduct}</td><td>${esc(statusText(g.id, r.status))}</td><td>${esc(r.plannedAction)}</td><td>${esc(r.responsible)}</td><td>${esc(r.milestone)}</td></tr>`);
    }
    H.push("</table>");
  }
  H.push("</body></html>");
  return H.join("\n") + "\n";
}

// --- POA&M CSV --------------------------------------------------------------

function csvCell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The POA&M, one row per gap, in the columns ssp-and-poam.html describes. */
export function poamToCsv(input) {
  const doc = normaliseSsp(input);
  const { gaps } = scoreSprs(statusesForScore(doc));
  const head = ["Requirement", "Short label", "Points deducted", "Status", "POA&M allowed (32 CFR 170.21)", "Weakness (implementation as it stands)", "Planned action", "Responsible", "Milestone date", "Provided or shared by"];
  const rows = gaps.map((g) => {
    const r = doc.requirements[g.id] || {};
    return [g.id, g.label, g.weight === null ? "" : g.deduct, statusText(g.id, r.status), POAM_RULE_TEXT[g.poam], r.implementation, r.plannedAction, r.responsible, r.milestone, r.provider];
  });
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
