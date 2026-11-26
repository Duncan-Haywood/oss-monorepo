// Runs the real spend queries against local D1 (llm_calls schema + index).
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { llmCalls, organization } from "../../db/schema";
import { newId } from "../../lib/ids";
import { BudgetExceededError, createLlmBudgetGuard, d1SpendSource, SpendCache } from "./llm-budget";

const db = createDb(env.DB);

async function org() {
  const id = newId("org");
  await db.insert(organization).values({ id, name: "Budget Org", slug: id });
  return id;
}

const call = (orgId: string | null, costMicros: number, createdAt: Date) => ({
  id: newId("llm"),
  orgId,
  purpose: "drafting.section",
  model: "claude-opus-5-5",
  costMicros,
  createdAt,
});

describe("d1SpendSource", () => {
  it("sums cost_micros per org since a date, ignoring other orgs and older rows", async () => {
    const a = await org();
    const b = await org();
    await db
      .insert(llmCalls)
      .values([
        call(a, 1_000_000, new Date("2026-11-02T10:00:00Z")),
        call(a, 2_500_000, new Date("2026-11-18T10:00:00Z")),
        call(a, 9_000_000, new Date("2026-10-31T23:59:59Z")),
        call(b, 7_000_000, new Date("2026-11-05T10:00:00Z")),
      ]);
    const source = d1SpendSource(db);
    const since = new Date("2026-11-01T00:00:00Z");
    expect(await source.orgSpendSince(a, since)).toBe(3_500_000);
    expect(await source.orgSpendSince(b, since)).toBe(7_000_000);
    expect(await source.orgSpendSince("org_missing", since)).toBe(0);
    expect(await source.globalSpendSince(new Date("2026-11-18T00:00:00Z"))).toBeGreaterThanOrEqual(
      2_500_000,
    );
  });

  it("blocks an org over its cap end to end", async () => {
    const a = await org();
    const now = new Date();
    await db.insert(llmCalls).values(call(a, 26_000_000, now));
    const guard = createLlmBudgetGuard({ GLOBAL_DAILY_LLM_CAP_USD: "off" }, db, undefined, {
      now: () => now,
      cache: new SpendCache(),
    });
    await expect(guard.assertWithinBudget(a, "drafting.section")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });
});
