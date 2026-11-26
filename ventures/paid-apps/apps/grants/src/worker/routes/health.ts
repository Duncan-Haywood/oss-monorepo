// OWNER: monitoring (infra). Health endpoints, probed by .github/workflows/grants-monitor.yml.
//   GET /api/health       public and cheap: one D1 round trip, no auth.
//   GET /api/health/deep  bearer INTERNAL_API_TOKEN: dependency + pipeline + spend checks, 503 on fail.
// Thresholds and the on-call playbook: docs/MONITORING.md.
//
// Tenant safety: the deep checks aggregate across every org on purpose (platform health). They return
// counts, ages and global totals only: never ids, titles, org names or error text.
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext } from "../context";
import { applications, discoveryRuns, documents, llmCalls } from "../db/schema";
import type { Env } from "../env";
import {
  budgetConfigFromEnv,
  NEAR_CAP_RATIO,
  startOfUtcDay,
  startOfUtcMonth,
} from "../services/guards/llm-budget";
import type { AppEnv } from "../types";
import { requireInternalToken } from "./internal";

export type CheckStatus = "ok" | "warn" | "fail";
export interface HealthCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}
export interface DeepHealth {
  status: CheckStatus;
  checks: HealthCheck[];
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

export const THRESHOLDS = {
  /** A check that has not answered by then fails (D1/R2 hangs must not hang the probe). */
  checkTimeoutMs: 5_000,
  d1WarnMs: 500,
  d1FailMs: 2_000,
  r2WarnMs: 1_000,
  r2FailMs: 3_000,
  /** Discovery runs daily (wrangler.jsonc cron), so one missed run warns and two fail. */
  discoveryWarnMs: 30 * HOUR,
  discoveryFailMs: 48 * HOUR,
  /** Applications in drafting/verifying longer than this are stuck. */
  stuckApplicationMs: 2 * HOUR,
  /** Documents in processing longer than this are stuck. */
  stuckDocumentMs: 30 * MINUTE,
  /** One stuck item warns; this many fail (the pipeline/consumer is likely down, not one bad row). */
  stuckFailCount: 5,
  llmWindowMs: HOUR,
  llmWarnRate: 0.1,
  llmFailRate: 0.5,
  /** Minimum calls in the window before the error rate can fail (small samples only warn). */
  llmFailMinCalls: 10,
  spendWarnRatio: NEAR_CAP_RATIO,
} as const;

/** R2 key HEAD-ed by the deep check. Outside `orgs/`, so it is never tenant data. */
export const R2_SENTINEL_KEY = "ops/health-sentinel";

// ---------------------------------------------------------------------------------------------
// Pure evaluators (exported for tests)
// ---------------------------------------------------------------------------------------------

const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, fail: 2 };

export const worstStatus = (statuses: CheckStatus[]): CheckStatus =>
  statuses.reduce<CheckStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "ok");

export function latencyStatus(ms: number, warnMs: number, failMs: number): CheckStatus {
  if (ms >= failMs) return "fail";
  if (ms >= warnMs) return "warn";
  return "ok";
}

export function stuckStatus(count: number): CheckStatus {
  if (count >= THRESHOLDS.stuckFailCount) return "fail";
  if (count > 0) return "warn";
  return "ok";
}

/** `ageMs` = time since the last successful run, or null when discovery has never run. */
export function discoveryStatus(ageMs: number | null): CheckStatus {
  if (ageMs === null) return "ok";
  if (ageMs > THRESHOLDS.discoveryFailMs) return "fail";
  if (ageMs > THRESHOLDS.discoveryWarnMs) return "warn";
  return "ok";
}

export function llmErrorStatus(calls: number, errors: number): CheckStatus {
  if (calls <= 0) return "ok";
  const rate = errors / calls;
  if (rate > THRESHOLDS.llmFailRate && calls >= THRESHOLDS.llmFailMinCalls) return "fail";
  if (rate > THRESHOLDS.llmWarnRate) return "warn";
  return "ok";
}

/**
 * Global spend against GLOBAL_DAILY_LLM_CAP_USD. Fails once today's spend reaches the cap (every
 * LLM route then returns 429), warns at 80% of it, or when month-to-date spend reaches 80% of
 * cap x days elapsed (sustained near-cap burn). A cap of 0 is the kill switch: warn, it is deliberate.
 */
export function spendStatus(
  todayMicros: number,
  mtdMicros: number,
  capMicros: number | null,
  daysElapsed: number,
): CheckStatus {
  if (capMicros === null) return "ok";
  if (capMicros === 0) return "warn";
  if (todayMicros >= capMicros) return "fail";
  const warn = THRESHOLDS.spendWarnRatio;
  if (todayMicros >= warn * capMicros || mtdMicros >= warn * capMicros * daysElapsed) {
    return "warn";
  }
  return "ok";
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`;
const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const hours = (ms: number) => `${(ms / HOUR).toFixed(1)}h`;
const minutes = (ms: number) => `${Math.round(ms / MINUTE)}m`;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

async function checkD1(ctx: AppContext): Promise<HealthCheck> {
  const { value, ms } = await timed(() =>
    ctx.env.DB.prepare("select count(*) as n from sqlite_master").first<{ n: number }>(),
  );
  if (!value) return { name: "d1", status: "fail", detail: "read returned no row" };
  return {
    name: "d1",
    status: latencyStatus(ms, THRESHOLDS.d1WarnMs, THRESHOLDS.d1FailMs),
    detail: `read in ${ms}ms`,
  };
}

async function checkR2(env: Env): Promise<HealthCheck> {
  const { value, ms } = await timed(() => env.FILES.head(R2_SENTINEL_KEY));
  return {
    name: "r2",
    status: latencyStatus(ms, THRESHOLDS.r2WarnMs, THRESHOLDS.r2FailMs),
    detail: `head in ${ms}ms (sentinel ${value ? "present" : "absent"})`,
  };
}

async function checkDiscovery(ctx: AppContext, now: number): Promise<HealthCheck> {
  const row = await ctx.db
    .select({
      runs: sql<number>`count(*)`,
      lastOk: sql<
        number | null
      >`max(case when ${discoveryRuns.status} = 'succeeded' then coalesce(${discoveryRuns.finishedAt}, ${discoveryRuns.startedAt}) end)`,
      firstStarted: sql<number | null>`min(${discoveryRuns.startedAt})`,
    })
    .from(discoveryRuns)
    .get();
  const runs = Number(row?.runs ?? 0);
  if (runs === 0 || row?.firstStarted == null) {
    return { name: "discovery", status: "ok", detail: "no discovery runs recorded yet" };
  }
  if (row.lastOk == null) {
    // Runs exist but none succeeded: measure from the first attempt.
    const age = now - Number(row.firstStarted);
    return {
      name: "discovery",
      status: discoveryStatus(age),
      detail: `no successful run yet (${runs} runs, first ${hours(age)} ago)`,
    };
  }
  const age = now - Number(row.lastOk);
  return {
    name: "discovery",
    status: discoveryStatus(age),
    detail: `last successful run ${hours(age)} ago`,
  };
}

async function checkStuckApplications(ctx: AppContext, now: number): Promise<HealthCheck> {
  const row = await ctx.db
    .select({
      n: sql<number>`count(*)`,
      oldest: sql<number | null>`min(${applications.updatedAt})`,
    })
    .from(applications)
    .where(
      and(
        inArray(applications.status, ["drafting", "verifying"]),
        lt(applications.updatedAt, new Date(now - THRESHOLDS.stuckApplicationMs)),
      ),
    )
    .get();
  const n = Number(row?.n ?? 0);
  return {
    name: "stuck_applications",
    status: stuckStatus(n),
    detail:
      n === 0
        ? "none in drafting/verifying for more than 2h"
        : `${n} in drafting/verifying for more than 2h (oldest ${hours(now - Number(row?.oldest ?? now))})`,
  };
}

async function checkStuckDocuments(ctx: AppContext, now: number): Promise<HealthCheck> {
  const row = await ctx.db
    .select({ n: sql<number>`count(*)`, oldest: sql<number | null>`min(${documents.updatedAt})` })
    .from(documents)
    .where(
      and(
        eq(documents.status, "processing"),
        lt(documents.updatedAt, new Date(now - THRESHOLDS.stuckDocumentMs)),
      ),
    )
    .get();
  const n = Number(row?.n ?? 0);
  return {
    name: "stuck_documents",
    status: stuckStatus(n),
    detail:
      n === 0
        ? "none in processing for more than 30m"
        : `${n} in processing for more than 30m (oldest ${minutes(now - Number(row?.oldest ?? now))})`,
  };
}

async function checkLlmErrors(ctx: AppContext, now: number): Promise<HealthCheck> {
  const row = await ctx.db
    .select({
      calls: sql<number>`count(*)`,
      errors: sql<number>`coalesce(sum(${llmCalls.error} is not null), 0)`,
    })
    .from(llmCalls)
    .where(gte(llmCalls.createdAt, new Date(now - THRESHOLDS.llmWindowMs)))
    .get();
  const calls = Number(row?.calls ?? 0);
  const errors = Number(row?.errors ?? 0);
  return {
    name: "llm_error_rate",
    status: llmErrorStatus(calls, errors),
    detail:
      calls === 0
        ? "no LLM calls in the last hour"
        : `${errors} of ${calls} calls failed in the last hour (${pct(errors / calls)})`,
  };
}

async function checkLlmSpend(ctx: AppContext, now: number): Promise<HealthCheck> {
  const cap = budgetConfigFromEnv(ctx.env).globalDailyCapMicros;
  const nowDate = new Date(now);
  const dayStart = startOfUtcDay(nowDate);
  // Covering range read on llm_calls_created_idx (created_at, cost_micros).
  const row = await ctx.db
    .select({
      mtd: sql<number>`coalesce(sum(${llmCalls.costMicros}), 0)`,
      today: sql<number>`coalesce(sum(case when ${llmCalls.createdAt} >= ${dayStart.getTime()} then ${llmCalls.costMicros} else 0 end), 0)`,
    })
    .from(llmCalls)
    .where(gte(llmCalls.createdAt, startOfUtcMonth(nowDate)))
    .get();
  const today = Number(row?.today ?? 0);
  const mtd = Number(row?.mtd ?? 0);
  const days = nowDate.getUTCDate();
  const status = spendStatus(today, mtd, cap, days);
  let detail: string;
  if (cap === null) detail = `month-to-date ${usd(mtd)}, today ${usd(today)}; global cap off`;
  else if (cap === 0)
    detail = `kill switch on (cap $0): all LLM calls blocked; month-to-date ${usd(mtd)}`;
  else {
    detail =
      `today ${usd(today)} of ${usd(cap)} daily cap (${pct(today / cap)}); ` +
      `month-to-date ${usd(mtd)} of ${usd(cap * days)} (${days}d x cap, ${pct(mtd / (cap * days))})`;
  }
  return { name: "llm_spend", status, detail };
}

function withTimeout(name: string, run: () => Promise<HealthCheck>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<HealthCheck>((resolve) => {
    timer = setTimeout(
      () => resolve({ name, status: "fail", detail: `no answer within ${ms}ms` }),
      ms,
    );
  });
  return Promise.race([run(), timeout]).finally(() => clearTimeout(timer));
}

export async function runDeepChecks(ctx: AppContext): Promise<DeepHealth> {
  const now = ctx.now().getTime();
  const checks: [string, () => Promise<HealthCheck>][] = [
    ["d1", () => checkD1(ctx)],
    ["r2", () => checkR2(ctx.env)],
    ["discovery", () => checkDiscovery(ctx, now)],
    ["stuck_applications", () => checkStuckApplications(ctx, now)],
    ["stuck_documents", () => checkStuckDocuments(ctx, now)],
    ["llm_error_rate", () => checkLlmErrors(ctx, now)],
    ["llm_spend", () => checkLlmSpend(ctx, now)],
  ];
  const results = await Promise.all(
    checks.map(([name, run]) =>
      withTimeout(
        name,
        () =>
          run().catch((e: unknown): HealthCheck => {
            // The error text stays in the logs; the response says only that the check failed.
            ctx.logger.error("health.check_failed", { check: name, error: String(e) });
            return { name, status: "fail", detail: "check errored (see Worker logs)" };
          }),
        THRESHOLDS.checkTimeoutMs,
      ),
    ),
  );
  return { status: worstStatus(results.map((r) => r.status)), checks: results };
}

// ---------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => {
  const db = await c.env.DB.prepare("select 1 as ok").first<{ ok: number }>();
  return c.json({ ok: db?.ok === 1, env: c.env.APP_ENV, fake: c.env.FAKE_EXTERNALS === "true" });
});

routes.get("/deep", requireInternalToken, async (c) => {
  const result = await runDeepChecks(c.var.ctx);
  if (result.status !== "ok") {
    c.var.ctx.logger.warn("health.deep_degraded", {
      status: result.status,
      failing: result.checks.filter((x) => x.status !== "ok").map((x) => x.name),
    });
  }
  c.header("Cache-Control", "no-store");
  return c.json(result, result.status === "fail" ? 503 : 200);
});

export default routes;
