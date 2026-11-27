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
    /**
     * Quote follow-up (services/quotes/follow-ups.ts): the shop day (YYYY-MM-DD) this sent quote is
     * next due for a follow-up; set at send from the shop's followUpDays, moved by each logged
     * follow-up, null for none. Only "sent" quotes are ever due.
     */
    followUpOn: text("follow_up_on"),
    /** The followUpOn date the follow-up email was claimed for, so each date is mailed once. */
    followUpRemindedFor: text("follow_up_reminded_for"),
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
    index("quotes_status_follow_up_idx").on(t.status, t.followUpOn),
  ],
);

/**
 * Each follow-up an estimator logged on a sent quote: what happened ("Left a voicemail", "Buyer
 * says award next week") and the next follow-up day it set (null: no more). Kept with the quote.
 */
export const quoteFollowUps = sqliteTable(
  "quote_follow_ups",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    byUserId: text("by_user_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    /** The quote's followUpOn after this entry (YYYY-MM-DD), or null for "no more follow-ups". */
    nextOn: text("next_on"),
    createdAt: createdAt(),
  },
  (t) => [index("quote_follow_ups_quote_idx").on(t.orgId, t.quoteId)],
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
    /**
     * The saved routings the line was built from (applied to it, saved from it or updated from it);
     * null when not recorded (lines from before 0030, or never touched by a routing). Win/loss by
     * routing reads it, and falls back to matching operations against today's routings when null.
     */
    routingIds: json<string[]>("routing_ids"),
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

/**
 * Customer links (services/quotes/customer-link.ts): a bearer link to one sent quote, where the
 * customer reads it and accepts (with a PO number and the quantities they order) or declines.
 * Only the SHA-256 of the token is stored; the link is shown once (or goes in a quote email).
 * Several per quote (each email makes its own); all stop working when the shop turns them off or
 * the quote leaves "sent".
 */
export const quoteLinks = sqliteTable(
  "quote_links",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** The quote email the link went out in, or null when an estimator copied it by hand. */
    quoteEmailId: text("quote_email_id").references(() => quoteEmails.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** Last time the customer's page loaded the quote (written at most hourly). */
    lastViewedAt: ts("last_viewed_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("quote_links_token_uq").on(t.tokenHash),
    index("quote_links_quote_idx").on(t.orgId, t.quoteId),
  ],
);

/** One line the customer ordered when accepting: the line, its part number and the break chosen. */
export interface QuoteResponseChoice {
  lineId: string;
  partNumber: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

/**
 * What the customer answered through a customer link: at most one per quote (the quote is then won
 * or lost; the shop can still correct the outcome by hand, and this row stays as the record).
 */
export const quoteResponses = sqliteTable(
  "quote_responses",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    linkId: text("link_id").references(() => quoteLinks.id, { onDelete: "set null" }),
    decision: text("decision").$type<"accepted" | "declined">().notNull(),
    /** As the customer typed them. */
    name: text("name").notNull(),
    email: text("email"),
    poNumber: text("po_number"),
    choices: json<QuoteResponseChoice[]>("choices")
      .notNull()
      .$defaultFn(() => []),
    amountCents: cents("amount_cents"),
    /** The customer's note (accepting) or reason (declining). */
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quote_responses_quote_uq").on(t.orgId, t.quoteId)],
);
