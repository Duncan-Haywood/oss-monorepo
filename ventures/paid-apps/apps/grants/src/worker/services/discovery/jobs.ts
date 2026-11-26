// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
import type { AppContext } from "../../context";
import type { JobOf } from "../../queues/messages";
import { ensureRequirements } from "./requirements";
import { runDiscoveryForSource } from "./run";

export async function parseRequirements(
  ctx: AppContext,
  job: JobOf<"opportunity.parse_requirements">,
): Promise<void> {
  await ensureRequirements(ctx, job.opportunityId, { orgId: job.orgId });
}

export async function runDiscovery(ctx: AppContext, job: JobOf<"discovery.run">): Promise<void> {
  await runDiscoveryForSource(ctx, job.source, job.trigger);
}
