// The org's knowledge base: source documents, their chunks, extracted facts (with provenance)
// and the projects the org has in mind.

import type { FactValue } from "@shared/content";
import type {
  DocumentKind,
  DocumentStatus,
  FactCategory,
  FactSourceType,
  FactStatus,
  PastOutcome,
  ProjectStatus,
  Sensitivity,
} from "@shared/enums";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

/**
 * Warning recorded by ingestion when services/safety's prompt-injection heuristics score the
 * document's text at or above the threshold. Facts from a flagged document get lower confidence
 * and are excluded from bulk confirmation (each needs an individual human confirmation).
 */
export interface DocumentSafetyFlags {
  injectionSuspected: boolean;
  /** 0-1 heuristic score. */
  injectionScore: number;
  /** Strongest findings with short excerpts, for the reviewer. */
  findings: { kind: string; excerpt: string }[];
  /** Heuristics version that produced the flag. */
  version: string;
  scannedAt: string;
}

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(), // doc_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    kind: text("kind").$type<DocumentKind>().notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** R2 key of the original upload: orgs/{orgId}/documents/{id}/original */
    r2Key: text("r2_key").notNull(),
    /** R2 key of the extracted markdown text: orgs/{orgId}/documents/{id}/text.md */
    textR2Key: text("text_r2_key"),
    sourceUrl: text("source_url"), // website pages
    status: text("status").$type<DocumentStatus>().notNull().default("uploaded"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    factCount: integer("fact_count").notNull().default(0),
    // Past applications as reference material (success / failure signal)
    pastOutcome: text("past_outcome").$type<PastOutcome>(),
    pastFunder: text("past_funder"),
    pastAmountCents: cents("past_amount_cents"),
    pastYear: integer("past_year"),
    notes: text("notes"),
    /** Set when the prompt-injection scan flagged the text (null = clean or not scanned). */
    safetyFlags: json<DocumentSafetyFlags>("safety_flags"),
    consentRecordId: text("consent_record_id"),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("documents_org_idx").on(t.orgId, t.createdAt),
    index("documents_org_sha_idx").on(t.orgId, t.sha256),
  ],
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").primaryKey(), // chk_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading"),
    text: text("text").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    /** Id of the vector in Vectorize (namespace = orgId). Same as chunk id. */
    embeddedAt: ts("embedded_at"),
    createdAt: createdAt(),
  },
  (t) => [index("chunks_doc_idx").on(t.documentId, t.ordinal), index("chunks_org_idx").on(t.orgId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(), // prj_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    problem: text("problem").notNull().default(""),
    approach: text("approach").notNull().default(""),
    populationServed: text("population_served").notNull().default(""),
    location: text("location").notNull().default(""),
    budgetNeededCents: cents("budget_needed_cents"),
    timelineStart: text("timeline_start"), // ISO date (yyyy-mm-dd) or free text like "Fall 2027"
    timelineEnd: text("timeline_end"),
    status: text("status").$type<ProjectStatus>().notNull().default("idea"),
    priority: integer("priority").notNull().default(3), // 1 (highest) .. 5
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

/**
 * Atomic, attributable statements about the org. The ONLY material drafts may assert.
 * Every fact keeps provenance (document chunk / interview turn / user) and a verbatim quote.
 */
export const facts = sqliteTable(
  "facts",
  {
    id: text("id").primaryKey(), // fct_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    category: text("category").$type<FactCategory>().notNull(),
    statement: text("statement").notNull(),
    value: json<FactValue>("value"),
    status: text("status").$type<FactStatus>().notNull().default("proposed"),
    sensitivity: text("sensitivity").$type<Sensitivity>().notNull().default("internal"),
    confidence: real("confidence").notNull().default(0.5),
    sourceType: text("source_type").$type<FactSourceType>().notNull(),
    sourceDocumentId: text("source_document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    sourceChunkId: text("source_chunk_id").references(() => documentChunks.id, {
      onDelete: "set null",
    }),
    sourceInterviewId: text("source_interview_id"),
    sourceTurnId: text("source_turn_id"),
    /** Verbatim supporting text from the source (empty only for user_entered). */
    sourceQuote: text("source_quote").notNull().default(""),
    /** When the fact was true, e.g. "2025" or "2026-06-30"; null if timeless. */
    asOf: text("as_of"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    supersededById: text("superseded_by_id"),
    /**
     * Proposed facts only: the older fact this one would replace (same category, newer asOf).
     * Confirming this fact marks that one superseded (supersededById = this id).
     */
    supersedesFactId: text("supersedes_fact_id"),
    /** Last time a human vouched the fact is still true ("Confirm still true", confirm). */
    lastConfirmedAt: ts("last_confirmed_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    confirmedBy: text("confirmed_by").references(() => user.id, { onDelete: "set null" }),
    confirmedAt: ts("confirmed_at"),
    /** The statement as first extracted, kept when a human edits it (provenance). */
    originalStatement: text("original_statement"),
    editedBy: text("edited_by").references(() => user.id, { onDelete: "set null" }),
    editedAt: ts("edited_at"),
    /** Why a reviewer rejected the fact (optional). */
    rejectionReason: text("rejection_reason"),
    /** For facts mirrored from a project's own fields (user_entered), which field, e.g. "summary". */
    projectField: text("project_field"),
    /**
     * Extracted facts only: sha256(orgId|normalized statement|source chunk or turn id). Unique per
     * org, so concurrent duplicate extraction runs insert each fact once (ON CONFLICT DO NOTHING).
     */
    dedupeHash: text("dedupe_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("facts_project_idx").on(t.projectId),
    index("facts_interview_idx").on(t.sourceInterviewId),
    index("facts_org_status_idx").on(t.orgId, t.status),
    index("facts_org_category_idx").on(t.orgId, t.category),
    index("facts_doc_idx").on(t.sourceDocumentId),
    // GET /facts ORDER BY created_at DESC
    index("facts_org_created_idx").on(t.orgId, t.createdAt),
    // FK SET NULL from document_chunks: reprocess/delete/org-delete otherwise scan all facts per chunk
    index("facts_chunk_idx").on(t.sourceChunkId),
    uniqueIndex("facts_org_dedupe_uq").on(t.orgId, t.dedupeHash),
  ],
);
