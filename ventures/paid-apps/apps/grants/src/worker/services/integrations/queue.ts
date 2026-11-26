// Queue messages for this module (ids only, never URLs or text). Until the integration pass adds
// them to queues/messages.ts + handlers.ts, enqueueIntegrationJob() dispatches inline jobs (tests,
// INLINE_JOBS) to the handlers below itself, and sends to JOBS otherwise.
import type { AppContext } from "../../context";
import type { JobMessage } from "../../queues/messages";

export type IntegrationJobMessage =
  | { type: "integrations.deliver"; orgId: string; deliveryId: string }
  | { type: "integrations.slack_followup"; orgId: string; receiptId: string };

export async function enqueueIntegrationJob(
  ctx: AppContext,
  job: IntegrationJobMessage,
  opts: { delaySeconds?: number } = {},
): Promise<void> {
  const inline = ctx.env.APP_ENV === "test" || ctx.env.INLINE_JOBS === "true";
  if (inline) {
    const { runIntegrationJob } = await import("./jobs");
    await runIntegrationJob(ctx, job);
    return;
  }
  // Same JOBS queue; the cast goes away once JobMessage includes IntegrationJobMessage.
  await ctx.env.JOBS.send(
    job as unknown as JobMessage,
    opts.delaySeconds ? { delaySeconds: opts.delaySeconds } : undefined,
  );
}
