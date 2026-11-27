// The history of a pay application: who did what to it, and when. Each change to an application
// (created, entries saved, submitted, certified, paid, a payment recorded or deleted, a balance
// closed short, a waiver or file added, a QuickBooks send) is one append-only row in
// `pay_app_events`, written by the route after the change succeeds. Nothing here is computed from
// the event rows: the pay-app math still reads the application itself, so the history is a record
// for the people involved (a dispute with the GC, a second person in the office), never an input.
import type { PayAppStatus, ShortCloseReason, WaiverKind, WaiverStatus } from "./enums";
import { formatCents } from "./money";
import { SHORT_REASON_LABELS } from "./payments";

export const PAY_APP_EVENT_ACTIONS = [
  "created",
  "details_changed",
  "entries_saved",
  "retainage_released",
  "submitted",
  "certified",
  "marked_paid",
  "payment_recorded",
  "payment_deleted",
  "closed_short",
  "reopened_short",
  "owner_payment_recorded",
  "owner_payment_cleared",
  "deleted",
  "quickbooks_invoice_sent",
  "quickbooks_payment_sent",
  "quickbooks_payment_marked",
  "quickbooks_credit_sent",
  "quickbooks_credit_marked",
  "waiver_created",
  "waiver_status_changed",
  "waiver_deleted",
  "ga_affidavit_filed",
  "ga_affidavit_copy_sent",
  "ga_affidavit_cleared",
  "ga_affidavit_contractor_copy",
  "ga_paid_affidavit_signed",
  "ga_paid_affidavit_recorded",
  "ga_paid_affidavit_cleared",
  "attachment_added",
  "attachment_deleted",
] as const;
export type PayAppEventAction = (typeof PAY_APP_EVENT_ACTIONS)[number];

/** What an event records beyond its action. Every field is optional; each action uses a few. */
export interface PayAppEventData {
  /** Status of the application after the change. */
  status?: PayAppStatus;
  /** The money the action is about: line 8, the certified amount, a payment, a release, a waiver. */
  amountCents?: number;
  /** A date the action names: the payment's date received, the date a balance was closed. */
  date?: string;
  /** Check number or other payment reference. */
  reference?: string | null;
  reason?: ShortCloseReason;
  note?: string | null;
  /** Header fields changed on a draft (period, application date, retainage rates, notes). */
  fields?: string[];
  waiverKind?: WaiverKind;
  waiverStatus?: WaiverStatus;
  fileName?: string;
  /** Affidavit of nonpayment: the county it was filed in. */
  county?: string;
  /** Affidavit of nonpayment: the waiver's state (GA or MS; unset on Georgia entries logged before 2026-11-26). */
  state?: string;
  /** Owner's payment recorded on several applications at once: the other applications' numbers. */
  together?: number[];
}

const FIELD_LABELS: Record<string, string> = {
  periodFrom: "period start",
  periodTo: "period end",
  applicationDate: "application date",
  retainagePctBps: "retainage on work",
  storedRetainagePctBps: "retainage on stored materials",
  notes: "notes",
};

/** The state named in an affidavit-of-nonpayment entry; Georgia's came first and logged no state. */
const affidavitState = (d: PayAppEventData) => (d.state === "MS" ? "Mississippi" : "Georgia");

const WAIVER_LABELS: Record<WaiverKind, string> = {
  "conditional-progress": "conditional progress",
  "unconditional-progress": "unconditional progress",
  "conditional-final": "conditional final",
  "unconditional-final": "unconditional final",
};

const joinAnd = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const money = (cents: number | undefined) => (cents === undefined ? "" : formatCents(cents));
const waiver = (d: PayAppEventData) =>
  d.waiverKind ? `${WAIVER_LABELS[d.waiverKind]} lien waiver` : "lien waiver";

/** One sentence for an event, as the history list and the CSV show it. */
export function describePayAppEvent(
  action: PayAppEventAction,
  number: number,
  d: PayAppEventData = {},
): string {
  const app = `Application #${number}`;
  switch (action) {
    case "created":
      return `${app} created as a draft`;
    case "details_changed": {
      const fields = (d.fields ?? []).map((f) => FIELD_LABELS[f] ?? f);
      return fields.length ? `${app}: changed ${fields.join(", ")}` : `${app}: details changed`;
    }
    case "entries_saved":
      return d.amountCents === undefined
        ? `${app}: entries saved`
        : `${app}: entries saved, current payment due ${money(d.amountCents)}`;
    case "retainage_released":
      return `${app}: retainage release of ${money(d.amountCents)} applied`;
    case "submitted":
      return `${app} submitted for ${money(d.amountCents)} (line 8)`;
    case "certified":
      return d.status === "paid"
        ? `${app} certified by the GC at ${money(d.amountCents)}; already paid in full`
        : `${app} certified by the GC at ${money(d.amountCents)}`;
    case "marked_paid":
      return `${app} marked paid in full`;
    case "payment_recorded": {
      const ref = d.reference ? ` (${d.reference})` : "";
      const paid = d.status === "paid" ? "; now paid in full" : "";
      return `Payment of ${money(d.amountCents)} received ${d.date ?? ""}${ref} recorded${paid}`;
    }
    case "payment_deleted": {
      const ref = d.reference ? ` (${d.reference})` : "";
      const reopened =
        d.status && d.status !== "paid" ? `; application #${number} reopened as ${d.status}` : "";
      return `Payment of ${money(d.amountCents)} received ${d.date ?? ""}${ref} deleted${reopened}`;
    }
    case "closed_short": {
      const label = d.reason ? SHORT_REASON_LABELS[d.reason].toLowerCase() : "closed";
      const note = d.note ? `: ${d.note}` : "";
      return `Balance of ${money(d.amountCents)} closed as ${label} on ${d.date ?? ""}${note}`;
    }
    case "reopened_short":
      return `Balance closed short reopened; application #${number} is ${d.status ?? "owed again"}`;
    case "owner_payment_recorded": {
      const others = (d.together ?? []).map((n) => `#${n}`);
      const together = others.length
        ? `, together with ${others.length === 1 ? "application" : "applications"} ${joinAnd(others)}`
        : "";
      return `Owner's payment to the GC for ${app.toLowerCase()} recorded as ${d.date ?? ""}${together}`;
    }
    case "owner_payment_cleared":
      return `Owner's payment date${d.date ? ` (${d.date})` : ""} cleared from ${app.toLowerCase()}`;
    case "deleted":
      return `Draft ${app.toLowerCase()} deleted`;
    case "quickbooks_invoice_sent":
      return `${app} sent to QuickBooks as an invoice`;
    case "quickbooks_payment_sent":
      return `Payment of ${money(d.amountCents)} sent to QuickBooks`;
    case "quickbooks_payment_marked":
      return `Payment of ${money(d.amountCents)} marked as already in QuickBooks`;
    case "quickbooks_credit_sent": {
      const label = d.reason ? SHORT_REASON_LABELS[d.reason].toLowerCase() : "closed short";
      return `Balance of ${money(d.amountCents)} (${label}) sent to QuickBooks as a credit memo`;
    }
    case "quickbooks_credit_marked":
      return `Balance of ${money(d.amountCents)} closed short marked as already credited in QuickBooks`;
    case "waiver_created":
      return `${capitalize(waiver(d))} for ${money(d.amountCents)} prepared`;
    case "waiver_status_changed":
      return d.waiverStatus === "sent"
        ? `${capitalize(waiver(d))} for ${money(d.amountCents)} marked sent`
        : `${capitalize(waiver(d))} for ${money(d.amountCents)} marked not sent`;
    case "waiver_deleted":
      return `${capitalize(waiver(d))} for ${money(d.amountCents)} deleted`;
    case "ga_affidavit_filed":
      return `${affidavitState(d)} affidavit of nonpayment on the ${waiver(d)} for ${money(d.amountCents)} recorded as filed${d.county ? ` in ${d.county} County` : ""} on ${d.date ?? ""}`;
    case "ga_affidavit_copy_sent":
      return `Copy of the ${affidavitState(d)} affidavit of nonpayment recorded as sent to the owner on ${d.date ?? ""}`;
    case "ga_affidavit_contractor_copy":
      return d.date
        ? `Copy of the ${affidavitState(d)} affidavit of nonpayment recorded as sent to the contractor on ${d.date}`
        : `${affidavitState(d)} affidavit of nonpayment: no copy recorded as owed to the contractor`;
    case "ga_paid_affidavit_signed":
      return `${affidavitState(d)} affidavit that payment in full was received recorded as signed on ${d.date ?? ""}`;
    case "ga_paid_affidavit_recorded":
      return `${affidavitState(d)} affidavit that payment in full was received recorded in the county on ${d.date ?? ""}; the affidavit of nonpayment is void`;
    case "ga_paid_affidavit_cleared":
      return `${affidavitState(d)} affidavit that payment in full was received: record cleared`;
    case "ga_affidavit_cleared":
      return `${affidavitState(d)} affidavit of nonpayment record cleared from the ${waiver(d)} for ${money(d.amountCents)}`;
    case "attachment_added":
      return `File attached: ${d.fileName ?? ""}`;
    case "attachment_deleted":
      return `File removed: ${d.fileName ?? ""}`;
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The header fields a PATCH actually changed (unchanged values sent back are not a change). */
export function changedFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): string[] {
  return Object.keys(patch)
    .filter((k) => patch[k] !== undefined && (before[k] ?? null) !== (patch[k] ?? null))
    .sort();
}
