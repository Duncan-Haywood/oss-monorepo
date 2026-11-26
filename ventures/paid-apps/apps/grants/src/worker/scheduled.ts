// Cron dispatcher (wrangler.jsonc triggers). Keep crons cheap: enqueue jobs, don't do work inline.
import { createAppContext } from "./context";
import type { Env } from "./env";
import { enqueue } from "./queues/enqueue";
import { purgeStalePending, sendDueSequenceEmails } from "./services/marketing";
import { runDueChecks } from "./services/watchlist";

/** Hourly, demo deployment only (scripts/provision.mjs adds it there; production never has it). */
export const DEMO_CLEANUP_CRON = "41 * * * *";

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  execCtx: ExecutionContext,
) {
  const ctx = createAppContext(env, { executionCtx: execCtx });
  if (controller.cron === "*/30 * * * *") {
    await enqueue(ctx, { type: "followups.run_due" });
    ctx.defer(
      runDueChecks(ctx).catch((e) =>
        ctx.logger.warn("watchlist.run_due_failed", { error: String(e) }),
      ),
    );
    // Newsletter welcome/nurture sequence. A no-op (no queries) unless MARKETING_EMAIL_ENABLED=true
    // and a postal address is configured (services/marketing/config.ts).
    ctx.defer(
      sendDueSequenceEmails(ctx)
        .then((r) => {
          if (!r.skipped) ctx.logger.info("newsletter.sequence_run", { ...r });
        })
        .catch((e) => ctx.logger.warn("newsletter.sequence_failed", { error: String(e) })),
    );
    return;
  }
  if (controller.cron === DEMO_CLEANUP_CRON) {
    // Expired one-click demo sessions (the job is a no-op unless DEMO_MODE + FAKE_EXTERNALS).
    if (env.DEMO_MODE === "true") await enqueue(ctx, { type: "demo.cleanup_expired" });
    return;
  }
  // Daily: discovery from official APIs (matching is triggered per org when discovery finishes),
  // plus the privacy retention sweep, deadline nudges and (on Mondays) the weekly digest.
  await enqueue(ctx, { type: "discovery.run", source: "grants_gov", trigger: "cron" });
  if (env.SIMPLER_GRANTS_API_KEY) {
    await enqueue(ctx, { type: "discovery.run", source: "simpler_grants", trigger: "cron" });
  }
  await enqueue(ctx, { type: "privacy.retention_sweep" });
  await enqueue(ctx, { type: "digest.deadlines" });
  // Never-confirmed newsletter signups older than 30 days are deleted (runs even while sending is off).
  ctx.defer(
    purgeStalePending(ctx)
      .then((n) => ctx.logger.info("newsletter.pending_purged", { count: n }))
      .catch((e) => ctx.logger.warn("newsletter.pending_purge_failed", { error: String(e) })),
  );
  if (new Date(controller.scheduledTime).getUTCDay() === 1) {
    await enqueue(ctx, { type: "digest.weekly" });
  }
}
