// Funder watchlist (OWNER: watchlist): funder / state-agency pages we re-check politely for new RFPs.
// orgId = null marks a platform-curated source shared by every org (editable only by platform admins).
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { opportunities } from "./opportunities";

export const WATCH_SOURCE_KINDS = ["rfp_page", "rss", "listing_page"] as const;
export type WatchSourceKind = (typeof WATCH_SOURCE_KINDS)[number];

export const WATCH_SOURCE_STATUSES = ["active", "paused", "error", "blocked_by_robots"] as const;
export type WatchSourceStatus = (typeof WATCH_SOURCE_STATUSES)[number];

export const WATCH_EVENT_KINDS = ["changed", "opportunity_found", "error"] as const;
export type WatchEventKind = (typeof WATCH_EVENT_KINDS)[number];

export const watchSources = sqliteTable(
  "watch_sources",
  {
    id: text("id").primaryKey(), // wch_...
    /** null = platform-curated source visible to every org. */
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Lower-cased hostname of `url` (per-host politeness). */
    host: text("host").notNull(),
    label: text("label"),
    funderName: text("funder_name"),
    kind: text("kind").$type<WatchSourceKind>().notNull().default("rfp_page"),
    status: text("status").$type<WatchSourceStatus>().notNull().default("active"),
    checkIntervalHours: integer("check_interval_hours").notNull().default(24),
    /** When the next automatic check is due (null = as soon as possible). */
    nextCheckAt: ts("next_check_at"),
    lastCheckedAt: ts("last_checked_at"),
    lastManualCheckAt: ts("last_manual_check_at"),
    lastChangedAt: ts("last_changed_at"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    /** sha256 of the normalized main text of the last successful fetch. */
    contentHash: text("content_hash"),
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
    lastError: text("last_error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("watch_sources_org_idx").on(t.orgId),
    index("watch_sources_due_idx").on(t.status, t.nextCheckAt),
    index("watch_sources_host_idx").on(t.host, t.lastCheckedAt),
  ],
);

export const watchEvents = sqliteTable(
  "watch_events",
  {
    id: text("id").primaryKey(), // wev_...
    sourceId: text("source_id")
      .notNull()
      .references(() => watchSources.id, { onDelete: "cascade" }),
    /** Copied from the source (null for platform sources). */
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<WatchEventKind>().notNull(),
    opportunityId: text("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("watch_events_org_idx").on(t.orgId, t.createdAt),
    index("watch_events_source_idx").on(t.sourceId, t.createdAt),
  ],
);
