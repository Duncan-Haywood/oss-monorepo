// Close-out documents on a job: what the subcontract asks for at the end (warranty, O&M manuals,
// as-builts and so on), when each was sent to the GC and when they accepted it, or why it is not
// required (src/shared/closeout.ts for the rules). Tenant rows keyed by org_id like every other
// table; an item goes with its job.
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import { CLOSEOUT_KINDS } from "@shared/closeout";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./payapps";

export const closeoutItems = sqliteTable(
  "closeout_items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: CLOSEOUT_KINDS }).notNull(),
    title: text("title").notNull(),
    /** Where the requirement comes from, as typed ("Subcontract Exhibit D", "Spec 01 78 00"). */
    requiredBy: text("required_by"),
    /** ISO dates (YYYY-MM-DD); null: not entered. */
    dueOn: text("due_on"),
    sentOn: text("sent_on"),
    acceptedOn: text("accepted_on"),
    acceptedBy: text("accepted_by"),
    /** Why this job does not need it; set means waived. */
    waivedNote: text("waived_note"),
    note: text("note"),
    /** Display order on the checklist: new items go last. */
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("closeout_items_project_idx").on(t.orgId, t.projectId)],
);

/**
 * Files kept with one close-out document (the document as sent, photos, the GC's receipt): the same
 * rules, bucket and storage limit as RFI files; objects under
 * orgs/{orgId}/projects/{projectId}/closeout/{itemId}/, so deleting the item or the job clears them.
 */
export const closeoutFiles = sqliteTable(
  "closeout_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => closeoutItems.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("closeout_files_item_idx").on(t.orgId, t.itemId),
    uniqueIndex("closeout_files_key_uq").on(t.r2Key),
  ],
);
