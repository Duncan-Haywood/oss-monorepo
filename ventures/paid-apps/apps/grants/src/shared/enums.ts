// Domain enums shared by the database schema, API contracts and the UI.
// Changing a value here is a breaking change: add values, don't rename them.

export const MEMBER_ROLES = ["owner", "admin", "editor", "reviewer", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ordered from least to most privileged; used by requireRole(). */
export const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 0,
  reviewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export const ORG_TYPES = [
  "nonprofit_501c3",
  "tribal_government",
  "tribal_organization",
  "faith_based",
  "community_based",
  "educational",
  "government",
  "fiscally_sponsored",
  "other",
] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const DOCUMENT_KINDS = [
  "mission_statement",
  "charter_bylaws",
  "annual_report",
  "financial_statement",
  "budget",
  "program_description",
  "past_application",
  "award_letter",
  "rejection_letter",
  "letter_of_support",
  "interview_transcript",
  "website_page",
  "policy",
  "other",
  "update_note", // a short "what's new" note typed or dictated by staff (company updates)
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ["uploaded", "processing", "ready", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Outcome of a past application uploaded as a reference document. */
export const PAST_OUTCOMES = ["awarded", "declined", "pending", "unknown"] as const;
export type PastOutcome = (typeof PAST_OUTCOMES)[number];

export const FACT_CATEGORIES = [
  "identity",
  "mission",
  "history",
  "program",
  "population_served",
  "geography",
  "outcome",
  "metric",
  "financial",
  "staff",
  "governance",
  "partner",
  "capacity",
  "project",
  "other",
] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

/**
 * proposed  – extracted by the system, not yet confirmed by a human. May be used in drafts
 *             but every claim citing it is flagged for review.
 * confirmed – a human confirmed it. Safe for autopilot.
 * rejected  – a human said it is wrong. Never used.
 * superseded – replaced by a newer fact (supersededById).
 */
export const FACT_STATUSES = ["proposed", "confirmed", "rejected", "superseded"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const FACT_SOURCE_TYPES = ["document", "interview", "user_entered", "website"] as const;
export type FactSourceType = (typeof FACT_SOURCE_TYPES)[number];

/** restricted facts (e.g. about individual clients) are never sent to drafting. */
export const SENSITIVITY_LEVELS = ["public", "internal", "restricted"] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

export const PROJECT_STATUSES = ["idea", "planned", "active", "funded", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const INTERVIEW_KINDS = [
  "onboarding",
  "follow_up",
  "project",
  "gap_fill",
  "transcript_upload",
  "update", // short "What's new?" check-in driven by stale facts
] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const INTERVIEW_STATUSES = ["active", "completed", "abandoned"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_MODES = ["ai_chat", "human_transcript", "dictation"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const TURN_ROLES = ["interviewer", "respondent"] as const;
export type TurnRole = (typeof TURN_ROLES)[number];

export const INPUT_MODES = ["text", "voice"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const FUNDER_TYPES = [
  "federal",
  "state",
  "local",
  "foundation",
  "corporate",
  "tribal",
  "other",
] as const;
export type FunderType = (typeof FUNDER_TYPES)[number];

export const OPPORTUNITY_SOURCES = [
  "grants_gov",
  "simpler_grants",
  "manual",
  "url_import",
  "rfp_upload",
] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_STATUSES = ["forecasted", "posted", "closed", "archived"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const SUBMISSION_METHODS = ["grants_gov", "email", "portal", "mail", "unknown"] as const;
export type SubmissionMethodHint = (typeof SUBMISSION_METHODS)[number];

export const ELIGIBILITY = ["eligible", "likely_eligible", "unknown", "ineligible"] as const;
export type Eligibility = (typeof ELIGIBILITY)[number];

export const MATCH_STATUSES = ["new", "shortlisted", "dismissed", "drafting", "applied"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "draft_queued",
  "drafting",
  "verifying",
  "needs_info",
  "in_review",
  "changes_requested",
  "approved",
  "submitting",
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
  "failed",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * auto        – fully automated submission (low value, high confidence, zero blockers, autopilot on)
 * one_click   – prepared package + exec summary + flags; a human approves with one click
 * full_review – high value or low confidence: a human reviews section by section
 */
export const REVIEW_TIERS = ["auto", "one_click", "full_review"] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

export const FLAG_SEVERITIES = ["blocker", "warning", "info"] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

export const FLAG_KINDS = [
  "unsupported_claim",
  "unconfirmed_fact",
  "numeric_mismatch",
  "missing_info",
  "stale_fact",
  "eligibility_risk",
  "length_limit",
  "policy",
  "restricted_data",
  "other",
] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export const FLAG_STATUSES = ["open", "resolved", "dismissed"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export const REVIEW_DECISIONS = ["approved", "changes_requested", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const SUBMISSION_CHANNELS = ["email", "manual", "grants_gov_s2s", "portal"] as const;
export type SubmissionChannel = (typeof SUBMISSION_CHANNELS)[number];

export const SUBMISSION_STATUSES = ["pending", "sent", "confirmed", "failed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const FOLLOWUP_KINDS = [
  "deadline_reminder",
  "status_check",
  "report_due",
  "thank_you",
  "resubmission",
  "custom",
] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export const FOLLOWUP_STATUSES = ["pending", "done", "skipped"] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const CONSENT_SCOPES = [
  "data_processing",
  "document_upload",
  "website_crawl",
  "ai_interview",
  "voice_recording",
  "terms_of_service",
  "privacy_policy",
  "autopilot_submission",
] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const ACTOR_TYPES = ["user", "system", "autopilot"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const EXPORT_STATUSES = ["pending", "ready", "failed", "expired"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "comp", // complimentary (pilot partners), no payment provider involved
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const USAGE_KINDS = [
  "application_draft",
  "opportunity_match",
  "interview_session",
  "document_ingest",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];
