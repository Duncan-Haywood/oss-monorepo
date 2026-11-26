// Quotes and their lines. Each line stores the estimator's cost inputs, the computed breaks and a
// snapshot of the rate-card rows used, so a sent quote never changes when the rate card does.

import type { CostBreak, CostInputs, CostIssue, RateSnapshot } from "@shared/costing";
import type { QuoteStatus } from "@shared/enums";
import type { PrefillSource } from "@shared/repeat-parts";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bool, cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { rfqParts, rfqs } from "./rfqs";

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    rfqId: text("rfq_id").references(() => rfqs.id, { onDelete: "set null" }),
    quoteNumber: integer("quote_number").notNull(),
    status: text("status").$type<QuoteStatus>().notNull().default("draft"),
    /**
     * Bumped in the same D1 batch as every write to a draft (header or lines). Sending succeeds only
     * if the revision is still the one the PDF was rendered from, so the PDF matches the stored quote.
     */
    revision: integer("revision").notNull().default(0),
    /**
     * The customer-facing revision of this quote number: 1 is the original, 2 is "Q-1001 Rev 2".
     * Not to be confused with `revision` above (the internal edit counter of a draft).
     */
    revNumber: integer("rev_number").notNull().default(1),
    /** The quote this one revises (same quote number, revNumber one lower). */
    supersedesQuoteId: text("supersedes_quote_id").references((): AnySQLiteColumn => quotes.id, {
      onDelete: "set null",
    }),
    /** Set on the earlier quote when its revision is sent (its status becomes "superseded"). */
    supersededByQuoteId: text("superseded_by_quote_id").references(
      (): AnySQLiteColumn => quotes.id,
      { onDelete: "set null" },
    ),
    customerCompany: text("customer_company").notNull(),
    customerContact: text("customer_contact"),
    customerEmail: text("customer_email"),
    leadTimeText: text("lead_time_text"),
    validUntil: text("valid_until"),
    notes: text("notes"),
    coverNote: text("cover_note"),
    /** "llm" | "template" | "user". */
    coverNoteSource: text("cover_note_source"),
    /**
     * Print "Changes from <the revision this replaces>" on the customer PDF (revisions only; the
     * customer-safe summary in shared/quote-change-summary.ts). Off by default.
     */
    showChangesOnPdf: bool("show_changes_on_pdf").notNull().default(false),
    /** Sum of each line's first (smallest-quantity) break; for the quote log. */
    headlineTotalCents: cents("headline_total_cents"),
    sentAt: ts("sent_at"),
    /** Exact PDF sent: `orgs/{orgId}/quotes/{quoteId}/Q{n}.pdf` + its SHA-256. */
    sentPdfKey: text("sent_pdf_key"),
    sentPdfSha256: text("sent_pdf_sha256"),
    decidedAt: ts("decided_at"),
    /**
     * When the day-before expiry email about this sent quote was claimed (expiry-reminders.ts).
     * Set before sending, so a second cron run never mails it twice; a revision is a new row.
     */
    expiryRemindedAt: ts("expiry_reminded_at"),
    lostReason: text("lost_reason"),
    poNumber: text("po_number"),
    /** Won value as the customer awarded it (chosen quantity break(s)). */
    wonAmountCents: cents("won_amount_cents"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("quotes_org_number_rev_uq").on(t.orgId, t.quoteNumber, t.revNumber),
    // At most one revision of any quote, so revisions form a single chain.
    uniqueIndex("quotes_supersedes_uq").on(t.orgId, t.supersedesQuoteId),
    index("quotes_org_status_idx").on(t.orgId, t.status),
  ],
);

export const quoteLines = sqliteTable(
  "quote_lines",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    rfqPartId: text("rfq_part_id").references(() => rfqParts.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    partNumber: text("part_number").notNull(),
    revision: text("revision"),
    description: text("description"),
    inputs: json<CostInputs>("inputs").notNull(),
    /** Null while the inputs have blocking issues. */
    breaks: json<CostBreak[]>("breaks"),
    basis: json<string[]>("basis")
      .notNull()
      .$defaultFn(() => []),
    issues: json<CostIssue[]>("issues")
      .notNull()
      .$defaultFn(() => []),
    snapshot: json<RateSnapshot>("snapshot"),
    /** Set when the line's inputs were pre-filled from a won quote (repeat parts, part 2). */
    prefilledFrom: json<PrefillSource>("prefilled_from"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quote_lines_quote_idx").on(t.orgId, t.quoteId)],
);

/**
 * Each time a sent quote is emailed from the app: to whom, by whom, with which PDF (its SHA-256 is
 * the sent quote's), and how it went. The row is written before the send ("sending") so the
 * per-shop and per-quote limits count attempts, then marked "sent" or "failed".
 */
export const quoteEmails = sqliteTable(
  "quote_emails",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    toAddresses: json<string[]>("to_addresses").notNull(),
    replyTo: text("reply_to").notNull(),
    subject: text("subject").notNull(),
    pdfSha256: text("pdf_sha256").notNull(),
    /** "sending" | "sent" | "failed". */
    status: text("status").$type<"sending" | "sent" | "failed">().notNull(),
    /** False when the server has no mail provider (tests, the offline demo): nothing left it. */
    delivered: bool("delivered").notNull().default(false),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    /**
     * The estimator's own copy (a separate message to their address after the customer's send):
     * null when not asked for, "sent" or "failed". A failed copy never fails the send.
     */
    senderCopy: text("sender_copy").$type<"sent" | "failed">(),
    createdAt: createdAt(),
  },
  (t) => [
    index("quote_emails_quote_idx").on(t.orgId, t.quoteId, t.createdAt),
    index("quote_emails_org_idx").on(t.orgId, t.createdAt),
  ],
);
