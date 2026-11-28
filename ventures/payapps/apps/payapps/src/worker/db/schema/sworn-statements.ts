// The contractor's sworn statement draft per job (src/shared/sworn-statement.ts): the parties and
// what each has been paid and is owed, kept so next month starts from this month's list on any
// computer and for everyone in the company, not only in one browser. One row per job, replaced on
// each save; the PDF itself is still printed from what is posted and not stored.
import type { SwornDraft } from "@shared/sworn-statement";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
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
