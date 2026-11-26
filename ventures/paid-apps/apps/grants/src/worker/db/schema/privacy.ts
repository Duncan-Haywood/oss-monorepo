// Consent records, append-only audit log, data export requests and retention purges.
import type { ActorType, ConsentScope, ExportStatus } from "@shared/enums";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts } from "./_columns";
import { organization, user } from "./auth";

export const consentRecords = sqliteTable(
  "consent_records",
  {
    id: text("id").primaryKey(), // cns_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    scope: text("scope").$type<ConsentScope>().notNull(),
    policyVersion: text("policy_version").notNull(),
    granted: bool("granted").notNull(),
    /** SHA-256 of the IP (never the raw IP). */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("consent_org_scope_idx").on(t.orgId, t.scope, t.createdAt)],
);

/** Append-only. Never UPDATE or DELETE rows except via full org deletion. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(), // aud_...
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(), // e.g. "document.uploaded", "application.submitted"
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: json<Record<string, unknown>>("metadata"),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_idx").on(t.orgId, t.createdAt)],
);

export const dataExports = sqliteTable(
  "data_exports",
  {
    id: text("id").primaryKey(), // exp_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<ExportStatus>().notNull().default("pending"),
    r2Key: text("r2_key"),
    error: text("error"),
    expiresAt: ts("expires_at"),
    createdAt: createdAt(),
  },
  // Privacy export/delete by org
  (t) => [index("data_exports_org_idx").on(t.orgId, t.createdAt)],
);

/**
 * Raw files removed by the retention sweep (org_settings.raw_file_retention_days). The extracted
 * text is kept; this table records that the original is gone so the sweep is idempotent and the
 * UI can explain why a download is unavailable. Keyed by the R2 key that was deleted.
 */
export const purgedFiles = sqliteTable(
  "purged_files",
  {
    r2Key: text("r2_key").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"document" | "interview_turn">().notNull(),
    targetId: text("target_id").notNull(),
    purgedAt: ts("purged_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("purged_files_org_idx").on(t.orgId, t.targetType)],
);
