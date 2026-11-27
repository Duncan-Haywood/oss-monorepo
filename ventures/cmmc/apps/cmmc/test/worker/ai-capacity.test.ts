// The service-wide daily AI cap (services/ai-capacity.ts) counted from real audit rows in D1, across
// organizations. The worker under test runs with the default $1.50 cap, so the cap here is set on a
// context built for the test.
import { env } from "cloudflare:workers";
import { createAppContext } from "@worker/context";
import { auditLog } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { assertServiceDraftCapacity, worstDraftCostMicros } from "@worker/services/ai-capacity";
import { assertCanDraft } from "@worker/services/billing";
import { describe, expect, it } from "vitest";
import { setupTenant, testDb } from "./helpers";

const L1 = "AC.L1-b.1.i";

const ctxWithCap = (cap: string) =>
  createAppContext({ ...(env as unknown as Env), GLOBAL_DAILY_LLM_CAP_USD: cap } as Env);

async function recordDraft(orgId: string, userId: string, action: string, at = new Date()) {
  await testDb()
    .insert(auditLog)
    .values({
      id: newId("aud"),
      orgId,
      actorUserId: userId,
      action,
      targetType: "control",
      targetId: L1,
      createdAt: at,
    });
}

/** A cap that allows exactly `drafts` drafts today on the test model. */
const capFor = (drafts: number) =>
  String((drafts * worstDraftCostMicros((env as unknown as Env).LLM_MODEL)) / 1_000_000);

describe("service-wide daily AI cap", () => {
  it("stops drafts once today's drafts across every organization reach it", async () => {
    const a = await setupTenant("owner", "Shop A", null);
    const b = await setupTenant("owner", "Shop B", null);
    // Other tests may have drafted today: allow exactly two more than are already counted.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const before = (await testDb().select().from(auditLog).all()).filter(
      (r) =>
        (r.action === "control.draft" || r.action === "policy.procedure_draft") &&
        r.createdAt >= today,
    ).length;
    const ctx = ctxWithCap(capFor(before + 2));
    await assertServiceDraftCapacity(ctx);
    await recordDraft(a.orgId, a.userId, "control.draft");
    // Yesterday's drafts and other audit actions do not count.
    await recordDraft(b.orgId, b.userId, "control.draft", new Date(Date.now() - 86_400_000 - 1));
    await recordDraft(b.orgId, b.userId, "control.update");
    await assertCanDraft(ctx, b.orgId, L1);
    // A policy procedure draft in another org takes the last slot.
    await recordDraft(b.orgId, b.userId, "policy.procedure_draft");
    await expect(assertCanDraft(ctx, a.orgId, L1)).rejects.toMatchObject({
      status: 429,
      code: "llm_capacity_exhausted",
    });
    await expect(assertCanDraft(ctxWithCap("off"), a.orgId, L1)).resolves.toBeUndefined();
  });

  it('"0" stops every draft without counting', async () => {
    const t = await setupTenant("owner", "Shop C", null);
    await expect(assertCanDraft(ctxWithCap("0"), t.orgId, L1)).rejects.toMatchObject({
      status: 429,
    });
  });

  it("a shop at its own monthly allowance is told about its plan, not the pause", async () => {
    const t = await setupTenant("owner", "Shop D", null);
    for (let i = 0; i < 10; i++) await recordDraft(t.orgId, t.userId, "control.draft");
    await expect(assertCanDraft(ctxWithCap("0"), t.orgId, L1)).rejects.toMatchObject({
      status: 402,
    });
  });
});
