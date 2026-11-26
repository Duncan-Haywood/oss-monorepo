// Queue job handler for this module (wired into queues/handlers.ts by the integration pass:
// message { type: "prospecting.build"; orgId; runId }).
import type { AppContext } from "../../context";
import { runProspectRefresh } from "./prospects";

export interface ProspectingBuildJob {
  type: "prospecting.build";
  orgId: string;
  runId: string;
}

export async function buildOrgProspects(ctx: AppContext, job: ProspectingBuildJob): Promise<void> {
  await runProspectRefresh(ctx, job.orgId, job.runId);
}
