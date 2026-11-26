// Attachments checklist per application (funder-required files matched to org documents) and
// letters of support requested from partners through a single-purpose public upload link.
//
// OWNER: attachments module (services/attachments/**). Until the integration pass exports this file
// from db/schema/index.ts, worker tests create these tables themselves (test/worker/attachments.test.ts).
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
import { applications } from "./applications";
import { organization, user } from "./auth";
import { documents } from "./knowledge";

export const ATTACHMENT_STATUSES = ["missing", "matched", "uploaded", "waived"] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUSES)[number];

/**
 * How an item got its document. "kind"/"keyword" = deterministic auto-match, "ai" = the optional
 * `attachments.match` suggestion (validated against the org's own document ids), "staff" = picked
 * or uploaded by a person, "partner" = a partner's letter of support, "cleared" = a person cleared
 * the match (auto-matching never re-fills a cleared item).
 */
export const ATTACHMENT_MATCH_SOURCES = [
  "kind",
  "keyword",
  "ai",
  "staff",
  "partner",
  "cleared",
] as const;
export type AttachmentMatchSource = (typeof ATTACHMENT_MATCH_SOURCES)[number];

export const applicationAttachments = sqliteTable(
  "application_attachments",
  {
    id: text("id").primaryKey(), // att_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    /** The funder's requirement name, verbatim (OpportunityRequirements.attachments[].name). */
    requirementName: text("requirement_name").notNull(),
    /** lower(trim(requirementName)): one row per requirement per application. */
    requirementKey: text("requirement_key").notNull(),
    required: bool("required").notNull().default(true),
    description: text("description").notNull().default(""),
    status: text("status").$type<AttachmentStatus>().notNull().default("missing"),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    matchSource: text("match_source").$type<AttachmentMatchSource>(),
    /** Waiver reason, or a staff note. */
    note: text("note"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("app_attachments_req_uq").on(t.applicationId, t.requirementKey),
    index("app_attachments_org_app_idx").on(t.orgId, t.applicationId),
    // FK SET NULL from documents
    index("app_attachments_doc_idx").on(t.documentId),
  ],
);

export const SUPPORT_LETTER_STATUSES = ["draft", "sent", "received", "declined"] as const;
export type SupportLetterStatus = (typeof SUPPORT_LETTER_STATUSES)[number];

export const supportLetterRequests = sqliteTable(
  "support_letter_requests",
  {
    id: text("id").primaryKey(), // slr_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    partnerName: text("partner_name").notNull(),
    partnerEmail: text("partner_email").notNull(),
    status: text("status").$type<SupportLetterStatus>().notNull().default("draft"),
    /**
     * sha256 of the current upload token (never the token itself). The token is an HMAC of
     * (request id, tokenNonce) under AUTH_SECRET, so reminders can re-send the same link without
     * storing it; a new send rotates the nonce and the old link stops working.
     */
    requestTokenHash: text("request_token_hash"),
    tokenNonce: text("token_nonce"),
    tokenExpiresAt: ts("token_expires_at"),
    dueAt: ts("due_at"),
    sentAt: ts("sent_at"),
    receivedAt: ts("received_at"),
    receivedDocumentId: text("received_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    /** Partner facts (fact ids) the request email cites. */
    factIds: json<string[]>("fact_ids").notNull().default([]),
    emailSubject: text("email_subject").notNull().default(""),
    /** The personal part of the request email (staff may edit before sending). */
    emailIntro: text("email_intro").notNull().default(""),
    /** Suggested letter outline with [placeholders] the partner fills in. */
    outline: json<string[]>("outline").notNull().default([]),
    /** "ai" when the attachments.letter_request draft passed the deterministic check, else "template". */
    draftSource: text("draft_source").$type<"ai" | "template" | "staff">().notNull(),
    note: text("note"),
    /** Partner reminders are scheduled as `followups` rows (dedupe `support_letter:{id}:7d|2d`). */
    lastReminderAt: ts("last_reminder_at"),
    reminderCount: integer("reminder_count").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("support_letters_token_uq").on(t.requestTokenHash),
    index("support_letters_org_app_idx").on(t.orgId, t.applicationId),
    // Reminder sweep: status = 'sent' ORDER BY due_at
    index("support_letters_status_due_idx").on(t.status, t.dueAt),
    index("support_letters_doc_idx").on(t.receivedDocumentId),
  ],
);
