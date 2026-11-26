import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BudgetedLlm } from "../../ports/budgeted-llm";
import {
  type LlmClient,
  LlmRefusalError,
  type LlmRequestBase,
  type LlmUsage,
} from "../../ports/llm";
import {
  BudgetExceededError,
  budgetConfigFromEnv,
  isNonRetryableError,
  type LlmBudgetConfig,
  LlmBudgetGuard,
  SpendCache,
  type SpendSource,
  usdToMicros,
} from "./llm-budget";

const T0 = new Date("2026-11-19T12:00:00Z");

function fakeSource(org: Record<string, number> = {}, global = 0) {
  const calls = { org: [] as { orgId: string; since: Date }[], global: [] as Date[] };
  const source: SpendSource = {
    orgSpendSince: async (orgId, since) => {
      calls.org.push({ orgId, since });
      return org[orgId] ?? 0;
    },
    globalSpendSince: async (since) => {
      calls.global.push(since);
      return global;
    },
  };
  return { source, calls, org, setGlobal: (v: number) => (global = v) };
}

function guardWith(
  source: SpendSource,
  config: Partial<LlmBudgetConfig> = {},
  opts: { now?: () => Date; orgCapMicros?: (orgId: string) => number | null | undefined } = {},
) {
  return new LlmBudgetGuard({
    source,
    config: {
      orgMonthlyCapMicros: usdToMicros(25),
      globalDailyCapMicros: usdToMicros(200),
      ...config,
    },
    cache: new SpendCache(),
    now: opts.now ?? (() => T0),
    ...(opts.orgCapMicros ? { orgCapMicros: opts.orgCapMicros } : {}),
  });
}

describe("budgetConfigFromEnv", () => {
  it("defaults to $25/org/month and $200/day globally", () => {
    expect(budgetConfigFromEnv({})).toEqual({
      orgMonthlyCapMicros: 25_000_000,
      globalDailyCapMicros: 200_000_000,
    });
  });
  it("reads overrides, 'off' and the 0 kill switch; ignores junk", () => {
    expect(
      budgetConfigFromEnv({ ORG_MONTHLY_LLM_CAP_USD: "50.5", GLOBAL_DAILY_LLM_CAP_USD: "0" }),
    ).toEqual({ orgMonthlyCapMicros: 50_500_000, globalDailyCapMicros: 0 });
    expect(
      budgetConfigFromEnv({ ORG_MONTHLY_LLM_CAP_USD: "off", GLOBAL_DAILY_LLM_CAP_USD: "-3" }),
    ).toEqual({ orgMonthlyCapMicros: null, globalDailyCapMicros: 200_000_000 });
  });
});

describe("LlmBudgetGuard", () => {
  it("allows calls while the org is under its monthly cap", async () => {
    const { source, calls } = fakeSource({ org_a: usdToMicros(24.99) });
    await expect(guardWith(source).assertWithinBudget("org_a", "drafting.section")).resolves.toBe(
      undefined,
    );
    expect(calls.org[0]).toEqual({ orgId: "org_a", since: new Date("2026-11-01T00:00:00Z") });
    expect(calls.global[0]).toEqual(new Date("2026-11-19T00:00:00Z"));
  });

  it("blocks with a 402 BudgetExceededError once the org reaches its cap", async () => {
    const { source } = fakeSource({ org_a: usdToMicros(25) });
    const err = await guardWith(source)
      .assertWithinBudget("org_a", "drafting.section")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    const e = err as BudgetExceededError;
    expect([e.status, e.code, e.scope, e.orgId]).toEqual([
      402,
      "llm_budget_exceeded",
      "org",
      "org_a",
    ]);
    expect(isNonRetryableError(e)).toBe(true);
    expect(isNonRetryableError(new Error("x"))).toBe(false);
    // A refusal re-refuses on every retry: the queue consumer acks it instead.
    expect(isNonRetryableError(new LlmRefusalError("matching.score", "cyber"))).toBe(true);
  });

  it("does not let one org's spend block another", async () => {
    const { source } = fakeSource({ org_a: usdToMicros(100) });
    await expect(guardWith(source).assertWithinBudget("org_b", "p")).resolves.toBeUndefined();
  });

  it("caches sums for 60 s, counting local spend in between", async () => {
    let now = T0.getTime();
    const { source, calls, org } = fakeSource({ org_a: usdToMicros(20) });
    const guard = guardWith(source, {}, { now: () => new Date(now) });

    await guard.assertWithinBudget("org_a", "p");
    await guard.assertWithinBudget("org_a", "p");
    expect(calls.org).toHaveLength(1);
    expect(calls.global).toHaveLength(1);

    // A $6 call in this isolate pushes the cached sum over the cap before the TTL expires.
    guard.recordSpend("org_a", usdToMicros(6));
    await expect(guard.assertWithinBudget("org_a", "p")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(calls.org).toHaveLength(1);

    // After the TTL the DB is the source of truth again.
    org.org_a = usdToMicros(10);
    now += 60_001;
    await expect(guard.assertWithinBudget("org_a", "p")).resolves.toBeUndefined();
    expect(calls.org).toHaveLength(2);
  });

  it("dedupes concurrent lookups", async () => {
    const { source, calls } = fakeSource();
    const guard = guardWith(source);
    await Promise.all([1, 2, 3].map(() => guard.assertWithinBudget("org_a", "p")));
    expect(calls.org).toHaveLength(1);
    expect(calls.global).toHaveLength(1);
  });

  it("starts a fresh sum in a new month", async () => {
    let now = new Date("2026-11-30T23:59:30Z");
    const { source, calls } = fakeSource();
    const guard = guardWith(source, {}, { now: () => now });
    await guard.assertWithinBudget("org_a", "p");
    now = new Date("2026-12-01T00:00:10Z");
    await guard.assertWithinBudget("org_a", "p");
    expect(calls.org.map((c) => c.since.toISOString())).toEqual([
      "2026-11-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
    ]);
  });

  it("global daily cap blocks every org (429) and 0 is an immediate kill switch", async () => {
    const { source, calls } = fakeSource({}, usdToMicros(200));
    const e = (await guardWith(source)
      .assertWithinBudget("org_a", "p")
      .catch((x: unknown) => x)) as BudgetExceededError;
    expect([e.status, e.code, e.scope]).toEqual([429, "llm_capacity_exhausted", "global"]);
    // Calls without an org (e.g. discovery) are subject to the global cap too.
    await expect(guardWith(source).assertWithinBudget(null, "p")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );

    const killed = fakeSource();
    await expect(
      guardWith(killed.source, { globalDailyCapMicros: 0 }).assertWithinBudget("org_a", "p"),
    ).rejects.toMatchObject({ scope: "global" });
    expect(killed.calls.global).toHaveLength(0);
    expect(calls.org).toHaveLength(0);
  });

  it("supports per-org cap overrides (billing plan) and disabled caps", async () => {
    const { source } = fakeSource({ org_pro: usdToMicros(80), org_free: usdToMicros(80) });
    const guard = guardWith(
      source,
      {},
      { orgCapMicros: (id) => (id === "org_pro" ? usdToMicros(100) : undefined) },
    );
    await expect(guard.assertWithinBudget("org_pro", "p")).resolves.toBeUndefined();
    await expect(guard.assertWithinBudget("org_free", "p")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    const open = guardWith(source, { orgMonthlyCapMicros: null, globalDailyCapMicros: null });
    await expect(open.assertWithinBudget("org_free", "p")).resolves.toBeUndefined();
  });

  it("fails open (and retries the lookup) when the spend query errors", async () => {
    let fail = true;
    const orgSpendSince = vi.fn(async () => {
      if (fail) throw new Error("D1 unavailable");
      return usdToMicros(30);
    });
    const guard = guardWith({ orgSpendSince, globalSpendSince: async () => 0 });
    await expect(guard.assertWithinBudget("org_a", "p")).resolves.toBeUndefined();
    fail = false;
    await expect(guard.assertWithinBudget("org_a", "p")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(orgSpendSince).toHaveBeenCalledTimes(2);
  });
});

describe("BudgetedLlm", () => {
  const usage = (costMicros: number): LlmUsage => ({
    model: "claude-opus-5-5",
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicros,
    latencyMs: 1,
    stopReason: "end_turn",
  });

  function stubLlm(cost: number) {
    const calls: LlmRequestBase[] = [];
    const llm: LlmClient = {
      async generateStructured<T>(req: LlmRequestBase) {
        calls.push(req);
        return { data: { ok: true } as T, usage: usage(cost) };
      },
      async generateText(req) {
        calls.push(req);
        return { text: "hi", usage: usage(cost) };
      },
    };
    return { llm, calls };
  }

  const req = { purpose: "drafting.section", orgId: "org_a", system: "s", prompt: "p" };

  it("passes calls through under the cap and blocks the inner client once over", async () => {
    const { source, calls: lookups } = fakeSource({ org_a: usdToMicros(24) });
    const inner = stubLlm(usdToMicros(1.5));
    const llm = new BudgetedLlm(inner.llm, guardWith(source));

    const out = await llm.generateStructured({ ...req, schema: z.object({ ok: z.boolean() }) });
    expect(out.data).toEqual({ ok: true });
    await expect(llm.generateText(req)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toHaveLength(1);
    expect(lookups.org).toHaveLength(1);
  });
});
