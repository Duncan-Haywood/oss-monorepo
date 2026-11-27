// Pay-application domain. Every table carries org_id (tenant) with ON DELETE CASCADE from organization;
// every query filters by it (see docs/ARCHITECTURE.md). Money: integer cents. Percent: basis points.

import { CA_NOTICE_METHODS, CA_NOTICE_RECIPIENTS } from "@lien-waivers";
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import {
  GA_CONTRACTOR_COPY,
  GA_CONTRACTOR_COPY_METHODS,
  GA_COPY_METHODS,
  PAY_APP_STATUSES,
  PAY_TERMS_BASES,
  SHORT_CLOSE_REASONS,
  WAIVER_KINDS,
  WAIVER_STATUSES,
} from "@shared/enums";
import { JOB_EVENT_ACTIONS, type JobEventData } from "@shared/job-history";
import { PAY_APP_EVENT_ACTIONS, type PayAppEventData } from "@shared/pay-app-history";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

const orgId = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    number: text("number"),
    location: text("location"),
    gcName: text("gc_name").notNull(),
    gcAddress: text("gc_address"),
    /**
     * Who at the GC handles pay applications (accounts payable or the project accountant). The
     * follow-up drafts are addressed to them; null when not set (migration 0020).
     */
    gcBillingName: text("gc_billing_name"),
    gcBillingEmail: text("gc_billing_email"),
    /**
     * The GC's project manager on this job: who change order requests go to (the billing contact
     * handles pay applications). Null when not set (migration 0027).
     */
    gcPmName: text("gc_pm_name"),
    gcPmEmail: text("gc_pm_email"),
    ownerName: text("owner_name"),
    architectName: text("architect_name"),
    /** ISO date (YYYY-MM-DD). */
    contractDate: text("contract_date"),
    originalContractSumCents: cents("original_contract_sum_cents").notNull(),
    retainagePctBps: integer("retainage_pct_bps").notNull().default(1000),
    storedRetainagePctBps: integer("stored_retainage_pct_bps").notNull().default(1000),
    /** Days after the application date the GC has to pay under the subcontract (null: not set). */
    payTermsDays: integer("pay_terms_days"),
    /** What the pay terms count from: the application date (default), the period end or the owner's payment. */
    payTermsBasis: text("pay_terms_basis", { enum: PAY_TERMS_BASES })
      .notNull()
      .default("application_date"),
    /**
     * Pay-when-paid outer limit: "and in any event within 90 days" of the application date. Only read
     * when payTermsBasis is "owner_paid"; null when the subcontract states none.
     */
    payTermsOuterDays: integer("pay_terms_outer_days"),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    /**
     * Mid-job start: the last pay application made before the job moved here (null when billed
     * here from #1). Its number, period end, line 6 and line 5a; per-line work to date is on
     * sov_lines.opening_completed_cents. Locked once a pay application here is submitted.
     */
    openingAppNumber: integer("opening_app_number"),
    openingPeriodTo: text("opening_period_to"),
    openingPreviousCertificatesCents: cents("opening_previous_certificates_cents"),
    openingRetainageHeldCents: cents("opening_retainage_held_cents"),
    /**
     * The QuickBooks item this job's work lines are billed with, when it differs from the company's
     * (docs/QUICKBOOKS.md, "An item per job"). Item ids belong to one QuickBooks company, so the
     * choice counts only while the connection's realm is qboItemRealmId (migration 0031).
     */
    qboItemId: text("qbo_item_id"),
    qboItemName: text("qbo_item_name"),
    qboItemRealmId: text("qbo_item_realm_id"),
    /**
     * Print a notary's jurat and seal box on the application summary, for GCs and owners that require
     * notarized pay applications (migration 0035).
     */
    notaryBlock: integer("notary_block", { mode: "boolean" }).notNull().default(false),
    /**
     * The GC's monthly billing cutoff: the day of the month (1-31, the month's last day when it is
     * shorter) the pay application must reach the GC; null when not set (migration 0037,
     * src/shared/billing-cutoff.ts).
     */
    billingDay: integer("billing_day"),
    /**
     * Where this job's base-contract lines sit under the GC's Procore SOV positions, saved from the
     * Procore subcontractor SOV filler: JSON `ProcoreSsovPlacement` (src/shared/gc-export/
     * procore-placement.ts), read back by the Procore invoice sheet to total each position. null
     * when never saved (migration 0039).
     */
    procoreSsov: text("procore_ssov"),
    /**
     * California preliminary notice: the day this company first furnished work on the job (ISO
     * date). Sets the § 8204(a) 20-day reminder; null when not entered (migration 0036).
     */
    caFirstFurnishedOn: text("ca_first_furnished_on"),
    /**
     * Georgia: whether a notice of commencement (O.C.G.A. § 44-14-361.5) was filed for the job (true
     * filed, false not filed, null not known), and the contractor's name and address as that notice
     * shows them. They preselect the answer on an affidavit of nonpayment's copy to the contractor
     * (§ 44-14-366(g)(2)) and say where it goes (migration 0041).
     */
    gaNocFiled: integer("ga_noc_filed", { mode: "boolean" }),
    gaNocContractor: text("ga_noc_contractor"),
    /** The one-click sample job (services/payapps/sample.ts): not counted toward the plan. */
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

export const sovLines = sqliteTable(
  "sov_lines",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemNumber: text("item_number").notNull(),
    description: text("description").notNull(),
    /** Scheduled value in the original contract; lines added by a change order start at 0. */
    originalCents: cents("original_cents").notNull(),
    sortOrder: integer("sort_order").notNull(),
    /** Set when the line was created by a change order. */
    changeOrderId: text("change_order_id"),
    /** Mid-job start: work completed to date on this line on the opening application. */
    openingCompletedCents: cents("opening_completed_cents").notNull().default(0),
    /** Mid-job start: retainage on this line released on or before the opening application. */
    openingReleasedCents: cents("opening_released_cents").notNull().default(0),
    /**
     * The line's own retainage rate in basis points, held on its work and stored materials in every
     * application (a bond line at 0%, say); null follows each application's rates. Locked once a
     * submitted application has computed retainage on the line.
     */
    retainagePctBps: integer("retainage_pct_bps"),
    /**
     * QuickBooks, an item per line: the item this line's work is billed with when it differs from
     * the job's and the company's (null: theirs). Counts only while the connection's realm is
     * qboItemRealmId (migration 0033).
     */
    qboItemId: text("qbo_item_id"),
    qboItemName: text("qbo_item_name"),
    qboItemRealmId: text("qbo_item_realm_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sov_lines_project_idx").on(t.orgId, t.projectId)],
);

export const changeOrders = sqliteTable(
  "change_orders",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    /** ISO date the GC approved it; it counts in pay apps whose period ends on/after this date. */
    approvedOn: text("approved_on"),
    /** ISO date the change order (request) went to the GC; null when not recorded. */
    submittedOn: text("submitted_on"),
    /** Calendar days of contract time requested; 0 = no change; null = not stated. */
    scheduleDays: integer("schedule_days"),
    /**
     * ISO date (UTC) someone last copied or opened an email draft about it from PayApps ("last
     * chased"); null: never. Opening a draft is not proof it was sent, so nothing else reads it as such.
     */
    lastEmailedOn: text("last_emailed_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("change_orders_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("change_orders_number_uq").on(t.projectId, t.number),
  ],
);

export const changeOrderItems = sqliteTable(
  "change_order_items",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    changeOrderId: text("change_order_id")
      .notNull()
      .references(() => changeOrders.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id")
      .notNull()
      .references(() => sovLines.id, { onDelete: "cascade" }),
    amountCents: cents("amount_cents").notNull(),
  },
  (t) => [index("change_order_items_co_idx").on(t.orgId, t.changeOrderId)],
);

export const payApps = sqliteTable(
  "pay_apps",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    periodFrom: text("period_from").notNull(),
    periodTo: text("period_to").notNull(),
    applicationDate: text("application_date").notNull(),
    retainagePctBps: integer("retainage_pct_bps").notNull(),
    storedRetainagePctBps: integer("stored_retainage_pct_bps").notNull(),
    status: text("status", { enum: PAY_APP_STATUSES }).notNull().default("draft"),
    submittedAt: ts("submitted_at"),
    /** Amount the GC certified (may differ from the amount applied for). */
    certifiedAmountCents: cents("certified_amount_cents"),
    certifiedAt: ts("certified_at"),
    paidAt: ts("paid_at"),
    /**
     * Set when an application paid short was closed with a balance left: the cents not collected
     * (the balance at closing), why, an optional note and the date (src/shared/payments.ts). The
     * status is then paid; reopening clears all four.
     */
    shortClosedCents: cents("short_closed_cents"),
    shortReason: text("short_reason", { enum: SHORT_CLOSE_REASONS }),
    shortNote: text("short_note"),
    shortClosedOn: text("short_closed_on"),
    /**
     * Pay-when-paid jobs (projects.pay_terms_basis "owner_paid"): the day the GC was paid by the
     * owner for this application's work, as the GC or the owner reported it (YYYY-MM-DD; null: not
     * known yet). The due date counts from it (src/shared/cash-report.ts, payDueOn).
     */
    ownerPaidOn: text("owner_paid_on"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("pay_apps_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("pay_apps_number_uq").on(t.projectId, t.number),
  ],
);

export const payAppLines = sqliteTable(
  "pay_app_lines",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    payAppId: text("pay_app_id")
      .notNull()
      .references(() => payApps.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id")
      .notNull()
      .references(() => sovLines.id, { onDelete: "cascade" }),
    workThisPeriodCents: cents("work_this_period_cents").notNull().default(0),
    storedMaterialsCents: cents("stored_materials_cents").notNull().default(0),
    retainageReleasedCents: cents("retainage_released_cents").notNull().default(0),
  },
  (t) => [
    index("pay_app_lines_app_idx").on(t.orgId, t.payAppId),
    uniqueIndex("pay_app_lines_uq").on(t.payAppId, t.sovLineId),
  ],
);

/**
 * Lien waivers issued by the org (the claimant) against one pay application: conditional when it
 * goes out with the application, unconditional once the payment has cleared. A row is a tracking
 * record; `form_data` holds the values used to print the state's form when one is encoded
 * (packages/lien-waivers). Crew plan and up (services/payapps/waivers.ts).
 */
export const lienWaivers = sqliteTable(
  "lien_waivers",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    payAppId: text("pay_app_id")
      .notNull()
      .references(() => payApps.id, { onDelete: "cascade" }),
    /** Two-letter state whose waiver law governs the job. */
    state: text("state").notNull(),
    kind: text("kind", { enum: WAIVER_KINDS }).notNull(),
    /** packages/lien-waivers form id, e.g. "AZ/conditional-progress/statutory"; null = tracked only. */
    formId: text("form_id"),
    amountCents: cents("amount_cents").notNull(),
    /** ISO date the waiver covers work through (progress waivers). */
    throughDate: text("through_date"),
    status: text("status", { enum: WAIVER_STATUSES }).notNull().default("draft"),
    sentAt: ts("sent_at"),
    /** Form field values (packages/lien-waivers WaiverData). */
    formData: json<Record<string, string | number>>("form_data"),
    /**
     * Georgia: the affidavit of nonpayment (O.C.G.A. § 44-14-366(g)(2)) as the user recorded it
     * filed: the day, the county, the clerk's book/page or instrument number, and the copy to the
     * owner (day, how, tracking). All null until filed; services/payapps/ga-affidavit.ts.
     */
    gaAffidavitFiledOn: text("ga_affidavit_filed_on"),
    gaAffidavitCounty: text("ga_affidavit_county"),
    gaAffidavitRecording: text("ga_affidavit_recording"),
    gaAffidavitCopySentOn: text("ga_affidavit_copy_sent_on"),
    gaAffidavitCopyMethod: text("ga_affidavit_copy_method", { enum: GA_COPY_METHODS }),
    gaAffidavitCopyTracking: text("ga_affidavit_copy_tracking"),
    /**
     * Georgia, part 4: the affidavit's copy to the contractor at the address on the notice of
     * commencement (owed or not, then day, how, tracking), and the (g)(3) affidavit that payment in
     * full was received (signed, then recorded in the same county, which voids the affidavit of
     * nonpayment). All null until recorded; services/payapps/ga-affidavit.ts.
     */
    gaAffidavitContractorCopy: text("ga_affidavit_contractor_copy", { enum: GA_CONTRACTOR_COPY }),
    gaAffidavitContractorCopySentOn: text("ga_affidavit_contractor_copy_sent_on"),
    gaAffidavitContractorCopyMethod: text("ga_affidavit_contractor_copy_method", {
      enum: GA_CONTRACTOR_COPY_METHODS,
    }),
    gaAffidavitContractorCopyTracking: text("ga_affidavit_contractor_copy_tracking"),
    gaPaidAffidavitSignedOn: text("ga_paid_affidavit_signed_on"),
    gaPaidAffidavitRecordedOn: text("ga_paid_affidavit_recorded_on"),
    gaPaidAffidavitRecording: text("ga_paid_affidavit_recording"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lien_waivers_pay_app_idx").on(t.orgId, t.payAppId)],
);

/**
 * Money received against one pay application (a GC check, an ACH, a joint check). GCs often pay an
 * application in more than one payment or short; each payment is one row. When the payments reach
 * the amount expected (the GC-certified amount, else line 8) the application is marked paid
 * (services/payapps/payments.ts). "Mark paid" without payments still means paid in full.
 */
export const payAppPayments = sqliteTable(
  "pay_app_payments",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    payAppId: text("pay_app_id")
      .notNull()
      .references(() => payApps.id, { onDelete: "cascade" }),
    amountCents: cents("amount_cents").notNull(),
    /** ISO date the money was received. */
    receivedOn: text("received_on").notNull(),
    /** Check number, ACH trace or other reference the bookkeeper matches against. */
    reference: text("reference"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("pay_app_payments_app_idx").on(t.orgId, t.payAppId)],
);

/**
 * Files attached to one pay application (backup, photos, the signed certificate). The bytes live
 * in R2 under `r2_key`, which always starts `orgs/{orgId}/projects/{projectId}/pay-apps/{payAppId}/`
 * so deleting a pay application or a job can clear its files by prefix
 * (services/payapps/attachments.ts).
 */
export const payAppAttachments = sqliteTable(
  "pay_app_attachments",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    payAppId: text("pay_app_id")
      .notNull()
      .references(() => payApps.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    /** Cleaned display and download name (src/shared/attachments.ts cleanFileName). */
    fileName: text("file_name").notNull(),
    /** From the extension table in src/shared/attachments.ts, never from the browser. */
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pay_app_attachments_app_idx").on(t.orgId, t.payAppId),
    uniqueIndex("pay_app_attachments_key_uq").on(t.r2Key),
  ],
);

/**
 * Files attached to a change order: the backup the GC asks for before signing (supplier quotes,
 * time-and-material tickets, photos of the condition) and the signed change order that comes back.
 * Same rules as pay_app_attachments (src/shared/attachments.ts); keys under the job's prefix, so
 * deleting the job clears them too.
 */
export const changeOrderAttachments = sqliteTable(
  "change_order_attachments",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    changeOrderId: text("change_order_id")
      .notNull()
      .references(() => changeOrders.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("change_order_attachments_co_idx").on(t.orgId, t.changeOrderId),
    uniqueIndex("change_order_attachments_key_uq").on(t.r2Key),
  ],
);

/**
 * The history of each pay application: one append-only row per change (src/shared/pay-app-history.ts).
 * Keyed to the project, not the pay application, so a deleted draft keeps its history (the number
 * is copied in for that reason). Never updated or read by the pay-app math.
 */
export const payAppEvents = sqliteTable(
  "pay_app_events",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** No foreign key: the row outlives a deleted draft. */
    payAppId: text("pay_app_id").notNull(),
    payAppNumber: integer("pay_app_number").notNull(),
    action: text("action", { enum: PAY_APP_EVENT_ACTIONS }).notNull(),
    data: json<PayAppEventData>("data"),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pay_app_events_app_idx").on(t.orgId, t.payAppId, t.createdAt),
    index("pay_app_events_project_idx").on(t.orgId, t.projectId, t.createdAt),
  ],
);

/**
 * The history of a job outside its pay applications (job terms, schedule of values, opening
 * balance, change orders): one append-only row per change (src/shared/job-history.ts). No foreign
 * key to the change order or line, so a deleted one keeps its history (number and description are
 * copied into `data`). Never updated or read by the pay-app math.
 */
export const jobEvents = sqliteTable(
  "job_events",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    action: text("action", { enum: JOB_EVENT_ACTIONS }).notNull(),
    /** The change order or schedule-of-values line the event is about, when there is one. */
    subjectId: text("subject_id"),
    data: json<JobEventData>("data"),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("job_events_project_idx").on(t.orgId, t.projectId, t.createdAt)],
);

/**
 * A California preliminary notice the company recorded as given, one row per person (§ 8200(a)),
 * for the § 8118 proof of notice declaration and the § 8204(a) reminder (migration 0036).
 */
export const lienNoticeSends = sqliteTable(
  "lien_notice_sends",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    recipient: text("recipient", { enum: CA_NOTICE_RECIPIENTS }).notNull(),
    recipientNameAddress: text("recipient_name_address").notNull(),
    method: text("method", { enum: CA_NOTICE_METHODS }).notNull(),
    /** ISO date delivered, deposited or mailed. */
    givenOn: text("given_on").notNull(),
    place: text("place").notNull(),
    tracking: text("tracking"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("lien_notice_sends_project_idx").on(t.orgId, t.projectId)],
);

/**
 * Files kept with a California notice recorded as given (§ 8118(b)'s mailing receipt or proof of
 * delivery, the signed declaration). Same bucket, limits and rules as change-order files; keys under
 * orgs/{orgId}/projects/{projectId}/notices/{sendId}/, so deleting the job clears them, and deleting
 * the record deletes its objects first (services/payapps/notice-files.ts).
 */
export const lienNoticeFiles = sqliteTable(
  "lien_notice_files",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sendId: text("send_id")
      .notNull()
      .references(() => lienNoticeSends.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("lien_notice_files_send_idx").on(t.orgId, t.sendId),
    uniqueIndex("lien_notice_files_key_uq").on(t.r2Key),
  ],
);
