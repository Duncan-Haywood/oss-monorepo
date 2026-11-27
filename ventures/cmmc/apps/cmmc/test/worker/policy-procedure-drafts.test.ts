// "Draft with AI" for a policy's procedures: drafts are stored beside the policy (never in its text),
// built only from the org's own facts, counted against the plan's AI drafts, cleared once saved into
// the text, gated by plan and role, and kept to their own organization.
import { replaceProcedure } from "@shared/security-policies";
import { auditLog, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Draft {
  controlId: string;
  text: string;
  questions: string[];
}
interface Detail {
  policy: { body: string; status: string; version: number } | null;
  template: string;
  procedureDrafts: Draft[];
}

const draft = (t: Tenant, family: string, controlId: string, as = t.userId) =>
  api(path(t, `/policies/${family}/procedures/${controlId}/draft`), { method: "POST", as });
const detail = (t: Tenant, family: string, as = t.userId) =>
  json<Detail>(api(path(t, `/policies/${family}`), { as }));

describe("policy procedure drafts", () => {
  it("drafts from the org's notes and accepted statement, kept apart from the policy text", async () => {
    const t = await setupTenant();
    await json(
      api(path(t, "/controls/PS.L2-3.9.1"), {
        method: "PATCH",
        as: t.userId,
        json: { notes: "Office manager runs background checks through the staffing agency." },
      }),
    );
    const d = await json<Draft>(draft(t, "PS", "PS.L2-3.9.1"));
    expect(d.controlId).toBe("PS.L2-3.9.1");
    expect(d.text).toContain("Office manager runs background checks");
    expect(d.text).toContain("[CONFIRM:");
    expect(d.questions.length).toBeGreaterThan(0);

    const page = await detail(t, "PS");
    expect(page.policy).toBeNull();
    expect(page.template).not.toContain("Office manager runs background checks");
    expect(page.procedureDrafts.map((p) => p.controlId)).toEqual(["PS.L2-3.9.1"]);

    // A second draft replaces the first (one per requirement).
    await json(draft(t, "PS", "PS.L2-3.9.1"));
    expect((await detail(t, "PS")).procedureDrafts).toHaveLength(1);

    // Every draft is audited and counts as an AI draft on the billing page.
    const rows = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, t.orgId), eq(auditLog.action, "policy.procedure_draft")))
      .all();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.targetId).toBe("PS:PS.L2-3.9.1");
    const billing = await json<{ usage: { draftsThisMonth: number } }>(
      api(path(t, "/billing"), { as: t.userId }),
    );
    expect(billing.usage.draftsThisMonth).toBe(2);
  });

  it("saves a procedure into the policy text, then discards that draft and keeps the others", async () => {
    const t = await setupTenant();
    await json(draft(t, "PS", "PS.L2-3.9.1"));
    await json(draft(t, "PS", "PS.L2-3.9.2"));
    // What the page does on "Put in the policy and save": the edited draft under its heading, saved,
    // then the draft discarded.
    const { template } = await detail(t, "PS");
    const body = replaceProcedure(template, "3.9.1", "1. The office manager screens every hire.");
    const saved = await json<Detail>(
      api(path(t, "/policies/PS"), { method: "PUT", as: t.userId, json: { body } }),
    );
    expect(saved.policy?.status).toBe("draft");
    expect(saved.policy?.body).toContain("### 3.9.1\n\n1. The office manager screens every hire.");
    await json(
      api(path(t, "/policies/PS/procedures/PS.L2-3.9.1/draft"), { method: "DELETE", as: t.userId }),
    );
    expect((await detail(t, "PS")).procedureDrafts.map((p) => p.controlId)).toEqual([
      "PS.L2-3.9.2",
    ]);

    // Deleting the policy (admins) takes its drafts with it.
    await json(api(path(t, "/policies/PS"), { method: "DELETE", as: t.userId }));
    expect((await detail(t, "PS")).procedureDrafts).toEqual([]);
  });

  it("refuses a requirement outside the family, and one that does not exist", async () => {
    const t = await setupTenant();
    expect((await draft(t, "PS", "AC.L2-3.1.1")).status).toBe(404);
    expect((await draft(t, "PS", "NOPE")).status).toBe(404);
    expect((await draft(t, "XX", "PS.L2-3.9.1")).status).toBe(404);
  });

  it("needs the Level 2 plan and an editor, and stops at the month's AI drafts", async () => {
    const free = await setupTenant("owner", "Free Shop", null);
    expect((await draft(free, "PS", "PS.L2-3.9.1")).status).toBe(402);

    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await draft(t, "PS", "PS.L2-3.9.1", viewer.id)).status).toBe(403);

    // The paid Level 2 plan includes a monthly allowance; at the limit the draft is refused.
    await testDb()
      .update(subscriptions)
      .set({ planKey: "level2", status: "active" })
      .where(eq(subscriptions.orgId, t.orgId));
    const billing = await json<{ limits: { draftsPerMonth: number } }>(
      api(path(t, "/billing"), { as: t.userId }),
    );
    const limit = billing.limits.draftsPerMonth;
    for (let i = 0; i < limit; i += 10) {
      await testDb()
        .insert(auditLog)
        .values(
          Array.from({ length: Math.min(10, limit - i) }, () => ({
            id: newId("aud"),
            orgId: t.orgId,
            actorUserId: t.userId,
            action: "control.draft",
            targetType: "control",
            targetId: "AC.L2-3.1.1",
          })),
        );
    }
    const res = await draft(t, "PS", "PS.L2-3.9.1");
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /AI drafts a month/,
    );
  });

  it("keeps each organization's drafts to itself", async () => {
    const a = await setupTenant("owner", "Org A");
    const b = await setupTenant("owner", "Org B");
    await json(draft(a, "PS", "PS.L2-3.9.1"));
    expect((await detail(b, "PS")).procedureDrafts).toEqual([]);
    // B's member cannot draft or discard in A's org (not a member: the org is not found).
    expect((await draft(a, "PS", "PS.L2-3.9.1", b.userId)).status).toBe(404);
    const del = await api(path(a, "/policies/PS/procedures/PS.L2-3.9.1/draft"), {
      method: "DELETE",
      as: b.userId,
    });
    expect(del.status).toBe(404);
    expect((await detail(a, "PS")).procedureDrafts).toHaveLength(1);
  });
});
