// LLM spend guards: a monthly cap per org and a global daily cap (the kill switch).
//
// Spend is read from `llm_calls.cost_micros` (written by the usage hook in context.ts), summed from
// the start of the current UTC month (org) / UTC day (global). Sums are cached in-isolate for
// CACHE_TTL_MS and bumped locally after each call, so the check costs ~one D1 query per minute per
// org per isolate. Concurrent in-flight calls can overshoot a cap by at most their own cost.
//
// Config (strings, set as Worker vars or — for an instant kill switch — `wrangler secret put`):
//   ORG_MONTHLY_LLM_CAP_USD   default 25    "off" disables the org cap
//   GLOBAL_DAILY_LLM_CAP_USD  default 200   "0" blocks every LLM call (kill switch); "off" disables
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { llmCalls } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { LlmRefusalError } from "../../ports/llm";

export const DEFAULT_ORG_MONTHLY_LLM_CAP_USD = 25;
export const DEFAULT_GLOBAL_DAILY_LLM_CAP_USD = 200;
export const CACHE_TTL_MS = 60_000;
/** Log a warning when a cached sum crosses this share of its cap. */
export const NEAR_CAP_RATIO = 0.8;

const MICROS_PER_USD = 1_000_000;
export const usdToMicros = (usd: number) => Math.round(usd * MICROS_PER_USD);

export type BudgetScope = "org" | "global";

/**
 * Thrown before an LLM call when a cap is reached. It is an AppError with a 4xx status, so routes
 * render it as JSON (402 org cap / 429 global cap) and the Workflow treats it as non-retryable.
 * Queue consumers should ack (not retry) it: see `isNonRetryableError`.
 */
export class BudgetExceededError extends AppError {
  readonly retryable = false;
  constructor(
    public readonly scope: BudgetScope,
    public readonly spentMicros: number,
    public readonly capMicros: number,
    public readonly orgId: string | null,
  ) {
    super(
      scope === "org" ? 402 : 429,
      scope === "org" ? "llm_budget_exceeded" : "llm_capacity_exhausted",
      scope === "org"
        ? "Your organization has reached its monthly AI usage limit. It resets on the 1st (UTC); contact support or upgrade your plan to raise it."
        : "AI drafting is temporarily unavailable. Please try again later.",
      { scope },
    );
    this.name = "BudgetExceededError";
  }
}

/**
 * For job runners: errors that must fail the job immediately instead of being retried. A model
 * refusal is deterministic for the same input, so retrying it only re-refuses until the DLQ.
 */
export const isNonRetryableError = (e: unknown): boolean =>
  e instanceof BudgetExceededError ||
  e instanceof LlmRefusalError ||
  (typeof e === "object" && e !== null && (e as { retryable?: unknown }).retryable === false);

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

export interface LlmBudgetConfig {
  /** null = no cap. */
  orgMonthlyCapMicros: number | null;
  globalDailyCapMicros: number | null;
}

function parseCapUsd(raw: unknown, fallbackUsd: number): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return usdToMicros(fallbackUsd);
  const v = raw.trim().toLowerCase();
  if (v === "off" || v === "none" || v === "unlimited") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? usdToMicros(n) : usdToMicros(fallbackUsd);
}

/** Reads the caps from Worker vars/secrets (not declared in Env: read loosely). */
export function budgetConfigFromEnv(env: object): LlmBudgetConfig {
  const vars = env as Record<string, unknown>;
  return {
    orgMonthlyCapMicros: parseCapUsd(vars.ORG_MONTHLY_LLM_CAP_USD, DEFAULT_ORG_MONTHLY_LLM_CAP_USD),
    globalDailyCapMicros: parseCapUsd(
      vars.GLOBAL_DAILY_LLM_CAP_USD,
      DEFAULT_GLOBAL_DAILY_LLM_CAP_USD,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Spend source
// ---------------------------------------------------------------------------------------------

export interface SpendSource {
  orgSpendSince(orgId: string, since: Date): Promise<number>;
  globalSpendSince(since: Date): Promise<number>;
}

/** Sums `llm_calls.cost_micros` (uses llm_calls_org_idx for the per-org query). */
export function d1SpendSource(db: Db): SpendSource {
  const total = sql<number>`coalesce(sum(${llmCalls.costMicros}), 0)`;
  return {
    async orgSpendSince(orgId, since) {
      const row = await db
        .select({ total })
        .from(llmCalls)
        .where(and(eq(llmCalls.orgId, orgId), gte(llmCalls.createdAt, since)))
        .get();
      return Number(row?.total ?? 0);
    },
    async globalSpendSince(since) {
      const row = await db
        .select({ total })
        .from(llmCalls)
        .where(gte(llmCalls.createdAt, since))
        .get();
      return Number(row?.total ?? 0);
    },
  };
}

export const startOfUtcMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()));
export const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ---------------------------------------------------------------------------------------------
// Cache (per isolate)
// ---------------------------------------------------------------------------------------------

interface CacheEntry {
  base: Promise<number>;
  /** Spend observed locally since `base` was fetched. */
  extra: number;
  expiresAt: number;
}

export class SpendCache {
  readonly entries = new Map<string, CacheEntry>();
  clear() {
    this.entries.clear();
  }
}

/** Shared across requests in the isolate. */
export const defaultSpendCache = new SpendCache();

// ---------------------------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------------------------

export interface LlmBudgetGuardOptions {
  source: SpendSource;
  config: LlmBudgetConfig;
  logger?: Logger;
  now?: () => Date;
  cache?: SpendCache;
  ttlMs?: number;
  /**
   * Per-org cap override in micro-USD (e.g. from the billing plan). Return undefined to use the
   * configured default, null for "no cap". Results are not cached here; keep it cheap.
   */
  orgCapMicros?: (orgId: string) => Promise<number | null | undefined> | number | null | undefined;
}

export class LlmBudgetGuard {
  private readonly cache: SpendCache;
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(private readonly opts: LlmBudgetGuardOptions) {
    this.cache = opts.cache ?? defaultSpendCache;
    this.ttlMs = opts.ttlMs ?? CACHE_TTL_MS;
    this.now = opts.now ?? (() => new Date());
  }

  private keys(orgId: string | null | undefined) {
    const now = this.now();
    const month = startOfUtcMonth(now);
    const day = startOfUtcDay(now);
    return {
      now,
      month,
      day,
      orgKey: orgId ? `org:${orgId}:${month.toISOString().slice(0, 7)}` : null,
      globalKey: `global:${day.toISOString().slice(0, 10)}`,
    };
  }

  private async cached(
    key: string,
    capMicros: number,
    fetch: () => Promise<number>,
    logData: Record<string, unknown>,
  ): Promise<number> {
    const nowMs = this.now().getTime();
    let entry = this.cache.entries.get(key);
    if (!entry || entry.expiresAt <= nowMs) {
      const base = fetch();
      entry = { base, extra: 0, expiresAt: nowMs + this.ttlMs };
      this.cache.entries.set(key, entry);
      const created = entry;
      base.then(
        (v) => {
          if (capMicros > 0 && v >= capMicros * NEAR_CAP_RATIO && v < capMicros) {
            this.opts.logger?.warn("llm_budget.near_cap", {
              ...logData,
              spentMicros: v,
              capMicros,
            });
          }
        },
        () => {
          if (this.cache.entries.get(key) === created) this.cache.entries.delete(key);
        },
      );
      if (this.cache.entries.size > 5_000) this.evictExpired(nowMs);
    }
    return (await entry.base) + entry.extra;
  }

  private evictExpired(nowMs: number) {
    for (const [k, e] of this.cache.entries) if (e.expiresAt <= nowMs) this.cache.entries.delete(k);
  }

  private async capForOrg(orgId: string): Promise<number | null> {
    const override = this.opts.orgCapMicros ? await this.opts.orgCapMicros(orgId) : undefined;
    return override === undefined ? this.opts.config.orgMonthlyCapMicros : override;
  }

  /** Throws BudgetExceededError if the global daily cap or the org's monthly cap is reached. */
  async assertWithinBudget(orgId: string | null | undefined, purpose: string): Promise<void> {
    const { month, day, orgKey, globalKey } = this.keys(orgId);
    const globalCap = this.opts.config.globalDailyCapMicros;
    try {
      if (globalCap !== null) {
        const spent =
          globalCap === 0
            ? 0
            : await this.cached(
                globalKey,
                globalCap,
                () => this.opts.source.globalSpendSince(day),
                { scope: "global" },
              );
        if (spent >= globalCap) {
          this.opts.logger?.error("llm_budget.global_cap_reached", {
            purpose,
            orgId: orgId ?? null,
            spentMicros: spent,
            capMicros: globalCap,
          });
          throw new BudgetExceededError("global", spent, globalCap, orgId ?? null);
        }
      }
      if (orgId && orgKey) {
        const orgCap = await this.capForOrg(orgId);
        if (orgCap !== null) {
          const spent =
            orgCap === 0
              ? 0
              : await this.cached(
                  orgKey,
                  orgCap,
                  () => this.opts.source.orgSpendSince(orgId, month),
                  { scope: "org", orgId },
                );
          if (spent >= orgCap) {
            this.opts.logger?.warn("llm_budget.org_cap_reached", {
              purpose,
              orgId,
              spentMicros: spent,
              capMicros: orgCap,
            });
            throw new BudgetExceededError("org", spent, orgCap, orgId);
          }
        }
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      // Spend lookup failed (D1 hiccup): fail open — the usage log itself needs D1 anyway.
      this.opts.logger?.error("llm_budget.check_failed", { purpose, error: String(e) });
    }
  }

  /** Adds a finished call's cost to the cached sums so bursts within the TTL are counted. */
  recordSpend(orgId: string | null | undefined, costMicros: number): void {
    if (!(costMicros > 0)) return;
    const { orgKey, globalKey } = this.keys(orgId);
    const g = this.cache.entries.get(globalKey);
    if (g) g.extra += costMicros;
    if (orgKey) {
      const o = this.cache.entries.get(orgKey);
      if (o) o.extra += costMicros;
    }
  }
}

/** Production wiring: D1-backed sums, caps from env. */
export function createLlmBudgetGuard(
  env: object,
  db: Db,
  logger?: Logger,
  extra: Pick<LlmBudgetGuardOptions, "orgCapMicros" | "now" | "cache"> = {},
): LlmBudgetGuard {
  return new LlmBudgetGuard({
    source: d1SpendSource(db),
    config: budgetConfigFromEnv(env),
    ...(logger ? { logger } : {}),
    ...extra,
  });
}
