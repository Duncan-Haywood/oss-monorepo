// Submission records (immutable package snapshots) and follow-up tracking.
import type {
  FollowupKind,
  FollowupStatus,
  SubmissionChannel,
  SubmissionStatus,
} from "@shared/enums";
import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, json, ts, updatedAt } from "./_columns";
import { applications, applicationVersions } from "./applications";
import { organization, user } from "./auth";

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(), // sub_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => applicationVersions.id, { onDelete: "restrict" }),
    channel: text("channel").$type<SubmissionChannel>().notNull(),
    status: text("status").$type<SubmissionStatus>().notNull().default("pending"),
    /** Exactly what was (or will be) sent: orgs/{orgId}/submissions/{id}/package.json */
    packageR2Key: text("package_r2_key").notNull(),
    packageSha256: text("package_sha256").notNull(),
    recipient: text("recipient"), // email address / portal URL
    externalRef: text("external_ref"), // tracking / confirmation number
    submittedByType: text("submitted_by_type").$type<"user" | "autopilot">().notNull(),
    submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    metadata: json<Record<string, unknown>>("metadata"),
    error: text("error"),
    sentAt: ts("sent_at"),
    confirmedAt: ts("confirmed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("submissions_org_idx").on(t.orgId, t.createdAt),
    index("submissions_app_idx").on(t.applicationId),
    // RESTRICT FK from application_versions
    index("submissions_version_idx").on(t.versionId),
    // At most one live (non-failed) submission per application version: a concurrent duplicate
    // insert fails here instead of emailing the funder twice.
    uniqueIndex("submissions_live_version_uq")
      .on(t.applicationId, t.versionId)
      .where(sql`${t.status} != 'failed'`),
  ],
);

export const followups = sqliteTable(
  "followups",
  {
    id: text("id").primaryKey(), // fup_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    /** The submission that created this follow-up (status_check / thank_you), if any. */
    submissionId: text("submission_id").references(() => submissions.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<FollowupKind>().notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    dueAt: ts("due_at").notNull(),
    status: text("status").$type<FollowupStatus>().notNull().default("pending"),
    notifiedAt: ts("notified_at"),
    completedAt: ts("completed_at"),
    completedBy: text("completed_by").references(() => user.id, { onDelete: "set null" }),
    /** Idempotency key for system-created follow-ups, e.g. "deadline:{appId}:14d". Null = manual. */
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("followups_due_idx").on(t.status, t.dueAt),
    index("followups_org_idx").on(t.orgId),
    uniqueIndex("followups_dedupe_uq").on(t.orgId, t.dedupeKey),
    // GET /submissions/followups?status= ORDER BY due_at (supersedes followups_org_idx)
    index("followups_org_status_due_idx").on(t.orgId, t.status, t.dueAt),
    // FK cascade from submissions / applications; GET /submissions/:id
    index("followups_submission_idx").on(t.submissionId),
    index("followups_app_idx").on(t.applicationId),
  ],
);
