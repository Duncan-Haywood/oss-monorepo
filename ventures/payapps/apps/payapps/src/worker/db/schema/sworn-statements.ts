// The contractor's sworn statement per job (src/shared/sworn-statement.ts).
//
// The draft: the parties and what each has been paid and is owed, kept so next month starts from this
// month's list on any computer and for everyone in the company, not only in one browser. One row per
// job, replaced on each save.
//
// The copies: the statement as printed for each pay application, so last month's can be printed again
// as it was signed after the draft has moved on. One row per job and pay application (`copy_key`,
// swornCopyKey); the PDF is printed again from the saved statement, never stored.
import type { SwornDraft, SwornState, SwornStatement } from "@shared/sworn-statement";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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

export const swornStatementCopies = sqliteTable(
  "sworn_statement_copies",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    copyKey: text("copy_key").notNull(),
    state: text("state").$type<SwornState>().notNull(),
    payApp: text("pay_app").notNull(),
    statementDate: text("statement_date").notNull(),
    /** The statement as printed, checked by the full schema (never a half-typed draft). */
    data: json<SwornStatement>("data").notNull(),
    owingCents: integer("owing_cents").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    /** Who kept it last; null once that user is deleted. */
    savedBy: text("saved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sworn_copies_project_key_uq").on(t.projectId, t.copyKey),
    index("sworn_copies_org_idx").on(t.orgId),
  ],
);
