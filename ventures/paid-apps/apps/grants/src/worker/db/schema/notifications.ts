// In-app notification center (OWNER: notifications). One row per recipient: notify() fans an event
// out to the org's members by role, so reads and "mark read" only ever touch the caller's own rows.
import type { NotificationKind, NotificationSeverity } from "@shared/notifications";
import { sql } from "drizzle-orm";
import { check, index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(), // ntf_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** App-relative path ("/orgs/…"); never absolute or protocol-relative (see isSafeAppLink). */
    link: text("link"),
    severity: text("severity").$type<NotificationSeverity>().notNull().default("info"),
    /**
     * Optional per-event key (e.g. `review:{applicationId}:{versionId}`): a retried Workflow step or
     * queue job that notifies again inserts nothing. NULL keys never collide.
     */
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_org_read_created_idx").on(t.userId, t.orgId, t.readAt, t.createdAt),
    uniqueIndex("notifications_user_org_dedupe_uq").on(t.userId, t.orgId, t.dedupeKey),
    check(
      "notifications_link_app_path",
      sql`${t.link} is null or (substr(${t.link}, 1, 1) = '/' and instr(${t.link}, '//') = 0)`,
    ),
    check("notifications_severity", sql`${t.severity} in ('info', 'success', 'warning', 'action')`),
  ],
);

/** A member's own choices per kind for one org. No row = NOTIFICATION_DEFAULTS. */
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    inApp: bool("in_app").notNull().default(true),
    email: bool("email").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId, t.kind] })],
);
