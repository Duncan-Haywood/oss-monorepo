// The history of a job outside its pay applications: the job's own terms, the schedule of values,
// the opening balance of a mid-job start and every change order, each change one append-only row in
// `job_events`, written by the route after the change succeeds (the same rules as the pay
// application history in ./pay-app-history.ts). A record for the people involved (a dispute over
// when a change order went to the GC, who changed the contract sum, when a California preliminary
// notice was given and what proof of it was kept), never an input to the math.
import {
  CA_NOTICE_METHOD_LABELS,
  type CaNoticeMethod,
  type CaNoticeRecipient,
} from "@lien-waivers";
import { formatCents } from "./money";

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
  /** Tracking or receipt number of a mailed notice. */
  tracking?: string | null;
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
  }
}

/** The keys a PATCH actually changed (unchanged values sent back are not a change). */
export function changedKeys(before: object, patch: object, ignore: string[] = []): string[] {
  const b = before as Record<string, unknown>;
  return Object.entries(patch)
    .filter(([k, v]) => v !== undefined && !ignore.includes(k) && (b[k] ?? null) !== (v ?? null))
    .map(([k]) => k)
    .sort();
}
