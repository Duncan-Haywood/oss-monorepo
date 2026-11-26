// Queue job handlers for this module (wire into queues/handlers.ts in the integration pass).
import type { AppContext } from "../../context";
import { deliverIntegration } from "./deliver";
import type { IntegrationJobMessage } from "./queue";
import { slackUpdateFollowup } from "./slack-command";

export { deliverIntegration, slackUpdateFollowup };

export async function runIntegrationJob(ctx: AppContext, job: IntegrationJobMessage) {
  if (job.type === "integrations.deliver") return deliverIntegration(ctx, job);
  return slackUpdateFollowup(ctx, job);
}
