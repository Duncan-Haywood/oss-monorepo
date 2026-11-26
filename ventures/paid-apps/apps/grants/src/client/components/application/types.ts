// Response shapes for the applications / reviews / submissions endpoints (see ARCHITECTURE.md
// "Endpoint contract", services/pipeline/queries.ts, services/review/index.ts, routes/org/submissions.ts).
import type {
  ApplicationDto,
  ApplicationVersionDto,
  FactDto,
  FeedbackDto,
  FlagDto,
  FollowupDto,
  OpportunityDto,
  SubmissionDto,
} from "@shared/api/types";
import type { SubmissionMethodHint } from "@shared/enums";

export interface OpportunitySummary {
  id: string;
  title: string;
  funderName: string;
  closeDate: string | null;
}

/** GET /applications → items. */
export type ApplicationListItem = ApplicationDto & { opportunity: OpportunitySummary | null };

export interface VersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
  authorType: "system" | "user";
}

/** GET /applications/:id */
export type ApplicationDetail = ApplicationDto & {
  opportunity: OpportunityDto;
  currentVersion: ApplicationVersionDto | null;
  versions: VersionSummary[];
  flags: FlagDto[];
  citedFacts: FactDto[];
  submissions: SubmissionDto[];
};

/** GET /reviews/queue → items. */
export type ReviewQueueItem = ApplicationDto & {
  opportunity: OpportunitySummary;
  openBlockers: number;
  openWarnings: number;
};

/** GET /applications/:id/cost */
export interface CostSummary {
  costMicros: number;
  calls: number;
}

/** submissions.metadata.guide for manual-channel submissions (services/submission/channel.ts). */
export interface ManualGuide {
  method: SubmissionMethodHint;
  title: string;
  url: string | null;
  steps: string[];
  notes: string[];
}

/** GET /submissions → items. */
export type SubmissionListItem = SubmissionDto & {
  application: { id: string; title: string } | null;
};

/** GET /submissions/followups → items. */
export type FollowupListItem = FollowupDto & {
  application?: { id: string; title: string } | null;
};

export type FeedbackItem = FeedbackDto;

export type PackageIntegrity = "verified" | "mismatch" | "unknown";
