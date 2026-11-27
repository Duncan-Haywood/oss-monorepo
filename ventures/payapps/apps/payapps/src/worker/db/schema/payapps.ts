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
import { INSURANCE_KINDS } from "@shared/insurance";
import { COMMITMENT_KINDS, COST_CATEGORIES } from "@shared/job-cost";
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
     * The QuickBooks class and location (department) this job's invoices and credit memos carry,
     * for companies on QuickBooks Plus or Advanced that track them (docs/QUICKBOOKS.md, "Class and
     * location per job"). Like the item, both count only while the connection's realm is
     * qboTrackingRealmId (migration 0052).
     */
    qboClassId: text("qbo_class_id"),
    qboClassName: text("qbo_class_name"),
    qboLocationId: text("qbo_location_id"),
    qboLocationName: text("qbo_location_name"),
    qboTrackingRealmId: text("qbo_tracking_realm_id"),
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
    /**
     * Unit-price lines (migration 0055, src/shared/unit-price.ts): billed by quantity installed at a
     * unit price. `unit` and `unit_price_micros` (millionths of a dollar) are set together; a base
     * line's contract `quantity_milli` (thousandths) times its unit price equals original_cents to the
     * cent. All null on a lump-sum line.
     */
    unit: text("unit"),
    unitPriceMicros: integer("unit_price_micros"),
    quantityMilli: integer("quantity_milli"),
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
    /**
     * Unit-price lines: the quantity installed this period, in thousandths; work_this_period_cents is
     * then exactly that times the line's unit price (the server checks). Null: entered in dollars.
     */
    quantityThisPeriodMilli: integer("quantity_this_period_milli"),
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
    /**
     * The lower-tier waiver row (lower_tier_waivers.id) this file is the signed waiver for; null: an
     * ordinary attachment. No foreign key (the tables' modules import each other the other way);
     * deleting the row clears this in services/payapps/lower-tier-waivers.ts, and deleting the pay
     * application cascades both.
     */
    lowerTierWaiverId: text("lower_tier_waiver_id"),
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

/**
 * The company's own certificates of insurance, as typed from each certificate (src/shared/insurance.ts):
 * which policy, carrier and number, and the dates. Org-wide, not per job: one policy covers every
 * job. Archived once replaced by a renewal or dropped, so it is never warned about again (migration
 * 0044).
 */
export const insuranceCertificates = sqliteTable(
  "insurance_certificates",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    kind: text("kind", { enum: INSURANCE_KINDS }).notNull(),
    label: text("label"),
    carrier: text("carrier"),
    policyNumber: text("policy_number"),
    /** YYYY-MM-DD, or null when not typed. */
    effectiveOn: text("effective_on"),
    /** YYYY-MM-DD. */
    expiresOn: text("expires_on").notNull(),
    notes: text("notes"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    /** The certificate's limits in cents, or null when not typed (src/shared/insurance-requirements.ts). */
    eachOccurrenceCents: integer("each_occurrence_cents"),
    aggregateCents: integer("aggregate_cents"),
    /** The wording the certificate shows (ADDL INSD, SUBR WVD, the description box), migration 0047. */
    additionalInsured: integer("additional_insured", { mode: "boolean" }).notNull().default(false),
    waiverOfSubrogation: integer("waiver_of_subrogation", { mode: "boolean" })
      .notNull()
      .default(false),
    primaryNoncontributory: integer("primary_noncontributory", { mode: "boolean" })
      .notNull()
      .default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("insurance_certificates_org_idx").on(t.orgId, t.expiresOn)],
);

/**
 * Files kept with an insurance certificate (the certificate PDF, its endorsements), keys under
 * orgs/{orgId}/insurance/{certificateId}/. Counted in the company's one storage limit (migration
 * 0045).
 */
export const insuranceCertificateFiles = sqliteTable(
  "insurance_certificate_files",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    certificateId: text("certificate_id")
      .notNull()
      .references(() => insuranceCertificates.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("insurance_certificate_files_cert_idx").on(t.orgId, t.certificateId),
    uniqueIndex("insurance_certificate_files_key_uq").on(t.r2Key),
  ],
);

/**
 * Which jobs' GCs hold an insurance certificate (the GC is the "certificate holder" on an ACORD 25):
 * one row per certificate and job, with the date the certificate was sent when typed. Lets a renewal
 * go to every GC holding the old certificate, and a pay application say whether its GC has the
 * certificate on file (src/shared/insurance.ts). Deleting the certificate or the job deletes the row
 * (migration 0046).
 */
export const insuranceCertificateProjects = sqliteTable(
  "insurance_certificate_projects",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    certificateId: text("certificate_id")
      .notNull()
      .references(() => insuranceCertificates.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD the certificate was sent to the job's GC, or null when not typed. */
    sentOn: text("sent_on"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("insurance_certificate_projects_uq").on(t.certificateId, t.projectId),
    index("insurance_certificate_projects_org_idx").on(t.orgId, t.projectId),
  ],
);

/**
 * What a job's subcontract asks the company to carry: one row per coverage, with its minimum limits
 * and the endorsements asked for, checked against the certificates on file
 * (src/shared/insurance-requirements.ts). Deleting the job deletes them (migration 0047).
 */
export const projectInsuranceRequirements = sqliteTable(
  "project_insurance_requirements",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: INSURANCE_KINDS }).notNull(),
    eachOccurrenceCents: integer("each_occurrence_cents"),
    aggregateCents: integer("aggregate_cents"),
    additionalInsured: integer("additional_insured", { mode: "boolean" }).notNull().default(false),
    waiverOfSubrogation: integer("waiver_of_subrogation", { mode: "boolean" })
      .notNull()
      .default(false),
    primaryNoncontributory: integer("primary_noncontributory", { mode: "boolean" })
      .notNull()
      .default(false),
    umbrellaCounts: integer("umbrella_counts", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("project_insurance_requirements_uq").on(t.projectId, t.kind),
    index("project_insurance_requirements_org_idx").on(t.orgId, t.projectId),
  ],
);

/**
 * Job costing (src/shared/job-cost.ts): the contractor's cost budget per schedule-of-values line. Kept
 * apart from sov_lines so a budget can be revised after the SOV is locked by billing; one row per
 * line, deleted with the line (migration 0048). The optional cost to complete is the revised
 * estimate (0049).
 */
export const jobCostBudgets = sqliteTable(
  "job_cost_budgets",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id")
      .notNull()
      .references(() => sovLines.id, { onDelete: "cascade" }),
    budgetCents: cents("budget_cents").notNull(),
    /** The PM's revised cost still to come on the line, typed on costToCompleteOn (migration 0049). */
    costToCompleteCents: cents("cost_to_complete_cents"),
    /** YYYY-MM-DD the cost to complete was last changed; costs dated after it use it up. */
    costToCompleteOn: text("cost_to_complete_on"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("job_cost_budgets_line_uq").on(t.sovLineId),
    index("job_cost_budgets_org_idx").on(t.orgId, t.projectId),
  ],
);

/**
 * Job costing: a line's budget split by cost type (src/shared/cost-type-budget.ts), one row per line
 * and type. A won estimate writes the bid item's cost by category; a person can change it. Saving a
 * split sets the line's budget to its sum; deleted with the line, or when the line's budget is
 * cleared (migration 0071).
 */
export const jobCostTypeBudgets = sqliteTable(
  "job_cost_type_budgets",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id")
      .notNull()
      .references(() => sovLines.id, { onDelete: "cascade" }),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    budgetCents: cents("budget_cents").notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("job_cost_type_budgets_line_uq").on(t.sovLineId, t.category),
    index("job_cost_type_budgets_org_idx").on(t.orgId, t.projectId),
  ],
);

/**
 * Job costing: a cost incurred on a job (a week's payroll, a supplier invoice, a rental), on one
 * schedule-of-values line or on none. A credit is negative. Deleting the line keeps the cost, as a
 * cost on no line (migration 0048).
 */
export const jobCostEntries = sqliteTable(
  "job_cost_entries",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id").references(() => sovLines.id, { onDelete: "set null" }),
    /** YYYY-MM-DD. */
    incurredOn: text("incurred_on").notNull(),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    amountCents: cents("amount_cents").notNull(),
    vendor: text("vendor"),
    description: text("description"),
    reference: text("reference"),
    /** The purchase order or subcontract it is billed against (migration 0050). */
    commitmentId: text("commitment_id").references(() => jobCostCommitments.id, {
      onDelete: "set null",
    }),
    /**
     * Imported from QuickBooks: "<realm>:<Bill|Purchase|VendorCredit|JournalEntry>:<txn id>:<line id>", unique
     * per org so a line is never imported twice (migration 0051). Null for typed or pasted costs.
     */
    qboSource: text("qbo_source"),
    /**
     * The QuickBooks purchase order the imported line was made from ("<realm>:PurchaseOrder:<txn
     * id>:<line id>", or without ":<line id>" when QuickBooks names only the order), so it is
     * counted against that order once the order is a commitment here (migration 0053).
     */
    qboPoSource: text("qbo_po_source"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("job_cost_entries_project_idx").on(t.orgId, t.projectId, t.incurredOn),
    uniqueIndex("job_cost_entries_qbo_source_idx").on(t.orgId, t.qboSource),
  ],
);

/**
 * Job costing: a purchase order or lower-tier subcontract on a job, on one schedule-of-values line
 * or on none. Its amount not yet invoiced (costs entered against it) is cost still to come, so it
 * floors the line's estimate at completion (src/shared/job-cost.ts). Deleting the line keeps it, on
 * no line (migration 0050).
 */
export const jobCostCommitments = sqliteTable(
  "job_cost_commitments",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id").references(() => sovLines.id, { onDelete: "set null" }),
    kind: text("kind", { enum: COMMITMENT_KINDS }).notNull(),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    vendor: text("vendor").notNull(),
    /** The PO or subcontract number. */
    reference: text("reference"),
    description: text("description"),
    /** YYYY-MM-DD issued or signed. */
    committedOn: text("committed_on").notNull(),
    /** Committed amount, change orders to it included. */
    amountCents: cents("amount_cents").notNull(),
    /**
     * Imported from a QuickBooks purchase order: "<realm>:PurchaseOrder:<txn id>:<line id>",
     * unique per org so an order line is never imported twice (migration 0053). Null when typed.
     */
    qboSource: text("qbo_source"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("job_cost_commitments_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("job_cost_commitments_qbo_source_idx").on(t.orgId, t.qboSource),
  ],
);
