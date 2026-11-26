// Opportunity triage contracts (worker <-> client): why a person dismissed a match, the bulk
// shortlist/dismiss call and the GET /matches/inbox view. Dismiss reasons are stored on the match and
// feed matching as a soft signal (services/matching/dismissal-signal.ts).
import type { MatchDto, OpportunityDto } from "./api/types";
import type { CheckStatus, CriterionKind, EligibilityOverall } from "./eligibility";

export const DISMISS_REASONS = [
  "not_eligible",
  "wrong_focus",
  "too_small",
  "too_much_effort",
  "deadline",
  "other",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

export const DISMISS_REASON_LABELS: Record<DismissReason, { label: string; hint: string }> = {
  not_eligible: { label: "Not eligible", hint: "We don't meet a funder requirement." },
  wrong_focus: { label: "Wrong focus", hint: "Not our mission or programs." },
  too_small: { label: "Too small", hint: "The award isn't worth the application." },
  too_much_effort: { label: "Too much effort", hint: "The application is too heavy for us." },
  deadline: { label: "Deadline", hint: "Not enough time before it closes." },
  other: { label: "Other", hint: "Something else (add a note)." },
};

/** Free-text note stored with a dismissal. */
export const MAX_DISMISS_NOTE_CHARS = 500;
/** POST /matches/bulk accepts at most this many ids. */
export const MAX_BULK_MATCH_IDS = 100;
export const BULK_MATCH_STATUSES = ["shortlisted", "dismissed"] as const;
export type BulkMatchStatus = (typeof BULK_MATCH_STATUSES)[number];

/** POST /api/orgs/:orgId/matches/bulk response. */
export interface BulkMatchResult {
  /** Ids whose status (or dismiss reason) changed. */
  updated: string[];
  /** Ids already in the requested state. */
  unchanged: string[];
  /** Matches that already have an application (drafting / applied): left untouched. */
  skipped: { id: string; status: MatchDto["status"] }[];
  /** Ids that are not this org's matches. */
  notFound: string[];
}

/** The stored eligibility check for the match's opportunity, condensed for the inbox. */
export interface InboxEligibility {
  overall: EligibilityOverall;
  checkedAt: string;
  items: { criterionId: string; kind: CriterionKind; status: CheckStatus; text: string }[];
}

export type InboxOpportunity = Pick<
  OpportunityDto,
  | "id"
  | "title"
  | "funderId"
  | "funderName"
  | "summary"
  | "status"
  | "closeDate"
  | "estimatedCloseDate"
  | "awardFloorCents"
  | "awardCeilingCents"
  | "opportunityNumber"
  | "source"
  | "sourceUrl"
>;

export type InboxItemDto = MatchDto & {
  opportunity: InboxOpportunity;
  /** null when eligibility has not been checked for this opportunity yet. */
  eligibilityCheck: InboxEligibility | null;
};

/** GET /api/orgs/:orgId/matches/inbox: status "new", highest expected value first. */
export interface InboxResponse {
  items: InboxItemDto[];
  /** All new matches in the inbox (items may be truncated by `limit`). */
  total: number;
}
