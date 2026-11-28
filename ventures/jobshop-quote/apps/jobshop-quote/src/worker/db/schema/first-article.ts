// First article results (shared/fai-results.ts): what the inspector entered against one drawing's
// drafted Form 3 list, one row per drawing file. The draft itself is not stored: it is read again
// from the file's text each time (deterministic, so the characteristic numbers stay the same), and
// the entries are keyed by those numbers.

import type { FaiAddedRow, FaiEntry } from "@shared/fai-results";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { json, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { rfqFiles, rfqs } from "./rfqs";

export const faiInspections = sqliteTable("fai_inspections", {
  fileId: text("file_id")
    .primaryKey()
    .references(() => rfqFiles.id, { onDelete: "cascade" }),
  orgId: text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  rfqId: text("rfq_id")
    .notNull()
    .references(() => rfqs.id, { onDelete: "cascade" }),
  /** The inspector's entries per characteristic number ("3", "4.2", or an added row's number). */
  entries: json<Record<string, FaiEntry>>("entries").notNull().default({}),
  /** Characteristics the draft missed, numbered after its rows (shared/fai-results addedNumbers). */
  added: json<FaiAddedRow[]>("added").notNull().default([]),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
