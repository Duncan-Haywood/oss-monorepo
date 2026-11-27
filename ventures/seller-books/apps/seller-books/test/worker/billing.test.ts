// Plans, limits, checkout and the provider webhook, through the HTTP API. APP_ENV=test selects
// packages/billing's signed fake provider, so signature rejection is exercised for real.
import { fakeWebhookRequest, signCheckoutToken } from "@billing";
import type { BillingDto, PlanDto } from "@shared/plans";
import { pendingCheckouts, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import ebayCsv from "../fixtures/ebay-transaction-report.csv?raw";
import poshCsv from "../fixtures/poshmark-my-sales-report.csv?raw";
import { api, BASE, createTestUser, grantPlan, setupTenant, testDb, worker } from "./helpers";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const freeTenant = () => setupTenant("owner", null);
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status).toBe(status);
  return (await r.json()) as T;
}

const billing = (t: Tenant, as = t.userId) => json<BillingDto>(api(path(t, "/billing"), { as }));

const upload = (t: Tenant, report: string, csv: string) =>
  api(path(t, "/imports"), {
    method: "POST",
    as: t.userId,
    json: { report, fileName: "report.csv", csv },
  });

/** A Mercari sales report with `n` completed orders sold on `date` (ids unique per call). */
function mercari(n: number, date: string) {
  const head =
    '"Item Id","Sold Date","Completed Date","Order Status","Item Title","Item Price","Buyer Shipping Fee","Seller Shipping Fee","Mercari Selling Fee","Payment Processing Fee","Shipping Adjustment Fee","Sales Tax Charged to Buyer","Buyer Protection Charged to Buyer","Net Seller Proceeds"';
  const tag = crypto.randomUUID().slice(0, 8);
  const rows = Array.from(
    { length: n },
    (_, i) =>
      `"m${tag}${i}","${date}","${date}","completed","Item ${i}","10.00","0.00","0.00","1.00","0.00","0.00","0.00","0.00","9.00"`,
  );
  return [head, ...rows].join("\n");
}

const invite = (t: Tenant, email: string) =>
  api(path(t, "/members/invitations"), {
    method: "POST",
    as: t.userId,
    json: { email, role: "editor" },
  });

async function checkout(t: Tenant, plan = "fulltime", interval = "month") {
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
  it("health names the app and whether checkout is on", async () => {
    // Tests run on the signed fake provider, so checkout is on; a deploy without Paddle secrets
    // reports billing: false.
    expect(await json(api("/api/health"))).toEqual({
      ok: true,
      app: "seller-books",
      billing: true,
      email: false,
    });
  });

  it("lists the public plans without signing in, free first, and never the complimentary one", async () => {
    const { items } = await json<{ items: PlanDto[] }>(api("/api/billing/plans"));
    expect(items.map((p) => [p.key, p.priceCents, p.annualPriceCents])).toEqual([
      ["free", 0, null],
      ["side", 1_500, 15_000],
      ["fulltime", 3_500, 35_000],
      ["business", 6_900, 69_000],
    ]);
  });

  it("an org with no subscription is on Free, with its usage", async () => {
    const t = await freeTenant();
    const b = await billing(t);
    expect(b.plan.key).toBe("free");
    expect(b.status).toBe("none");
    expect(b.limits).toEqual({ platforms: 1, members: 1, ordersPerMonth: 25, hardOrderCap: true });
    expect(b.usage).toEqual({ platforms: [], members: 1, ordersThisMonth: 0, busiestMonth: null });
    expect(b.checkoutAvailable).toBe(true);
    expect(b.portalAvailable).toBe(false);
  });

  it("billing is members only (404 for another org's user)", async () => {
    const t = await freeTenant();
    const other = await freeTenant();
    expect((await api(path(t, "/billing"), { as: other.userId })).status).toBe(404);
  });
});

describe("limits", () => {
  it("Free: a second platform is refused with 402 and nothing is imported", async () => {
    const t = await freeTenant();
    expect((await upload(t, "ebay_transaction_report", ebayCsv)).status).toBe(201);
    const res = await upload(t, "poshmark_my_sales_report", poshCsv);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("payment_required");
    expect(body.error.message).toContain("eBay");
    expect(body.error.message).toContain("Poshmark");
    const { items } = await json<{ items: { platform: string }[] }>(
      api(path(t, "/imports"), { as: t.userId }),
    );
    expect(items.map((i) => i.platform)).toEqual(["ebay"]);
    // The platform already used keeps importing.
    expect((await upload(t, "ebay_transaction_report", ebayCsv)).status).toBe(201);
  });

  it("Side hustle: two platforms, the third is refused", async () => {
    const t = await setupTenant("owner", "side");
    expect((await upload(t, "ebay_transaction_report", ebayCsv)).status).toBe(201);
    expect((await upload(t, "poshmark_my_sales_report", poshCsv)).status).toBe(201);
    expect((await upload(t, "mercari_sales_report", mercari(1, "2026-03-01"))).status).toBe(402);
  });

  it("Free: an import that takes a month over 25 orders is refused whole; other months pass", async () => {
    const t = await freeTenant();
    expect((await upload(t, "mercari_sales_report", mercari(20, "2026-03-10"))).status).toBe(201);
    const res = await upload(t, "mercari_sales_report", mercari(6, "2026-03-20"));
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain(
      "2026-03 to 26",
    );
    expect((await upload(t, "mercari_sales_report", mercari(5, "2026-03-21"))).status).toBe(201);
    expect((await upload(t, "mercari_sales_report", mercari(25, "2026-04-02"))).status).toBe(201);
    const b = await billing(t);
    expect(b.usage.busiestMonth).toEqual({ month: "2026-04", orders: 25 });
  });

  it("paid plans never block a busy month; the billing page suggests the plan that fits", async () => {
    const t = await setupTenant("owner", "side");
    expect((await upload(t, "mercari_sales_report", mercari(120, "2026-06-15"))).status).toBe(201);
    const b = await billing(t);
    expect(b.plan.key).toBe("side");
    expect(b.usage.busiestMonth).toEqual({ month: "2026-06", orders: 120 });
    expect(b.suggestedPlan).toBe("fulltime");
  });

  it("Free and Side hustle are one person: inviting is refused; Business takes 4 with pending invites counted", async () => {
    const free = await freeTenant();
    expect((await invite(free, "helper@example.test")).status).toBe(402);
    const side = await setupTenant("owner", "side");
    expect((await invite(side, "helper@example.test")).status).toBe(402);

    const biz = await setupTenant("owner", "business");
    for (const n of [1, 2, 3]) expect((await invite(biz, `h${n}@example.test`)).status).toBe(201);
    expect((await invite(biz, "h4@example.test")).status).toBe(402);
  });

  it("a lapsed Business plan stops an old invitation from adding a member", async () => {
    const t = await setupTenant("owner", "business");
    const { url } = await json<{ url: string }>(invite(t, "late@example.test"), 201);
    await grantPlan(t.orgId, "business", "canceled");
    const late = await createTestUser("late@example.test");
    const token = new URL(url).searchParams.get("token") ?? "";
    const res = await api("/api/invitations/accept", {
      method: "POST",
      as: late.id,
      json: { token },
    });
    expect(res.status).toBe(402);
    const b = await billing(t);
    expect(b.plan.key).toBe("free");
    expect(b.lapsed).toBe(true);
  });

  it("a lapsed org still reads and exports everything it imported", async () => {
    const t = await setupTenant("owner", "fulltime");
    expect((await upload(t, "ebay_transaction_report", ebayCsv)).status).toBe(201);
    expect((await upload(t, "poshmark_my_sales_report", poshCsv)).status).toBe(201);
    await grantPlan(t.orgId, "fulltime", "canceled");
    const sales = await json<{ items: unknown[] }>(api(path(t, "/sales"), { as: t.userId }));
    expect(sales.items.length).toBeGreaterThan(0);
    const b = await billing(t);
    expect(b.usage.platforms).toEqual(["ebay", "poshmark"]);
    // Over the Free platform limit already: the next new platform is refused, nothing is removed.
    expect((await upload(t, "mercari_sales_report", mercari(1, "2026-03-01"))).status).toBe(402);
  });
});

describe("checkout", () => {
  it("admins only; free and comp are not for sale; annual exists", async () => {
    const t = await freeTenant();
    const editor = await createTestUser();
    const { member } = await import("@worker/db/schema");
    await testDb()
      .insert(member)
      .values({ id: newId("mem"), organizationId: t.orgId, userId: editor.id, role: "editor" });
    const post = (as: string, body: unknown) =>
      api(path(t, "/billing/checkout"), { method: "POST", as, json: body });
    expect((await post(editor.id, { plan: "side" })).status).toBe(403);
    expect((await post(t.userId, { plan: "free" })).status).toBe(400);
    expect((await post(t.userId, { plan: "comp" })).status).toBe(400);
    const { url, pending } = await checkout(t, "business", "year");
    expect(url).toContain("fake_checkout");
    expect(new URL(url).pathname).toBe(`/o/${t.orgId}/billing`);
    expect(pending?.planKey).toBe("business");
    expect(pending?.interval).toBe("year");
  });

  it("a signed webhook with the checkout token puts the org on the paid plan", async () => {
    const t = await freeTenant();
    const { pending } = await checkout(t, "fulltime");
    const token = await signCheckoutToken(TEST_AUTH_SECRET, pending?.id ?? "", t.orgId);
    const id = `sub_${++seq}_${t.orgId}`;
    const r = await webhook({
      providerEventId: `evt_${seq}_${t.orgId}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:00Z",
      customData: { checkoutToken: token },
      subscription: sub("fulltime", id, `ctm_${t.orgId}`),
    });
    expect(r).toEqual({ status: 200, body: { outcome: "applied" } });
    const b = await billing(t);
    expect(b.plan.key).toBe("fulltime");
    expect(b.limits.platforms).toBeNull();
    expect(b.portalAvailable).toBe(true);
    // Now the second platform imports.
    expect((await upload(t, "ebay_transaction_report", ebayCsv)).status).toBe(201);
    expect((await upload(t, "poshmark_my_sales_report", poshCsv)).status).toBe(201);
  });

  it("rejects a bad signature, and ignores a webhook without a token for an unknown subscription", async () => {
    const t = await freeTenant();
    const body = {
      providerEventId: `evt_bad_${t.orgId}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:00Z",
      subscription: sub("business", `sub_bad_${t.orgId}`, "ctm_x"),
    };
    expect((await webhook(body, "not-the-secret")).status).toBe(401);
    const r = await webhook(body);
    expect(r.body).toEqual({ outcome: "ignored", reason: "unknown org" });
    expect((await billing(t)).plan.key).toBe("free");
  });

  it("a token signed for one org cannot move a subscription onto another", async () => {
    const a = await freeTenant();
    const b = await freeTenant();
    const { pending } = await checkout(a, "side");
    // A forged token: a's checkout id, signed for b's org.
    const forged = await signCheckoutToken(TEST_AUTH_SECRET, pending?.id ?? "", b.orgId);
    const r = await webhook({
      providerEventId: `evt_forged_${b.orgId}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:00Z",
      customData: { checkoutToken: forged },
      subscription: sub("side", `sub_forged_${b.orgId}`, "ctm_y"),
    });
    expect(r.body.outcome).toBe("ignored");
    expect((await billing(a)).plan.key).toBe("free");
    expect((await billing(b)).plan.key).toBe("free");
  });

  it("a duplicate delivery is applied once", async () => {
    const t = await freeTenant();
    const { pending } = await checkout(t, "side");
    const token = await signCheckoutToken(TEST_AUTH_SECRET, pending?.id ?? "", t.orgId);
    const event = {
      providerEventId: `evt_dup_${t.orgId}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:00Z",
      customData: { checkoutToken: token },
      subscription: sub("side", `sub_dup_${t.orgId}`, `ctm_dup_${t.orgId}`),
    };
    expect((await webhook(event)).body).toEqual({ outcome: "applied" });
    expect((await webhook(event)).body).toEqual({ outcome: "duplicate" });
    const rows = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, t.orgId))
      .all();
    expect(rows.map((r) => r.planKey)).toEqual(["side"]);
  });
});
