// Crew timesheets (src/shared/timesheets.ts for the rules): the company's own workers, their hours
// per day on a job and a schedule-of-values line, and the company's workweek. Tenant rows keyed by
// org_id like every other table. A deleted job takes its hours with it; a deleted line keeps the
// hours, on no line. A worker with hours is deactivated, not deleted (services/payapps/timesheets.ts).
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects, sovLines } from "./payapps";

const orgId = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const crewMembers = sqliteTable(
  "crew_members",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    /** Lower-cased, spaces collapsed: one worker per name in a company. */
    nameKey: text("name_key").notNull(),
    trade: text("trade"),
    /** Straight-time cents per hour; null: hours only. */
    rateCents: integer("rate_cents"),
    active: bool("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("crew_members_name_uq").on(t.orgId, t.nameKey)],
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    workerId: text("worker_id")
      .notNull()
      .references(() => crewMembers.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sovLineId: text("sov_line_id").references(() => sovLines.id, { onDelete: "set null" }),
    /** YYYY-MM-DD. */
    workDate: text("work_date").notNull(),
    hoursHundredths: integer("hours_hundredths").notNull(),
    /** Its position among the worker's rows that week (overtime falls on later rows first). */
    rowIndex: integer("row_index").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("time_entries_week_idx").on(t.orgId, t.workDate),
    index("time_entries_worker_idx").on(t.workerId, t.workDate),
    index("time_entries_project_idx").on(t.projectId),
  ],
);

/** The company's workweek: the day it starts (0 Sunday .. 6 Saturday). No row: Monday. */
export const timesheetSettings = sqliteTable("timesheet_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  weekStartDay: integer("week_start_day").notNull(),
  updatedAt: updatedAt(),
});
