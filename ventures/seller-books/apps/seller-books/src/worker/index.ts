import { createApp } from "./app";
import { createAppContext } from "./context";
import type { Env } from "./env";
import { createFetchHandler } from "./http";
import { sendRenewalNotices } from "./services/billing/renewal-notices";
import { sendEstimateReminders } from "./services/books/estimate-reminders";

const fetch = createFetchHandler(createApp());

export default {
  fetch: (request, env, ctx) => fetch(request, env, ctx),
  // The only cron (wrangler.jsonc, daily at 14:00 UTC) sends two emails:
  // - the 1040-ES reminder a week before each estimated-tax due date, to the owners and admins who
  //   turned it on (services/books/estimate-reminders.ts);
  // - the automatic-renewal notice 26 to 39 days before each yearly renewal and each twelve-month
  //   mark of a monthly plan, to owners and admins (services/billing/renewal-notices.ts).
  // Each runs on its own: one failing never stops the other.
  scheduled: (controller, env, ctx) => {
    const now = new Date(controller.scheduledTime);
    const appCtx = createAppContext(env, { now: () => now });
    ctx.waitUntil(
      Promise.allSettled([sendEstimateReminders(appCtx), sendRenewalNotices(appCtx)]).then(
        (results) => {
          for (const r of results) {
            if (r.status === "rejected") {
              appCtx.logger.error("cron.job_failed", { error: String(r.reason) });
            }
          }
        },
      ),
    );
  },
} satisfies ExportedHandler<Env>;
