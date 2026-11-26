import { createApp } from "./app";
import { createAppContext } from "./context";
import type { Env } from "./env";
import { remindAffirmationsDue } from "./services/affirmations/reminders";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // The only cron (wrangler.jsonc, daily at 11:23 UTC, after midnight in every US time zone): the
  // affirmation reminder email 60 and 7 days before a date falls due (services/affirmations/reminders.ts).
  scheduled: (controller, env, ctx) => {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(
      remindAffirmationsDue(createAppContext(env, { now: () => now })).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env>;
