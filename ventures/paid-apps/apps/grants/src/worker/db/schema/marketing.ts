// Marketing email list (newsletter / guide updates). NOT tenant data: these rows belong to public
// prospects who signed up on the marketing site, not to any organization, so there is deliberately no
// org_id column (tenantTables() skips them; org export/deletion never touches them). Access is only
// through the public newsletter routes (token-gated) and platform-admin counts. See
// docs/EMAIL_MARKETING.md for the data model, retention and compliance notes.
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, ts, updatedAt } from "./_columns";

export const MARKETING_SUBSCRIBER_STATUSES = ["pending", "confirmed", "unsubscribed"] as const;
export type MarketingSubscriberStatus = (typeof MARKETING_SUBSCRIBER_STATUSES)[number];

export const marketingSubscribers = sqliteTable(
  "marketing_subscribers",
  {
    id: text("id").primaryKey(),
    /** Normalized (trimmed, lowercased). Kept after unsubscribe as the suppression record. */
    email: text("email").notNull(),
    status: text("status", { enum: MARKETING_SUBSCRIBER_STATUSES }).notNull().default("pending"),
    /** Site path of the form the person used, e.g. "/resources/need-statement". */
    consentSource: text("consent_source").notNull(),
    /** NEWSLETTER_CONSENT_VERSION of the wording shown next to the form. */
    consentTextVersion: text("consent_text_version").notNull(),
    /** Salted SHA-256 of the signup IP (privacy/consents#hashIp); raw IPs are never stored. */
    consentIpHash: text("consent_ip_hash"),
    /** SHA-256 (hex) of the current double-opt-in token; null once confirmed or unsubscribed. */
    confirmTokenHash: text("confirm_token_hash"),
    confirmTokenExpiresAt: ts("confirm_token_expires_at"),
    /** Last confirmation email + how many were sent while pending (per-address resend limit). */
    confirmSentAt: ts("confirm_sent_at"),
    confirmSendCount: integer("confirm_send_count").notNull().default(0),
    confirmedAt: ts("confirmed_at"),
    unsubscribedAt: ts("unsubscribed_at"),
    /** "link" (unsubscribe page) or "one_click" (RFC 8058 List-Unsubscribe-Post). */
    unsubscribeMethod: text("unsubscribe_method"),
    /** Last nurture email sent (spacing between sequence steps). */
    lastSequenceSentAt: ts("last_sequence_sent_at"),
    /** When the next sequence step is due (services/marketing/sequence.ts); null = nothing left. */
    nextSequenceAt: ts("next_sequence_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("marketing_subscribers_email_uq").on(t.email),
    uniqueIndex("marketing_subscribers_confirm_token_uq").on(t.confirmTokenHash),
    // Cron: confirmed subscribers due a sequence step.
    index("marketing_subscribers_sequence_idx").on(t.status, t.nextSequenceAt),
    // Daily purge of never-confirmed signups.
    index("marketing_subscribers_status_created_idx").on(t.status, t.createdAt),
  ],
);

/**
 * One row per (subscriber, sequence step) already sent or being sent. The unique index makes the
 * nurture sequence idempotent across overlapping cron runs: a step is claimed before sending and the
 * claim is released if the send fails.
 */
export const marketingEmailLog = sqliteTable(
  "marketing_email_log",
  {
    subscriberId: text("subscriber_id")
      .notNull()
      .references(() => marketingSubscribers.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    sentAt: ts("sent_at").notNull(),
  },
  (t) => [uniqueIndex("marketing_email_log_sub_step_uq").on(t.subscriberId, t.stepKey)],
);
