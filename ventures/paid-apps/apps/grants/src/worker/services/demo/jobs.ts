// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
import type { AppContext } from "../../context";
import { demoSessionsAllowed, sweepExpiredDemoSessions } from "./sessions";

/**
 * Hourly (demo deployment cron): delete expired one-click demo sessions. A no-op unless
 * DEMO_MODE=true and FAKE_EXTERNALS=true, so it can never run against production data.
 */
export async function cleanupExpiredSessions(
  ctx: AppContext,
  _job: { type: "demo.cleanup_expired" },
): Promise<void> {
  if (!demoSessionsAllowed(ctx.env)) {
    ctx.logger.info("demo.cleanup.skipped", { reason: "not_a_demo_deployment" });
    return;
  }
  await sweepExpiredDemoSessions(ctx);
}
