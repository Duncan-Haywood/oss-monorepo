// Post-award grant management: the award itself (terms, grant period) and the reports the funder
// requires (interim / final / financial), each drafted from facts dated within its period.
// Dates of the grant period and report periods are calendar dates ("yyyy-mm-dd"); due dates are
// timestamps (they drive report_due follow-ups).
import type {
  AwardReportKind,
  AwardReportStatus,
  ReportContent,
  ReportFlag,
} from "@shared/api/awards";
import type { GroundingReport } from "@shared/content";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { applications } from "./applications";
import { organization, user } from "./auth";
import { projects } from "./knowledge";

export const awards = sqliteTable(
  "awards",
  {
    id: text("id").primaryKey(), // awd_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The application that won it; null for awards entered by hand (won outside the app). */
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** What the grant funds (project or application title). */
    title: text("title").notNull(),
    funderName: text("funder_name").notNull(),
    amountCents: cents("amount_cents"),
    startDate: text("start_date"), // yyyy-mm-dd
    endDate: text("end_date"), // yyyy-mm-dd
    grantNumber: text("grant_number"),
    termsNotes: text("terms_notes").notNull().default(""),
    /** The "Awarded $X by <funder> in <year> for <project>" fact (user_entered, confirmed). */
    factId: text("fact_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("awards_org_idx").on(t.orgId, t.createdAt),
    // One award per application (NULLs, i.e. manual awards, never collide).
    uniqueIndex("awards_org_app_uq").on(t.orgId, t.applicationId),
    index("awards_app_idx").on(t.applicationId),
    index("awards_project_idx").on(t.projectId),
  ],
);

export const awardReports = sqliteTable(
  "award_reports",
  {
    id: text("id").primaryKey(), // rpt_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    awardId: text("award_id")
      .notNull()
      .references(() => awards.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AwardReportKind>().notNull(),
    periodStart: text("period_start").notNull(), // yyyy-mm-dd
    periodEnd: text("period_end").notNull(), // yyyy-mm-dd
    dueAt: ts("due_at").notNull(),
    status: text("status").$type<AwardReportStatus>().notNull().default("upcoming"),
    /** The drafted report: sections of cited claims + promised-vs-achieved comparisons. */
    versionContent: json<ReportContent>("version_content"),
    versionNumber: integer("version_number").notNull().default(0),
    groundingReport: json<GroundingReport>("grounding_report"),
    /** Verifier flags for the current content (reports have no flags table). */
    flags: json<ReportFlag[]>("flags").notNull().default([]),
    /** Report check-in interviews opened for this report's missing metrics (newest last). */
    checkinInterviewIds: json<string[]>("checkin_interview_ids").notNull().default([]),
    submittedAt: ts("submitted_at"),
    submittedRef: text("submitted_ref"),
    submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("award_reports_award_idx").on(t.awardId, t.dueAt),
    index("award_reports_org_due_idx").on(t.orgId, t.status, t.dueAt),
  ],
);
