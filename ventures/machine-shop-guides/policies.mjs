/**
 * NIST SP 800-171 policy templates: one written security policy per requirement family (the 14
 * CMMC Level 2 domains), filled with the shop's own names.
 *
 * The same starter text CMMC Workspace's Policies tab writes (apps/cmmc/src/shared/security-policies.ts),
 * ported so a shop can take the documents without an account. Honesty rules, the app's:
 *
 *   - section 4, "Policy", restates each requirement of the family in NIST's own wording
 *     (policy-text.mjs, generated from the app's official-text.json), so nothing in it is invented;
 *   - section 5, "Procedures", carries only what the shop wrote itself: the implementation
 *     statements from its SSP template draft (nist-800-171-ssp-template.html) when it brings them
 *     in, and otherwise a note saying what to write. No procedure is made up;
 *   - the rest (purpose, scope, roles, exceptions, enforcement, review) is plain boilerplate the
 *     shop is told to edit. NIST SP 800-171 Rev. 2 sets no review interval for policies; the
 *     interval is the shop's choice and the text says so.
 *
 * Pure, runs in the browser; nothing is transmitted.
 */
import { FAMILIES, REQUIREMENTS } from "./sprs-data.mjs";
import { REQUIREMENT_TEXT } from "./policy-text.mjs";

export const POLICY_FAMILIES = Object.keys(FAMILIES);
export const REVIEW_MONTHS = [6, 12, 24, 36];
export const DEFAULT_REVIEW_MONTHS = 12;
const TEXT_MAX = 8000;

/** The requirement numbers a family's policy covers, in NIST order. */
export const familyRequirements = (family) =>
  REQUIREMENTS.filter((r) => r.family === family).map((r) => ({ id: r.id, text: REQUIREMENT_TEXT.get(r.id) }));

export const policyTitle = (family) => `${FAMILIES[family]} Policy`;

const clean = (s, max = 200) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

/** Keep pasted text from forging headings in the generated Markdown. */
const para = (s) => s.trim().replace(/^(#+)/gm, "\\$1");

const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Review interval in months: one of the offered values, else the default. */
export const reviewMonths = (m) => (REVIEW_MONTHS.includes(Number(m)) ? Number(m) : DEFAULT_REVIEW_MONTHS);

/**
 * Implementation statements from a plan saved by the SSP template (its draft or plan file), by
 * requirement number. Only non-empty statements; everything else in the plan is ignored.
 */
export function statementsFromSsp(plan) {
  const out = new Map();
  const reqs = plan && typeof plan === "object" && plan.requirements && typeof plan.requirements === "object" ? plan.requirements : {};
  for (const r of REQUIREMENTS) {
    const s = reqs[r.id]?.implementation;
    if (typeof s === "string" && s.trim()) out.set(r.id, s.trim().slice(0, TEXT_MAX));
  }
  return out;
}

/** The SSP plan's system name and organisation, if it has them, to prefill the form. */
export function namesFromSsp(plan) {
  const sys = plan?.system && typeof plan.system === "object" ? plan.system : {};
  return { systemName: clean(sys.name), orgName: clean(sys.organization ?? sys.org ?? "") };
}

/**
 * The starter policy body for one family (Markdown, sections 1 to 8). `input`: orgName, systemName,
 * ownerName, reviewMonths, statements (Map of requirement number to the shop's own statement).
 */
export function policyBody(family, input = {}) {
  if (!FAMILIES[family]) throw new Error(`unknown family ${family}`);
  const org = clean(input.orgName) || "The organization";
  const system = clean(input.systemName) || "the system that processes, stores or transmits CUI";
  const owner = clean(input.ownerName) || "the policy owner";
  const months = reviewMonths(input.reviewMonths);
  const statements = input.statements instanceof Map ? input.statements : new Map();
  const reqs = familyRequirements(family);
  const name = FAMILIES[family];
  const out = [];
  out.push("## 1. Purpose", "");
  out.push(`This policy sets out how ${org} meets the ${name} (${family}) security requirements of NIST SP 800-171 Rev. 2, which CMMC Level 2 adopts (32 CFR 170.14(c)(3)), to protect Controlled Unclassified Information (CUI).`, "");
  out.push("## 2. Scope", "");
  out.push(`This policy applies to ${system}, to every asset in the assessment scope (see the asset inventory in the System Security Plan), and to every employee, contractor and external service provider who uses, administers or supports it.`, "");
  out.push("## 3. Roles and responsibilities", "");
  out.push(`- **Policy owner (${owner}):** keeps this policy and its procedures current, answers questions about it, approves and records exceptions, and reviews it at least every ${months} months.`);
  out.push("- **Senior management:** approves this policy and provides the resources to carry it out.");
  out.push("- **Everyone in scope:** follows this policy and reports suspected violations or security incidents to the policy owner without delay.", "");
  out.push("## 4. Policy", "");
  out.push(`${org} will:`, "");
  for (const r of reqs) out.push(`- **${r.id}** ${lowerFirst(r.text)}`);
  out.push("");
  out.push("## 5. Procedures", "");
  out.push("How each requirement is carried out: who does it, with which tool or setting, and how often. Where the System Security Plan has an implementation statement it is copied here; edit it to read as a procedure.");
  for (const r of reqs) {
    out.push("", `### ${r.id}`, "");
    const s = statements.get(r.id)?.trim();
    out.push(s ? para(s) : "_No implementation statement yet. Write the procedure: who does it, with which tool or setting, how often, and where the record of it is kept._");
  }
  out.push("");
  out.push("## 6. Exceptions", "");
  out.push("An exception to this policy is requested in writing to the policy owner, with the reason, the compensating measures and an end date. Approved exceptions are recorded. A requirement that is not met is tracked on the plan of action and milestones (POA&M).", "");
  out.push("## 7. Enforcement", "");
  out.push("Violating this policy may lead to loss of system access and to disciplinary action under the organization's personnel policies.", "");
  out.push("## 8. Review", "");
  out.push(`The policy owner reviews this policy and its procedures at least every ${months} months, and after a significant change to the system, its scope or its external service providers, or after a security incident. NIST SP 800-171 Rev. 2 does not set a review interval; this one is ${org}'s choice.`);
  return out.join("\n");
}

const cell = (s) => String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** One policy as a Markdown document: title, a control block marked draft, then the body. */
export function policyDocument(family, input = {}, { today } = {}) {
  const org = clean(input.orgName) || "The organization";
  const out = [`# ${policyTitle(family)}`, "", "| | |", "| --- | --- |"];
  const row = (k, v) => out.push(`| ${k} | ${cell(v)} |`);
  row("Organization", org);
  row("Family", `${FAMILIES[family]} (${family}), NIST SP 800-171 Rev. 2`);
  row("Requirements covered", familyRequirements(family).map((r) => r.id).join(", "));
  row("Version", "1");
  row("Status", "Draft (not approved)");
  row("Policy owner", clean(input.ownerName) || "Unassigned");
  row("Review interval", `${reviewMonths(input.reviewMonths)} months`);
  row("Next review due", "Set when approved");
  if (today) row("Prepared", today);
  out.push("");
  out.push("> **Draft.** Edit this policy to match how your organization works, then have it approved and record the approval date. A template is not a policy until it is approved and followed.");
  out.push("");
  out.push(policyBody(family, input));
  out.push("");
  return out.join("\n");
}

/** Every chosen family's policy in one Markdown file (the policy manual), with a contents table. */
export function policyManual(families, input = {}, { today } = {}) {
  const org = clean(input.orgName) || "The organization";
  const chosen = POLICY_FAMILIES.filter((f) => families.includes(f));
  const out = [`# Security policies — ${org}`, ""];
  out.push(`${today ? `Prepared ${today}. ` : ""}One policy per NIST SP 800-171 Rev. 2 family. Drafts: none is approved yet.`, "");
  out.push("| Family | Policy | Requirements |", "| --- | --- | --- |");
  for (const f of chosen) out.push(`| ${f} | ${policyTitle(f)} | ${familyRequirements(f).length} |`);
  for (const f of chosen) {
    out.push("", "---", "");
    out.push(policyDocument(f, input, { today }).replace(/^(#{1,5}) /gm, "#$1 "));
  }
  return out.join("\n");
}

/** How many of a family's requirements have the shop's own statement. */
export function coverage(family, statements) {
  const reqs = familyRequirements(family);
  return { total: reqs.length, written: reqs.filter((r) => statements?.get(r.id)?.trim()).length };
}

// ---- HTML (opens in Word or Google Docs) ----

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown of the subset these documents use: **bold**, _italic_, escaped characters. */
function inline(s) {
  let h = esc(s);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,;:])/g, "$1<em>$2</em>");
  h = h.replace(/\\([\\|#])/g, "$1");
  return h;
}

/**
 * The documents above as one standalone HTML file. Only the Markdown these functions write is
 * understood (headings, bullets, tables, a quote, rules, paragraphs); every character of the shop's
 * text is escaped first, so a pasted statement can never add markup.
 */
export function markdownToHtml(md, title) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6}) (.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (l.trim() === "---") { out.push("<hr>"); i++; continue; }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim());
      const [head, , ...body] = rows;
      const hc = cells(head);
      const th = hc.some((c) => c) ? `<thead><tr>${hc.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` : "";
      out.push(`<table>${th}<tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (l.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (l.startsWith("> ")) { out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`); i++; continue; }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6} |\||- |> |---$)/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${p.map(inline).join("<br>")}</p>`);
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.45;color:#111}table{border-collapse:collapse;margin:.5rem 0 1rem}td,th{border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top}blockquote{border-left:4px solid #b58900;margin:1rem 0;padding:.25rem .75rem;background:#fdf6e3}hr{page-break-after:always;border:0}h1{font-size:1.6rem}h2{font-size:1.25rem;margin-top:1.4rem}h3{font-size:1.05rem}</style>
</head><body>
${out.join("\n")}
</body></html>
`;
}
