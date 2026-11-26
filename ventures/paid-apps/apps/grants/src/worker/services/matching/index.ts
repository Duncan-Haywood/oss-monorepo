// Public API of the matching module for other modules: import from "@worker/services/matching".
export {
  AUTODRAFT_MIN_DAYS_TO_DEADLINE,
  AUTODRAFT_MIN_FIT,
  runAutopilotDrafting,
} from "./autodraft";
export type { AutoDraftInput, MatchingDeps } from "./deps";
export {
  applyDismissalSignal,
  DISMISS_FIT_PENALTY,
  DISMISS_SIGNAL_REASONS,
  type DismissalSignal,
  dismissalAdjustment,
  MAX_DISMISS_FIT_PENALTY,
} from "./dismissal-signal";
export {
  INBOX_DEFAULT_LIMIT,
  INBOX_MAX_LIMIT,
  type InboxItem,
  listInbox,
} from "./inbox";
export {
  bulkUpdateMatchStatus,
  type DismissalInput,
  listMatches,
  type MatchWithOpportunity,
  USER_MATCH_STATUSES,
  type UserMatchStatus,
  updateMatchStatus,
} from "./matches";
export {
  applicantCompatibility,
  classifyApplicantType,
  geographyCompatibility,
  type PrefilterResult,
  prefilter,
} from "./prefilter";
export {
  MAX_LLM_SCORES_PER_RUN,
  RESCORE_AFTER_DAYS,
  type ScoreOrgResult,
  scoreOrgMatches,
} from "./score-org";
export { finalizeScore, MATCH_SCORE_PURPOSE, MatchScoreOutput } from "./scoring";

import type { AppContext } from "../../context";
import { enqueue } from "../../queues/enqueue";

/** Queue a (re)score of an org's matches, e.g. after discovery, onboarding or new facts. */
export async function requestScoreOrg(
  ctx: AppContext,
  orgId: string,
  opportunityIds?: string[],
): Promise<void> {
  await enqueue(ctx, {
    type: "matching.score_org",
    orgId,
    ...(opportunityIds?.length ? { opportunityIds } : {}),
  });
}
