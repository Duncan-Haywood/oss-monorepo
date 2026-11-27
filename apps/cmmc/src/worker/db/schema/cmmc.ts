// CMMC workspace tables. Every row is tenant-scoped by org_id with ON DELETE CASCADE from organization.
// The control library itself is static data (src/shared/controls); these tables hold each org's answers.

import type { AffirmationKind, CmmcStatus, Deadline } from "@shared/affirmation";
import type { ImplementationStatus, PartialCreditKey } from "@shared/controls";
import type { ObjectiveResult, PoamStatus } from "@shared/enums";
import type { QualityStatus } from "@shared/quality";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

const orgRef = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/** System description used by the SSP and as the only factual input to AI drafting. */
export const orgProfile = sqliteTable("org_profile", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  targetLevel: integer("target_level").notNull().default(2),
  legalName: text("legal_name").notNull().default(""),
  cageCode: text("cage_code").notNull().default(""),
  systemName: text("system_name").notNull().default(""),
  systemDescription: text("system_description").notNull().default(""),
  boundaryDescription: text("boundary_description").notNull().default(""),
  environmentDescription: text("environment_description").notNull().default(""),
  connectionsDescription: text("connections_description").notNull().default(""),
  sspUpdateFrequency: text("ssp_update_frequency").notNull().default(""),
  affirmingOfficial: text("affirming_official").notNull().default(""),
  updatedAt: updatedAt(),
});

export const controlRecord = sqliteTable(
  "control_record",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    /** CMMC id from the library, e.g. "AC.L2-3.1.1" or "AC.L1-b.1.i". */
    controlId: text("control_id").notNull(),
    status: text("status").$type<ImplementationStatus>().notNull().default("not_assessed"),
    partialCredit: text("partial_credit").$type<PartialCreditKey>(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    /** The accepted implementation statement (human-reviewed). Only this goes in the SSP. */
    statement: text("statement").notNull().default(""),
    statementUpdatedBy: text("statement_updated_by"),
    statementUpdatedAt: ts("statement_updated_at"),
    /** Unreviewed AI draft. Never enters the SSP until a person accepts it. */
    draftStatement: text("draft_statement"),
    draftQuestions: json<string[]>("draft_questions"),
    draftGeneratedAt: ts("draft_generated_at"),
    objectiveResults: json<Record<string, ObjectiveResult>>("objective_results"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("control_record_org_control_uq").on(t.orgId, t.controlId)],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    controlId: text("control_id"),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Always `orgs/{orgId}/evidence/{id}`. */
    r2Key: text("r2_key").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("evidence_org_control_idx").on(t.orgId, t.controlId)],
);

export const poamItem = sqliteTable(
  "poam_item",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    controlId: text("control_id").notNull(),
    weakness: text("weakness").notNull(),
    remediation: text("remediation").notNull().default(""),
    milestones: text("milestones").notNull().default(""),
    responsible: text("responsible").notNull().default(""),
    /** YYYY-MM-DD */
    scheduledCompletion: text("scheduled_completion").notNull(),
    status: text("status").$type<PoamStatus>().notNull().default("open"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("poam_org_idx").on(t.orgId, t.status)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_idx").on(t.orgId, t.createdAt)],
);

/**
 * What the organization's affirming official entered in SPRS (32 CFR 170.22). A record of the
 * user's own submission, never a submission: the app sends nothing to SPRS.
 */
export const affirmation = sqliteTable(
  "affirmation",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    level: integer("level").$type<1 | 2>().notNull(),
    kind: text("kind").$type<AffirmationKind>().notNull(),
    cmmcStatus: text("cmmc_status").$type<CmmcStatus>().notNull(),
    /** YYYY-MM-DD */
    cmmcStatusDate: text("cmmc_status_date").notNull(),
    /** YYYY-MM-DD: the day the affirmation was entered in SPRS. */
    affirmedOn: text("affirmed_on").notNull(),
    officialName: text("official_name").notNull(),
    officialTitle: text("official_title").notNull(),
    officialContact: text("official_contact").notNull(),
    /** Level 2: the score entered in SPRS. */
    sprsScore: integer("sprs_score"),
    /** Level 2: the score this workspace computed when the record was made. */
    workspaceScore: integer("workspace_score"),
    notes: text("notes").notNull().default(""),
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("affirmation_org_idx").on(t.orgId, t.level, t.affirmedOn)],
);

/** The org's answer for one ISO 9001 clause (src/shared/quality). The clause list is static data. */
export const qualityClauseRecord = sqliteTable(
  "quality_clause_record",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    /** e.g. "iso9001-7.5.3" */
    clauseId: text("clause_id").notNull(),
    status: text("status").$type<QualityStatus>().notNull().default("not_assessed"),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("quality_clause_org_clause_uq").on(t.orgId, t.clauseId)],
);

/**
 * An evidence file (already uploaded, usually for a CMMC requirement) linked to an ISO clause, so one
 * training record or internal audit serves both without a second upload.
 */
export const qualityEvidenceLink = sqliteTable(
  "quality_evidence_link",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    clauseId: text("clause_id").notNull(),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    linkedBy: text("linked_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quality_link_org_clause_evidence_uq").on(t.orgId, t.clauseId, t.evidenceId)],
);

/**
 * A member's own email settings in one organization. No row means the defaults: the affirmation
 * reminder is on for admins and owners (it is about a legal deadline they are responsible for).
 */
export const memberNotifications = sqliteTable(
  "member_notifications",
  {
    orgId: orgRef(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    affirmationReminders: bool("affirmation_reminders").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

/**
 * One row per reminder sent (services/affirmations/reminders.ts): an organization's deadline, its
 * due date and the warning stage (60 or 7 days). Inserted before the email goes out, so two
 * overlapping cron runs never send the same reminder twice. A new affirmation moves the due date,
 * which makes a new key, so the next cycle is reminded again.
 */
export const affirmationReminderSent = sqliteTable(
  "affirmation_reminder_sent",
  {
    orgId: orgRef(),
    level: integer("level").$type<1 | 2>().notNull(),
    deadlineKey: text("deadline_key").$type<Deadline["key"]>().notNull(),
    /** YYYY-MM-DD */
    due: text("due").notNull(),
    /** 60 or 7: days of warning this reminder was for. */
    stage: integer("stage").notNull(),
    sentAt: ts("sent_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.level, t.deadlineKey, t.due, t.stage] })],
);

/**
 * An organization's subscribable calendar link (services/affirmations/calendar-feed.ts): at most one
 * per organization. Only the SHA-256 of the secret token is kept, so a database read cannot rebuild
 * the link; an admin sees it once when it is made, and resetting it replaces the hash, which stops
 * the old link. Deleting the row turns the link off.
 */
export const affirmationCalendarFeed = sqliteTable(
  "affirmation_calendar_feed",
  {
    orgId: orgRef().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** When a calendar last fetched it, at most hourly; null until the first fetch. */
    lastFetchedAt: ts("last_fetched_at"),
  },
  (t) => [uniqueIndex("affirmation_calendar_feed_token_hash").on(t.tokenHash)],
);
