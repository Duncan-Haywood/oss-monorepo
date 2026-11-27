// Punch list items on a job: what the GC, architect or owner listed at a walk-through, when the
// contractor fixed it and when the GC accepted it (src/shared/punch-list.ts for the rules). Tenant
// rows keyed by org_id like every other table; an item goes with its job.
import { PUNCH_SOURCES } from "@shared/punch-list";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization } from "./auth";
import { projects } from "./payapps";

export const punchItems = sqliteTable(
  "punch_items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 1..n per job: a new item takes one past the highest on the list. */
    number: integer("number").notNull(),
    description: text("description").notNull(),
    /** Room, floor, grid or area, as the list names it. */
    location: text("location"),
    source: text("source", { enum: PUNCH_SOURCES }),
    /** ISO dates (YYYY-MM-DD); null: not entered. */
    listedOn: text("listed_on"),
    dueOn: text("due_on"),
    completedOn: text("completed_on"),
    completedBy: text("completed_by"),
    acceptedOn: text("accepted_on"),
    acceptedBy: text("accepted_by"),
    /** Why the contractor says the item is not theirs; set means disputed. */
    disputeNote: text("dispute_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("punch_items_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("punch_items_number_uq").on(t.projectId, t.number),
  ],
);
