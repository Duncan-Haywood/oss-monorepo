// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
import type { AppContext } from "../../context";
import type { JobOf } from "../../queues/messages";
import { sendDueLetterReminders } from "../attachments/letters";
import { sendDueFollowups } from "./followups";

/** Cron (every 30 min): email reminders for due follow-ups. Safe to run concurrently / repeatedly. */
export async function runDueFollowups(
  ctx: AppContext,
  _job: JobOf<"followups.run_due">,
): Promise<void> {
  // Partner letter-of-support reminders first: they claim their own followups rows
  // (support_letter:*) so the team sweep below does not email the team about them.
  try {
    ctx.logger.info("followups.letter_reminders", await sendDueLetterReminders(ctx));
  } catch (e) {
    ctx.logger.error("followups.letter_reminders_failed", { error: String(e).slice(0, 200) });
  }
  const result = await sendDueFollowups(ctx);
  ctx.logger.info("followups.run_due", result);
}
