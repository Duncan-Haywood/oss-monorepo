// RFQ intake: the pasted email, uploaded drawings, and the extracted (then estimator-edited) parts.

import type { RfqStatus } from "@shared/enums";
import type { FieldSource } from "@shared/extraction";
import type { GeometryFeatures } from "@shared/geometry";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const rfqs = sqliteTable(
  "rfqs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status").$type<RfqStatus>().notNull().default("new"),
    subject: text("subject"),
    customerCompany: text("customer_company"),
    customerContact: text("customer_contact"),
    customerEmail: text("customer_email"),
    /** "manual" (pasted in the app) or "email" (sent to the shop's inbound address). */
    source: text("source").$type<"manual" | "email">().notNull().default("manual"),
    /** Envelope sender of an emailed RFQ (who sent it to the shop, often the estimator forwarding). */
    fromAddress: text("from_address"),
    /** Message-ID header of an emailed RFQ: a redelivery of the same message is not a second RFQ. */
    messageId: text("message_id"),
    /**
     * The emailed RFQ's own thread chain (its References, else a lone In-Reply-To; shared/
     * quote-email.ts `threadChain`): the quote's reply keeps the chain, not just this message.
     */
    threadReferences: text("thread_references"),
    /** What intake skipped or read with a fallback (unsupported attachments, winmail.dat...). */
    intakeNotes: json<string[]>("intake_notes").notNull().default([]),
    /** The pasted email / message body. */
    bodyText: text("body_text").notNull().default(""),
    missingInfo: json<string[]>("missing_info")
      .notNull()
      .$defaultFn(() => []),
    extractionWarnings: json<string[]>("extraction_warnings")
      .notNull()
      .$defaultFn(() => []),
    extractedAt: ts("extracted_at"),
    /**
     * When the AI first read this RFQ: the moment it counted against the plan's monthly RFQ
     * allowance (services/billing.ts). Set once; re-extraction never counts again.
     */
    countedAt: ts("counted_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("rfqs_org_idx").on(t.orgId, t.createdAt),
    index("rfqs_counted_idx").on(t.orgId, t.countedAt),
    uniqueIndex("rfqs_message_idx").on(t.orgId, t.messageId),
    index("rfqs_source_idx").on(t.orgId, t.source, t.createdAt),
  ],
);

export const rfqFiles = sqliteTable(
  "rfq_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    rfqId: text("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    /** Always `orgs/{orgId}/rfqs/{rfqId}/{fileId}`. */
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Text read from the file (drawing title block, notes); null for CAD files. */
    extractedText: text("extracted_text"),
    /**
     * Pages in an uploaded PDF (shared/pdf-pages.ts), null when it could not be read without
     * guessing (counted as one) and for other file types. Drives the 10-pages-per-RFQ count.
     */
    pageCount: integer("page_count"),
    conversionError: text("conversion_error"),
    /** From packages/cad-features via ports/geometry.ts; null until that port has an adapter. */
    geometry: json<GeometryFeatures>("geometry"),
    createdAt: createdAt(),
  },
  (t) => [index("rfq_files_rfq_idx").on(t.orgId, t.rfqId)],
);

export const rfqParts = sqliteTable(
  "rfq_parts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    rfqId: text("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    partNumber: text("part_number"),
    revision: text("revision"),
    description: text("description"),
    materialText: text("material_text"),
    /** Rate-card material the estimator chose (suggested by matchMaterial). */
    materialId: text("material_id"),
    quantities: json<number[]>("quantities")
      .notNull()
      .$defaultFn(() => []),
    tolerances: text("tolerances"),
    finishText: text("finish_text"),
    finishingOpIds: json<string[]>("finishing_op_ids")
      .notNull()
      .$defaultFn(() => []),
    /** Hole diameters (in) on the CAD file the estimator marked threaded (STEP rarely says). */
    tappedHoleDiametersIn: json<number[]>("tapped_hole_diameters_in").notNull().default([]),
    dueDate: text("due_date"),
    notes: text("notes"),
    /** Per-field verbatim quote + verification status from extraction. */
    sources: json<Partial<Record<string, FieldSource>>>("sources")
      .notNull()
      .$defaultFn(() => ({})),
    /** "llm" (extracted) or "user" (added by hand). */
    origin: text("origin").notNull().default("user"),
    /** The estimator reviewed the fields. Only confirmed parts can be quoted. */
    confirmed: bool("confirmed").notNull().default(false),
    geometryFileId: text("geometry_file_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rfq_parts_rfq_idx").on(t.orgId, t.rfqId)],
);

/**
 * What each RFQ has used of the plan's monthly allowance: one row per claim, so a package that grows
 * past 10 pages after its first read counts its extra RFQs in the month they were read
 * (services/billing.ts `claimRfqRead`). A failed AI read deletes its row.
 */
export const rfqCounts = sqliteTable(
  "rfq_counts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    rfqId: text("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    /** RFQs of the allowance this claim used: 1 for the first read of up to 10 pages. */
    units: integer("units").notNull(),
    /** Drawing pages the RFQ had when this claim was made. */
    pages: integer("pages").notNull(),
    countedAt: ts("counted_at").notNull(),
  },
  (t) => [
    index("rfq_counts_org_idx").on(t.orgId, t.countedAt),
    index("rfq_counts_rfq_idx").on(t.orgId, t.rfqId),
  ],
);
