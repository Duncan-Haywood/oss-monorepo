// Plans, limits, checkout and the provider webhook, through the HTTP API. APP_ENV=test selects
// packages/billing's signed fake provider, so signature rejection is exercised for real.
import { fakeWebhookRequest, signCheckoutToken } from "@billing";
import type { BillingDto, PlanDto } from "@shared/plans";
import { auditLog, evidence, pendingCheckouts, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, BASE, createTestUser, setupTenant, testDb, worker } from "./helpers";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
const L1 = "AC.L1-b.1.i";
const L2 = "AC.L2-3.1.1";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const freeTenant = () => setupTenant("owner", "Free Shop", null);
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status).toBe(status);
  return (await r.json()) as T;
}

const billing = (t: Tenant, as = t.userId) => json<BillingDto>(api(path(t, "/billing"), { as }));

async function grantPlan(orgId: string, planKey: string, status: "comp" | "active" | "canceled") {
  await testDb()
    .insert(subscriptions)
    .values({ orgId, planKey, status })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { planKey, status } });
}

const patchControl = (t: Tenant, controlId: string) =>
  api(path(t, `/controls/${controlId}`), {
    method: "PATCH",
    as: t.userId,
    json: { status: "implemented", notes: "MFA on every account" },
  });

function upload(t: Tenant, controlId?: string) {
  const fd = new FormData();
  fd.set("file", new File(["policy"], "policy.pdf", { type: "application/pdf" }));
  fd.set("title", "Policy");
  if (controlId) fd.set("controlId", controlId);
  fd.set("noCui", "true");
  return api(path(t, "/evidence"), { method: "POST", as: t.userId, body: fd });
}

async function checkout(t: Tenant, plan = "level2", interval = "month") {
  const { url } = await json<{ url: string }>(
    api(path(t, "/billing/checkout"), { method: "POST", as: t.userId, json: { plan, interval } }),
  );
  const rows = await testDb()
    .select()
    .from(pendingCheckouts)
    .where(eq(pendingCheckouts.orgId, t.orgId))
    .all();
  return { url, pending: rows.at(-1) };
}

let seq = 0;
async function webhook(body: Parameters<typeof fakeWebhookRequest>[1], secret?: string) {
  const req = await fakeWebhookRequest(`${BASE}/api/billing/webhook`, body, secret);
  const res = await worker.fetch(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const sub = (planKey: string, id: string, customer: string, status = "active" as const) => ({
  planKey,
  status,
  providerCustomerId: customer,
  providerSubscriptionId: id,
  currentPeriodStart: "2026-11-01T00:00:00Z",
  currentPeriodEnd: "2026-12-01T00:00:00Z",
});

describe("plans", () => {
  it("health names the app and whether checkout is on (the deploy smoke test reads both)", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    // The tests run on the signed fake provider, so checkout is on here; a deploy without the
    // Paddle secrets reports billing: false.
    // Mail stays in memory in tests, so `email` is false (nothing leaves the Worker).
    expect(await res.json()).toEqual({
      ok: true,
      app: "cmmc-workspace",
      billing: true,
      email: false,
    });
  });

  it("lists public plans without signing in, never the complimentary plan", async () => {
    const { items } = await json<{ items: PlanDto[] }>(api("/api/billing/plans"));
    expect(items.map((p) => p.key)).toEqual(["free", "level2", "team"]);
    expect(items.find((p) => p.key === "level2")).toMatchObject({
      priceCents: 24_900,
      level2: true,
      maxMembers: 3,
    });
  });

  it("a new org is on the free Level 1 plan with checkout offered", async () => {
    const t = await freeTenant();
    const b = await billing(t);
    expect(b.plan).toEqual({ key: "free", name: "Level 1", level2: false, quality: false });
    expect(b.status).toBe("none");
    expect(b.checkoutAvailable).toBe(true);
    expect(b.portalAvailable).toBe(false);
    expect(b.limits).toEqual({ members: 1, draftsPerMonth: 10, evidenceBytes: 250 * 1024 ** 2 });
    expect(b.usage).toEqual({ members: 1, draftsThisMonth: 0, evidenceBytes: 0 });
  });
});

describe("limits", () => {
  it("free: Level 1 is recorded, Level 2 answers wait for a paid plan but stay readable", async () => {
    const t = await freeTenant();
    expect((await patchControl(t, L1)).status).toBe(200);
    const denied = await patchControl(t, L2);
    expect(denied.status).toBe(402);
    expect(((await denied.json()) as { error: { message: string } }).error.message).toMatch(
      /needs the Level 2 plan/,
    );
    expect(
      (await api(path(t, `/controls/${L2}/draft`), { method: "POST", as: t.userId })).status,
    ).toBe(402);
    expect((await upload(t, L2)).status).toBe(402);
    const poam = await api(path(t, "/poam"), {
      method: "POST",
      as: t.userId,
      json: { controlId: L2, weakness: "No MFA", scheduledCompletion: "2027-01-31" },
    });
    expect(poam.status).toBe(402);
    // Reading Level 2 is never blocked.
    expect((await api(path(t, "/controls?level=2"), { as: t.userId })).status).toBe(200);
    expect((await api(path(t, "/score?level=2"), { as: t.userId })).status).toBe(200);
    expect((await api(path(t, "/ssp/download?level=2"), { as: t.userId })).status).toBe(200);
    // An upload with no control, or a Level 1 one, is fine.
    expect((await upload(t)).status).toBe(201);
    expect((await upload(t, L1)).status).toBe(201);
  });

  it("a lapsed Level 2 org keeps its answers and POA&M readable but cannot change them", async () => {
    const t = await setupTenant("owner", "Lapsed Shop", null);
    await grantPlan(t.orgId, "level2", "active");
    expect((await patchControl(t, L2)).status).toBe(200);
    const item = await json<{ id: string }>(
      api(path(t, "/poam"), {
        method: "POST",
        as: t.userId,
        json: { controlId: L2, weakness: "No MFA", scheduledCompletion: "2027-01-31" },
      }),
      201,
    );
    await grantPlan(t.orgId, "level2", "canceled");
    expect((await billing(t)).lapsed).toBe(true);
    expect((await patchControl(t, L2)).status).toBe(402);
    const edit = await api(path(t, `/poam/${item.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { status: "closed" },
    });
    expect(edit.status).toBe(402);
    const ctl = await json<{ record: { status: string } }>(
      api(path(t, `/controls/${L2}`), { as: t.userId }),
    );
    expect(ctl.record.status).toBe("implemented");
    expect((await api(path(t, "/poam/export.csv"), { as: t.userId })).status).toBe(200);
  });

  it("seats: the free plan has one user; Level 2 has three", async () => {
    const t = await freeTenant();
    const other = await createTestUser("Second");
    const add = () =>
      api(path(t, "/members"), {
        method: "POST",
        as: t.userId,
        json: { email: other.email, role: "editor" },
      });
    expect((await add()).status).toBe(402);
    await grantPlan(t.orgId, "level2", "active");
    expect((await add()).status).toBe(201);
    const third = await createTestUser("Third");
    await addToOrg(t.orgId, third.id, "viewer");
    const fourth = await createTestUser("Fourth");
    const res = await api(path(t, "/members"), {
      method: "POST",
      as: t.userId,
      json: { email: fourth.email, role: "viewer" },
    });
    expect(res.status).toBe(402);
  });

  it("AI drafts stop at the month's allowance and are counted on the billing page", async () => {
    const t = await freeTenant();
    const draft = () => api(path(t, `/controls/${L1}/draft`), { method: "POST", as: t.userId });
    expect((await draft()).status).toBe(200);
    expect((await billing(t)).usage.draftsThisMonth).toBe(1);
    for (let i = 0; i < 9; i++) {
      await testDb()
        .insert(auditLog)
        .values({
          id: newId("aud"),
          orgId: t.orgId,
          actorUserId: t.userId,
          action: "control.draft",
          targetType: "control",
          targetId: L1,
        });
    }
    const res = await draft();
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /10 AI drafts a month/,
    );
  });

  it("evidence uploads stop at the plan's storage", async () => {
    const t = await freeTenant();
    await testDb()
      .insert(evidence)
      .values({
        id: newId("evd"),
        orgId: t.orgId,
        title: "Big",
        fileName: "big.pdf",
        contentType: "application/pdf",
        sizeBytes: 250 * 1024 ** 2,
        sha256: "0",
        r2Key: `orgs/${t.orgId}/evidence/x`,
      });
    const res = await upload(t);
    expect(res.status).toBe(402);
    expect((await billing(t)).usage.evidenceBytes).toBe(250 * 1024 ** 2);
  });
});

describe("checkout", () => {
  it("is admin-only and never sells the free or complimentary plan", async () => {
    const t = await freeTenant();
    const editor = await createTestUser("Editor");
    await addToOrg(t.orgId, editor.id, "editor");
    const denied = await api(path(t, "/billing/checkout"), {
      method: "POST",
      as: editor.id,
      json: { plan: "level2" },
    });
    expect(denied.status).toBe(403);
    expect((await billing(t, editor.id)).plan.key).toBe("free");
    for (const plan of ["free", "comp", "nope"]) {
      const res = await api(path(t, "/billing/checkout"), {
        method: "POST",
        as: t.userId,
        json: { plan },
      });
      expect(res.status).toBe(400);
    }
  });

  it("stores a pending checkout and returns to the billing tab", async () => {
    const t = await freeTenant();
    const { url, pending } = await checkout(t, "team", "year");
    expect(url).toContain("fake_checkout=team%3Aannual");
    expect(url).toContain("tab=billing");
    expect(pending).toMatchObject({ planKey: "team", interval: "year", consumedAt: null });
  });

  it("the portal needs a paid subscription", async () => {
    const t = await freeTenant();
    const res = await api(path(t, "/billing/portal"), { method: "POST", as: t.userId });
    expect(res.status).toBe(400);
  });
});

describe("webhook", () => {
  it("rejects a bad signature with 401", async () => {
    const res = await webhook({ providerEventId: "evt_bad" }, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("a checkout's webhook unlocks Level 2; a duplicate delivery is a no-op", async () => {
    const t = await freeTenant();
    expect((await patchControl(t, L2)).status).toBe(402);
    const { pending } = await checkout(t, "level2");
    const body = {
      providerEventId: `evt_${++seq}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:01Z",
      customData: {
        checkoutToken: await signCheckoutToken(TEST_AUTH_SECRET, pending?.id ?? "", t.orgId),
      },
      subscription: sub("level2", "sub_upgrade", "ctm_upgrade"),
    };
    expect((await webhook(body)).body).toEqual({ outcome: "applied" });
    expect((await webhook(body)).body).toEqual({ outcome: "duplicate" });
    const b = await billing(t);
    expect(b.plan).toEqual({ key: "level2", name: "Level 2", level2: true, quality: false });
    expect(b.portalAvailable).toBe(true);
    expect((await patchControl(t, L2)).status).toBe(200);
  });

  it("ignores a crafted custom_data.orgId and an unsigned token", async () => {
    const victim = await freeTenant();
    const res = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { orgId: victim.orgId, checkoutToken: "pco_aaaaaaaaaaaaaaaaaaaa.00" },
      subscription: sub("team", "sub_crafted", "ctm_attacker"),
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored");
    const row = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, victim.orgId))
      .get();
    expect(row).toBeUndefined();
  });

  it("never grants the complimentary plan from a webhook", async () => {
    const t = await freeTenant();
    const { pending } = await checkout(t, "level2");
    const res = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: {
        checkoutToken: await signCheckoutToken(TEST_AUTH_SECRET, pending?.id ?? "", t.orgId),
      },
      subscription: sub("comp", "sub_comp", "ctm_comp"),
    });
    expect(res.body.outcome).toBe("ignored");
    expect((await billing(t)).plan.key).toBe("free");
  });
});
