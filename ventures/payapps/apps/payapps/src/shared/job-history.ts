// The history of a job outside its pay applications: the job's own terms, the schedule of values,
// the opening balance of a mid-job start and every change order, each change one append-only row in
// `job_events`, written by the route after the change succeeds (the same rules as the pay
// application history in ./pay-app-history.ts). A record for the people involved (a dispute over
// when a change order went to the GC, who changed the contract sum, when a California preliminary
// notice was given and what proof of it was kept, when a Florida Notice to Owner was served), never an input to the math.
import {
  CA_NOTICE_METHOD_LABELS,
  type CaNoticeMethod,
  type CaNoticeRecipient,
  FL_SERVICE_METHOD_LABELS,
  type FlNoticeRecipient,
  type FlServiceMethod,
} from "@lien-waivers";
import { formatCents } from "./money";
import { type RfiFacts, rfiLabel } from "./rfi";
import { type TmLines, type TmMarkups, tmLabel } from "./tm-tickets";

export const JOB_EVENT_ACTIONS = [
  "job_created",
  "job_details_changed",
  "sov_lines_added",
  "sov_line_changed",
  "sov_line_deleted",
  "opening_set",
  "opening_cleared",
  "change_order_created",
  "change_order_sent_changed",
  "change_order_time_changed",
  "change_order_emailed",
  "change_order_approved",
  "change_order_rejected",
  "change_order_deleted",
  "change_order_file_added",
  "change_order_file_deleted",
  "ca_first_furnished_set",
  "ca_notice_recorded",
  "ca_notice_deleted",
  "ca_notice_file_added",
  "ca_notice_file_deleted",
  "fl_first_furnished_set",
  "fl_notice_recorded",
  "fl_notice_delivered_set",
  "fl_notice_deleted",
  "rfi_created",
  "rfi_sent_changed",
  "rfi_answered",
  "rfi_answer_cleared",
  "rfi_change_order_linked",
  "rfi_change_order_unlinked",
  "rfi_changed",
  "rfi_deleted",
  "rfi_file_added",
  "rfi_file_deleted",
  "daily_report_created",
  "daily_report_changed",
  "daily_report_deleted",
  "daily_report_file_added",
  "daily_report_file_deleted",
  "closeout_file_added",
  "closeout_file_deleted",
  "tm_ticket_created",
  "tm_ticket_changed",
  "tm_ticket_signed",
  "tm_ticket_unsigned",
  "tm_ticket_billed",
  "tm_ticket_deleted",
  "tm_ticket_file_added",
  "tm_ticket_file_deleted",
] as const;
export type JobEventAction = (typeof JOB_EVENT_ACTIONS)[number];

/** What an event records beyond its action. Every field is optional; each action uses a few. */
export interface JobEventData {
  /** The money the action is about: a contract sum, lines added, a change order's net amount. */
  amountCents?: number;
  /** The amount before the change (a line's scheduled value). */
  beforeCents?: number;
  /** A date the action names: sent to the GC, approved, an opening period end. null: cleared. */
  date?: string | null;
  /** Change order number as the contractor wrote it ("CO-3"). */
  changeOrderNumber?: string;
  /** Schedule-of-values line, as the job page shows it. */
  itemNumber?: string;
  description?: string;
  /** Lines added at once. */
  count?: number;
  /** Fields changed (job terms or a line). */
  fields?: string[];
  /** Contract time a change order asks for, in calendar days; null: not stated. */
  scheduleDays?: number | null;
  /** A line's own retainage rate in basis points; null follows each application. */
  rateBps?: number | null;
  beforeRateBps?: number | null;
  /** Opening balance: the last application number made elsewhere. */
  appNumber?: number;
  /** A file attached to a change order, by its cleaned name. */
  fileName?: string;
  /** Which change order email draft was copied or opened. */
  emailKind?: "request" | "follow-up";
  /** California preliminary notice: who it went to and how (ids from packages/lien-waivers). */
  recipient?: CaNoticeRecipient;
  method?: CaNoticeMethod;
  /** Florida Notice to Owner: who it went to and how (ids from packages/lien-waivers). */
  flRecipient?: FlNoticeRecipient;
  flMethod?: FlServiceMethod;
  /** Florida: the delivery date from the evidence of delivery; null: not entered or cleared. */
  deliveredOn?: string | null;
  /** Tracking or receipt number of a mailed notice. */
  tracking?: string | null;
  /** RFI number on the job (printed "RFI 003"). */
  rfiNumber?: number;
  /** The date before the change (an RFI answered on another day before). */
  beforeDate?: string | null;
  /** Who answered an RFI, as entered. */
  answeredBy?: string | null;
  /** The day a daily report is for (YYYY-MM-DD). */
  reportDate?: string;
  /** T&M ticket number on the job (printed "T&M 7"). */
  ticketNumber?: number;
  /** The ticket number before a renumbering. */
  beforeTicketNumber?: number;
  /** Who signed a T&M ticket for the GC, their title, and whether the signature was drawn. */
  signedBy?: string;
  signedTitle?: string | null;
  drawn?: boolean;
}

const JOB_FIELD_LABELS: Record<string, string> = {
  name: "job name",
  number: "job number",
  location: "location",
  gcName: "general contractor",
  gcAddress: "GC address",
  gcBillingName: "GC billing contact",
  gcBillingEmail: "GC billing email",
  gcPmName: "GC project manager",
  gcPmEmail: "GC project manager email",
  ownerName: "owner",
  architectName: "architect",
  contractDate: "contract date",
  originalContractSumCents: "original contract sum",
  retainagePctBps: "retainage on work",
  storedRetainagePctBps: "retainage on stored materials",
  payTermsDays: "pay terms",
  payTermsBasis: "what pay terms count from",
  payTermsOuterDays: "pay-when-paid outer limit",
  notaryBlock: "notary block on the application",
  billingDay: "GC billing cutoff day",
  gaNocFiled: "Georgia notice of commencement filed",
  gaNocContractor: "contractor on the Georgia notice of commencement",
  lienState: "lien deadline state",
  lienResidential: "residential (lien deadline)",
  lastFurnishedOn: "last day furnished (lien deadline)",
  workCompletedOn: "project completion (lien deadline)",
  noticeOfCompletionOn: "notice of completion recorded (lien deadline)",
  procoreSsov: "Procore SOV positions for the invoice sheet",
  status: "status",
};

const LINE_FIELD_LABELS: Record<string, string> = {
  itemNumber: "item number",
  description: "description",
  originalCents: "scheduled value",
  retainagePctBps: "retainage rate",
};

const money = (cents: number | undefined) => (cents === undefined ? "" : formatCents(cents));
const signed = (cents: number | undefined) =>
  cents === undefined ? "" : cents < 0 ? `(${formatCents(-cents)})` : formatCents(cents);
const rate = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "each application's rate" : `${trimPct(bps)}%`;
const trimPct = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, "");
const days = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "not stated"
    : n === 0
      ? "no change in contract time"
      : `${n} calendar day${n === 1 ? "" : "s"}`;
const line = (d: JobEventData) =>
  `Line ${d.itemNumber ?? ""}${d.description ? ` (${d.description})` : ""}`;
const co = (d: JobEventData) => `Change order ${d.changeOrderNumber ?? ""}`;
const rfi = (d: JobEventData) => (d.rfiNumber === undefined ? "RFI" : rfiLabel(d.rfiNumber));

const RFI_FIELD_LABELS: Record<string, string> = {
  subject: "subject",
  question: "question",
  suggestion: "suggested answer",
  reference: "drawing or spec reference",
  responseDueOn: "response due date",
  answer: "answer",
  answeredBy: "answered by",
  costImpact: "cost impact",
  timeImpact: "time impact",
};

const DAILY_REPORT_FIELD_LABELS: Record<string, string> = {
  weather: "weather",
  tempHighF: "high temperature",
  tempLowF: "low temperature",
  delayHours: "hours lost",
  crew: "crew",
  workPerformed: "work performed",
  delays: "delays",
  delayActivityId: "activity delayed",
  equipment: "equipment",
  deliveries: "deliveries",
  visitors: "visitors and inspections",
  safety: "safety",
  notes: "notes",
};
const daily = (d: JobEventData) => `Daily report for ${d.reportDate ?? ""}`;

const TM_TICKET_FIELD_LABELS: Record<string, string> = {
  description: "description of the work",
  location: "location",
  directedBy: "directed by",
  reference: "directive or RFI reference",
  laborQuantities: "labor (trades, workers or hours)",
  laborRates: "labor rates",
  materialQuantities: "material (items or quantities)",
  materialRates: "material unit costs",
  equipmentQuantities: "equipment (items or hours)",
  equipmentRates: "equipment rates",
  markups: "markups",
  notes: "notes",
};
const tm = (d: JobEventData) =>
  d.ticketNumber === undefined ? "T&M ticket" : tmLabel(d.ticketNumber);
const signer = (d: JobEventData) =>
  `${d.signedBy ?? ""}${d.signedTitle ? ` (${d.signedTitle})` : ""}`;

/** Short names for the § 8200(a) recipients, as a sentence uses them. */
const CA_RECIPIENT_NAMES: Record<CaNoticeRecipient, string> = {
  owner: "the owner",
  "direct-contractor": "the direct contractor",
  lender: "the construction lender",
};
const caNotice = (d: JobEventData) =>
  `California preliminary notice to ${d.recipient ? CA_RECIPIENT_NAMES[d.recipient] : "a recipient"}`;
const caManner = (d: JobEventData) => {
  const how = d.method ? ` by ${CA_NOTICE_METHOD_LABELS[d.method].toLowerCase()}` : "";
  const tracking = d.tracking ? `, tracking or receipt number ${d.tracking}` : "";
  return `${how} on ${d.date ?? ""}${tracking}`;
};

/** Short names for the Florida recipients, as a sentence uses them. */
const FL_RECIPIENT_NAMES: Record<FlNoticeRecipient, string> = {
  owner: "the owner",
  contractor: "the contractor",
  subcontractor: "the subcontractor",
  designee: "the notice of commencement's designee",
  lender: "the lender",
};
const flNotice = (d: JobEventData) =>
  `Florida Notice to Owner to ${d.flRecipient ? FL_RECIPIENT_NAMES[d.flRecipient] : "a recipient"}`;
const flManner = (d: JobEventData) => {
  const how = d.flMethod ? ` by ${FL_SERVICE_METHOD_LABELS[d.flMethod].toLowerCase()}` : "";
  const delivered = d.deliveredOn ? `, delivered ${d.deliveredOn}` : "";
  const tracking = d.tracking ? `, tracking number ${d.tracking}` : "";
  return `${how} on ${d.date ?? ""}${delivered}${tracking}`;
};

/** One sentence for an event, as the job history and its CSV show it. */
export function describeJobEvent(action: JobEventAction, d: JobEventData = {}): string {
  switch (action) {
    case "job_created":
      return `Job created with an original contract sum of ${money(d.amountCents)}`;
    case "job_details_changed": {
      const fields = (d.fields ?? []).map((f) => JOB_FIELD_LABELS[f] ?? f);
      const sum =
        d.amountCents !== undefined && d.beforeCents !== undefined
          ? ` (contract sum ${money(d.beforeCents)} to ${money(d.amountCents)})`
          : "";
      return fields.length ? `Job terms changed: ${fields.join(", ")}${sum}` : "Job terms changed";
    }
    case "sov_lines_added":
      return d.count === 1
        ? `${line(d)} added to the schedule of values at ${money(d.amountCents)}`
        : `${d.count ?? 0} lines added to the schedule of values, ${money(d.amountCents)} in all`;
    case "sov_line_changed": {
      const parts = (d.fields ?? []).map((f) => {
        if (f === "originalCents")
          return `scheduled value ${money(d.beforeCents)} to ${money(d.amountCents)}`;
        if (f === "retainagePctBps")
          return `retainage ${rate(d.beforeRateBps)} to ${rate(d.rateBps)}`;
        return LINE_FIELD_LABELS[f] ?? f;
      });
      return `${line(d)} changed: ${parts.join("; ")}`;
    }
    case "sov_line_deleted":
      return `${line(d)} deleted from the schedule of values (${money(d.amountCents)})`;
    case "opening_set":
      return `Opening balance set from application #${d.appNumber ?? ""} ending ${d.date ?? ""} made elsewhere, line 6 ${money(d.amountCents)}`;
    case "opening_cleared":
      return "Opening balance removed";
    case "change_order_created": {
      const sent = d.date ? `, sent to the GC ${d.date}` : "";
      const time = d.scheduleDays === undefined ? "" : `, contract time ${days(d.scheduleDays)}`;
      return `${co(d)} entered for ${signed(d.amountCents)}${d.description ? `: ${d.description}` : ""}${sent}${time}`;
    }
    case "change_order_sent_changed":
      return d.date ? `${co(d)}: sent to the GC ${d.date}` : `${co(d)}: date sent cleared`;
    case "change_order_time_changed":
      return `${co(d)}: contract time ${days(d.scheduleDays)}`;
    case "change_order_emailed":
      return `${co(d)}: ${d.emailKind === "follow-up" ? "follow-up" : "request"} email draft to the GC copied or opened (sending is not recorded)`;
    case "change_order_approved":
      return `${co(d)} approved by the GC on ${d.date ?? ""} for ${signed(d.amountCents)}`;
    case "change_order_rejected":
      return `${co(d)} for ${signed(d.amountCents)} marked rejected`;
    case "change_order_deleted":
      return `${co(d)} for ${signed(d.amountCents)} deleted`;
    case "change_order_file_added":
      return `${co(d)}: file attached, ${d.fileName ?? ""}`;
    case "change_order_file_deleted":
      return `${co(d)}: file removed, ${d.fileName ?? ""}`;
    case "ca_first_furnished_set":
      return d.date
        ? `Day first furnished work (California § 8204(a)) set to ${d.date}`
        : "Day first furnished work (California § 8204(a)) cleared";
    case "ca_notice_recorded":
      return `${caNotice(d)} recorded as given${caManner(d)}`;
    case "ca_notice_deleted":
      return `${caNotice(d)} given${caManner(d)}: record deleted`;
    case "ca_notice_file_added":
      return `${caNotice(d)}: file attached, ${d.fileName ?? ""}`;
    case "ca_notice_file_deleted":
      return `${caNotice(d)}: file removed, ${d.fileName ?? ""}`;
    case "fl_first_furnished_set":
      return d.date
        ? `Day first furnished work (Florida § 713.06(2)(a)) set to ${d.date}`
        : "Day first furnished work (Florida § 713.06(2)(a)) cleared";
    case "fl_notice_recorded":
      return `${flNotice(d)} recorded as served${flManner(d)}`;
    case "fl_notice_delivered_set":
      return d.deliveredOn
        ? `${flNotice(d)}: delivery date set to ${d.deliveredOn}`
        : `${flNotice(d)}: delivery date cleared`;
    case "fl_notice_deleted":
      return `${flNotice(d)} sent${flManner(d)}: record deleted`;
    case "rfi_created": {
      const sent = d.date ? `, sent to the GC ${d.date}` : ", not sent yet";
      return `${rfi(d)} entered${d.description ? `: ${d.description}` : ""}${sent}`;
    }
    case "rfi_sent_changed":
      return d.date ? `${rfi(d)}: sent to the GC ${d.date}` : `${rfi(d)}: date sent cleared`;
    case "rfi_answered": {
      const by = d.answeredBy ? ` by ${d.answeredBy}` : "";
      return d.beforeDate
        ? `${rfi(d)}: date answered changed from ${d.beforeDate} to ${d.date ?? ""}${by}`
        : `${rfi(d)} answered on ${d.date ?? ""}${by}`;
    }
    case "rfi_answer_cleared":
      return `${rfi(d)}: date answered (${d.beforeDate ?? ""}) cleared, open again`;
    case "rfi_change_order_linked":
      return `${rfi(d)} linked to change order ${d.changeOrderNumber ?? ""}`;
    case "rfi_change_order_unlinked":
      return `${rfi(d)}: change order ${d.changeOrderNumber ?? ""} unlinked`;
    case "rfi_changed": {
      const parts = (d.fields ?? []).map((f) => {
        const label = RFI_FIELD_LABELS[f] ?? f;
        return f === "responseDueOn" ? `${label} ${d.date ?? "cleared"}` : label;
      });
      return `${rfi(d)} changed: ${parts.join(", ")}`;
    }
    case "rfi_deleted":
      return `${rfi(d)} deleted${d.description ? `: ${d.description}` : ""}`;
    case "rfi_file_added":
      return `${rfi(d)}: file attached, ${d.fileName ?? ""}`;
    case "rfi_file_deleted":
      return `${rfi(d)}: file removed, ${d.fileName ?? ""}`;
    case "daily_report_created":
      return `${daily(d)} entered${d.description ? ` (${d.description})` : ""}`;
    case "daily_report_changed": {
      const moved = d.beforeDate
        ? `date changed from ${d.beforeDate} to ${d.reportDate ?? ""}`
        : "";
      const parts = [
        ...(moved ? [moved] : []),
        ...(d.fields ?? []).map((f) => DAILY_REPORT_FIELD_LABELS[f] ?? f),
      ];
      return `${daily(d)} changed: ${parts.join(", ")}`;
    }
    case "daily_report_deleted":
      return `${daily(d)} deleted`;
    case "daily_report_file_added":
      return `${daily(d)}: file attached, ${d.fileName ?? ""}`;
    case "daily_report_file_deleted":
      return `${daily(d)}: file removed, ${d.fileName ?? ""}`;
    case "closeout_file_added":
      return `Close-out, ${d.description ?? "document"}: file attached, ${d.fileName ?? ""}`;
    case "closeout_file_deleted":
      return `Close-out, ${d.description ?? "document"}: file removed, ${d.fileName ?? ""}`;
    case "tm_ticket_created":
      return `${tm(d)} written up for work on ${d.reportDate ?? ""}${d.description ? `: ${d.description}` : ""}`;
    case "tm_ticket_changed": {
      const parts = [
        ...(d.beforeTicketNumber !== undefined ? [`renumbered from ${d.beforeTicketNumber}`] : []),
        ...(d.beforeDate
          ? [`work date changed from ${d.beforeDate} to ${d.reportDate ?? ""}`]
          : []),
        ...(d.fields ?? []).map((f) => TM_TICKET_FIELD_LABELS[f] ?? f),
      ];
      return `${tm(d)} changed: ${parts.join(", ")}`;
    }
    case "tm_ticket_signed":
      return `${tm(d)} signed for the GC by ${signer(d)} on ${d.date ?? ""}${d.drawn ? ", signature drawn on the device" : ", on paper"}`;
    case "tm_ticket_unsigned":
      return `${tm(d)}: signature by ${signer(d)} dated ${d.date ?? ""} taken off`;
    case "tm_ticket_billed":
      return `${tm(d)} billed on change order ${d.changeOrderNumber ?? ""}${d.amountCents === undefined ? "" : ` for ${money(d.amountCents)}`}`;
    case "tm_ticket_deleted":
      return `${tm(d)} for work on ${d.reportDate ?? ""} deleted${d.description ? `: ${d.description}` : ""}`;
    case "tm_ticket_file_added":
      return `${tm(d)}: file attached, ${d.fileName ?? ""}`;
    case "tm_ticket_file_deleted":
      return `${tm(d)}: file removed, ${d.fileName ?? ""}`;
  }
}

/** A T&M ticket as the history compares it: what was written up and who signed it. */
export interface TmTicketHistoryFacts extends TmLines, TmMarkups {
  number: number;
  workDate: string;
  description: string;
  location: string | null;
  directedBy: string | null;
  reference: string | null;
  notes: string | null;
  signedName: string | null;
  signedTitle: string | null;
  signedOn: string | null;
  hasSignatureImage: boolean;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const laborQty = (t: TmLines) => t.labor.map((l) => [l.trade, l.workers, l.hoursEach]);
const materialQty = (t: TmLines) => t.material.map((l) => [l.description, l.quantity, l.unit]);
const equipmentQty = (t: TmLines) => t.equipment.map((l) => [l.description, l.hours]);
const rates = (lines: readonly { rateCents?: number | null; unitCostCents?: number | null }[]) =>
  lines.map((l) => l.rateCents ?? l.unitCostCents ?? null);

/** The fields a ticket edit touched, with quantities and rates apart (rates change after signing). */
function tmTicketFields(b: TmTicketHistoryFacts, a: TmTicketHistoryFacts): string[] {
  const out: string[] = [];
  for (const f of ["description", "location", "directedBy", "reference"] as const) {
    if ((b[f] ?? null) !== (a[f] ?? null)) out.push(f);
  }
  if (!sameJson(laborQty(b), laborQty(a))) out.push("laborQuantities");
  if (!sameJson(rates(b.labor), rates(a.labor))) out.push("laborRates");
  if (!sameJson(materialQty(b), materialQty(a))) out.push("materialQuantities");
  if (!sameJson(rates(b.material), rates(a.material))) out.push("materialRates");
  if (!sameJson(equipmentQty(b), equipmentQty(a))) out.push("equipmentQuantities");
  if (!sameJson(rates(b.equipment), rates(a.equipment))) out.push("equipmentRates");
  if (
    b.laborMarkupBps !== a.laborMarkupBps ||
    b.materialMarkupBps !== a.materialMarkupBps ||
    b.equipmentMarkupBps !== a.equipmentMarkupBps
  ) {
    out.push("markups");
  }
  if ((b.notes ?? null) !== (a.notes ?? null)) out.push("notes");
  return out;
}

/**
 * The job history rows for one change to a T&M ticket: `before` null is a new ticket, `after` null
 * a deleted one. A ticket is the evidence behind a change order, so a signature and its removal get
 * rows of their own with the name and date as entered, and an edit names what it touched (rates
 * apart from quantities, since rates may change after the GC signs and quantities may not). Billing
 * on a change order is written by the change-order route (`tm_ticket_billed`). Pure, so the route
 * only records what this returns.
 */
export function tmTicketEvents(
  before: TmTicketHistoryFacts | null,
  after: TmTicketHistoryFacts | null,
): { action: JobEventAction; data: JobEventData }[] {
  if (!before && !after) return [];
  if (!after) {
    const b = before as TmTicketHistoryFacts;
    return [
      {
        action: "tm_ticket_deleted",
        data: { ticketNumber: b.number, reportDate: b.workDate, description: b.description },
      },
    ];
  }
  if (!before) {
    return [
      {
        action: "tm_ticket_created",
        data: {
          ticketNumber: after.number,
          reportDate: after.workDate,
          description: after.description,
        },
      },
    ];
  }
  const events: { action: JobEventAction; data: JobEventData }[] = [];
  const fields = tmTicketFields(before, after);
  const renumbered = before.number !== after.number;
  const moved = before.workDate !== after.workDate;
  if (renumbered || moved || fields.length > 0) {
    events.push({
      action: "tm_ticket_changed",
      data: {
        ticketNumber: after.number,
        reportDate: after.workDate,
        ...(renumbered ? { beforeTicketNumber: before.number } : {}),
        ...(moved ? { beforeDate: before.workDate } : {}),
        fields,
      },
    });
  }
  const wasSigned = !!before.signedName && !!before.signedOn;
  const isSigned = !!after.signedName && !!after.signedOn;
  if (
    wasSigned &&
    (!isSigned || before.signedOn !== after.signedOn || before.signedName !== after.signedName)
  ) {
    events.push({
      action: "tm_ticket_unsigned",
      data: {
        ticketNumber: after.number,
        signedBy: before.signedName ?? "",
        signedTitle: before.signedTitle,
        date: before.signedOn,
      },
    });
  }
  if (
    isSigned &&
    (!wasSigned || before.signedOn !== after.signedOn || before.signedName !== after.signedName)
  ) {
    events.push({
      action: "tm_ticket_signed",
      data: {
        ticketNumber: after.number,
        signedBy: after.signedName ?? "",
        signedTitle: after.signedTitle,
        date: after.signedOn,
        drawn: after.hasSignatureImage,
      },
    });
  }
  return events;
}

/** A daily report as the history compares it: what the field crew entered. */
export interface DailyReportHistoryFacts {
  reportDate: string;
  weather: string | null;
  tempHighF: number | null;
  tempLowF: number | null;
  delayHours: number | null;
  crew: readonly unknown[];
  workPerformed: string | null;
  delays: string | null;
  /** The schedule activity the delay held up (optional: older facts carry none). */
  delayActivityId?: string | null;
  equipment: string | null;
  deliveries: string | null;
  visitors: string | null;
  safety: string | null;
  notes: string | null;
  workers: number;
  manHours: number;
}

const DAILY_REPORT_FIELDS = [
  "weather",
  "tempHighF",
  "tempLowF",
  "delayHours",
  "crew",
  "workPerformed",
  "delays",
  "delayActivityId",
  "equipment",
  "deliveries",
  "visitors",
  "safety",
  "notes",
] as const;

const crewSummary = (r: DailyReportHistoryFacts) =>
  r.workers > 0
    ? `${r.workers} worker${r.workers === 1 ? "" : "s"}, ${Number(r.manHours.toFixed(2))} man-hours`
    : "";

/**
 * The job history rows for one change to a daily report: `before` null is a new report, `after`
 * null a deleted one. A field log is evidence in a delay or change-order claim, so an edit made
 * after the day names the fields it touched (and a moved date both dates); the text itself stays in
 * the report. Pure, so the route only records what this returns.
 */
export function dailyReportEvents(
  before: DailyReportHistoryFacts | null,
  after: DailyReportHistoryFacts | null,
): { action: JobEventAction; data: JobEventData }[] {
  if (!before && !after) return [];
  if (!after) {
    return [
      {
        action: "daily_report_deleted",
        data: { reportDate: (before as DailyReportHistoryFacts).reportDate },
      },
    ];
  }
  if (!before) {
    const summary = crewSummary(after);
    return [
      {
        action: "daily_report_created",
        data: { reportDate: after.reportDate, ...(summary ? { description: summary } : {}) },
      },
    ];
  }
  const fields = DAILY_REPORT_FIELDS.filter((f) =>
    f === "crew"
      ? JSON.stringify(before.crew) !== JSON.stringify(after.crew)
      : (before[f] ?? null) !== (after[f] ?? null),
  );
  const moved = before.reportDate !== after.reportDate;
  if (!moved && fields.length === 0) return [];
  return [
    {
      action: "daily_report_changed",
      data: {
        reportDate: after.reportDate,
        ...(moved ? { beforeDate: before.reportDate } : {}),
        fields: [...fields],
      },
    },
  ];
}

/** An RFI as the history compares it: the entered facts plus the linked change order's number. */
export type RfiHistoryFacts = RfiFacts & { changeOrderNumber: string | null };

export interface RfiEvent {
  action: JobEventAction;
  data: JobEventData;
}

const RFI_OTHER_FIELDS = [
  "subject",
  "question",
  "suggestion",
  "reference",
  "responseDueOn",
  "answer",
  "answeredBy",
  "costImpact",
  "timeImpact",
] as const;

/**
 * The job history rows for one change to an RFI: `before` null is a new RFI, `after` null a
 * deleted one. The events that matter in a dispute (sent, answered, linked to a change order) get
 * their own rows with the dates as entered; anything else is one "changed" row naming the fields.
 * Pure, so the route only records what this returns.
 */
export function rfiEvents(
  before: RfiHistoryFacts | null,
  after: RfiHistoryFacts | null,
): RfiEvent[] {
  if (!before && !after) return [];
  if (!after) {
    const b = before as RfiHistoryFacts;
    return [{ action: "rfi_deleted", data: { rfiNumber: b.number, description: b.subject } }];
  }
  const base: JobEventData = { rfiNumber: after.number };
  const events: RfiEvent[] = [];
  if (!before) {
    events.push({
      action: "rfi_created",
      data: { ...base, description: after.subject, date: after.sentOn },
    });
  } else if (before.sentOn !== after.sentOn) {
    events.push({ action: "rfi_sent_changed", data: { ...base, date: after.sentOn } });
  }
  const answeredBefore = before?.answeredOn ?? null;
  if (answeredBefore !== after.answeredOn) {
    events.push(
      after.answeredOn
        ? {
            action: "rfi_answered",
            data: {
              ...base,
              date: after.answeredOn,
              beforeDate: answeredBefore,
              answeredBy: after.answeredBy,
            },
          }
        : { action: "rfi_answer_cleared", data: { ...base, beforeDate: answeredBefore } },
    );
  }
  const coBefore = before?.changeOrderId ?? null;
  if (coBefore !== after.changeOrderId) {
    if (before && coBefore) {
      events.push({
        action: "rfi_change_order_unlinked",
        data: { ...base, changeOrderNumber: before.changeOrderNumber ?? "" },
      });
    }
    if (after.changeOrderId) {
      events.push({
        action: "rfi_change_order_linked",
        data: { ...base, changeOrderNumber: after.changeOrderNumber ?? "" },
      });
    }
  }
  if (before) {
    // "Answered by" is part of the answered row when the date changed in the same edit.
    const answerRow = events.some((e) => e.action === "rfi_answered");
    const fields = RFI_OTHER_FIELDS.filter(
      (f) => (before[f] ?? null) !== (after[f] ?? null) && !(f === "answeredBy" && answerRow),
    );
    if (fields.length) {
      events.push({
        action: "rfi_changed",
        data: {
          ...base,
          fields: [...fields],
          ...(fields.includes("responseDueOn") ? { date: after.responseDueOn } : {}),
        },
      });
    }
  }
  return events;
}

/** The keys a PATCH actually changed (unchanged values sent back are not a change). */
export function changedKeys(before: object, patch: object, ignore: string[] = []): string[] {
  const b = before as Record<string, unknown>;
  return Object.entries(patch)
    .filter(([k, v]) => v !== undefined && !ignore.includes(k) && (b[k] ?? null) !== (v ?? null))
    .map(([k]) => k)
    .sort();
}
