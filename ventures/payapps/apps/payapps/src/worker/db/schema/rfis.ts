// RFIs (requests for information) on a job: the questions the subcontractor sends the GC and the
// answers that come back (src/shared/rfi.ts for the rules). Tenant rows keyed by org_id like every
// other table; an RFI goes with its job, and a deleted change order leaves the RFI unlinked.
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import { RFI_IMPACTS } from "@shared/rfi";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { changeOrders, projects } from "./payapps";

export const rfis = sqliteTable(
  "rfis",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 1..n per job; a deleted RFI's number is not reused. */
    number: integer("number").notNull(),
    subject: text("subject").notNull(),
    question: text("question").notNull(),
    /** The contractor's proposed solution, if any. */
    suggestion: text("suggestion"),
    /** Drawing sheet, detail, spec section or grid the question is about. */
    reference: text("reference"),
    /** ISO dates (YYYY-MM-DD); null: not yet. */
    sentOn: text("sent_on"),
    responseDueOn: text("response_due_on"),
    answeredOn: text("answered_on"),
    answer: text("answer"),
    answeredBy: text("answered_by"),
    costImpact: text("cost_impact", { enum: RFI_IMPACTS }),
    timeImpact: text("time_impact", { enum: RFI_IMPACTS }),
    /** The change order that prices the answer, when one was entered. */
    changeOrderId: text("change_order_id").references(() => changeOrders.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("rfis_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("rfis_number_uq").on(t.projectId, t.number),
  ],
);

/**
 * Files kept with an RFI (marked-up sheets, photos, the response that comes back): the same rules,
 * bucket and storage limit as change-order files; objects under
 * orgs/{orgId}/projects/{projectId}/rfis/{rfiId}/, so deleting the RFI or the job clears them.
 */
export const rfiFiles = sqliteTable(
  "rfi_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    rfiId: text("rfi_id")
      .notNull()
      .references(() => rfis.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("rfi_files_rfi_idx").on(t.orgId, t.rfiId),
    uniqueIndex("rfi_files_key_uq").on(t.r2Key),
  ],
);
