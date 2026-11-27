// Worker entry point (wrangler.jsonc "main"). worker.mjs keeps the site's logic; this adds
// PurgeClock, the Durable Object whose daily alarm runs worker.mjs's purge() in place of a cron
// trigger (purge-clock.mjs: the Free plan allows 5 per account), so worker.mjs's own
// `scheduled` handler no longer runs.
import { purgeClockClass, withPurgeClock } from "./purge-clock.mjs";
import worker, { purge } from "./worker.mjs";

export const PurgeClock = purgeClockClass(async (env) => {
  await purge(env);
  return null; // purge() does not count the rows it deletes
});

export default withPurgeClock(worker);
