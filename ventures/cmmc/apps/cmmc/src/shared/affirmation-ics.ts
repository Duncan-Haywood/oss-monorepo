// The affirmation and self-assessment due dates as an iCalendar file (RFC 5545), so the affirming
// official gets the reminder in their own calendar 60 and 7 days ahead without the app sending email.
// Pure: the Worker serves it from GET /api/orgs/:orgId/affirmations/calendar.ics.
//
// Each due date is an all-day event with a UID that stays the same for the same organization, level
// and kind of deadline, so importing a newer file moves the event instead of adding a second one
// (calendars that honour UID on import; others add a copy, which the page says).
//
// The same file carries each approved security policy's next review date (one event per NIST
// family, UID per org and family), so the policy owner gets the 60- and 7-day alarms too. Only the
// family's fixed name goes in: never the policy's own title, text or owner, so the subscribable
// link still shows dates and fixed wording only.
//
// Training refresher dates (AT.L2-3.2.1 to 3.2.3) go in the same way: one event per training and
// date with the number of people due, never their names, so the link stays free of personal data.
// The UID is per org, training and date: a person retrained moves to a later date, and the old
// event drops out of a subscription (an imported file keeps it until deleted, as the page says).
//
// Suppliers' "current through" dates (DFARS 252.204-7021(a), "Current") go in the same way: one
// event per date and part (the CMMC status's period, or the yearly affirmation) with the number of
// suppliers, never their names, so the link does not list the shop's supply chain. The event sits
// on the last day the record is current, and the alarms give 60 and 7 days to ask for a new one.
//
// ISO 9001 dates go in the same way: controlled documents' periodic review dates (clause 7.5),
// planned internal audits (9.2), and each open corrective action's due date or the date to check it
// worked (10.2), one event per kind and date with a count. Never a document's title, an audit's
// title or a nonconformity's text: those can name a customer, a part or a person.
//
// Gauge calibration due dates (ISO 9001 7.1.5) go in the same way: one event per date with the number
// of gauges in use falling due, never a gauge's id, description or location.
//
// The next ISO 9001 management review (9.3) and the due dates of open actions from final reviews go
// in the same way: one event per kind and date with a count, never an action's text or owner.

import { type AffirmationSchedule, addDays, DUE_SOON_DAYS } from "./affirmation";
import type { CalibrationDueDate } from "./calibration";
import type { DocumentReviewDate } from "./document-control";
import type { IncidentDueDate } from "./incidents";
import type { QualityDueDate, QualityDueKind } from "./internal-audits";
import type { ReviewDueDate, ReviewDueKind } from "./management-review";
import { TRAINING_INFO, type TrainingDueDate } from "./personnel";
import type { SupplierDueDate } from "./suppliers";

/** Days before each due date a calendar alarm fires: the dashboard's amber window, then a week. */
export const CALENDAR_ALARM_DAYS = [DUE_SOON_DAYS, 7] as const;

const PLANNING_NOTE =
  "A planning aid computed from the affirmations recorded in the CMMC Workspace, not a determination of your CMMC status. The workspace does not submit anything to SPRS: the affirming official does.";

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped in TEXT values. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const utf8 = new TextEncoder();

/**
 * RFC 5545 §3.1: a content line longer than 75 octets is folded with CRLF and one space. Splits
 * between characters, never inside a UTF-8 sequence.
 */
export function foldLine(line: string): string {
  if (utf8.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // The first line holds 75 octets; continuation lines hold 74 after their leading space.
  let limit = 75;
  for (const ch of line) {
    const n = utf8.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const icsDate = (iso: string) => iso.replace(/-/g, "");

/** A UTC timestamp in the basic format DTSTAMP wants: 20261125T143000Z. */
const icsStamp = (d: Date) => `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;

/** UID parts are ids and fixed keys; anything else is dropped so the UID stays a plain token. */
const uidPart = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

/** An approved policy's next review date (security_policy.review_due), by its family. */
export interface PolicyReviewDate {
  /** NIST SP 800-171 family code, e.g. "AC". */
  family: string;
  /** The family's fixed name from the control library, e.g. "Access Control". */
  familyName: string;
  /** YYYY-MM-DD */
  reviewDue: string;
}

const POLICY_REVIEW_NOTE =
  'The next review date recorded for this policy in the CMMC Workspace. When the policy owner has reviewed it, an admin marks it "Reviewed, no changes" or approves a revision on the Policies tab, which sets the next date. NIST SP 800-171 Rev. 2 sets no review interval: the interval is your organization\'s choice.';

const TRAINING_NOTE =
  "The refresher date computed from the training dates recorded on the People tab and your organization's refresher interval. The People tab lists who is due. NIST SP 800-171 Rev. 2 does not set how often training is repeated: the interval is your organization's choice.";

const SUPPLIER_NOTE =
  'The last day a supplier\'s record stays "current" as DFARS 252.204-7021(a) defines it, computed from the CMMC Status Dates and affirmation dates on the Suppliers tab: 180 days for a Conditional status, 1 year for Final Level 1 (Self), 3 years for Final Level 2 or 3, and 1 year for each affirmation of continuous compliance. The Suppliers tab lists which suppliers. The clause and your prime contract govern.';

const SUPPLIER_PART_LABEL: Record<SupplierDueDate["part"], string> = {
  status: "CMMC status",
  affirmation: "affirmation",
};

const DOCUMENT_REVIEW_NOTE =
  'The periodic review date recorded for these controlled documents on the Documents tab. When a document has been reviewed, mark it "Reviewed" or release a new revision there, which sets the next date. ISO 9001 sets no review interval: the interval is your organization\'s choice.';

const QUALITY_NOTE: Record<QualityDueKind, string> = {
  audit:
    "The planned date of internal audits on the Audits tab (ISO 9001 clause 9.2). Mark each audit done there with its date and summary, or move its planned date. The Audits tab lists which audits.",
  ca_action:
    "The due date set for corrective actions on the Audits tab (ISO 9001 clause 10.2). Record the root cause, the action taken and the date it was done there. The Audits tab lists which actions.",
  ca_check:
    "The date set to check that corrective actions worked (ISO 9001 clause 10.2). Record what was checked and whether the action was effective on the Audits tab, which lists which actions.",
};

const INCIDENT_HOLD_NOTE =
  "The earliest day the images of the affected systems and the monitoring/packet capture data for these incidents may be released: DFARS 252.204-7012(e) asks for them to be kept for at least 90 days from submitting the cyber incident report, computed from the report times on the Incidents tab. Keep them longer if DoD has asked for them or your contract or counsel says so.";

const CALIBRATION_NOTE =
  "The calibration due date of gauges in use, from the last calibration and each gauge's interval on the Gauges tab (ISO 9001 clause 7.1.5). The Gauges tab's recall list says which gauges. Record each calibration there, which sets the next date; a gauge past its date should not be used to accept parts until it is calibrated. The interval is your organization's choice.";

const REVIEW_NOTE: Record<ReviewDueKind, string> = {
  review:
    "The next management review (ISO 9001 clause 9.3), from the date the last review's minutes set or 12 months after it. Start the review on the Mgmt review tab: the figures for the period are filled in from the workspace's records. The standard asks for reviews at planned intervals; the interval is your organization's choice.",
  action:
    "The due date of actions set by a management review (ISO 9001 clause 9.3.3) and not yet marked done. The Mgmt review tab lists which actions and who owns them; mark each one done there.",
};

const reviewSummary = (kind: ReviewDueKind, n: number) =>
  kind === "review"
    ? "Management review due"
    : `Management review action due: ${n} ${n === 1 ? "action" : "actions"}`;

const qualitySummary = (kind: QualityDueKind, n: number) => {
  if (kind === "audit") return `Internal audit planned: ${n} ${n === 1 ? "audit" : "audits"}`;
  const what = `${n} corrective ${n === 1 ? "action" : "actions"}`;
  return kind === "ca_action" ? `Corrective action due: ${what}` : `Check effectiveness: ${what}`;
};

export interface CalendarInput {
  orgId: string;
  orgName: string;
  schedules: readonly AffirmationSchedule[];
  /** Approved policies' review dates; omitted or empty adds none. */
  policyReviews?: readonly PolicyReviewDate[];
  /** Training refresher dates, grouped (personnel.trainingDueDates); omitted or empty adds none. */
  trainingDue?: readonly TrainingDueDate[];
  /** Suppliers' "current through" dates, grouped (suppliers.supplierDueDates); omitted adds none. */
  supplierDue?: readonly SupplierDueDate[];
  /** Controlled documents' review dates, grouped (document-control.documentReviewDates). */
  documentReviews?: readonly DocumentReviewDate[];
  /** Planned audits and corrective-action dates, grouped (internal-audits.qualityDueDates). */
  qualityDue?: readonly QualityDueDate[];
  /** Days incident image holds end (incidents.incidentHoldDates); omitted adds none. */
  incidentHolds?: readonly IncidentDueDate[];
  /** Gauges in use falling due for calibration, grouped (calibration.calibrationDueDates). */
  calibrationDue?: readonly CalibrationDueDate[];
  /** The next management review and its open actions' due dates (management-review.reviewDueDates). */
  reviewDue?: readonly ReviewDueDate[];
  now: Date;
}

/** The calendar file's text, CRLF line endings. An organization with nothing recorded gets no events. */
export function renderAffirmationCalendar({
  orgId,
  orgName,
  schedules,
  policyReviews = [],
  trainingDue = [],
  supplierDue = [],
  documentReviews = [],
  qualityDue = [],
  incidentHolds = [],
  calibrationDue = [],
  reviewDue = [],
  now,
}: CalendarInput): string {
  const stamp = icsStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CMMC Workspace//Affirmation due dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`CMMC due dates: ${orgName}`)}`,
  ];
  const event = (uid: string, due: string, summary: string, description: string) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}@cmmc-workspace`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(due)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(due, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "TRANSP:TRANSPARENT",
    );
    for (const days of CALENDAR_ALARM_DAYS) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER;RELATED=START:-P${days}D`,
        `DESCRIPTION:${escapeText(`${summary}: due in ${days} days (${due})`)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  };
  for (const schedule of schedules) {
    for (const d of schedule.deadlines) {
      event(
        `cmmc-${uidPart(orgId)}-l${schedule.level}-${uidPart(d.key)}`,
        d.due,
        `CMMC Level ${schedule.level}: ${d.label}`,
        `${d.basis}\n\n${PLANNING_NOTE}`,
      );
    }
  }
  // Family order is the caller's; a malformed date is skipped rather than written as a broken event.
  for (const p of policyReviews) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.reviewDue)) continue;
    event(
      `cmmc-${uidPart(orgId)}-policy-${uidPart(p.family)}`,
      p.reviewDue,
      `Policy review: ${p.familyName} (${p.family})`,
      POLICY_REVIEW_NOTE,
    );
  }
  for (const t of trainingDue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dueOn) || t.people < 1) continue;
    const info = TRAINING_INFO[t.training];
    event(
      `cmmc-${uidPart(orgId)}-training-${uidPart(t.training)}-${icsDate(t.dueOn)}`,
      t.dueOn,
      `Training due: ${info.label} (${info.controlId}), ${t.people} ${t.people === 1 ? "person" : "people"}`,
      TRAINING_NOTE,
    );
  }
  for (const d of supplierDue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.through) || d.suppliers < 1) continue;
    event(
      `cmmc-${uidPart(orgId)}-supplier-${uidPart(d.part)}-${icsDate(d.through)}`,
      d.through,
      `Last day current, supplier ${SUPPLIER_PART_LABEL[d.part]}: ${d.suppliers} ${d.suppliers === 1 ? "supplier" : "suppliers"}`,
      SUPPLIER_NOTE,
    );
  }
  for (const d of documentReviews) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due) || d.documents < 1) continue;
    event(
      `cmmc-${uidPart(orgId)}-docreview-${icsDate(d.due)}`,
      d.due,
      `Document review due: ${d.documents} controlled ${d.documents === 1 ? "document" : "documents"}`,
      DOCUMENT_REVIEW_NOTE,
    );
  }
  for (const q of qualityDue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.due) || q.count < 1) continue;
    event(
      `cmmc-${uidPart(orgId)}-quality-${uidPart(q.kind)}-${icsDate(q.due)}`,
      q.due,
      qualitySummary(q.kind, q.count),
      QUALITY_NOTE[q.kind],
    );
  }
  for (const h of incidentHolds) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date) || h.count < 1) continue;
    event(
      `cmmc-${uidPart(orgId)}-incident-hold-${icsDate(h.date)}`,
      h.date,
      `Incident image hold ends: ${h.count} ${h.count === 1 ? "incident" : "incidents"}`,
      INCIDENT_HOLD_NOTE,
    );
  }
  for (const d of calibrationDue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due) || d.gauges < 1) continue;
    event(
      `cmmc-${uidPart(orgId)}-calibration-${icsDate(d.due)}`,
      d.due,
      `Calibration due: ${d.gauges} ${d.gauges === 1 ? "gauge" : "gauges"}`,
      CALIBRATION_NOTE,
    );
  }
  for (const d of reviewDue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due) || d.count < 1) continue;
    // One "next review" event per org (its UID has no date, so a new review moves it); actions per date.
    event(
      d.kind === "review"
        ? `cmmc-${uidPart(orgId)}-mgmt-review`
        : `cmmc-${uidPart(orgId)}-mgmt-review-action-${icsDate(d.due)}`,
      d.due,
      reviewSummary(d.kind, d.count),
      REVIEW_NOTE[d.kind],
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** GET/POST/DELETE /api/orgs/:orgId/affirmations/calendar-feed (admins). */
export interface CalendarFeedStatus {
  on: boolean;
  createdAt: string | null;
  createdByName: string | null;
  lastFetchedAt: string | null;
  /** The https link, only in the answer to the POST that made it: the server keeps only its hash. */
  url: string | null;
}

/** The secret's prefix, so a leaked link is recognisable in a log or a secret scanner. */
export const CALENDAR_TOKEN_PREFIX = "cmcal_";

/** A well-formed token: the prefix and 43 base64url characters (32 random bytes). */
export const isCalendarToken = (s: string) =>
  new RegExp(`^${CALENDAR_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`).test(s);

/** The same link for calendar apps that open webcal:// (Apple Calendar, Outlook desktop). */
export const webcalUrl = (httpsUrl: string) => httpsUrl.replace(/^https?:\/\//, "webcal://");
