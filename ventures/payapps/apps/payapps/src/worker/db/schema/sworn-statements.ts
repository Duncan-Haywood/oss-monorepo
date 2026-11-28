// The contractor's sworn statement draft per job (src/shared/sworn-statement.ts): the parties and
// what each has been paid and is owed, kept so next month starts from this month's list on any
// computer and for everyone in the company, not only in one browser. One row per job, replaced on
// each save. And each statement an editor prints, kept as given with its pay application (one row per
// job, pay application and statement date; a reprint replaces it), so a past month's can be printed
// again and the next one checked against it. The PDF itself is printed from the row, not stored.
import type { SwornDraft, SwornState, SwornStatement } from "@shared/sworn-statement";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, json, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./payapps";

export const swornStatementDrafts = sqliteTable("sworn_statement_drafts", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  orgId: text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  data: json<SwornDraft>("data").notNull(),
  /** Who saved it last; null once that user is deleted. */
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const swornStatementsGiven = sqliteTable(
  "sworn_statements_given",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** As printed ("No. 4, period to 2026-10-31"); "" when the statement names none. */
    payApp: text("pay_app").notNull(),
    statementDate: text("statement_date").notNull(),
    state: text("state").$type<SwornState>().notNull(),
    /** The whole statement as printed (swornStatementSchema's output). */
    data: json<SwornStatement>("data").notNull(),
    /** Who printed it last; null once that user is deleted. */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sworn_given_project_app_date_uq").on(t.projectId, t.payApp, t.statementDate),
    index("sworn_given_org_idx").on(t.orgId),
  ],
);
