// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
import type { AppContext } from "../../context";
import type { JobOf } from "../../queues/messages";
import { defaultMatchingDeps } from "./deps";
import { scoreOrgMatches } from "./score-org";

export async function scoreOrg(ctx: AppContext, job: JobOf<"matching.score_org">): Promise<void> {
  await scoreOrgMatches(
    ctx,
    { orgId: job.orgId, opportunityIds: job.opportunityIds },
    defaultMatchingDeps,
  );
}
