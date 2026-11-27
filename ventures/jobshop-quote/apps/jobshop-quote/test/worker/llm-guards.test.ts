// LLM cost guards at the route level: the per-org monthly spend cap (BudgetedLlm) and the per-user
// LLM rate limiter. The guard's own logic and D1 sums are covered in services/guards/.
import type { RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { TEST_RATE_LIMIT_HEADER } from "@worker/middleware/rate-limit";
import { LlmBudgetGuard, SpendCache } from "@worker/services/guards/llm-budget";
import { afterEach, describe, expect, it } from "vitest";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { api, json, setupTenant } from "./helpers";

afterEach(() => {
  testFakes.llmBudget = null;
});

/** A guard whose org cap is already used up this month (cap 0 blocks every call). */
const exhaustedOrgGuard = () =>
  new LlmBudgetGuard({
    source: { orgSpendSince: async () => 0, globalSpendSince: async () => 0 },
    config: { orgMonthlyCapMicros: 0, globalDailyCapMicros: null },
    cache: new SpendCache(),
  });

async function textRfq(t: Awaited<ReturnType<typeof setupTenant>>) {
  const form = new FormData();
  form.set("subject", "RFQ - brackets");
  form.set("bodyText", RFQ_EMAIL);
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

describe("per-org monthly LLM spend cap", () => {
  it("refuses extraction with 402 llm_budget_exceeded and leaves the RFQ unextracted", async () => {
    const t = await setupTenant();
    const rfq = await textRfq(t);
    testFakes.llmBudget = exhaustedOrgGuard();

    const res = await api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("llm_budget_exceeded");
    expect(body.error.message).toMatch(/monthly AI usage limit/);

    const after = await json<RfqDetailDto>(api(t.path(`/rfqs/${rfq.id}`), { as: t.userId }));
    expect(after.status).not.toBe("extracted");
    expect(after.parts).toEqual([]);

    // Under the cap again (next month, or a raised cap): extraction works.
    testFakes.llmBudget = null;
    const ok = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    expect(ok.status).toBe("extracted");
  });
});

describe("LLM rate limiter", () => {
  it("allows 30 AI requests a minute per user, then 429 with Retry-After", async () => {
    const t = await setupTenant();
    const enforce = { [TEST_RATE_LIMIT_HEADER]: "enforce" };
    const extract = () =>
      api(t.path("/rfqs/rfq_missing/extract"), { method: "POST", as: t.userId, headers: enforce });
    for (let i = 0; i < 30; i++) expect((await extract()).status).toBe(404);
    const limited = await extract();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    // Non-LLM routes are not counted.
    const list = await api(t.path("/quotes"), { as: t.userId, headers: enforce });
    expect(list.status).toBe(200);
    // Quote cover notes share the bucket.
    const cover = await api(t.path("/quotes/q_missing/cover-note"), {
      method: "POST",
      as: t.userId,
      headers: enforce,
    });
    expect(cover.status).toBe(429);
  });
});
