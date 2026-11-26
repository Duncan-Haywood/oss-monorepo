// Grant opportunities (a shared, public catalog) and per-org matches against it.
import type { MatchReason, OpportunityRequirements } from "@shared/content";
import type {
  Eligibility,
  FunderType,
  MatchStatus,
  OpportunitySource,
  OpportunityStatus,
  SubmissionMethodHint,
} from "@shared/enums";
import type { DismissReason } from "@shared/match-triage";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization } from "./auth";
import { projects } from "./knowledge";

export const funders = sqliteTable(
  "funders",
  {
    id: text("id").primaryKey(), // fnd_...
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    type: text("type").$type<FunderType>().notNull().default("other"),
    websiteUrl: text("website_url"),
    ein: text("ein"),
    agencyCode: text("agency_code"), // grants.gov agency code
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("funders_normalized_uq").on(t.normalizedName)],
);

/**
 * Prompt-injection warning on the page / RFP an opportunity was built from (imports, watchlist),
 * set when services/safety's heuristics score it at or above the threshold. `needsReview` keeps
 * the opportunity out of autopilot drafting (matching/autodraft.ts): a person must start the draft.
 */
export interface OpportunitySafetyFlags {
  needsReview: true;
  injectionSuspected: boolean;
  /** 0-1 heuristic score. */
  injectionScore: number;
  /** Strongest findings with short excerpts, for the reviewer. */
  findings: { kind: string; excerpt: string }[];
  /** Emails / URLs removed from the extraction because they came from the injected text. */
  droppedContacts: string[];
  /** Which pipeline scanned it. */
  source: "imports" | "watchlist";
  /** Heuristics version that produced the flag. */
  version: string;
  scannedAt: string;
}

/**
 * Public opportunities are global (privateToOrgId = null). Opportunities an org imports by
 * URL / RFP upload are private to that org (privateToOrgId = orgId) and must be filtered.
 */
export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(), // opp_...
    source: text("source").$type<OpportunitySource>().notNull(),
    sourceId: text("source_id").notNull(), // external id (or our id for manual)
    sourceUrl: text("source_url"),
    privateToOrgId: text("private_to_org_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    funderId: text("funder_id").references(() => funders.id, { onDelete: "set null" }),
    funderName: text("funder_name").notNull(),
    title: text("title").notNull(),
    opportunityNumber: text("opportunity_number"),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    eligibilityText: text("eligibility_text").notNull().default(""),
    applicantTypes: json<string[]>("applicant_types").notNull().default([]),
    categories: json<string[]>("categories").notNull().default([]),
    keywords: json<string[]>("keywords").notNull().default([]),
    geographicScope: text("geographic_scope"),
    awardFloorCents: cents("award_floor_cents"),
    awardCeilingCents: cents("award_ceiling_cents"),
    totalFundingCents: cents("total_funding_cents"),
    expectedAwards: integer("expected_awards"),
    costSharingRequired: integer("cost_sharing_required", { mode: "boolean" }),
    openDate: ts("open_date"),
    closeDate: ts("close_date"), // application deadline (null for forecasts: not announced yet)
    /** Forecasts only: the funder's estimated posting / application due dates (not deadlines). */
    estimatedPostDate: ts("estimated_post_date"),
    estimatedCloseDate: ts("estimated_close_date"),
    status: text("status").$type<OpportunityStatus>().notNull().default("posted"),
    requirements: json<OpportunityRequirements>("requirements"),
    submissionMethod: text("submission_method")
      .$type<SubmissionMethodHint>()
      .notNull()
      .default("unknown"),
    submissionEmail: text("submission_email"),
    /**
     * A person in the owning org confirmed submissionEmail (POST /opportunities/:id/confirm-submission-email).
     * Emails extracted from imported pages / RFPs are untrusted (prompt injection could plant an
     * attacker's address); the email channel never sends to them until confirmed. Public catalog
     * rows from official / curated sources are trusted by source (services/submission/channel.ts).
     */
    submissionEmailVerified: integer("submission_email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    submissionUrl: text("submission_url"),
    /** R2 key of the raw source payload / RFP document (for auditability). */
    rawR2Key: text("raw_r2_key"),
    /** Set when the source page / RFP looked like a prompt injection (null = clean / not scanned). */
    sourceSafetyFlags: json<OpportunitySafetyFlags>("source_safety_flags"),
    contentHash: text("content_hash"),
    fetchedAt: ts("fetched_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("opportunities_source_uq").on(t.source, t.sourceId),
    index("opportunities_close_idx").on(t.status, t.closeDate),
    index("opportunities_private_idx").on(t.privateToOrgId),
  ],
);

export const discoveryRuns = sqliteTable("discovery_runs", {
  id: text("id").primaryKey(), // dsc_...
  source: text("source").$type<OpportunitySource>().notNull(),
  trigger: text("trigger").$type<"cron" | "manual">().notNull(),
  status: text("status").$type<"running" | "succeeded" | "failed">().notNull(),
  query: json<Record<string, unknown>>("query"),
  found: integer("found").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  error: text("error"),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
});

export const opportunityMatches = sqliteTable(
  "opportunity_matches",
  {
    id: text("id").primaryKey(), // mat_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    eligibility: text("eligibility").$type<Eligibility>().notNull().default("unknown"),
    /** 0-100 mission/program fit. */
    fitScore: integer("fit_score").notNull().default(0),
    /** 0-1 estimated probability of award if we apply. */
    likelihood: real("likelihood").notNull().default(0),
    /** Requested amount we would ask for (cents). */
    suggestedAskCents: cents("suggested_ask_cents"),
    /** likelihood x suggested ask, used for ranking and routing. */
    expectedValueCents: cents("expected_value_cents").notNull().default(0),
    /** Rough hours of human time this application would need (for prioritization). */
    effortHours: real("effort_hours"),
    reasons: json<MatchReason[]>("reasons").notNull().default([]),
    status: text("status").$type<MatchStatus>().notNull().default("new"),
    /** Why a person dismissed it (null unless status = dismissed). A soft signal for matching. */
    dismissReason: text("dismiss_reason").$type<DismissReason>(),
    /** Optional free-text note entered with the dismissal (user-entered, max 500 chars). */
    dismissNote: text("dismiss_note"),
    model: text("model"),
    scoredAt: ts("scored_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("matches_org_opp_uq").on(t.orgId, t.opportunityId),
    index("matches_org_rank_idx").on(t.orgId, t.status, t.expectedValueCents),
    // GET /matches + autodraft ORDER BY expected_value DESC, fit DESC with early LIMIT
    // (supersedes matches_org_rank_idx, which `status <> 'dismissed'` can't use; drop it later)
    index("matches_org_ev_idx").on(t.orgId, t.expectedValueCents, t.fitScore),
    // FK cascade from opportunities / SET NULL from projects
    index("matches_opp_idx").on(t.opportunityId),
    index("matches_project_idx").on(t.projectId),
  ],
);
