// Tenant profile + settings (1:1 with organization).
import type { OrgType } from "@shared/enums";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bool, cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

/** User-entered identity details used on application forms. Substantive claims live in `facts`. */
export const orgProfiles = sqliteTable("org_profiles", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  dba: text("dba"),
  orgType: text("org_type").$type<OrgType>().notNull().default("nonprofit_501c3"),
  ein: text("ein"),
  uei: text("uei"), // SAM.gov Unique Entity ID (required for federal grants)
  websiteUrl: text("website_url"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").notNull().default("US"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  foundedYear: integer("founded_year"),
  /** Free-text areas of work used by discovery keyword search, e.g. ["workforce development"]. */
  focusAreas: json<string[]>("focus_areas").notNull().default([]),
  /** Geographic service areas, e.g. ["Gallup, NM", "McKinley County, NM", "Navajo Nation"]. */
  serviceAreas: json<string[]>("service_areas").notNull().default([]),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Review-routing policy and privacy settings. Defaults are conservative: autopilot off,
 * everything routed to human review until the org opts in.
 */
export const orgSettings = sqliteTable("org_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  // --- review routing (owned by review/pipeline module) ---
  autopilotEnabled: bool("autopilot_enabled").notNull().default(false),
  /** Requests at or below this amount may be auto-submitted (if every other gate passes). */
  autoSubmitMaxCents: cents("auto_submit_max_cents").notNull().default(1_000_000), // $10k
  /** Requests above this amount always get full section-by-section review. */
  fullReviewAboveCents: cents("full_review_above_cents").notNull().default(10_000_000), // $100k
  /** Fit score (0-100) required for auto-submission. */
  minFitScoreForAuto: integer("min_fit_score_for_auto").notNull().default(80),
  /** Likelihood (0-1) at or above which a grant is "high likelihood" and gets human review. */
  highLikelihoodThreshold: real("high_likelihood_threshold").notNull().default(0.6),
  /** First submission to any funder always goes through a human. */
  reviewFirstSubmissionPerFunder: bool("review_first_submission_per_funder")
    .notNull()
    .default(true),
  maxAutoSubmissionsPerMonth: integer("max_auto_submissions_per_month").notNull().default(5),
  /** Allow drafts to cite `proposed` (unconfirmed) facts; such claims are always flagged. */
  allowUnconfirmedFactsInDrafts: bool("allow_unconfirmed_facts_in_drafts").notNull().default(true),
  /** How many matches to auto-draft per discovery run (0 = never auto-draft). */
  autoDraftTopN: integer("auto_draft_top_n").notNull().default(3),
  // --- automation level (services/review/automation.ts, ADR 0006) ---
  /**
   * Preset: manual | assisted | prepared | supervised | full. null = legacy row: derived from
   * autopilotEnabled (true → supervised, false → prepared, the recommended default). Kept in
   * sync with autopilotEnabled by PATCH /settings.
   */
  automationLevel: text("automation_level").$type<
    "manual" | "assisted" | "prepared" | "supervised" | "full"
  >(),
  /** Per-stage human checkpoints. null = the preset's default (see presetDefaults). */
  requireMatchApproval: bool("require_match_approval"),
  /** Forced true for supervised/full (also a safety rail). */
  requireFactConfirmation: bool("require_fact_confirmation"),
  requireDraftReview: bool("require_draft_review"),
  requireSubmissionApproval: bool("require_submission_approval"),
  requireFollowupApproval: bool("require_followup_approval"),
  /** Asks above this need two different approving reviewers. null = off. */
  twoPersonRuleAboveCents: cents("two_person_rule_above_cents"),
  notifyEmails: json<string[]>("notify_emails").notNull().default([]),
  // --- privacy (owned by privacy module) ---
  allowWebsiteCrawl: bool("allow_website_crawl").notNull().default(false),
  storeVoiceRecordings: bool("store_voice_recordings").notNull().default(false),
  /** Days to keep raw uploaded files after processing; null = keep until deleted. */
  rawFileRetentionDays: integer("raw_file_retention_days"),
  dataPolicyVersion: text("data_policy_version"),
  dataPolicyAcceptedAt: ts("data_policy_accepted_at"),
  dataPolicyAcceptedBy: text("data_policy_accepted_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
