import { DIGEST_SEND_HOUR_UTC } from "@shared/cash-digest";
import { createApp } from "./app";
import { createAppContext } from "./context";
import type { Env } from "./env";
import { sendWeeklyDigests } from "./services/payapps/digest";
import { sendFirstSendReminders, sendNoJobReminders } from "./services/payapps/onboarding";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // The only cron (wrangler.jsonc, every hour): the weekly "money to chase" email to members whose
  // chosen weekday and hour have come in their own time zone, and on Mondays at 13:00 UTC (one run
  // a week) the getting-started reminders: one to companies with no
  // job yet, one to companies with a job but nothing sent. Each runs on its own, so a failure in one
  // never stops the others.
  scheduled: (controller, env, ctx) => {
    const now = new Date(controller.scheduledTime);
    const appCtx = createAppContext(env, { now: () => now });
    ctx.waitUntil(sendWeeklyDigests(appCtx).then(() => undefined));
    if (now.getUTCDay() === 1 && now.getUTCHours() === DIGEST_SEND_HOUR_UTC) {
      ctx.waitUntil(sendNoJobReminders(appCtx).then(() => undefined));
      ctx.waitUntil(sendFirstSendReminders(appCtx).then(() => undefined));
    }
  },
} satisfies ExportedHandler<Env>;
