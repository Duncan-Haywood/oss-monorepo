import { createApp } from "./app";
import { createAppContext } from "./context";
import type { Env } from "./env";
import { createFetchHandler } from "./http";
import { sendEstimateReminders } from "./services/books/estimate-reminders";

const fetch = createFetchHandler(createApp());

export default {
  fetch: (request, env, ctx) => fetch(request, env, ctx),
  // The only cron (wrangler.jsonc, daily at 14:00 UTC): the 1040-ES reminder email a week before each
  // estimated-tax due date, to the owners and admins who turned it on (services/books/estimate-reminders.ts).
  scheduled: (controller, env, ctx) => {
    const now = new Date(controller.scheduledTime);
    const appCtx = createAppContext(env, { now: () => now });
    ctx.waitUntil(sendEstimateReminders(appCtx).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
