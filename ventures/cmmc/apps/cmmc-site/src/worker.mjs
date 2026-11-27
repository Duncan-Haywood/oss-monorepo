// Worker entry point. Only the entry points live here: workerd treats every named export of the
// main module as an entrypoint, so the logic and its constants are in early-access.mjs.
// PurgeClock is the Durable Object whose daily alarm deletes never-confirmed sign-ups; it
// replaced the cron trigger (purge-clock.mjs), so handler.scheduled no longer runs.
import { handler, purgePending } from "./early-access.mjs";
import { purgeClockClass, withPurgeClock } from "./purge-clock.mjs";

export const PurgeClock = purgeClockClass((env) => purgePending(env));

export default withPurgeClock(handler);
