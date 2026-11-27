// Written security policies, one per NIST SP 800-171 Rev. 2 family (the 14 CMMC Level 2 domains).
// Pure: the starter text, review dates and the downloadable document. The org's policies live in
// the security_policy table (services/security-policies); these functions never read the database.
//
// Honesty rules for the starter text: the "Policy" section restates each requirement of the family
// in its official wording (from the control library, checked against NIST), so nothing in it is
// invented. Procedures come only from the org's own accepted implementation statements; where there
// is none the template says what to write instead of guessing. Everything else (purpose, roles,
// exceptions, review) is plain boilerplate the org is told to edit. NIST SP 800-171 Rev. 2 sets no
// review interval for policies: the interval is the org's choice and the template says so.

import { daysBetween } from "./affirmation";
import { CONTROLS, type ControlDef, FAMILIES, type FamilyCode } from "./controls";

export const POLICY_FAMILIES = Object.keys(FAMILIES) as FamilyCode[];
export const POLICY_STATUSES = ["draft", "approved"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];
/** Review intervals offered, in months. 12 is the default. */
export const REVIEW_MONTHS = [6, 12, 24, 36] as const;
export type ReviewMonths = (typeof REVIEW_MONTHS)[number];
export const DEFAULT_REVIEW_MONTHS: ReviewMonths = 12;
/** Amber this many days before a review falls due (same window as the affirmation dates). */
export const REVIEW_WARNING_DAYS = 60;
export const POLICY_TITLE_MAX = 200;
export const POLICY_BODY_MAX = 100_000;

export const isPolicyFamily = (s: string): s is FamilyCode => s in FAMILIES;

/** The Level 2 requirements a family's policy covers, in library order. */
export const familyRequirements = (family: FamilyCode): ControlDef[] =>
  CONTROLS[2].filter((c) => c.family === family);

export const defaultPolicyTitle = (family: FamilyCode) => `${FAMILIES[family]} Policy`;

const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
};

/**
 * The same day `months` later. A day the target month lacks (31 Aug + 6 months) becomes that
 * month's last day, never the 1st of the next: a review date a day early is safe, a day late is not.
 */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parse(date);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export type ReviewState = "none" | "never_approved" | "current" | "due_soon" | "overdue";

/**
 * Where a policy's review stands today. Only the review date counts: a policy being revised (status
 * draft after an approval) keeps its last approved version in force, and that one can fall due.
 */
export function reviewState(p: { reviewDue: string | null } | null, today: string): ReviewState {
  if (!p) return "none";
  if (!p.reviewDue) return "never_approved";
  const days = daysBetween(today, p.reviewDue);
  if (days < 0) return "overdue";
  if (days <= REVIEW_WARNING_DAYS) return "due_soon";
  return "current";
}

export interface TemplateInput {
  orgName: string;
  systemName: string;
  ownerName: string | null;
  reviewMonths: number;
  /** Accepted implementation statements by control id (only accepted ones; never AI drafts). */
  statements: ReadonlyMap<string, string>;
}

/** Keep pasted text from forging headings in the generated Markdown. */
const para = (s: string) => s.trim().replace(/^(#+)/gm, "\\$1");

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]?.toLowerCase() + s.slice(1) : s);

/**
 * The starter policy for one family, filled with the org's names and its accepted implementation
 * statements. The org edits it before approving; nothing here is approved by default.
 */
export function policyTemplate(family: FamilyCode, input: TemplateInput): string {
  const org = input.orgName.trim() || "The organization";
  const system = input.systemName.trim() || "the system that processes, stores or transmits CUI";
  const owner = input.ownerName?.trim() || "the policy owner named in this workspace";
  const reqs = familyRequirements(family);
  const name = FAMILIES[family];
  const out: string[] = [];
  out.push("## 1. Purpose");
  out.push("");
  out.push(
    `This policy sets out how ${org} meets the ${name} (${family}) security requirements of NIST SP 800-171 Rev. 2, which CMMC Level 2 adopts (32 CFR 170.14(c)(3)), to protect Controlled Unclassified Information (CUI).`,
  );
  out.push("");
  out.push("## 2. Scope");
  out.push("");
  out.push(
    `This policy applies to ${system}, to every asset in the assessment scope (see the asset inventory in the System Security Plan), and to every employee, contractor and external service provider who uses, administers or supports it.`,
  );
  out.push("");
  out.push("## 3. Roles and responsibilities");
  out.push("");
  out.push(
    `- **Policy owner (${owner}):** keeps this policy and its procedures current, answers questions about it, approves and records exceptions, and reviews it at least every ${input.reviewMonths} months.`,
  );
  out.push(
    "- **Senior management:** approves this policy and provides the resources to carry it out.",
  );
  out.push(
    "- **Everyone in scope:** follows this policy and reports suspected violations or security incidents to the policy owner without delay.",
  );
  out.push("");
  out.push("## 4. Policy");
  out.push("");
  out.push(`${org} will:`);
  out.push("");
  for (const c of reqs) out.push(`- **${c.nistIds[0]}** ${lowerFirst(c.text)}`);
  out.push("");
  out.push("## 5. Procedures");
  out.push("");
  out.push(
    "How each requirement is carried out: who does it, with which tool or setting, and how often. Where an implementation statement has been accepted on the Controls page it is copied here; edit it to read as a procedure.",
  );
  for (const c of reqs) {
    out.push("");
    out.push(`### ${c.nistIds[0]}`);
    out.push("");
    const s = input.statements.get(c.id)?.trim();
    out.push(
      s
        ? para(s)
        : "_No accepted implementation statement yet. Write the procedure: who does it, with which tool or setting, how often, and where the record of it is kept._",
    );
  }
  out.push("");
  out.push("## 6. Exceptions");
  out.push("");
  out.push(
    "An exception to this policy is requested in writing to the policy owner, with the reason, the compensating measures and an end date. Approved exceptions are recorded. A requirement that is not met is tracked on the plan of action and milestones (POA&M).",
  );
  out.push("");
  out.push("## 7. Enforcement");
  out.push("");
  out.push(
    "Violating this policy may lead to loss of system access and to disciplinary action under the organization's personnel policies.",
  );
  out.push("");
  out.push("## 8. Review");
  out.push("");
  out.push(
    `The policy owner reviews this policy and its procedures at least every ${input.reviewMonths} months, and after a significant change to the system, its scope or its external service providers, or after a security incident. NIST SP 800-171 Rev. 2 does not set a review interval; this one is ${org}'s choice.`,
  );
  return out.join("\n");
}

export interface PolicyDocumentInput {
  orgName: string;
  family: FamilyCode;
  title: string;
  body: string;
  version: number;
  status: PolicyStatus;
  ownerName: string | null;
  approvedByName: string | null;
  /** YYYY-MM-DD */
  approvedOn: string | null;
  reviewMonths: number;
  /** YYYY-MM-DD */
  reviewDue: string | null;
  generatedOn: string;
}

/** One policy as a Markdown document with its control block (version, approval, review). */
export function renderPolicyDocument(p: PolicyDocumentInput): string {
  const out: string[] = [];
  out.push(`# ${p.title.trim() || defaultPolicyTitle(p.family)}`);
  out.push("");
  out.push(`| | |`);
  out.push(`| --- | --- |`);
  const row = (k: string, v: string) =>
    out.push(`| ${k} | ${v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")} |`);
  row("Organization", p.orgName);
  row("Family", `${FAMILIES[p.family]} (${p.family}), NIST SP 800-171 Rev. 2`);
  row(
    "Requirements covered",
    familyRequirements(p.family)
      .map((c) => c.nistIds[0])
      .join(", "),
  );
  row("Version", String(p.version));
  row(
    "Status",
    p.status === "approved"
      ? `Approved${p.approvedByName ? ` by ${p.approvedByName}` : ""}${p.approvedOn ? ` on ${p.approvedOn}` : ""}`
      : "Draft (not approved)",
  );
  row("Policy owner", p.ownerName ?? "Unassigned");
  row("Review interval", `${p.reviewMonths} months`);
  row("Next review due", p.reviewDue ?? "Set when first approved");
  row("Printed", p.generatedOn);
  out.push("");
  if (p.status === "draft")
    out.push(
      "> **Draft.** This version has not been approved. The last approved version, if any, stays in force until this one is approved.",
    );
  if (p.status === "draft") out.push("");
  out.push(p.body.trim());
  out.push("");
  return out.join("\n");
}

/** Every family's policy in one file (the "policy manual"), with a contents table. */
export function renderPolicyManual(
  orgName: string,
  generatedOn: string,
  docs: PolicyDocumentInput[],
): string {
  const out: string[] = [];
  out.push(`# Security policies — ${orgName}`);
  out.push("");
  out.push(`Printed ${generatedOn}. One policy per NIST SP 800-171 Rev. 2 family.`);
  out.push("");
  out.push("| Family | Policy | Version | Status | Next review |");
  out.push("| --- | --- | --- | --- | --- |");
  const byFamily = new Map(docs.map((d) => [d.family, d]));
  for (const f of POLICY_FAMILIES) {
    const d = byFamily.get(f);
    const cell = (s: string) =>
      s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    out.push(
      d
        ? `| ${f} | ${cell(d.title)} | ${d.version} | ${d.status === "approved" ? `Approved ${d.approvedOn ?? ""}`.trim() : "Draft"} | ${d.reviewDue ?? "—"} |`
        : `| ${f} | _Not written_ | — | — | — |`,
    );
  }
  for (const f of POLICY_FAMILIES) {
    const d = byFamily.get(f);
    if (!d) continue;
    out.push("");
    out.push("---");
    out.push("");
    // One level down: each document's title becomes a second-level heading inside the manual.
    out.push(renderPolicyDocument(d).replace(/^(#{1,5}) /gm, "#$1 "));
  }
  return out.join("\n");
}

/** The `[CONFIRM: ...]` placeholders an AI draft leaves where it lacked a fact. */
export const confirmPlaceholders = (s: string): string[] => s.match(/\[CONFIRM:[^\]]*\]/g) ?? [];

/**
 * Put `procedure` under the `### <nistId>` heading of a policy's text, replacing what was there up
 * to the next heading. Null when the text has no such heading (the org restructured it): the caller
 * says so rather than guessing where it goes. Headings in the procedure are escaped, so pasted text
 * cannot start a new section.
 */
export function replaceProcedure(body: string, nistId: string, procedure: string): string | null {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trim() === `### ${nistId}`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,3} /.test(lines[end] ?? "")) end++;
  const tail = lines.slice(end);
  return [
    ...lines.slice(0, start + 1),
    "",
    para(procedure),
    ...(tail.length ? [""] : []),
    ...tail,
  ].join("\n");
}
