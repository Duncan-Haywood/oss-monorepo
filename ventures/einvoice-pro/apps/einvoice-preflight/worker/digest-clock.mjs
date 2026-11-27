// @ts-check
// The client summary email on a schedule (accountant client dashboard, part 3): a Durable Object
// alarm that calls pro/digest.mjs sendDigests for the weekly and the monthly summary, so nobody has
// to post to /v1/admin/digest/send. Proprietary (see ../LICENSE, part 2).
//
// Shipped OFF. It sends nothing unless the Worker variable DIGEST_SCHEDULE is "on": an unattended
// send is the owner's call (ROADMAP, "Accountant client dashboard, part 3"), so the code is ready
// and the switch is theirs. Without the switch the clock is not even armed.
//
// Why an alarm and not a cron trigger: the account's 5 cron triggers are in use
// (platform/ci/cron_budget.py), as for worker/settle-clock.mjs.
//
// When it sends (UTC): the weekly summary from 07:00 on Monday, for the ISO week that starts then
// ("2026-W49", covering the 7 days before); the monthly one from 07:00 on the 1st ("2026-12",
// covering the 30 days before). A late summary (the clock was unarmed, mail was down) is still sent
// up to LATE_DAYS after its send time, since its window ends at the send; later than that it is
// skipped, so turning the switch on at the end of a month does not mail a monthly summary two days
// before the next one.
//
// How it stays safe to run unattended:
// - sendDigests claims each account and period in the store before sending (digest_sends), so a run
//   that repeats, or races the admin endpoint, sends nothing twice.
// - A period is marked done in the DO when a run leaves nothing more to send. A run with failed
//   sends (their claims released) leaves it due, and the next hourly run retries only those; after
//   MAX_TRIES runs with failures the period is closed anyway, so a bouncing address is not mailed at
//   every hour of the week.
// - At most DEFAULT_SEND_LIMIT sends per run; when more wait, the next alarm is a minute away.
// - No mailer or APP_URL: logged, nothing claimed, the period stays due.
// - The DO stores, per frequency, the last period done and the failed-run count for the open one;
//   nothing about accounts or invoices. Logs carry counts and opaque account ids, never names or
//   addresses.

import { digestPeriod, sendDigests } from "../pro/digest.mjs";

export const DIGEST_EVERY_MS = 60 * 60 * 1000;
/** The next run when a run hit the send limit and more accounts wait. */
export const MORE_MS = 60 * 1000;
export const FIRST_RUN_MS = 60 * 1000;
/** Hours after the start of a period (Monday 00:00 or the 1st, UTC) from which it is sent. */
export const SEND_HOUR_UTC = 7;
/** How late a summary may still go out, in days after its send time. */
export const LATE_DAYS = { weekly: 2, monthly: 3 };
/** Runs with failed sends before a period is closed anyway. */
export const MAX_TRIES = 3;
export const DIGEST_CLOCK_NAME = "client-summary";
/** @type {readonly ("weekly" | "monthly")[]} */
export const FREQUENCIES = ["weekly", "monthly"];

const DAY_MS = 86_400_000;

/** @param {Record<string, unknown> | undefined} env */
export const scheduleOn = (env) => String(env?.DIGEST_SCHEDULE ?? "").trim().toLowerCase() === "on";

/** The same check as pro/server.mjs: an origin, no path. @param {Record<string, unknown> | undefined} env */
export function appUrlOf(env) {
  const u = String(env?.APP_URL ?? "").replace(/\/+$/, "");
  return /^https?:\/\/[^\s/?#]+$/.test(u) ? u : "";
}

/**
 * When `at`'s period starts sending: Monday (weekly) or the 1st (monthly) at SEND_HOUR_UTC.
 * @param {"weekly" | "monthly"} frequency @param {Date} at
 */
export function sendFrom(frequency, at) {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  if (frequency === "monthly") return new Date(Date.UTC(y, m, 1, SEND_HOUR_UTC));
  const midnight = Date.UTC(y, m, at.getUTCDate());
  const day = at.getUTCDay() || 7; // Monday 1 .. Sunday 7
  return new Date(midnight - (day - 1) * DAY_MS + SEND_HOUR_UTC * 3_600_000);
}

/**
 * The summaries due now: each frequency's current period, from its send time to LATE_DAYS after,
 * unless that period is already done.
 * @param {Date} now @param {Partial<Record<"weekly" | "monthly", string>>} done
 * @returns {{ frequency: "weekly" | "monthly", period: string }[]}
 */
export function dueDigests(now, done) {
  /** @type {{ frequency: "weekly" | "monthly", period: string }[]} */
  const out = [];
  for (const frequency of FREQUENCIES) {
    const from = sendFrom(frequency, now).getTime();
    if (now.getTime() < from || now.getTime() >= from + LATE_DAYS[frequency] * DAY_MS) continue;
    const period = digestPeriod(frequency, now);
    if (done[frequency] !== period) out.push({ frequency, period });
  }
  return out;
}

const defaultLog = (/** @type {string} */ event, /** @type {Record<string, unknown>} */ data) =>
  console.log(JSON.stringify({ level: "info", event, ...data }));

const doneKey = (/** @type {string} */ f) => `done:${f}`;
const triesKey = (/** @type {string} */ f) => `tries:${f}`;

/**
 * @typedef {{ store: any, mailer: import("../pro/email.mjs").Mailer | null, appUrl: string }} DigestDeps
 * @typedef {{ get: (k: string) => Promise<unknown>, put: (k: string, v: unknown) => Promise<void> }} ClockStorage
 */

/**
 * One run: send each due summary. Returns when the next run should be (ms from now), or null when
 * the schedule is off and the chain should end.
 * @param {() => Promise<DigestDeps>} depsFor
 * @param {ClockStorage} storage
 * @param {{ now: () => Date, env?: Record<string, unknown>, log?: typeof defaultLog }} o
 * @returns {Promise<{ next: number | null, ran: { frequency: string, period: string, outcome: string }[] }>}
 */
export async function runDigests(depsFor, storage, { now, env = {}, log = defaultLog }) {
  if (!scheduleOn(env)) {
    log("digest_schedule.off", {});
    return { next: null, ran: [] };
  }
  /** @type {Partial<Record<"weekly" | "monthly", string>>} */
  const done = {};
  for (const f of FREQUENCIES) done[f] = /** @type {string | undefined} */ (await storage.get(doneKey(f)));
  const due = dueDigests(now(), done);
  /** @type {{ frequency: string, period: string, outcome: string }[]} */
  const ran = [];
  if (!due.length) return { next: DIGEST_EVERY_MS, ran };

  const deps = await depsFor();
  if (!deps.mailer || !deps.appUrl) {
    log("digest_schedule.unavailable", { reason: !deps.mailer ? "no mailer" : "no APP_URL", due: due.map((d) => d.period) });
    return { next: DIGEST_EVERY_MS, ran };
  }

  let next = DIGEST_EVERY_MS;
  for (const { frequency, period } of due) {
    let out;
    try {
      out = await sendDigests({ store: deps.store, mailer: deps.mailer, appUrl: deps.appUrl, now, frequency, period });
    } catch (e) {
      log("digest_schedule.error", { frequency, period, reason: e instanceof Error ? e.message.slice(0, 200) : "send failed" });
      ran.push({ frequency, period, outcome: "error" });
      continue;
    }
    /** @type {Record<string, number>} */
    const counts = {};
    for (const r of out.results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const failed = out.results.filter((r) => r.status === "failed").map((r) => r.accountId);
    if (out.more) {
      log("digest_schedule.more", { frequency, period, counts });
      ran.push({ frequency, period, outcome: "more" });
      next = MORE_MS;
      continue;
    }
    if (failed.length) {
      const prev = /** @type {{ period?: string, n?: number } | undefined} */ (await storage.get(triesKey(frequency)));
      const n = (prev?.period === period ? (prev.n ?? 0) : 0) + 1;
      if (n < MAX_TRIES) {
        await storage.put(triesKey(frequency), { period, n });
        log("digest_schedule.retry", { frequency, period, counts, attention: failed, tries: n });
        ran.push({ frequency, period, outcome: "retry" });
        continue;
      }
      log("digest_schedule.gave_up", { frequency, period, counts, attention: failed, tries: n });
    }
    await storage.put(doneKey(frequency), period);
    log("digest_schedule.done", { frequency, period, counts });
    ran.push({ frequency, period, outcome: failed.length ? "gave_up" : "done" });
  }
  return { next, ran };
}

/**
 * The Durable Object class (exported from worker/index.mjs as `DigestClock`).
 * @param {(env: any) => Promise<DigestDeps>} depsFor
 * @param {{ now?: () => Date, log?: typeof defaultLog }} [o]
 */
export function digestClockClass(depsFor, { now = () => new Date(), log = defaultLog } = {}) {
  return class DigestClock {
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
      if (!scheduleOn(this.env)) {
        log("digest_schedule.off", {});
        return; // the chain ends; the next request after the switch is turned on re-arms it
      }
      // The next alarm first, so a run that throws never ends the chain.
      await this.state.storage.setAlarm(now().getTime() + DIGEST_EVERY_MS);
      try {
        const r = await runDigests(() => depsFor(this.env), this.state.storage, { now, env: this.env, log });
        if (r.next !== null && r.next !== DIGEST_EVERY_MS) await this.state.storage.setAlarm(now().getTime() + r.next);
      } catch (e) {
        log("digest_schedule.error", { reason: e instanceof Error ? e.message.slice(0, 200) : "run failed" });
      }
    }
  };
}

const armedNamespaces = new WeakSet();

/**
 * Arms the clock once per isolate, only when DIGEST_SCHEDULE is "on". A failure is logged and
 * retried on the next request. @param {any} env
 */
export async function armDigestClock(env) {
  const ns = env?.DIGEST_CLOCK;
  if (!ns || !scheduleOn(env) || armedNamespaces.has(ns)) return;
  armedNamespaces.add(ns);
  try {
    await ns.get(ns.idFromName(DIGEST_CLOCK_NAME)).fetch("https://digest-clock.localhost/arm");
  } catch (err) {
    armedNamespaces.delete(ns);
    console.warn(JSON.stringify({ level: "warn", event: "digest_schedule.unarmed", error: String(/** @type {any} */ (err)?.message ?? err) }));
  }
}
