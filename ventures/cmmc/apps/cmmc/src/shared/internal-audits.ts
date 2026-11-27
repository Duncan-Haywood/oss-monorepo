// ISO 9001 internal audits (clause 9.2) and nonconformity and corrective action (clause 10.2) for the
// quality side of the workspace: an audit programme (each audit's scope by clause or process, its
// date and auditor), the findings each audit raises, and a corrective-action log (the nonconformity,
// what was done at once, the root cause, the action, and the check that it worked) that a finding
// opens. Shared by the Worker and the SPA; everything here is pure.
//
// ISO 9001's text is copyrighted, so nothing here quotes it: clause numbers point a reader to the
// standard, and the checks are plain-language readings of what auditors ask to see (a programme that
// covers the system at planned intervals, auditors who do not audit their own work, findings
// followed up, causes found, actions checked for effect). docs/SOURCES.md, "Internal audits and
// corrective actions". The log is a record-keeping aid; it does not make a quality system conform
// to ISO 9001 or AS9100.

import { addDays, daysBetween, isIsoDate } from "./affirmation";
import { addMonths } from "./security-policies";

export const AUDIT_STATUSES = ["planned", "done", "cancelled"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  planned: "Planned",
  done: "Done",
  cancelled: "Cancelled",
};

/**
 * Finding grades in the words certification bodies commonly use (not ISO 9001's own: the standard
 * does not grade findings). Major and minor nonconformities need a corrective action; an
 * observation or opportunity for improvement may open one but need not.
 */
export const FINDING_KINDS = ["major", "minor", "observation", "improvement"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];
export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  major: "Major nonconformity",
  minor: "Minor nonconformity",
  observation: "Observation",
  improvement: "Opportunity for improvement",
};
export const isNonconformity = (k: FindingKind) => k === "major" || k === "minor";

export const CA_SOURCES = [
  "internal_audit",
  "external_audit",
  "customer_complaint",
  "customer_return",
  "supplier",
  "process",
  "other",
] as const;
export type CaSource = (typeof CA_SOURCES)[number];
export const CA_SOURCE_LABEL: Record<CaSource, string> = {
  internal_audit: "Internal audit",
  external_audit: "Customer or registrar audit",
  customer_complaint: "Customer complaint",
  customer_return: "Returned or rejected parts",
  supplier: "Supplier problem",
  process: "Found in the shop (inspection, process)",
  other: "Other",
};

/**
 * How far a corrective action has got, read from what is filled in (never stored):
 * cause: no root cause yet; action: cause found, action not done; verify: action done, effect not
 * yet checked; not_effective: checked and it did not work, so a new action is due; closed.
 */
export const CA_STAGES = ["cause", "action", "verify", "not_effective", "closed"] as const;
export type CaStage = (typeof CA_STAGES)[number];
export const CA_STAGE_LABEL: Record<CaStage, string> = {
  cause: "Find the cause",
  action: "Take the action",
  verify: "Check it worked",
  not_effective: "Did not work: new action",
  closed: "Closed",
};

/** The standard sets no audit interval; a programme that covers every clause once a year is common. */
export const AUDIT_COVERAGE_MONTHS = 12;
export const AUDIT_WARNING_DAYS = 30;
export const CA_WARNING_DAYS = 14;
export const MAX_AUDITS_PER_ORG = 500;
export const MAX_FINDINGS_PER_AUDIT = 200;
export const MAX_CORRECTIVE_ACTIONS_PER_ORG = 2000;
export const AUDIT_TITLE_MAX = 200;

const DATE_ERR = (what: string) => `The ${what} must be a date (YYYY-MM-DD).`;

// ---------- audits ----------

export interface AuditFields {
  title: string;
  /** ISO 9001 clause ids in scope ("iso9001-8.5.1"); may be empty when a process is named. */
  clauseIds: string[];
  /** A process audited across clauses ("Receiving inspection", "CNC turning cell"). */
  process: string;
  plannedOn: string;
  /** The auditor when they are a member; null for an outside auditor named in auditorName. */
  auditorUserId: string | null;
  auditorName: string;
}

export function validateAuditFields(
  a: AuditFields,
  knownClause: (id: string) => boolean,
): string[] {
  const errors: string[] = [];
  if (!a.title.trim()) errors.push("Give the audit a title (for example Q1 production audit).");
  else if (a.title.length > AUDIT_TITLE_MAX)
    errors.push(`A title is up to ${AUDIT_TITLE_MAX} characters.`);
  if (a.clauseIds.length === 0 && !a.process.trim())
    errors.push("Pick the clauses in scope or name the process audited.");
  const unknown = a.clauseIds.filter((id) => !knownClause(id));
  if (unknown.length) errors.push(`Unknown clause: ${unknown.join(", ")}.`);
  if (new Set(a.clauseIds).size !== a.clauseIds.length) errors.push("A clause is listed twice.");
  if (!isIsoDate(a.plannedOn)) errors.push(DATE_ERR("planned date"));
  if (!a.auditorUserId && !a.auditorName.trim())
    errors.push("Name the auditor (a member, or someone from outside).");
  return errors;
}

/** Problems with marking an audit done. `today` is YYYY-MM-DD (UTC). */
export function validateCompletion(completedOn: string, today: string): string[] {
  if (!isIsoDate(completedOn)) return [DATE_ERR("date the audit was done")];
  if (completedOn > today) return ["An audit cannot be marked done on a future date."];
  return [];
}

export interface AuditLike {
  id: string;
  title: string;
  clauseIds: string[];
  process: string;
  plannedOn: string;
  status: AuditStatus;
  completedOn: string | null;
  auditorUserId: string | null;
  auditorName: string;
}

export interface FindingLike {
  id: string;
  auditId: string;
  kind: FindingKind;
  clauseId: string | null;
  correctiveActionId: string | null;
}

export type IssueKind = "gap" | "soon" | "note";
export interface QualityIssue {
  /** The audit, finding or corrective action the issue is about. */
  targetId: string;
  kind: IssueKind;
  message: string;
}

export type AuditTiming = "none" | "upcoming" | "due_soon" | "overdue";

export function auditTiming(
  a: Pick<AuditLike, "status" | "plannedOn">,
  today: string,
): AuditTiming {
  if (a.status !== "planned") return "none";
  const days = daysBetween(today, a.plannedOn);
  if (days < 0) return "overdue";
  if (days <= AUDIT_WARNING_DAYS) return "due_soon";
  return "upcoming";
}

/**
 * What an auditor of the programme would ask about one audit. `clauseOwner` gives each clause's owner
 * on the ISO 9001 checklist: an auditor who owns a clause in scope is auditing their own work.
 */
export function auditIssues(
  a: AuditLike,
  findings: FindingLike[],
  clauseOwner: (clauseId: string) => string | null,
  clauseNumber: (clauseId: string) => string,
  today: string,
): QualityIssue[] {
  const out: QualityIssue[] = [];
  const add = (kind: IssueKind, message: string) =>
    out.push({ targetId: a.id, kind, message: `${a.title}: ${message}` });
  if (a.status === "cancelled") return out;
  const timing = auditTiming(a, today);
  if (timing === "overdue") add("gap", `planned for ${a.plannedOn} and not marked done.`);
  else if (timing === "due_soon") add("soon", `planned for ${a.plannedOn}.`);
  if (a.auditorUserId) {
    const own = a.clauseIds.filter((id) => clauseOwner(id) === a.auditorUserId);
    if (own.length)
      add(
        "gap",
        `the auditor owns ${own.map(clauseNumber).join(", ")} on the checklist, so would audit their own work. Pick another auditor or take those clauses out of scope.`,
      );
  }
  for (const f of findings) {
    if (f.auditId !== a.id || !isNonconformity(f.kind) || f.correctiveActionId) continue;
    out.push({
      targetId: f.id,
      kind: "gap",
      message: `${a.title}: a ${FINDING_KIND_LABEL[f.kind].toLowerCase()}${f.clauseId ? ` against ${clauseNumber(f.clauseId)}` : ""} has no corrective action.`,
    });
  }
  return out;
}

export interface ClauseCoverage {
  clauseId: string;
  /** The latest done audit with the clause in scope, or null when none. */
  lastAuditedOn: string | null;
  /** The next planned audit with the clause in scope, or null. */
  nextPlannedOn: string | null;
  /** Audited within AUDIT_COVERAGE_MONTHS, or planned to be. */
  covered: boolean;
}

/**
 * Per clause: when it was last audited and when it is next planned. Clauses the org marked not
 * applicable on the checklist are left out (pass them in `excluded`).
 */
export function clauseCoverage(
  clauseIds: readonly string[],
  audits: AuditLike[],
  excluded: ReadonlySet<string>,
  today: string,
): ClauseCoverage[] {
  const since = addMonths(today, -AUDIT_COVERAGE_MONTHS);
  return clauseIds
    .filter((id) => !excluded.has(id))
    .map((clauseId) => {
      let last: string | null = null;
      let next: string | null = null;
      for (const a of audits) {
        if (!a.clauseIds.includes(clauseId)) continue;
        if (a.status === "done" && a.completedOn && (!last || a.completedOn > last))
          last = a.completedOn;
        if (a.status === "planned" && (!next || a.plannedOn < next)) next = a.plannedOn;
      }
      const covered = (last !== null && last >= since) || next !== null;
      return { clauseId, lastAuditedOn: last, nextPlannedOn: next, covered };
    });
}

// ---------- corrective actions ----------

export interface CorrectiveActionLike {
  id: string;
  ref: string;
  nonconformity: string;
  rootCause: string;
  action: string;
  ownerUserId: string | null;
  raisedOn: string;
  dueOn: string | null;
  completedOn: string | null;
  verifyDueOn: string | null;
  verifiedOn: string | null;
  effective: boolean | null;
  closedOn: string | null;
}

export function caStage(ca: CorrectiveActionLike): CaStage {
  if (ca.closedOn) return "closed";
  if (ca.verifiedOn && ca.effective === false) return "not_effective";
  if (!ca.rootCause.trim()) return "cause";
  if (!ca.completedOn) return "action";
  return "verify";
}

export interface CaDates {
  raisedOn: string;
  dueOn: string | null;
  completedOn: string | null;
  verifyDueOn: string | null;
}

export function validateCaDates(d: CaDates, today: string): string[] {
  const errors: string[] = [];
  if (!isIsoDate(d.raisedOn)) errors.push(DATE_ERR("date raised"));
  else if (d.raisedOn > today) errors.push("The date raised cannot be in the future.");
  if (d.dueOn !== null && !isIsoDate(d.dueOn)) errors.push(DATE_ERR("action due date"));
  if (d.verifyDueOn !== null && !isIsoDate(d.verifyDueOn))
    errors.push(DATE_ERR("effectiveness check date"));
  if (d.completedOn !== null) {
    if (!isIsoDate(d.completedOn)) errors.push(DATE_ERR("date the action was done"));
    else if (d.completedOn > today) errors.push("The action cannot be done on a future date.");
    else if (isIsoDate(d.raisedOn) && d.completedOn < d.raisedOn)
      errors.push("The action cannot be done before the problem was raised.");
  }
  return errors;
}

/** Problems with recording the effectiveness check. */
export function validateVerification(
  ca: CorrectiveActionLike,
  v: { checkedOn: string; effective: boolean; notes: string },
  today: string,
): string[] {
  const errors: string[] = [];
  const stage = caStage(ca);
  if (stage === "closed") errors.push("This corrective action is closed.");
  else if (stage !== "verify")
    errors.push(
      stage === "not_effective"
        ? "Record the new action and when it was done before checking it again."
        : "Record the root cause and the action taken, with the date it was done, before checking it worked.",
    );
  if (!isIsoDate(v.checkedOn)) errors.push(DATE_ERR("date of the check"));
  else if (v.checkedOn > today) errors.push("The check cannot be dated in the future.");
  else if (ca.completedOn && v.checkedOn < ca.completedOn)
    errors.push("The check cannot come before the action was done.");
  if (!v.notes.trim())
    errors.push("Say what was checked (the parts, the records, the period looked at).");
  return errors;
}

/** What an auditor would ask about one corrective action. Closed ones raise nothing. */
export function caIssues(ca: CorrectiveActionLike, today: string): QualityIssue[] {
  const out: QualityIssue[] = [];
  const add = (kind: IssueKind, message: string) =>
    out.push({ targetId: ca.id, kind, message: `${ca.ref}: ${message}` });
  const stage = caStage(ca);
  if (stage === "closed") return out;
  if (stage === "not_effective")
    add("gap", "the check found the action did not work; record a new action.");
  if ((stage === "cause" || stage === "action" || stage === "not_effective") && ca.dueOn) {
    const days = daysBetween(today, ca.dueOn);
    if (days < 0) add("gap", `action was due ${ca.dueOn}.`);
    else if (days <= CA_WARNING_DAYS) add("soon", `action due ${ca.dueOn}.`);
  }
  if ((stage === "cause" || stage === "action") && !ca.dueOn)
    add("note", "no due date for the action.");
  if (stage === "verify") {
    if (!ca.verifyDueOn) add("note", "no date set to check the action worked.");
    else {
      const days = daysBetween(today, ca.verifyDueOn);
      if (days < 0) add("gap", `check that the action worked was due ${ca.verifyDueOn}.`);
      else if (days <= CA_WARNING_DAYS)
        add("soon", `check that the action worked due ${ca.verifyDueOn}.`);
    }
  }
  if (!ca.ownerUserId) add("note", "no owner.");
  return out;
}

export interface QualityProgrammeCheck {
  audits: { planned: number; done: number; overdue: number };
  /** Applicable clauses, and how many have been audited in the coverage window or are planned. */
  clauses: { applicable: number; covered: number; uncovered: string[] };
  correctiveActions: { open: number; closed: number; overdue: number; notEffective: number };
  issues: QualityIssue[];
}

const ORDER: Record<IssueKind, number> = { gap: 0, soon: 1, note: 2 };

export function checkProgramme(input: {
  audits: AuditLike[];
  findings: FindingLike[];
  actions: CorrectiveActionLike[];
  clauseIds: readonly string[];
  excluded: ReadonlySet<string>;
  clauseOwner: (clauseId: string) => string | null;
  clauseNumber: (clauseId: string) => string;
  today: string;
}): QualityProgrammeCheck {
  const { audits, findings, actions, today } = input;
  const issues: QualityIssue[] = [];
  const check: QualityProgrammeCheck = {
    audits: { planned: 0, done: 0, overdue: 0 },
    clauses: { applicable: 0, covered: 0, uncovered: [] },
    correctiveActions: { open: 0, closed: 0, overdue: 0, notEffective: 0 },
    issues,
  };
  for (const a of audits) {
    if (a.status === "planned") check.audits.planned++;
    if (a.status === "done") check.audits.done++;
    if (auditTiming(a, today) === "overdue") check.audits.overdue++;
    issues.push(...auditIssues(a, findings, input.clauseOwner, input.clauseNumber, today));
  }
  const coverage = clauseCoverage(input.clauseIds, audits, input.excluded, today);
  check.clauses.applicable = coverage.length;
  check.clauses.covered = coverage.filter((c) => c.covered).length;
  check.clauses.uncovered = coverage.filter((c) => !c.covered).map((c) => c.clauseId);
  if (audits.length > 0 && check.clauses.uncovered.length > 0)
    issues.push({
      targetId: "programme",
      kind: "note",
      message: `Not audited in the last ${AUDIT_COVERAGE_MONTHS} months and not planned: ${check.clauses.uncovered.map(input.clauseNumber).join(", ")}.`,
    });
  for (const ca of actions) {
    const stage = caStage(ca);
    if (stage === "closed") check.correctiveActions.closed++;
    else check.correctiveActions.open++;
    if (stage === "not_effective") check.correctiveActions.notEffective++;
    const mine = caIssues(ca, today);
    if (mine.some((i) => i.kind === "gap" && /was due/.test(i.message)))
      check.correctiveActions.overdue++;
    issues.push(...mine);
  }
  issues.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  return check;
}

/** The next reference in the log: CA-0001, CA-0002 ... from the highest number already used. */
export function nextCaRef(existing: readonly string[]): string {
  let max = 0;
  for (const r of existing) {
    const m = /^CA-(\d+)$/.exec(r);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CA-${String(max + 1).padStart(4, "0")}`;
}

/** A default date to check effect: 90 days after the action, a common "long enough to see" wait. */
export const suggestedVerifyDue = (completedOn: string) => addDays(completedOn, 90);

const csvCell = (v: string) => {
  // A cell that a spreadsheet would read as a formula is prefixed with an apostrophe.
  const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/** The corrective-action log as CSV. Names come from `nameOf`; a user who has left shows empty. */
export function correctiveActionLogCsv(
  list: (CorrectiveActionLike & {
    source: CaSource;
    clauseId: string | null;
    containment: string;
    verificationNotes: string;
  })[],
  nameOf: (userId: string | null) => string,
  clauseNumber: (clauseId: string) => string,
): string {
  const head = [
    "Reference",
    "Raised on",
    "Source",
    "ISO 9001 clause",
    "Nonconformity",
    "Correction (immediate)",
    "Root cause",
    "Corrective action",
    "Owner",
    "Action due",
    "Action done",
    "Check due",
    "Checked on",
    "Effective",
    "What was checked",
    "Stage",
    "Closed on",
  ];
  const rows = [...list]
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .map((ca) => [
      ca.ref,
      ca.raisedOn,
      CA_SOURCE_LABEL[ca.source],
      ca.clauseId ? clauseNumber(ca.clauseId) : "",
      ca.nonconformity,
      ca.containment,
      ca.rootCause,
      ca.action,
      nameOf(ca.ownerUserId),
      ca.dueOn ?? "",
      ca.completedOn ?? "",
      ca.verifyDueOn ?? "",
      ca.verifiedOn ?? "",
      ca.effective === null ? "" : ca.effective ? "Yes" : "No",
      ca.verificationNotes,
      CA_STAGE_LABEL[caStage(ca)],
      ca.closedOn ?? "",
    ]);
  return `${[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

// ---------- dates for the calendar file and the dashboard ----------

/** What a quality date is: a planned internal audit, a corrective action's due date, or its check. */
export type QualityDueKind = "audit" | "ca_action" | "ca_check";

/** One calendar event's worth: how many audits or actions fall on a date, never their titles. */
export interface QualityDueDate {
  kind: QualityDueKind;
  due: string;
  count: number;
}

/**
 * The date a corrective action is waiting on, by stage: the action's due date until the action is
 * done (or again after a check found it did not work), then the date to check it worked. Closed
 * actions wait on nothing.
 */
export function caNextDate(
  ca: CorrectiveActionLike,
): { kind: "ca_action" | "ca_check"; due: string } | null {
  const stage = caStage(ca);
  if ((stage === "cause" || stage === "action" || stage === "not_effective") && ca.dueOn)
    return { kind: "ca_action", due: ca.dueOn };
  if (stage === "verify" && ca.verifyDueOn) return { kind: "ca_check", due: ca.verifyDueOn };
  return null;
}

const DUE_KIND_ORDER: Record<QualityDueKind, number> = { audit: 0, ca_action: 1, ca_check: 2 };

/**
 * Planned audits and open corrective actions grouped by date and kind, for the calendar file and
 * the subscribable link. Counts only: an audit's title or a nonconformity's text never leaves the
 * workspace through a link that has no session.
 */
export function qualityDueDates(
  audits: Pick<AuditLike, "status" | "plannedOn">[],
  actions: CorrectiveActionLike[],
): QualityDueDate[] {
  const byKey = new Map<string, QualityDueDate>();
  const add = (kind: QualityDueKind, due: string) => {
    if (!isIsoDate(due)) return;
    const key = `${kind}|${due}`;
    const hit = byKey.get(key);
    if (hit) hit.count++;
    else byKey.set(key, { kind, due, count: 1 });
  };
  for (const a of audits) if (a.status === "planned") add("audit", a.plannedOn);
  for (const ca of actions) {
    const next = caNextDate(ca);
    if (next) add(next.kind, next.due);
  }
  return [...byKey.values()].sort(
    (a, b) => a.due.localeCompare(b.due) || DUE_KIND_ORDER[a.kind] - DUE_KIND_ORDER[b.kind],
  );
}

/** A dashboard line: an audit or corrective action whose date has passed or falls due soon. */
export interface QualityAttention {
  kind: QualityDueKind;
  /** The audit or corrective action. */
  id: string;
  /** The audit's title, or the action's reference (CA-0001). */
  label: string;
  due: string;
  state: "overdue" | "due_soon";
}

/**
 * Overdue first (oldest first), then what falls due within the warning window: audits within
 * AUDIT_WARNING_DAYS, corrective actions and their checks within CA_WARNING_DAYS, the same windows
 * the Audits tab's checks use.
 */
export function qualityAttention(
  audits: Pick<AuditLike, "id" | "title" | "status" | "plannedOn">[],
  actions: CorrectiveActionLike[],
  today: string,
): QualityAttention[] {
  const out: QualityAttention[] = [];
  for (const a of audits) {
    const t = auditTiming(a, today);
    if (t === "overdue" || t === "due_soon")
      out.push({ kind: "audit", id: a.id, label: a.title, due: a.plannedOn, state: t });
  }
  for (const ca of actions) {
    const next = caNextDate(ca);
    if (!next) continue;
    const days = daysBetween(today, next.due);
    if (days < 0) out.push({ ...next, id: ca.id, label: ca.ref, state: "overdue" });
    else if (days <= CA_WARNING_DAYS)
      out.push({ ...next, id: ca.id, label: ca.ref, state: "due_soon" });
  }
  return out.sort(
    (a, b) =>
      (a.state === b.state ? 0 : a.state === "overdue" ? -1 : 1) ||
      a.due.localeCompare(b.due) ||
      a.label.localeCompare(b.label),
  );
}
