// One project budget per application (line items + computed totals). Lines and totals are JSON:
// totals are recomputed from the lines on every write (services/budgets), never taken from input.
import type { BudgetLine, BudgetTotals } from "@shared/budget";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, updatedAt } from "./_columns";
import { applications } from "./applications";
import { organization, user } from "./auth";

export const applicationBudgets = sqliteTable(
  "application_budgets",
  {
    applicationId: text("application_id")
      .primaryKey()
      .references(() => applications.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    lines: json<BudgetLine[]>("lines").notNull().default([]),
    totals: json<BudgetTotals>("totals").notNull(),
    /** Required cost share from the RFP, entered by the applicant (null = not entered). */
    requiredMatchCents: cents("required_match_cents"),
    notes: text("notes").notNull().default(""),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("application_budgets_org_idx").on(t.orgId)],
);
