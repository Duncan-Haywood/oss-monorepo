// @ts-check
// The metered `api` plan's month-end settlement on a schedule: a Durable Object alarm that calls
// pro/billing.mjs settleUsage for each closed month, so usage above the €19 minimum reaches Paddle
// without anyone posting to /v1/admin/usage/settle. Proprietary (see ../LICENSE, part 2).
//
// Why an alarm and not a cron trigger: the Workers Free plan allows 5 cron triggers per account and
// the repository's Workers use all 5 (platform/ci/cron_budget.py; prompts/process/backlog/P098, the
// landing sites' purge-clock.mjs). Alarms are not cron triggers, and SQLite-backed Durable Objects
// are on the Free plan.
//
// How it stays safe to run unattended:
// - settleUsage claims a row per account and month before calling the provider and never retries a
//   claimed row (pro/billing.mjs; usage_charges), so running it again, from here or from the admin
//   endpoint at the same moment, answers "already" and never charges twice.
// - A month is settled only from SETTLE_GRACE_MS after it ends (06:00 UTC on the 1st), so a check
//   that started at 23:59:59 on the last day has long been counted.
// - While billing cannot charge (BILLING_PROVIDER=none, the launch default), settleUsage refuses
//   with 503 before it reads anything; that is logged and the month stays due, so the first run
//   after Paddle is on settles it. With billing dark there are no `api` subscriptions to charge.
// - USAGE_SETTLEMENT=off stops it (the admin endpoint keeps working).
// - The DO stores one value, the last month settled in full; nothing about accounts or invoices.

export const SETTLE_EVERY_MS = 6 * 60 * 60 * 1000;
/** A closed month is settled from this long after it ends. */
export const SETTLE_GRACE_MS = 6 * 60 * 60 * 1000;
/** The first run after arming: soon, so a month that ended before a deploy is not left waiting. */
export const FIRST_RUN_MS = 60 * 1000;
/** After a gap (the clock unarmed for a while), months further back than this are left to a person. */
export const MAX_CATCH_UP_MONTHS = 3;
export const SETTLE_CLOCK_NAME = "usage-settlement";
export const SETTLED_KEY = "settledThrough";

/** "YYYY-MM" of a UTC date. @param {Date} d */
const periodOfDate = (d) => d.toISOString().slice(0, 7);

/** The month before `period`. @param {string} period "YYYY-MM" */
export function previousPeriod(period) {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * The closed months to settle now, oldest first: every month after `settledThrough` up to the
 * latest one past its grace, at most MAX_CATCH_UP_MONTHS. With nothing settled yet, only the
 * latest (older months predate the clock; the admin endpoint covers them).
 * @param {Date} now @param {string | null | undefined} settledThrough
 * @returns {string[]}
 */
export function duePeriods(now, settledThrough) {
  const latest = previousPeriod(periodOfDate(new Date(now.getTime() - SETTLE_GRACE_MS)));
  if (!settledThrough) return [latest];
  /** @type {string[]} */
  const out = [];
  for (let p = latest; p > settledThrough && out.length < MAX_CATCH_UP_MONTHS; p = previousPeriod(p)) out.unshift(p);
  return out;
}

/** Results by status, for the log line: counts only, plus the accounts a person must look at. */
function summarise(/** @type {{ accountId: string, status: string }[]} */ results) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const attention = results.filter((r) => r.status === "failed").map((r) => r.accountId);
  return { counts, attention };
}

const defaultLog = (/** @type {string} */ event, /** @type {Record<string, unknown>} */ data) =>
  console.log(JSON.stringify({ level: "info", event, ...data }));

/**
 * One run: settle every due month in order, recording each one finished. Stops at the first month
 * that throws (billing unavailable, a store error) and leaves it due for the next run.
 * @param {{ settleUsage: (period: string) => Promise<{ period: string, results: { accountId: string, status: string }[] }> }} billing
 * @param {{ get: (k: string) => Promise<unknown>, put: (k: string, v: unknown) => Promise<void> }} storage
 * @param {{ now: () => Date, env?: Record<string, unknown>, log?: typeof defaultLog }} o
 * @returns {Promise<{ settled: string[], stopped: string | null }>}
 */
export async function runSettlement(billing, storage, { now, env = {}, log = defaultLog }) {
  if (String(env.USAGE_SETTLEMENT ?? "").toLowerCase() === "off") {
    log("usage_settlement.off", {});
    return { settled: [], stopped: "USAGE_SETTLEMENT=off" };
  }
  const settledThrough = /** @type {string | undefined} */ (await storage.get(SETTLED_KEY));
  /** @type {string[]} */
  const settled = [];
  for (const period of duePeriods(now(), settledThrough)) {
    let out;
    try {
      out = await billing.settleUsage(period);
    } catch (e) {
      const status = /** @type {any} */ (e)?.status;
      const reason = e instanceof Error ? e.message.slice(0, 200) : "settlement failed";
      log(status === 503 ? "usage_settlement.unavailable" : "usage_settlement.error", { period, reason });
      return { settled, stopped: reason };
    }
    await storage.put(SETTLED_KEY, period);
    settled.push(period);
    log("usage_settlement.done", { period, ...summarise(out.results) });
  }
  return { settled, stopped: null };
}

/**
 * The Durable Object class (exported from worker/index.mjs as `SettleClock`). `billingFor(env)`
 * gives the same billing object the Worker's handler uses.
 * @param {(env: any) => Promise<{ settleUsage: (period: string) => Promise<any> }>} billingFor
 * @param {{ now?: () => Date, log?: typeof defaultLog }} [o]
 */
export function settleClockClass(billingFor, { now = () => new Date(), log = defaultLog } = {}) {
  return class SettleClock {
    /** @param {any} state @param {any} env */
    constructor(state, env) {
      this.state = state;
      this.env = env;
    }

    async fetch() {
      const at = await this.state.storage.getAlarm();
      if (at === null) await this.state.storage.setAlarm(now().getTime() + FIRST_RUN_MS);
      return new Response(at === null ? "armed" : "already armed");
    }

    async alarm() {
      // The next alarm first, so a run that throws never ends the chain.
      await this.state.storage.setAlarm(now().getTime() + SETTLE_EVERY_MS);
      try {
        await runSettlement(await billingFor(this.env), this.state.storage, { now, env: this.env, log });
      } catch (e) {
        log("usage_settlement.error", { reason: e instanceof Error ? e.message.slice(0, 200) : "run failed" });
      }
    }
  };
}

const armedNamespaces = new WeakSet();

/** Arms the clock once per isolate. A failure is logged and retried on the next request. @param {any} env */
export async function armSettleClock(env) {
  const ns = env?.SETTLE_CLOCK;
  if (!ns || armedNamespaces.has(ns)) return;
  armedNamespaces.add(ns);
  try {
    await ns.get(ns.idFromName(SETTLE_CLOCK_NAME)).fetch("https://settle-clock.localhost/arm");
  } catch (err) {
    armedNamespaces.delete(ns);
    console.warn(JSON.stringify({ level: "warn", event: "usage_settlement.unarmed", error: String(/** @type {any} */ (err)?.message ?? err) }));
  }
}
