// Company documents: the contractor's licenses, W-9, bonding letter, safety program, EMR letter and
// other compliance papers a GC asks a subcontractor for (src/shared/company-documents.ts has the
// rules). Tenant rows keyed by org_id like every other table; no job link (they belong to the
// company). A W-9 row never holds the taxpayer identification number: the API refuses a number for
// that kind.
import { ATTACHMENT_CATEGORIES } from "@shared/attachments";
import { COMPANY_DOCUMENT_KINDS } from "@shared/company-documents";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const companyDocuments = sqliteTable(
  "company_documents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: COMPANY_DOCUMENT_KINDS }).notNull(),
    label: text("label"),
    issuer: text("issuer"),
    jurisdiction: text("jurisdiction"),
    classification: text("classification"),
    number: text("number"),
    /** YYYY-MM-DD, or null when not typed. */
    effectiveOn: text("effective_on"),
    /** YYYY-MM-DD, or null: the document does not expire. */
    expiresOn: text("expires_on"),
    notes: text("notes"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("company_documents_org_idx").on(t.orgId, t.expiresOn)],
);

/**
 * Files kept with a company document (the license card, the bonding letter PDF, a signed W-9 when the
 * contractor chooses), keys under orgs/{orgId}/documents/{documentId}/. Counted in the company's one
 * storage limit.
 */
export const companyDocumentFiles = sqliteTable(
  "company_document_files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => companyDocuments.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category", { enum: ATTACHMENT_CATEGORIES }).notNull().default("backup"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("company_document_files_doc_idx").on(t.orgId, t.documentId),
    uniqueIndex("company_document_files_key_uq").on(t.r2Key),
  ],
);
