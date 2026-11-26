// GET /api/orgs/:orgId/home: the org's personalized "grant plan" (services/home). Built only from
// this org's own rows; nothing here is aggregated across tenants.
import type { MemberRole } from "../enums";

export interface HomeGreeting {
  /** First word of the signed-in user's name; null when the name is empty or an email address. */
  firstName: string | null;
  orgName: string;
  role: MemberRole;
  /** The org's own profile focus areas, e.g. ["workforce development", "construction trades"]. */
  focusAreas: string[];
  serviceAreas: string[];
  /** e.g. "501(c)(3) nonprofit". */
  orgTypeLabel: string;
  /** "City, ST" from the profile, if set. */
  location: string | null;
}

export const NEXT_ACTION_KINDS = [
  "upload_documents",
  "onboarding_interview",
  "confirm_submission",
  "answer_questions",
  "review_draft",
  "revise_draft",
  "fill_gap",
  "confirm_facts",
  "add_uei",
  "start_draft",
  "new_matches",
] as const;
export type NextActionKind = (typeof NEXT_ACTION_KINDS)[number];

export interface NextBestAction {
  /** Stable key, e.g. "review_draft:app_123". */
  id: string;
  kind: NextActionKind;
  title: string;
  reason: string;
  /** In-app path, always under /orgs/{orgId}/. */
  href: string;
  /** Short call to action for the link, e.g. "Review draft". */
  cta: string;
  priority: "high" | "medium" | "low";
  /** ISO deadline the action is racing, if any. */
  dueAt: string | null;
}

export interface CalendarEntry {
  /** "app:{applicationId}" or "match:{matchId}". */
  id: string;
  kind: "application" | "match";
  title: string;
  funderName: string;
  /** ISO deadline. */
  date: string;
  daysLeft: number;
  /** Application status, or the match status ("new" | "shortlisted"). */
  status: string;
  href: string;
}

export interface CalendarMonth {
  /** "YYYY-MM" (UTC). */
  month: string;
  /** e.g. "December 2026". */
  label: string;
  entries: CalendarEntry[];
}

export interface HomeCalendar {
  windowDays: number;
  from: string;
  to: string;
  /** Every month the window touches, in order, including months with no deadlines. */
  months: CalendarMonth[];
  total: number;
}

export interface PipelineValue {
  /** Sum of expected value (likelihood x ask) over shortlisted + drafting matches. */
  expectedValueCents: number;
  shortlistedCount: number;
  draftingCount: number;
  awardedCents: number;
  awardedCount: number;
  declinedCount: number;
  /** awarded / (awarded + declined); null until at least one outcome is recorded. */
  winRate: number | null;
}

/** Mirrors services/review/automation.ts AUTOMATION_LEVELS (least to most automated). */
export type HomeAutomationLevel = "manual" | "assisted" | "prepared" | "supervised" | "full";

export interface AutomationSummary {
  level: HomeAutomationLevel;
  /** The level preset's label and description (services/review/automation.ts). */
  label: string;
  description: string;
  /** Autopilot may submit without a person at this org's effective settings. */
  autoSubmit: boolean;
  /** Ceiling for auto-submitted asks, when one applies (supervised autopilot). */
  autoSubmitMaxCents: number | null;
  waitingOnHumans: {
    reviews: number;
    questions: number;
    changesRequested: number;
    manualSubmissions: number;
    proposedFacts: number;
    total: number;
  };
  href: string;
}

export interface HomePlanDto {
  generatedAt: string;
  /** No documents, facts or applications yet. */
  firstRun: boolean;
  greeting: HomeGreeting;
  nextBestActions: NextBestAction[];
  calendar: HomeCalendar;
  pipelineValue: PipelineValue;
  automationSummary: AutomationSummary;
}
