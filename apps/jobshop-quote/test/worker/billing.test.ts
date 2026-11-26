// Plans, limits, checkout and the provider webhook, through the HTTP API. APP_ENV=test selects
// packages/billing's signed fake provider, so signature rejection is exercised for real.
import { fakeWebhookRequest, signCheckoutToken } from "@billing";
import type { BillingDto, PlanDto, RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { pendingCheckouts, rfqCounts, rfqs, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { planLlmCapMicros } from "@worker/services/billing";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { addMember, api, BASE, createTestUser, json, setupTenant, testDb, worker } from "./helpers";

afterEach(() => {
  testFakes.llmHandlers.clear();
});

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function grantPlan(
  orgId: string,
  planKey: string,
  status: "comp" | "active" | "past_due" | "canceled",
) {
  await testDb()
    .insert(subscriptions)
    .values({ orgId, planKey, status })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { planKey, status } });
}

const billing = (t: Tenant, as = t.userId) => json<BillingDto>(api(t.path("/billing"), { as }));

const RFQ_TEXT = `From: buyer@example.com
Company: Example Robotics LLC
Please quote part number BRK-1001 Rev B, material 6061-T6 aluminum, qty 10.`;

async function newRfq(t: Tenant) {
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), {
      method: "POST",
      as: t.userId,
      json: { subject: "RFQ", bodyText: RFQ_TEXT },
    }),
    201,
  );
}

const extract = (t: Tenant, rfqId: string) =>
  api(t.path(`/rfqs/${rfqId}/extract`), { method: "POST", as: t.userId });

/** Marks `n` RFQs as already read by the AI this month (the cheap way to reach an allowance). */
async function useAllowance(orgId: string, userId: string, n: number) {
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const id = newId("rfq");
    await testDb()
      .insert(rfqs)
      .values({ id, orgId, bodyText: "x", createdBy: userId, countedAt: now });
    await testDb()
      .insert(rfqCounts)
      .values({ id: newId("rfc"), orgId, rfqId: id, units: 1, pages: 0, countedAt: now });
  }
}

/** A drawing set of `pages` pages (an uncompressed PDF whose page tree says so). */
function drawingPdf(pages: number, name = "drawings.pdf") {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ");
  let body = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  body += `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages} >>\nendobj\n`;
  for (let i = 0; i < pages; i++) {
    body += `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`;
  }
  return new File([`${body}%%EOF\n`], name, { type: "application/pdf" });
}

async function rfqWithDrawings(t: Tenant, ...files: File[]) {
  const form = new FormData();
  form.set("subject", "RFQ");
  form.set("bodyText", RFQ_TEXT);
  for (const f of files) form.append("files", f);
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

async function checkout(t: Tenant, plan = "shop", interval = "month") {
  const { url } = await json<{ url: string }>(
    api(t.path("/billing/checkout"), { method: "POST", as: t.userId, json: { plan, interval } }),
  );
  const rows = await testDb()
    .select()
    .from(pendingCheckouts)
    .where(eq(pendingCheckouts.orgId, t.orgId))
    .all();
  return { url, pending: rows.at(-1) };
}

const tokenFor = (orgId: string, checkoutId: string) =>
  signCheckoutToken(TEST_AUTH_SECRET, checkoutId, orgId);

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

describe("plans and limits", () => {
  it("lists public plans without signing in, never the complimentary plan", async () => {
    const { items } = await json<{ items: PlanDto[] }>(api("/api/billing/plans"));
    expect(items.map((p) => p.key)).toEqual(["free", "shop", "shop_plus"]);
    expect(items.find((p) => p.key === "shop")).toMatchObject({
      priceCents: 19_900,
      rfqsPerMonth: 125,
      maxMembers: 3,
    });
  });

  it("a new shop is on early access: 40 RFQs a month, 3 users, checkout offered", async () => {
    const t = await setupTenant();
    const b = await billing(t);
    expect(b.plan).toEqual({ key: "free", name: "Early access" });
    expect(b.status).toBe("none");
    expect(b.checkoutAvailable).toBe(true);
    expect(b.limits).toEqual({ rfqsPerMonth: 40, members: 3 });
    expect(b.usage).toEqual({ rfqsThisMonth: 0, members: 1, pendingInvitations: 0 });
    expect(b.allowanceResetsOn).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("an RFQ counts once, on its first AI read; re-reading it is free", async () => {
    const t = await setupTenant();
    const rfq = await newRfq(t);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(0); // intake alone never counts
    expect((await extract(t, rfq.id)).status).toBe(200);
    expect((await extract(t, rfq.id)).status).toBe(200);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(1);
  });

  it("over the allowance, a new RFQ's AI read is 402 but the RFQ can still be quoted by hand", async () => {
    const t = await setupTenant();
    const before = await newRfq(t);
    await extract(t, before.id); // counted inside the allowance
    await useAllowance(t.orgId, t.userId, 39);
    const rfq = await newRfq(t);
    const res = await extract(t, rfq.id);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("payment_required");
    expect(body.error.message).toContain("enter parts by hand");
    // Not counted, and nothing else is blocked: a part entered by hand, and the old RFQ re-read.
    expect((await billing(t)).usage.rfqsThisMonth).toBe(40);
    const part = await api(t.path(`/rfqs/${rfq.id}/parts`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: "BRK-1001", quantities: [10] },
    });
    expect(part.status).toBe(201);
    expect((await extract(t, before.id)).status).toBe(200);
  });

  it("a drawing package counts once per 10 pages, shown on the RFQ before the read", async () => {
    const t = await setupTenant();
    const rfq = await rfqWithDrawings(
      t,
      drawingPdf(18, "set-a.pdf"),
      drawingPdf(4, "set-b.pdf"),
      new File(["png"], "photo.png", { type: "image/png" }),
    );
    expect(rfq.files.map((f) => f.pageCount)).toEqual([18, 4, null]);
    expect(rfq.allowance).toEqual({ pages: 23, units: 3, counted: 0 });
    const read = await json<RfqDetailDto>(extract(t, rfq.id));
    expect(read.allowance).toEqual({ pages: 23, units: 3, counted: 3 });
    expect((await billing(t)).usage.rfqsThisMonth).toBe(3);
    expect((await extract(t, rfq.id)).status).toBe(200); // re-reading is free
    expect((await billing(t)).usage.rfqsThisMonth).toBe(3);
  });

  it("up to 10 pages is one RFQ; drawings added later count only past each 10 pages", async () => {
    const t = await setupTenant();
    const rfq = await rfqWithDrawings(t, drawingPdf(7));
    await extract(t, rfq.id);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(1);
    const add = (f: File) => {
      const form = new FormData();
      form.append("files", f);
      return json<RfqDetailDto>(
        api(t.path(`/rfqs/${rfq.id}/files`), { method: "POST", as: t.userId, body: form }),
      );
    };
    expect((await add(drawingPdf(3, "rev.pdf"))).allowance).toEqual({
      pages: 10,
      units: 1,
      counted: 1,
    });
    await extract(t, rfq.id);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(1);
    expect((await add(drawingPdf(12, "more.pdf"))).allowance).toEqual({
      pages: 22,
      units: 3,
      counted: 1,
    });
    await extract(t, rfq.id);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(3);
  });

  it("a package bigger than what is left is 402 and says how many it needs", async () => {
    const t = await setupTenant();
    await useAllowance(t.orgId, t.userId, 38);
    const rfq = await rfqWithDrawings(t, drawingPdf(31));
    const res = await extract(t, rfq.id);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("needs 4 RFQs");
    expect(body.error.message).toContain("2 are left");
    expect((await billing(t)).usage.rfqsThisMonth).toBe(38);
    // A smaller RFQ still fits.
    expect((await extract(t, (await rfqWithDrawings(t, drawingPdf(20))).id)).status).toBe(200);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(40);
  });

  it("two reads of the same package at once count it once", async () => {
    const t = await setupTenant();
    const rfq = await rfqWithDrawings(t, drawingPdf(25));
    const [a, b] = await Promise.all([extract(t, rfq.id), extract(t, rfq.id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(3);
  });

  it("an unreadable PDF counts as one page, never a guess", async () => {
    const t = await setupTenant();
    const rfq = await rfqWithDrawings(
      t,
      new File(["%PDF-1.7 broken"], "scan.pdf", { type: "application/pdf" }),
    );
    expect(rfq.files[0]?.pageCount).toBeNull();
    expect(rfq.allowance).toEqual({ pages: 1, units: 1, counted: 0 });
  });

  it("another shop's RFQs never count against this one", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await extract(a, (await rfqWithDrawings(a, drawingPdf(25))).id);
    expect((await billing(a)).usage.rfqsThisMonth).toBe(3);
    expect((await billing(b)).usage.rfqsThisMonth).toBe(0);
  });

  it("a failed AI read gives the RFQ back", async () => {
    const t = await setupTenant();
    const rfq = await newRfq(t);
    testFakes.llmHandlers.set("rfq.extract", () => {
      throw new Error("model unavailable");
    });
    expect((await extract(t, rfq.id)).status).toBe(500);
    expect((await billing(t)).usage.rfqsThisMonth).toBe(0);
    expect(
      await testDb().select().from(rfqCounts).where(eq(rfqCounts.rfqId, rfq.id)).all(),
    ).toEqual([]);
    const row = await testDb()
      .select({ countedAt: rfqs.countedAt })
      .from(rfqs)
      .where(and(eq(rfqs.id, rfq.id), eq(rfqs.orgId, t.orgId)))
      .get();
    expect(row?.countedAt).toBeNull();
  });

  it("a paid plan raises the allowance; a lapsed one falls back to early access", async () => {
    const t = await setupTenant();
    await useAllowance(t.orgId, t.userId, 40);
    await grantPlan(t.orgId, "shop", "active");
    expect((await billing(t)).limits.rfqsPerMonth).toBe(125);
    expect((await extract(t, (await newRfq(t)).id)).status).toBe(200);
    await grantPlan(t.orgId, "shop", "canceled");
    const b = await billing(t);
    expect(b.plan.key).toBe("free");
    expect(b.lapsed).toBe(true);
    expect((await extract(t, (await newRfq(t)).id)).status).toBe(402);
  });

  it("seats: members plus open invitations stay within the plan", async () => {
    const t = await setupTenant();
    await addMember(t.orgId, "estimator");
    const invite = (email: string) =>
      api(t.path("/members/invitations"), {
        method: "POST",
        as: t.userId,
        json: { email, role: "estimator" },
      });
    expect((await invite("third@example.test")).status).toBe(201);
    const fourth = await invite("fourth@example.test");
    expect(fourth.status).toBe(402);
    expect((await billing(t)).usage).toMatchObject({ members: 2, pendingInvitations: 1 });
    await grantPlan(t.orgId, "shop_plus", "active");
    expect((await invite("fourth@example.test")).status).toBe(201);
  });

  it("an invitation cannot be accepted once the shop has no free seat", async () => {
    const t = await setupTenant();
    const invitee = await createTestUser();
    const inv = await json<{ token: string }>(
      api(t.path("/members/invitations"), {
        method: "POST",
        as: t.userId,
        json: { email: invitee.email, role: "estimator" },
      }),
      201,
    );
    // Seats filled after the invitation went out.
    await addMember(t.orgId, "viewer");
    await addMember(t.orgId, "viewer");
    const res = await api(`/api/invitations/${inv.token}/accept`, {
      method: "POST",
      as: invitee.id,
    });
    expect(res.status).toBe(402);
  });

  it("the plan sets the shop's monthly AI ceiling", async () => {
    const t = await setupTenant();
    const now = new Date();
    expect(await planLlmCapMicros(testDb(), t.orgId, now)).toBe(20_000_000);
    await grantPlan(t.orgId, "shop_plus", "active");
    expect(await planLlmCapMicros(testDb(), t.orgId, now)).toBe(150_000_000);
  });
});

describe("checkout", () => {
  it("is admin-only and never sells the free or complimentary plan", async () => {
    const t = await setupTenant();
    const estimator = await addMember(t.orgId, "estimator");
    const denied = await api(t.path("/billing/checkout"), {
      method: "POST",
      as: estimator,
      json: { plan: "shop" },
    });
    expect(denied.status).toBe(403);
    // Any member can see the plan and usage.
    expect((await billing(t, estimator)).plan.key).toBe("free");
    for (const plan of ["free", "comp", "nope"]) {
      const res = await api(t.path("/billing/checkout"), {
        method: "POST",
        as: t.userId,
        json: { plan },
      });
      expect(res.status).toBe(400);
    }
  });

  it("stores a pending checkout and returns the provider URL back to the billing page", async () => {
    const t = await setupTenant();
    const { url, pending } = await checkout(t, "shop_plus", "year");
    expect(url).toContain("fake_checkout=shop_plus%3Aannual");
    expect(url).toContain(`/app/${t.orgId}/billing`);
    expect(pending).toMatchObject({ planKey: "shop_plus", interval: "year", consumedAt: null });
  });

  it("rejects an unknown promo code with 400", async () => {
    const t = await setupTenant();
    const res = await api(t.path("/billing/checkout"), {
      method: "POST",
      as: t.userId,
      json: { plan: "shop", promoCode: "NOTREAL" },
    });
    expect(res.status).toBe(400);
  });

  it("the portal needs a paid subscription", async () => {
    const t = await setupTenant();
    const res = await api(t.path("/billing/portal"), { method: "POST", as: t.userId });
    expect(res.status).toBe(400);
  });
});

describe("webhook", () => {
  it("rejects a bad signature with 401", async () => {
    const res = await webhook({ providerEventId: "evt_bad" }, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("a checkout's webhook upgrades the shop; a duplicate delivery is a no-op", async () => {
    const t = await setupTenant();
    const { pending } = await checkout(t, "shop");
    const body = {
      providerEventId: `evt_${++seq}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:01Z",
      customData: { checkoutToken: await tokenFor(t.orgId, pending?.id ?? "") },
      subscription: sub("shop", "sub_upgrade", "ctm_upgrade"),
    };
    expect((await webhook(body)).body).toEqual({ outcome: "applied" });
    expect((await webhook(body)).body).toEqual({ outcome: "duplicate" });
    const b = await billing(t);
    expect(b.plan.key).toBe("shop");
    expect(b.status).toBe("active");
    expect(b.portalAvailable).toBe(true);
    expect(b.limits.rfqsPerMonth).toBe(125);
    // Later events bind through the stored subscription id, with no token.
    const canceled = await webhook({
      providerEventId: `evt_${++seq}`,
      occurredAt: "2026-11-20T00:00:00Z",
      subscription: { ...sub("shop", "sub_upgrade", "ctm_upgrade"), status: "canceled" },
    });
    expect(canceled.body).toEqual({ outcome: "applied" });
    const after = await billing(t);
    expect(after.plan.key).toBe("free");
    expect(after.lapsed).toBe(true);
  });

  it("ignores a crafted custom_data.orgId and an unsigned token", async () => {
    const victim = await setupTenant();
    const res = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { orgId: victim.orgId, checkoutToken: "pco_aaaaaaaaaaaaaaaaaaaa.00" },
      subscription: sub("shop_plus", "sub_crafted", "ctm_attacker"),
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

  it("a token is consumed once: a second subscription replaying it is ignored", async () => {
    const t = await setupTenant();
    const { pending } = await checkout(t, "shop");
    const token = await tokenFor(t.orgId, pending?.id ?? "");
    const first = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("shop", "sub_first", "ctm_same"),
    });
    expect(first.body.outcome).toBe("applied");
    const replay = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("shop_plus", "sub_second", "ctm_same"),
    });
    expect(replay.body).toEqual({ outcome: "ignored", reason: "checkout token replay" });
  });

  it("never grants the complimentary plan, and never lets another customer take over", async () => {
    const t = await setupTenant();
    const { pending } = await checkout(t, "shop");
    const token = await tokenFor(t.orgId, pending?.id ?? "");
    const comp = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("comp", "sub_comp", "ctm_owner"),
    });
    expect(comp.body).toEqual({ outcome: "ignored", reason: "unknown plan" });
    await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("shop", "sub_owner", "ctm_owner"),
    });
    const { pending: p2 } = await checkout(t, "shop_plus");
    const takeover = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: await tokenFor(t.orgId, p2?.id ?? "") },
      subscription: sub("shop_plus", "sub_other", "ctm_other"),
    });
    expect(takeover.body).toEqual({ outcome: "ignored", reason: "customer mismatch" });
  });

  it("a webhook for one shop's subscription cannot touch another shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const { pending } = await checkout(a, "shop");
    await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: await tokenFor(a.orgId, pending?.id ?? "") },
      subscription: sub("shop", "sub_a", "ctm_a"),
    });
    // A token signed for shop A's checkout id but claiming shop B fails verification.
    const forged = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: await tokenFor(b.orgId, pending?.id ?? "") },
      subscription: sub("shop_plus", "sub_b", "ctm_b"),
    });
    expect(forged.body).toEqual({ outcome: "ignored", reason: "invalid checkout token" });
    expect((await billing(b)).plan.key).toBe("free");
    // And B's members cannot read or buy for A.
    expect((await api(a.path("/billing"), { as: b.userId })).status).toBeGreaterThanOrEqual(403);
    const buy = await api(a.path("/billing/checkout"), {
      method: "POST",
      as: b.userId,
      json: { plan: "shop" },
    });
    expect(buy.status).toBeGreaterThanOrEqual(403);
  });
});
