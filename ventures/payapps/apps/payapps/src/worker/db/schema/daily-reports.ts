// Daily reports (field logs) on a job: one per job and day (src/shared/daily-reports.ts for the
// rules). Tenant rows keyed by org_id like every other table; a report goes with its job.
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import type { CrewLine } from "@shared/daily-reports";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, json, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./payapps";
import { scheduleActivities } from "./schedule";

export const dailyReports = sqliteTable(
  "daily_reports",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** ISO date (YYYY-MM-DD); one report per job and day. */
    reportDate: text("report_date").notNull(),
    weather: text("weather"),
    tempHighF: integer("temp_high_f"),
    tempLowF: integer("temp_low_f"),
    /** Hours of work lost to weather or another delay; null: not stated. */
    delayHours: real("delay_hours"),
    crew: json<CrewLine[]>("crew").notNull(),
    workPerformed: text("work_performed"),
    delays: text("delays"),
    /** The schedule activity the day's delay held up (src/shared/schedule-delays.ts); null: not
     * tied to one. Deleting the activity keeps the report and its hours, untied. */
    delayActivityId: text("delay_activity_id").references(() => scheduleActivities.id, {
      onDelete: "set null",
    }),
    equipment: text("equipment"),
    deliveries: text("deliveries"),
    visitors: text("visitors"),
    safety: text("safety"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("daily_reports_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("daily_reports_day_uq").on(t.projectId, t.reportDate),
  ],
);

/**
 * Files kept with one daily report (photos of the day, delivery tickets, inspection reports): the
 * same rules, bucket and storage limit as RFI files; objects under
 * orgs/{orgId}/projects/{projectId}/daily-reports/{reportId}/, so deleting the report or the job
 * clears them.
 */
export const dailyReportFiles = sqliteTable(
  "daily_report_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => dailyReports.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("photo"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("daily_report_files_report_idx").on(t.orgId, t.reportId),
    uniqueIndex("daily_report_files_key_uq").on(t.r2Key),
  ],
);
