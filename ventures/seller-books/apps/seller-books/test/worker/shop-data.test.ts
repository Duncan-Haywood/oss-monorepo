// The shop's data, whole: the JSON export (admins and the owner, this shop's rows only) and deleting the
// shop (the owner, its name typed, and never while a paid plan is still set to renew).
import { member, organization, sale, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, json, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p = "") => `/api/orgs/${t.orgId}${p}`;

interface Export {
  format: string;
  version: number;
  shop: { id: string; name: string };
  members: { email: string; role: string }[];
  plan: { planKey: string; status: string } | null;
  counts: Record<string, number>;
  records: Record<string, Record<string, unknown>[]>;
}

async function seed(t: Tenant, title = "Denim jacket") {
  const item = await json<{ id: string }>(
    await api(path(t, "/inventory/items"), {
      method: "POST",
      as: t.userId,
      json: { title, acquiredDate: "2026-01-15", costCents: 1200 },
    }),
  );
  const res = await api(path(t, "/sales"), {
    method: "POST",
    as: t.userId,
    json: { date: "2026-03-10", title, itemCents: 4500, paymentFeeCents: 160, itemId: item.id },
  });
  expect(res.status).toBe(201);
  return { itemId: item.id, saleId: (await json<{ id: string }>(res)).id };
}

async function addMember(t: Tenant, role: "viewer" | "editor" | "admin") {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: t.orgId, userId: u.id, role });
  return u.id;
}

const del = (t: Tenant, confirmName: string, as = t.userId) =>
  api(path(t), { method: "DELETE", as, json: { confirmName } });

describe("shop export", () => {
  it("downloads every record of this shop, and none of another's", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const mine = await seed(t);
    await seed(other, "Other shop's boots");

    const res = await api(path(t, "/export"), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="seller-books-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const data = await json<Export>(res);
    expect(data).toMatchObject({
      format: "seller-books-export",
      version: 1,
      shop: { id: t.orgId, name: "Test Shop" },
      plan: { planKey: "comp", status: "comp" },
    });
    expect(data.members).toEqual([expect.objectContaining({ email: t.email, role: "owner" })]);
    expect(data.counts.sales).toBe(1);
    expect(data.counts.inventoryItems).toBe(1);
    expect(data.counts.saleFees).toBe(1);
    expect(data.records.sales?.[0]).toMatchObject({ id: mine.saleId, itemCents: 4500 });
    expect(data.records.inventoryItems?.[0]).toMatchObject({ id: mine.itemId, costCents: 1200 });
    // org_id is the shop above, so rows do not repeat it; the other shop's sale is not here.
    expect(data.records.sales?.[0]).not.toHaveProperty("orgId");
    expect(JSON.stringify(data)).not.toContain("Other shop's boots");
    expect(JSON.stringify(data)).not.toContain(other.orgId);
  });

  it("is for admins and the owner; editors, viewers and other shops are refused", async () => {
    const t = await setupTenant();
    const admin = await addMember(t, "admin");
    const editor = await addMember(t, "editor");
    const viewer = await addMember(t, "viewer");
    const stranger = await setupTenant();

    expect((await api(path(t, "/export"), { as: admin })).status).toBe(200);
    expect((await api(path(t, "/export"), { as: editor })).status).toBe(403);
    expect((await api(path(t, "/export"), { as: viewer })).status).toBe(403);
    expect((await api(path(t, "/export"), { as: stranger.userId })).status).toBe(404);
    expect((await api(path(t, "/export"))).status).toBe(401);
  });
});

describe("deleting a shop", () => {
  it("the owner, with the shop's name typed, removes the shop and every record in it", async () => {
    const t = await setupTenant("owner", null);
    const other = await setupTenant();
    const { saleId } = await seed(t);
    await seed(other);

    expect((await del(t, "Wrong name")).status).toBe(400);
    const res = await del(t, "Test Shop");
    expect(res.status).toBe(200);

    const db = testDb();
    expect(await db.select().from(organization).where(eq(organization.id, t.orgId)).get()).toBe(
      undefined,
    );
    expect(await db.select().from(sale).where(eq(sale.id, saleId)).get()).toBe(undefined);
    expect(await db.select().from(member).where(eq(member.organizationId, t.orgId)).all()).toEqual(
      [],
    );
    // The other shop is untouched, and the deleted one now answers 404 to its former owner.
    expect((await db.select().from(sale).where(eq(sale.orgId, other.orgId)).all()).length).toBe(1);
    expect((await api(path(t), { as: t.userId })).status).toBe(404);
  });

  it("is the owner's alone", async () => {
    const t = await setupTenant();
    const admin = await addMember(t, "admin");
    const stranger = await setupTenant();
    expect((await del(t, "Test Shop", admin)).status).toBe(403);
    expect((await del(t, "Test Shop", stranger.userId)).status).toBe(404);
    expect(
      await testDb().select().from(organization).where(eq(organization.id, t.orgId)).get(),
    ).toBeTruthy();
  });

  it("waits while a paid plan will renew, and goes ahead once it is set to end", async () => {
    const t = await setupTenant("owner", null);
    await testDb()
      .insert(subscriptions)
      .values({
        orgId: t.orgId,
        planKey: "pro",
        status: "active",
        provider: "paddle",
        providerSubscriptionId: `sub_${t.orgId}`,
      });

    const refused = await del(t, "Test Shop");
    expect(refused.status).toBe(409);
    expect(JSON.stringify(await refused.json())).toMatch(/Cancel it on the Billing page first/);
    expect(
      await testDb().select().from(organization).where(eq(organization.id, t.orgId)).get(),
    ).toBeTruthy();

    await testDb()
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(subscriptions.orgId, t.orgId));
    expect((await del(t, "Test Shop")).status).toBe(200);
    expect(
      await testDb().select().from(subscriptions).where(eq(subscriptions.orgId, t.orgId)).get(),
    ).toBe(undefined);
  });

  it("a staff-granted plan or a cancelled one does not hold the shop", async () => {
    const comp = await setupTenant("owner", "comp");
    expect((await del(comp, "Test Shop")).status).toBe(200);

    const lapsed = await setupTenant("owner", null);
    await testDb().insert(subscriptions).values({
      orgId: lapsed.orgId,
      planKey: "pro",
      status: "canceled",
      provider: "paddle",
    });
    expect((await del(lapsed, "Test Shop")).status).toBe(200);
  });
});
