// The daily purge of never-confirmed sign-ups, run by a Durable Object alarm instead of a cron
// trigger. The Workers Free plan allows 5 cron triggers per account and the repository's Workers
// configured 8 (platform/ci/cron_budget.py; prompts/process/backlog/P098); alarms are not cron
// triggers, and SQLite-backed Durable Objects are on the Free plan.
//
// Any request that reaches the Worker arms the clock (once per isolate), so a sign-up row never
// exists without an armed clock. From then on the alarm re-arms itself every day, with or without
// traffic, which keeps the privacy page's promise (unconfirmed sign-ups deleted after 30 days).
// TypeScript copy of seller-books-site's and cmmc-site's src/purge-clock.mjs; keep them alike.

export const PURGE_EVERY_MS = 24 * 60 * 60 * 1000;
/** The first purge after arming: soon, so rows left from before a deploy go on schedule. */
export const FIRST_PURGE_MS = 60 * 1000;
export const PURGE_CLOCK_NAME = "early-access-purge";

type Log = (event: string, data: Record<string, unknown>) => void;
type ClockStorage = Pick<DurableObjectStorage, "getAlarm" | "setAlarm">;
type ClockNamespace = Pick<DurableObjectNamespace, "get" | "idFromName">;
export type PurgeClockEnv = { PURGE_CLOCK?: ClockNamespace };

const defaultLog: Log = (event, data) =>
  console.log(JSON.stringify({ level: "info", event, ...data }));

/**
 * The Durable Object class (export it from the Worker's main module as `PurgeClock`).
 * `purge(env)` deletes the expired rows and returns how many it deleted.
 */
export function purgeClockClass<E>(purge: (env: E) => Promise<number>, log: Log = defaultLog) {
  return class PurgeClock {
    constructor(
      readonly state: { storage: ClockStorage },
      readonly env: E,
    ) {}

    async fetch(): Promise<Response> {
      const at = await this.state.storage.getAlarm();
      if (at === null) await this.state.storage.setAlarm(Date.now() + FIRST_PURGE_MS);
      return new Response(at === null ? "armed" : "already armed");
    }

    async alarm(): Promise<void> {
      // The next alarm first, so a purge that throws never ends the daily chain.
      await this.state.storage.setAlarm(Date.now() + PURGE_EVERY_MS);
      const deleted = await purge(this.env);
      log("early_access.purge", { deleted });
    }
  };
}

const armedNamespaces = new WeakSet<object>();

/** Arms the clock once per isolate. A failure is logged and retried on the next request. */
export async function armPurgeClock(env: PurgeClockEnv): Promise<void> {
  const ns = env?.PURGE_CLOCK;
  if (!ns || armedNamespaces.has(ns)) return;
  armedNamespaces.add(ns);
  try {
    await ns.get(ns.idFromName(PURGE_CLOCK_NAME)).fetch("https://purge-clock.localhost/arm");
  } catch (err) {
    armedNamespaces.delete(ns);
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "early_access.purge_clock_unarmed",
        error: String((err as Error)?.message ?? err),
      }),
    );
  }
}
