// Document control for the ISO 9001 side of the workspace (clause 7.5, "Documented information"):
// the master list of a shop's controlled documents (quality manual, procedures, work instructions,
// forms, and the customer drawings and specs it works to), each with its number, revision, who
// approved it and when, where it is kept, its review date, and the history of every release.
// Shared by the Worker and the SPA; everything here is pure.
//
// ISO 9001's text is copyrighted, so nothing here quotes it: the clause numbers point a reader to
// the standard, and the checks are plain-language readings of what auditors ask to see (a master
// list, one approved revision in use, obsolete revisions withdrawn but retained, external documents
// identified). docs/SOURCES.md, "Document control". The register is a record-keeping aid; it does
// not make a quality system conform to ISO 9001 or AS9100.

import { addDays, daysBetween, isIsoDate } from "./affirmation";
import { addMonths } from "./security-policies";

export const DOC_KINDS = [
  "quality_manual",
  "procedure",
  "work_instruction",
  "form",
  "specification",
  "drawing",
  "record_template",
  "other",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  quality_manual: "Quality manual",
  procedure: "Procedure",
  work_instruction: "Work instruction",
  form: "Form or checklist",
  specification: "Specification",
  drawing: "Drawing",
  record_template: "Record template",
  other: "Other",
};

/** Internal: the shop writes and approves it. External: a customer, standards body or supplier issues it. */
export const DOC_ORIGINS = ["internal", "external"] as const;
export type DocOrigin = (typeof DOC_ORIGINS)[number];

export const DOC_ORIGIN_LABEL: Record<DocOrigin, string> = {
  internal: "Ours",
  external: "External (customer, standard, supplier)",
};

/**
 * draft: being written or revised (a revised document's last released revision stays in force);
 * released: approved and in use; obsolete: withdrawn, kept for the record.
 */
export const DOC_STATUSES = ["draft", "released", "obsolete"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  released: "Released",
  obsolete: "Obsolete",
};

/** Periodic review intervals offered; null means no periodic review (reviewed when it changes). */
export const DOC_REVIEW_MONTHS = [12, 24, 36] as const;
export type DocReviewMonths = (typeof DOC_REVIEW_MONTHS)[number];

export const DOC_REVIEW_WARNING_DAYS = 60;
export const MAX_DOCUMENTS_PER_ORG = 1000;
export const DOC_NUMBER_MAX = 40;
export const DOC_TITLE_MAX = 200;
export const DOC_REVISION_MAX = 12;

/** The history kinds written by the service: one row per release, review and withdrawal. */
export const DOC_EVENT_KINDS = ["released", "reviewed", "obsoleted"] as const;
export type DocEventKind = (typeof DOC_EVENT_KINDS)[number];

/** Where the clause list points: 7.5.3 is control of documented information. */
export const DOC_CONTROL_CLAUSE_ID = "iso9001-7.5.3";

// Printable characters only: a document number or revision ends up in a CSV, a PDF header and an
// auditor's checklist, so no control characters and no leading/trailing space.
const CLEAN = /^[^\p{Cc}\s](?:[^\p{Cc}]*[^\p{Cc}\s])?$/u;

/**
 * The revision after `rev`, in the scheme it already uses: letters count A, B ... Z, AA, AB
 * (spreadsheet style; I and O are not skipped, since shops differ), digits count up keeping their
 * width ("01" to "02", "9" to "10"), and a prefix is kept ("Rev C" to "Rev D", "1.4" to "1.5").
 * An empty revision starts at "A". Returns null when there is no trailing letter or number to count.
 */
export function nextRevision(rev: string): string | null {
  const r = rev.trim();
  if (r === "") return "A";
  const digits = /^(.*?)(\d+)$/.exec(r);
  if (digits) {
    const [, prefix, n] = digits as unknown as [string, string, string];
    const next = String(Number(n) + 1);
    return `${prefix}${next.padStart(n.length, "0")}`;
  }
  const letters = /^(.*?)([A-Za-z]+)$/.exec(r);
  if (letters) {
    const [, prefix, word] = letters as unknown as [string, string, string];
    const upper = word === word.toUpperCase();
    const base = upper ? 65 : 97;
    const chars = [...word].map((ch) => ch.charCodeAt(0) - base);
    // Mixed case ("Rev" alone, "rC") is not a revision letter run: count only a single-case run.
    if (chars.some((c) => c < 0 || c > 25)) return null;
    let i = chars.length - 1;
    while (i >= 0 && chars[i] === 25) {
      chars[i] = 0;
      i--;
    }
    if (i < 0) chars.unshift(0);
    else chars[i] = (chars[i] as number) + 1;
    return `${prefix}${chars.map((c) => String.fromCharCode(base + c)).join("")}`;
  }
  return null;
}

export interface DocumentFields {
  docNumber: string;
  title: string;
  kind: DocKind;
  origin: DocOrigin;
  /** The working revision: the one being drafted, or the one released. */
  revision: string;
  /** Who issued an external document (the customer, ASTM, the supplier); empty for internal ones. */
  issuer: string;
  /** Where the controlled copy is kept: a shared-drive path, the binder at the inspection bench. */
  location: string;
  reviewMonths: number | null;
}

/** Problems with the fields before they are stored; an empty list means they can be saved. */
export function validateDocumentFields(d: DocumentFields): string[] {
  const errors: string[] = [];
  if (!d.docNumber.trim()) errors.push("Give the document a number (for example QP-7.5-01).");
  else if (d.docNumber.length > DOC_NUMBER_MAX || !CLEAN.test(d.docNumber))
    errors.push(
      `A document number is up to ${DOC_NUMBER_MAX} printable characters, with no spaces at either end.`,
    );
  if (!d.title.trim()) errors.push("Give the document a title.");
  else if (d.title.length > DOC_TITLE_MAX)
    errors.push(`A title is up to ${DOC_TITLE_MAX} characters.`);
  if (d.revision !== "" && (d.revision.length > DOC_REVISION_MAX || !CLEAN.test(d.revision)))
    errors.push(
      `A revision is up to ${DOC_REVISION_MAX} printable characters, with no spaces at either end.`,
    );
  if (d.origin === "external" && !d.issuer.trim())
    errors.push("Say who issues an external document (the customer, the standards body).");
  if (d.reviewMonths !== null && !(DOC_REVIEW_MONTHS as readonly number[]).includes(d.reviewMonths))
    errors.push(`A review interval is ${DOC_REVIEW_MONTHS.join(", ")} months, or none.`);
  return errors;
}

/** Problems with a release before it is recorded. `today` is YYYY-MM-DD (UTC). */
export function validateRelease(
  r: { revision: string; approvedOn: string; effectiveOn: string | null },
  today: string,
): string[] {
  const errors: string[] = [];
  if (!r.revision.trim()) errors.push("Set the revision being released.");
  if (!isIsoDate(r.approvedOn)) errors.push("The approval date must be a date (YYYY-MM-DD).");
  else if (r.approvedOn > today) errors.push("The approval date cannot be in the future.");
  if (r.effectiveOn !== null) {
    if (!isIsoDate(r.effectiveOn)) errors.push("The effective date must be a date (YYYY-MM-DD).");
    else if (isIsoDate(r.approvedOn) && r.effectiveOn < r.approvedOn)
      errors.push("A revision cannot take effect before it is approved.");
  }
  return errors;
}

/** The next review date from the last release or review, or null when there is no periodic review. */
export const reviewDueFrom = (on: string, months: number | null): string | null =>
  months === null ? null : addMonths(on, months);

export interface DocumentLike {
  id: string;
  docNumber: string;
  title: string;
  kind: DocKind;
  origin: DocOrigin;
  revision: string;
  status: DocStatus;
  /** The revision in force: set at release, kept while the next one is drafted. */
  releasedRevision: string | null;
  issuer: string;
  location: string;
  ownerUserId: string | null;
  approvedBy: string | null;
  approvedOn: string | null;
  effectiveOn: string | null;
  reviewMonths: number | null;
  reviewDue: string | null;
}

export type DocIssueKind = "gap" | "soon" | "note";
export interface DocIssue {
  documentId: string;
  kind: DocIssueKind;
  message: string;
}

export type DocReviewState = "none" | "current" | "due_soon" | "overdue";

export function docReviewState(
  d: Pick<DocumentLike, "status" | "reviewDue">,
  today: string,
): DocReviewState {
  if (d.status === "obsolete" || !d.reviewDue) return "none";
  const days = daysBetween(today, d.reviewDue);
  if (days < 0) return "overdue";
  if (days <= DOC_REVIEW_WARNING_DAYS) return "due_soon";
  return "current";
}

const label = (d: Pick<DocumentLike, "docNumber" | "title">) => `${d.docNumber} ${d.title}`;

/** What an auditor would ask about one document. Obsolete documents raise nothing. */
export function documentIssues(d: DocumentLike, today: string): DocIssue[] {
  const out: DocIssue[] = [];
  const add = (kind: DocIssueKind, message: string) =>
    out.push({ documentId: d.id, kind, message: `${label(d)}: ${message}` });
  if (d.status === "obsolete") return out;
  const review = docReviewState(d, today);
  if (review === "overdue") add("gap", `review was due ${d.reviewDue}.`);
  else if (review === "due_soon") add("soon", `review due ${d.reviewDue}.`);
  if (d.releasedRevision === null)
    add(
      d.origin === "internal" ? "gap" : "note",
      d.origin === "internal"
        ? "never released, so no approved revision is in use yet."
        : "not yet recorded as the revision you work to (release it once checked).",
    );
  else if (d.status === "draft")
    add(
      "note",
      `revision ${d.revision || "(none set)"} in draft; ${d.releasedRevision} stays in force.`,
    );
  if (d.releasedRevision !== null && d.origin === "internal" && (!d.approvedBy || !d.approvedOn))
    add("gap", "no approver or approval date on the released revision.");
  if (!d.location.trim()) add("note", "no location for the controlled copy.");
  if (!d.ownerUserId) add("note", "no owner.");
  return out;
}

export interface DocumentCheck {
  total: number;
  /** Not obsolete. */
  active: number;
  /** Active with a released revision in force. */
  released: number;
  obsolete: number;
  reviewOverdue: number;
  reviewDueSoon: number;
  issues: DocIssue[];
}

export function checkDocuments(list: DocumentLike[], today: string): DocumentCheck {
  const check: DocumentCheck = {
    total: list.length,
    active: 0,
    released: 0,
    obsolete: 0,
    reviewOverdue: 0,
    reviewDueSoon: 0,
    issues: [],
  };
  for (const d of list) {
    if (d.status === "obsolete") {
      check.obsolete++;
      continue;
    }
    check.active++;
    if (d.releasedRevision !== null) check.released++;
    const r = docReviewState(d, today);
    if (r === "overdue") check.reviewOverdue++;
    if (r === "due_soon") check.reviewDueSoon++;
    check.issues.push(...documentIssues(d, today));
  }
  const order: Record<DocIssueKind, number> = { gap: 0, soon: 1, note: 2 };
  check.issues.sort((a, b) => order[a.kind] - order[b.kind]);
  return check;
}

/** Review dates for the calendar file and link: a count per date, never a document's title. */
export interface DocumentReviewDate {
  due: string;
  documents: number;
}

export function documentReviewDates(
  list: Pick<DocumentLike, "status" | "reviewDue">[],
): DocumentReviewDate[] {
  const byDate = new Map<string, number>();
  for (const d of list) {
    if (d.status === "obsolete" || !d.reviewDue) continue;
    byDate.set(d.reviewDue, (byDate.get(d.reviewDue) ?? 0) + 1);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([due, documents]) => ({ due, documents }));
}

/** Documents a review falls due for within `days` of today, or already overdue: for the dashboard. */
export function documentsNeedingReview(
  list: DocumentLike[],
  today: string,
  days = DOC_REVIEW_WARNING_DAYS,
) {
  const until = addDays(today, days);
  return list
    .filter((d) => d.status !== "obsolete" && d.reviewDue !== null && d.reviewDue <= until)
    .sort(
      (a, b) =>
        (a.reviewDue ?? "").localeCompare(b.reviewDue ?? "") ||
        a.docNumber.localeCompare(b.docNumber),
    )
    .map((d) => ({
      documentId: d.id,
      docNumber: d.docNumber,
      title: d.title,
      reviewDue: d.reviewDue as string,
    }));
}

const csvCell = (v: string) => {
  // A cell that a spreadsheet would read as a formula is prefixed with an apostrophe.
  const guarded = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/**
 * The master list as CSV, the document auditors ask for first. Names come from `nameOf` (members'
 * display names); a user who has left shows as empty rather than an id.
 */
export function masterListCsv(
  list: (DocumentLike & { notes: string })[],
  nameOf: (userId: string | null) => string,
  today: string,
): string {
  const head = [
    "Document number",
    "Title",
    "Type",
    "Origin",
    "Issued by",
    "Revision in force",
    "Status",
    "Revision in draft",
    "Approved by",
    "Approved on",
    "Effective on",
    "Owner",
    "Location of the controlled copy",
    "Review every (months)",
    "Review due",
    "Open gaps",
    "Notes",
  ];
  const sorted = [...list].sort((a, b) => a.docNumber.localeCompare(b.docNumber));
  const rows = sorted.map((d) => [
    d.docNumber,
    d.title,
    DOC_KIND_LABEL[d.kind],
    d.origin === "internal" ? "Internal" : "External",
    d.issuer,
    d.releasedRevision ?? "",
    DOC_STATUS_LABEL[d.status],
    d.status === "draft" && d.releasedRevision !== null ? d.revision : "",
    nameOf(d.approvedBy),
    d.approvedOn ?? "",
    d.effectiveOn ?? "",
    nameOf(d.ownerUserId),
    d.location,
    d.reviewMonths === null ? "" : String(d.reviewMonths),
    d.status === "obsolete" ? "" : (d.reviewDue ?? ""),
    String(documentIssues(d, today).filter((i) => i.kind === "gap").length),
    d.notes,
  ]);
  return `${[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
