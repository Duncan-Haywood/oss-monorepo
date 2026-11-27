// Shop load (shared/shop-load.ts): each machine's hours a day, and the job each won quote became
// (its due date, the quantity ordered per line, and the day it shipped). Kept beside the rate card
// and quote rows rather than in them, so the rate-card import, export and workbook (which carry
// every machine column) and the frozen quote rows are untouched.
import { primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { json, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { quotes } from "./quotes";
import { machines } from "./shop";

export const machineCapacity = sqliteTable(
  "machine_capacity",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    /** Hours a day the machine runs, Monday to Friday (0.5 to 24). */
    hoursPerDay: real("hours_per_day").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.machineId] })],
);

export const quoteJobs = sqliteTable("quote_jobs", {
  quoteId: text("quote_id")
    .primaryKey()
    .references(() => quotes.id, { onDelete: "cascade" }),
  orgId: text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** YYYY-MM-DD the parts are owed; null when not set. */
  dueOn: text("due_on"),
  /** Quantity ordered per quote line id (from the PO); lines not named use the traveler's rules. */
  quantities: json<Record<string, number>>("quantities").notNull().default({}),
  /** YYYY-MM-DD the job shipped; a shipped job leaves the shop load. */
  shippedOn: text("shipped_on"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
