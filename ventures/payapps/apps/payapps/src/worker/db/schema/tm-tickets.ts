// T&M tickets on a job (src/shared/tm-tickets.ts for the rules, docs/TM-TICKETS.md). Tenant rows
// keyed by org_id like every other table; a ticket goes with its job. Its stage (unsigned, signed,
// on a change order) is read from what it holds, never stored.
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import type { TmEquipmentLine, TmLaborLine, TmMaterialLine, TmRateLine } from "@shared/tm-tickets";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, json, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { changeOrders, projects } from "./payapps";

export const tmTickets = sqliteTable(
  "tm_tickets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The ticket's number on the job (a paper ticket book's number, or the next free one). */
    number: integer("number").notNull(),
    /** ISO date the work was done. */
    workDate: text("work_date").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    /** Who asked for the work (the GC's super, a foreman), as typed. */
    directedBy: text("directed_by"),
    /** The GC's directive, RFI or field order number it answers, as typed. */
    reference: text("reference"),
    labor: json<TmLaborLine[]>("labor").notNull(),
    material: json<TmMaterialLine[]>("material").notNull(),
    equipment: json<TmEquipmentLine[]>("equipment").notNull(),
    laborMarkupBps: integer("labor_markup_bps").notNull().default(0),
    materialMarkupBps: integer("material_markup_bps").notNull().default(0),
    equipmentMarkupBps: integer("equipment_markup_bps").notNull().default(0),
    notes: text("notes"),
    /** The GC representative who signed, their title and the date; null while unsigned. */
    signedName: text("signed_name"),
    signedTitle: text("signed_title"),
    signedOn: text("signed_on"),
    /** The signature as drawn on the device, base64 JPEG; null when signed on paper. */
    signatureJpeg: text("signature_jpeg"),
    /** The change order that bills it; set null if that change order is deleted. */
    changeOrderId: text("change_order_id").references(() => changeOrders.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tm_tickets_project_idx").on(t.orgId, t.projectId),
    uniqueIndex("tm_tickets_number_uq").on(t.projectId, t.number),
    index("tm_tickets_change_order_idx").on(t.changeOrderId),
  ],
);

/**
 * The job's T&M rate sheet (src/shared/tm-tickets.ts, TmRateSheet): one per job, the rates and
 * markups its subcontract fixes. New tickets start from it; nothing on a ticket changes when it does.
 */
export const tmRateSheets = sqliteTable(
  "tm_rate_sheets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    labor: json<TmRateLine[]>("labor").notNull(),
    material: json<TmRateLine[]>("material").notNull(),
    equipment: json<TmRateLine[]>("equipment").notNull(),
    /** Null where the sheet sets no markup (a new ticket then takes the latest ticket's). */
    laborMarkupBps: integer("labor_markup_bps"),
    materialMarkupBps: integer("material_markup_bps"),
    equipmentMarkupBps: integer("equipment_markup_bps"),
    /** Where the rates come from, as typed. */
    source: text("source"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tm_rate_sheets_project_uq").on(t.orgId, t.projectId)],
);

/**
 * Files kept with one T&M ticket (photos of the extra work, material receipts, a scan of the signed
 * paper copy): the same rules, bucket and storage limit as daily report files; objects under
 * orgs/{orgId}/projects/{projectId}/tm-tickets/{ticketId}/, so deleting the ticket or the job
 * clears them.
 */
export const tmTicketFiles = sqliteTable(
  "tm_ticket_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tmTickets.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("photo"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("tm_ticket_files_ticket_idx").on(t.orgId, t.ticketId),
    uniqueIndex("tm_ticket_files_key_uq").on(t.r2Key),
  ],
);
