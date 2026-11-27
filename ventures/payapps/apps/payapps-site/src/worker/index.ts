// Worker entry: the early-access API (static pages are served by Workers static assets from dist/)
// and PurgeClock, the Durable Object whose daily alarm deletes never-confirmed sign-ups (it
// replaced the cron trigger: purge-clock.ts).
import { createApp, stripBasePath } from "./app";
import { armPurgeClock, type PurgeClockEnv, purgeClockClass } from "./purge-clock";
import { purgePending } from "./signups";

const app = createApp();

export const PurgeClock = purgeClockClass((env: CloudflareBindings) =>
  purgePending(env.DB, new Date()),
);

export default {
  fetch(request, env, ctx) {
    ctx.waitUntil(armPurgeClock(env as CloudflareBindings & PurgeClockEnv));
    return app.fetch(stripBasePath(request, env.SITE_URL), env, ctx);
  },
} satisfies ExportedHandler<CloudflareBindings>;
