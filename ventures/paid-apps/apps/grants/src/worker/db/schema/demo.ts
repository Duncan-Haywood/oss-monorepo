// One-click live demo sessions (demo deployment only: DEMO_MODE=true + FAKE_EXTERNALS=true).
// A row marks its user, and the org seeded for it, as throwaway until expiresAt; the hourly
// demo.cleanup_expired job (services/demo/sessions.ts) then deletes the org data and the user.
//
// Deliberately NOT a tenant table and without foreign keys: the org column is `demoOrgId` (not `orgId`,
// which privacy/tenant-tables.ts would pick up), so deleting the org from Settings, or a cleanup that
// stopped half-way, never deletes this row and loses track of the demo user that still has to go.
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, ts } from "./_columns";

export const demoSessions = sqliteTable(
  "demo_sessions",
  {
    id: text("id").primaryKey(), // dms_...
    /** Null only while the slot is reserved, before the throwaway user exists. */
    userId: text("user_id"),
    /** The org seeded for this session (null until the seed has created it). */
    demoOrgId: text("demo_org_id"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("demo_sessions_user_uq").on(t.userId),
    // Active-session cap (expires_at > now) and the cleanup sweep (expires_at <= now).
    index("demo_sessions_expires_idx").on(t.expiresAt),
  ],
);

export type DemoSessionRow = typeof demoSessions.$inferSelect;
