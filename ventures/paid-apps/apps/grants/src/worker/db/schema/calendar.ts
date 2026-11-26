// Calendar feeds (OWNER: calendar). Subscribable ICS feeds are public but unguessable: the URL
// carries 32 random bytes (base64url) and only their SHA-256 is stored here.
import type { CalendarScope } from "@shared/api/calendar";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const calendarTokens = sqliteTable(
  "calendar_tokens",
  {
    id: text("id").primaryKey(), // cal_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The member the feed belongs to. The feed stops working if they leave the org. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** SHA-256 (hex) of the raw token. The raw token is never stored. */
    tokenHash: text("token_hash").notNull(),
    scope: text("scope").$type<CalendarScope>().notNull(),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("calendar_tokens_hash_uq").on(t.tokenHash),
    index("calendar_tokens_org_user_idx").on(t.orgId, t.userId),
  ],
);

/** Per-org feed options (no row = defaults). */
export const calendarSettings = sqliteTable("calendar_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Show amounts (requested / award ceiling) in event titles. Default off: titles only. */
  includeAmounts: bool("include_amounts").notNull().default(false),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
