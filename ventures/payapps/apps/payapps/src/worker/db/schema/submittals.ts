// Submittal log per job (src/shared/submittals.ts, docs/SUBMITTALS.md). Tenant table keyed by org_id
// with ON DELETE CASCADE, like every other table; every query filters by it.
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import { SUBMITTAL_ACTIONS, SUBMITTAL_TYPES } from "@shared/submittals";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./payapps";

/**
 * One row per revision: a resubmittal is a new row with the same number and the next revision, so
 * the first one's dates and the GC's action stay on the log. Dates are YYYY-MM-DD as typed.
 */
export const submittals = sqliteTable(
  "submittals",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    revision: integer("revision").notNull().default(0),
    specSection: text("spec_section"),
    title: text("title").notNull(),
    type: text("type", { enum: SUBMITTAL_TYPES }).notNull(),
    /** The GC's own number for it, when their log numbers differently. */
    gcReference: text("gc_reference"),
    submittedOn: text("submitted_on"),
    requiredBy: text("required_by"),
    returnedOn: text("returned_on"),
    action: text("action", { enum: SUBMITTAL_ACTIONS }),
    neededOnSite: text("needed_on_site"),
    leadTimeDays: integer("lead_time_days"),
    reviewDays: integer("review_days"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("submittals_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("submittals_number_revision_idx").on(t.projectId, t.number, t.revision),
  ],
);

/**
 * Files attached to one submittal revision: the product data, shop drawings or photos of samples sent
 * with it and the stamped copy the reviewer returns (services/payapps/submittal-files.ts). Same rules
 * as pay_app_attachments (src/shared/attachments.ts); keys under the job's prefix, so deleting the
 * job clears them too. A resubmittal is a new row, so each revision keeps its own files.
 */
export const submittalFiles = sqliteTable(
  "submittal_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    submittalId: text("submittal_id")
      .notNull()
      .references(() => submittals.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("submittal_files_submittal_idx").on(t.orgId, t.submittalId),
    uniqueIndex("submittal_files_key_uq").on(t.r2Key),
  ],
);
