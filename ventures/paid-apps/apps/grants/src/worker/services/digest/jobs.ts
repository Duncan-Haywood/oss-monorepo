// Queue job handlers for this module (wired in queues/handlers.ts). Both are safe to rerun.
import type { AppContext } from "../../context";
import { sendDeadlineNudges, sendWeeklyDigests } from "./send";

/** Monday cron: the weekly digest for every org with something to report. */
export async function runWeeklyDigest(
  ctx: AppContext,
  _job: { type: "digest.weekly" },
): Promise<void> {
  const result = await sendWeeklyDigests(ctx, ctx.now());
  ctx.logger.info("digest.weekly", { ...result });
}

/** Daily cron: deadline nudges at 14, 7, 3 and 1 days out. */
export async function runDeadlineNudges(
  ctx: AppContext,
  _job: { type: "digest.deadlines" },
): Promise<void> {
  const result = await sendDeadlineNudges(ctx, ctx.now());
  ctx.logger.info("digest.deadlines", { ...result });
}
