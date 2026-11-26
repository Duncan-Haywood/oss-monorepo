// Applications, immutable draft versions, verifier flags, human reviews and feedback.
import type { ApplicationContent, GroundingReport } from "@shared/content";
import type {
  ApplicationStatus,
  FlagKind,
  FlagSeverity,
  FlagStatus,
  ReviewDecision,
  ReviewTier,
} from "@shared/enums";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./knowledge";
import { opportunities, opportunityMatches } from "./opportunities";

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(), // app_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    matchId: text("match_id").references(() => opportunityMatches.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").$type<ApplicationStatus>().notNull().default("draft_queued"),
    reviewTier: text("review_tier").$type<ReviewTier>(),
    /** Human-readable explanation of why this tier was chosen (shown in UI + audit log). */
    reviewTierReason: text("review_tier_reason"),
    requestedAmountCents: cents("requested_amount_cents"),
    deadline: ts("deadline"),
    currentVersionId: text("current_version_id"),
    workflowInstanceId: text("workflow_instance_id"),
    lastError: text("last_error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    submittedAt: ts("submitted_at"),
    outcomeAt: ts("outcome_at"),
    outcomeNotes: text("outcome_notes"),
    awardedAmountCents: cents("awarded_amount_cents"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_org_status_idx").on(t.orgId, t.status),
    index("applications_org_deadline_idx").on(t.orgId, t.deadline),
    // GET /applications ORDER BY updated_at DESC
    index("applications_org_updated_idx").on(t.orgId, t.updatedAt),
    // Autodraft NOT EXISTS, createApplication dedupe, RESTRICT FK from opportunities
    index("applications_opp_idx").on(t.opportunityId, t.orgId),
    // FK SET NULL from opportunity_matches / projects
    index("applications_match_idx").on(t.matchId),
    index("applications_project_idx").on(t.projectId),
  ],
);

/** Every draft/edit creates a new immutable version. Submissions point at an exact version. */
export const applicationVersions = sqliteTable(
  "application_versions",
  {
    id: text("id").primaryKey(), // ver_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: json<ApplicationContent>("content").notNull(),
    executiveSummary: text("executive_summary").notNull().default(""),
    keyPoints: json<string[]>("key_points").notNull().default([]),
    groundingReport: json<GroundingReport>("grounding_report"),
    /** "system" for machine drafts, otherwise the editing user's id. */
    authorType: text("author_type").$type<"system" | "user">().notNull(),
    authorId: text("author_id"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    changeNote: text("change_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("versions_app_num_uq").on(t.applicationId, t.versionNumber),
    // Privacy export/delete by org
    index("versions_org_idx").on(t.orgId),
  ],
);

export const applicationFlags = sqliteTable(
  "application_flags",
  {
    id: text("id").primaryKey(), // flg_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => applicationVersions.id, { onDelete: "cascade" }),
    severity: text("severity").$type<FlagSeverity>().notNull(),
    kind: text("kind").$type<FlagKind>().notNull(),
    sectionKey: text("section_key"),
    claimId: text("claim_id"),
    message: text("message").notNull(),
    /** A question to ask the org (feeds gap-fill interviews). */
    suggestedQuestion: text("suggested_question"),
    status: text("status").$type<FlagStatus>().notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("flags_app_idx").on(t.applicationId, t.status),
    // Review-queue counts, missing-info lookup, FK cascade from application_versions
    index("flags_version_idx").on(t.versionId, t.status),
    // Privacy export/delete by org
    index("flags_org_idx").on(t.orgId),
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(), // rev_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => applicationVersions.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    decision: text("decision").$type<ReviewDecision>().notNull(),
    comments: text("comments").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("reviews_app_idx").on(t.applicationId),
    // FK cascade from application_versions; privacy export/delete
    index("reviews_version_idx").on(t.versionId),
    index("reviews_org_idx").on(t.orgId),
  ],
);

/** Quality feedback ("this was horrible" / "exceptionally good") used to steer future drafts. */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(), // fbk_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => applicationVersions.id, {
      onDelete: "set null",
    }),
    sectionKey: text("section_key"), // null = whole application
    rating: integer("rating").notNull(), // 1 (very bad) .. 5 (excellent)
    comment: text("comment").notNull().default(""),
    tags: json<string[]>("tags").notNull().default([]),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("feedback_org_idx").on(t.orgId, t.rating),
    // FK cascade from applications / SET NULL from application_versions; listFeedback
    index("feedback_app_idx").on(t.applicationId),
    index("feedback_version_idx").on(t.versionId),
  ],
);
