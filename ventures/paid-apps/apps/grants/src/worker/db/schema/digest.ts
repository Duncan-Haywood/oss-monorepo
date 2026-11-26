// Proactive team notifications: the weekly digest, deadline nudges and per-member email preferences.
import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

/**
 * One row per notification already sent (claimed) for an org. The unique (orgId, key) index makes
 * sends idempotent across cron reruns and queue retries. Keys: `weekly:{isoWeek}` (e.g.
 * `weekly:2026-W47`) and `deadline:{applicationId}:{days}` (14, 7, 3 or 1).
 */
export const digestLog = sqliteTable(
  "digest_log",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sentAt: ts("sent_at").notNull(),
  },
  (t) => [uniqueIndex("digest_log_org_key_uq").on(t.orgId, t.key)],
);

/** A member's own notification choices for one org. No row = every notification on. */
export const emailPreferences = sqliteTable(
  "email_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    weeklyDigest: bool("weekly_digest").notNull().default(true),
    deadlineReminders: bool("deadline_reminders").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.orgId] }),
    // Recipient lookup per org; privacy export/delete by org
    index("email_preferences_org_idx").on(t.orgId),
  ],
);

/**
 * Unsubscribes from team notification emails (digest / deadline nudges) made with the one-click
 * link in the email, for addresses that belong to no member of the org (e.g. listed in
 * org_settings.notifyEmails). Members' clicks update email_preferences instead. Only a SHA-256 of
 * the normalized address is stored. notificationRecipients() drops matching addresses.
 */
export const notificationOptOuts = sqliteTable(
  "notification_opt_outs",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** base64url SHA-256 of the trimmed, lowercased address. */
    emailHash: text("email_hash").notNull(),
    /** NotificationKind: "weeklyDigest" | "deadlineReminders". */
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.emailHash, t.kind] })],
);
