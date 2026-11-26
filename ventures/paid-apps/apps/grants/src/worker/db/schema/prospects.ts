// Foundation prospecting (OWNER: prospecting). `funder_profiles` is a global catalog of public IRS
// Form 990-PF data (via the ProPublica Nonprofit Explorer API); `org_prospects` is each tenant's
// private pipeline of foundations to research / approach. See docs/PROSPECTING.md.
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization } from "./auth";

/** IRS EO BMF foundation code, simplified (02/03 operating, 04 non-operating, 10-24 public charity). */
export const FOUNDATION_TYPES = [
  "private_non_operating",
  "private_operating",
  "private_foundation", // files 990-PF, BMF foundation code not available
  "public_charity",
  "unknown",
] as const;
export type FoundationType = (typeof FOUNDATION_TYPES)[number];

/** Where a funder profile came from. "sample" = fictional offline-demo fixture (FAKE_EXTERNALS). */
export const FUNDER_PROFILE_SOURCES = ["propublica", "sample"] as const;
export type FunderProfileSource = (typeof FUNDER_PROFILE_SOURCES)[number];

export const PROSPECT_STATUSES = [
  "new",
  "researching",
  "contacted",
  "applied",
  "declined",
  "not_a_fit",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/** How to approach the funder. Private foundations rarely post RFPs. */
export const PROSPECT_APPROACHES = ["letter_of_inquiry", "wait_for_rfp", "research_first"] as const;
export type ProspectApproach = (typeof PROSPECT_APPROACHES)[number];

/**
 * One reason behind a fit score. `factIds` cite the org's fact base (fct_...); `funderFactIds` cite
 * the numbered public-data facts about the foundation given to the model (e.g. "ff_giving").
 * Both are filtered deterministically to ids that were actually provided.
 */
export interface ProspectReason {
  text: string;
  polarity: "positive" | "negative" | "neutral";
  factIds: string[];
  funderFactIds: string[];
}

/** Global, public data: one row per EIN. Never holds tenant data. */
export const funderProfiles = sqliteTable(
  "funder_profiles",
  {
    /** 9-digit EIN without dash, e.g. "850457010". */
    ein: text("ein").primaryKey(),
    source: text("source").$type<FunderProfileSource>().notNull().default("propublica"),
    name: text("name").notNull(),
    city: text("city"),
    state: text("state"),
    nteeCode: text("ntee_code"),
    /** 501(c) subsection, e.g. 3 = 501(c)(3). */
    subsectionCode: integer("subsection_code"),
    foundationType: text("foundation_type").$type<FoundationType>().notNull().default("unknown"),
    /** Tax year of the most recent filing with extracted financial data. */
    latestFilingYear: integer("latest_filing_year"),
    /** Form type of that filing: 0 = 990, 1 = 990-EZ, 2 = 990-PF. */
    latestFormType: integer("latest_form_type"),
    totalAssetsCents: cents("total_assets_cents"),
    /** 990-PF Part I line 25 col (a), "Contributions, gifts, grants paid"; null = not reported. */
    totalGivingCents: cents("total_giving_cents"),
    website: text("website"),
    propublicaUrl: text("propublica_url"),
    /** R2 key of the cached raw organization JSON (catalog/propublica/...). */
    rawR2Key: text("raw_r2_key"),
    fetchedAt: ts("fetched_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("funder_profiles_state_idx").on(t.state, t.foundationType)],
);

/** Per-tenant prospect pipeline. status / notes / nextStepAt are user-owned and never overwritten by refresh. */
export const orgProspects = sqliteTable(
  "org_prospects",
  {
    id: text("id").primaryKey(), // prs_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ein: text("ein")
      .notNull()
      .references(() => funderProfiles.ein, { onDelete: "cascade" }),
    /** 0-100, after deterministic caps. */
    fitScore: integer("fit_score").notNull().default(0),
    reasons: json<ProspectReason[]>("reasons").notNull().default([]),
    approach: text("approach").$type<ProspectApproach>().notNull().default("research_first"),
    approachNotes: text("approach_notes").notNull().default(""),
    status: text("status").$type<ProspectStatus>().notNull().default("new"),
    notes: text("notes").notNull().default(""),
    nextStepAt: ts("next_step_at"),
    /** Hash of the scoring inputs; unchanged inputs skip the LLM on refresh. */
    scoreInputHash: text("score_input_hash"),
    scoredAt: ts("scored_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("org_prospects_org_ein_uq").on(t.orgId, t.ein),
    index("org_prospects_org_rank_idx").on(t.orgId, t.status, t.fitScore),
  ],
);

/** One row per prospect refresh (rate limiting: one per org per hour; status for the UI). */
export const prospectRuns = sqliteTable(
  "prospect_runs",
  {
    id: text("id").primaryKey(), // prr_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status").$type<"queued" | "running" | "succeeded" | "failed">().notNull(),
    requestedBy: text("requested_by"),
    counts: json<Record<string, number>>("counts"),
    error: text("error"),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("prospect_runs_org_idx").on(t.orgId, t.startedAt)],
);
