// Client-side DTOs for the grant sourcing UI (funder watchlist + foundation prospects), mirroring
// src/worker/routes/org/{watchlist,prospects}.ts. Once src/shared/api/types.ts exports these DTOs,
// they can be replaced by re-exports.
import type { MatchReason } from "@shared/content";

export const WATCH_SOURCE_KINDS = ["rfp_page", "rss", "listing_page"] as const;
export type WatchSourceKind = (typeof WATCH_SOURCE_KINDS)[number];

export const WATCH_SOURCE_STATUSES = ["active", "paused", "error", "blocked_by_robots"] as const;
export type WatchSourceStatus = (typeof WATCH_SOURCE_STATUSES)[number];

/** GET /watchlist item. `orgId: null` = platform-managed source (read-only for orgs). */
export interface WatchSourceDto {
  id: string;
  orgId: string | null;
  url: string;
  label: string | null;
  funderName: string | null;
  kind: WatchSourceKind;
  status: WatchSourceStatus;
  checkIntervalHours: number;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastError: string | null;
  /** "platform" = curated by Grant Autopilot and shared with every org. */
  scope?: "org" | "platform";
  /** True when this viewer may not change the source (platform sources, unless platform admin). */
  readOnly?: boolean;
}

export interface CreateWatchSourceInput {
  url: string;
  label?: string;
  funderName?: string;
  kind?: WatchSourceKind;
}

export type WatchEventKind = "changed" | "opportunity_found" | "error";

/** GET /watchlist/events item (newest first), with the watched page it came from. */
export interface WatchEventDto {
  id?: string;
  sourceId?: string | null;
  kind: WatchEventKind;
  opportunityId: string | null;
  summary: string;
  createdAt: string;
  source?: { id: string; url: string; label: string | null } | null;
}

export const PROSPECT_STATUSES = [
  "new",
  "researching",
  "contacted",
  "applied",
  "declined",
  "not_a_fit",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/** The funder (private foundation) profile joined onto a prospect, from 990-PF data. */
export interface FunderProfileDto {
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  totalAssetsCents: number | null;
  totalGivingCents: number | null;
  latestFilingYear: number | null;
  website: string | null;
  propublicaUrl: string | null;
}

export const PROSPECT_APPROACHES = ["letter_of_inquiry", "wait_for_rfp", "research_first"] as const;
export type ProspectApproach = (typeof PROSPECT_APPROACHES)[number];

/** `factIds` cite the org's fact base; `funderFactIds` cite public data about the foundation. */
export type ProspectReason = MatchReason & { funderFactIds?: string[] };

export interface ProspectDto {
  id: string;
  ein: string;
  /** 0–100, same scale as match fit scores. */
  fitScore: number;
  reasons: ProspectReason[];
  status: ProspectStatus;
  /** "" when empty (the API never stores null notes). */
  notes: string | null;
  /** ISO timestamp of the next planned step, or null. */
  nextStepAt: string | null;
  approach?: ProspectApproach;
  approachNotes?: string;
}

/** The latest prospect refresh, returned next to the list. */
export interface ProspectRunDto {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ProspectListResponse {
  items: ProspectItem[];
  lastRun?: ProspectRunDto | null;
}

/**
 * GET /prospects item: prospect fields plus the joined funder profile. The profile is expected
 * under `funder`; `profile` and flat (top-level) fields are accepted too — see `funderOf`.
 */
export type ProspectItem = ProspectDto & {
  funder?: FunderProfileDto | null;
  profile?: FunderProfileDto | null;
} & Partial<FunderProfileDto>;

export interface UpdateProspectInput {
  status?: ProspectStatus;
  /** Not nullable: send "" to clear. */
  notes?: string;
  /** ISO datetime with offset, or null to clear. */
  nextStepAt?: string | null;
}
