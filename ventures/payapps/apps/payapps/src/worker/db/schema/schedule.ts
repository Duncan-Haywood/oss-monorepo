// Activities on a job's schedule: what the contractor plans to do and when, with how far along it is
// and the activity it waits for (src/shared/schedule.ts for the rules). Tenant rows keyed by org_id
// like every other table; an activity goes with its job.
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization } from "./auth";
import { projects } from "./payapps";

export const scheduleActivities = sqliteTable(
  "schedule_activities",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 1..n per job, never renumbered: a predecessor names an activity by it. */
    number: integer("number").notNull(),
    name: text("name").notNull(),
    /** The trade, crew or foreman doing it, as typed. */
    trade: text("trade"),
    /** ISO dates (YYYY-MM-DD), inclusive. */
    startOn: text("start_on").notNull(),
    finishOn: text("finish_on").notNull(),
    percentComplete: integer("percent_complete").notNull().default(0),
    /** Number of the activity this one waits for (finish to start); null: none. */
    predecessorNumber: integer("predecessor_number"),
    /** Workdays after the predecessor finishes. */
    lagDays: integer("lag_days").notNull().default(0),
    notes: text("notes"),
    /** The activity's ID in the GC's P6 schedule when it was imported from an .xer export
     * (src/shared/schedule-xer.ts); a later import of the GC's update matches on it. Null: typed. */
    sourceCode: text("source_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("schedule_activities_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("schedule_activities_number_uq").on(t.projectId, t.number),
  ],
);

/**
 * The company's holidays: weekdays its crews do not work, left out of every schedule's workday
 * math (src/shared/schedule.ts, HolidayCalendar). Typed by the contractor or added from the federal
 * list and then edited; one row per date.
 */
export const companyHolidays = sqliteTable(
  "company_holidays",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** ISO date (YYYY-MM-DD). */
    on: text("on_date").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("company_holidays_date_uq").on(t.orgId, t.on)],
);
