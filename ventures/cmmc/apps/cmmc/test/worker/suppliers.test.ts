// Subcontractors and suppliers (DFARS 252.204-7021(d)(4), (f)): create, edit, the checks on each row,
// the CSV, the plan gate (FCI-only Level 1 on every plan), validation, roles, audit and tenants.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

interface Supplier {
  id: string;
  name: string;
  infoFlowed: string;
  status: string | null;
  clauseFlowedDown: boolean;
}
interface SupplierList {
  today: string;
  items: (Supplier & {
    currency: { state: string; through: string | null };
    issues: { kind: string; message: string }[];
  })[];
  check: { total: number; flowdown: number; ready: number; issues: { message: string }[] };
  attention: { supplierId: string; name: string; state: string; through: string | null }[];
  levels: { key: string }[];
  statuses: { key: string; label: string }[];
  quotes: Record<string, string>;
  verification: { readOn: string; levelRuleRead: boolean };
}

const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/suppliers"), { method: "POST", as, json: body });
const list = (t: Tenant, as = t.userId) => json<SupplierList>(api(path(t, "/suppliers"), { as }));

const anodizer = () => ({
  name: "Acme Anodizing",
  supplies: "Type II anodize",
  infoFlowed: "cui",
  requiredLevel: "l2_self",
  status: "final_l2_self",
  statusDate: daysAgo(100),
  affirmedOn: daysAgo(100),
  cmmcUids: "AB12CD34EF",
  clauseFlowedDown: true,
  subcontractRef: "PO 1042",
  checkedOn: daysAgo(90),
  awardedOn: daysAgo(80),
});

describe("suppliers", () => {
  it("records a supplier and finds it ready; edits bring the gaps back", async () => {
    const t = await setupTenant();
    const s = await json<Supplier>(add(t, anodizer()), 201);
    let l = await list(t);
    expect(l.check).toMatchObject({ total: 1, flowdown: 1, ready: 1 });
    expect(l.items[0]?.currency.state).toBe("current");
    expect(l.statuses).toHaveLength(7);
    expect(l.quotes.beforeAward).toContain("Prior to awarding a subcontract");
    expect(l.verification.levelRuleRead).toBe(true);

    await json(
      api(path(t, `/suppliers/${s.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { status: "final_l1_self", clauseFlowedDown: false },
      }),
    );
    l = await list(t);
    expect(l.check.ready).toBe(0);
    const messages = l.items[0]?.issues.map((i) => i.message) ?? [];
    expect(messages).toContain(
      "Acme Anodizing: Final Level 1 (Self) is below the CMMC Level 2 (Self) you flow down.",
    );
    expect(messages.join(" ")).toContain("252.204-7021(f)(1)");
  });

  it("names a Conditional status past 180 days", async () => {
    const t = await setupTenant();
    await json(
      add(t, {
        ...anodizer(),
        status: "conditional_l2_self",
        statusDate: daysAgo(200),
        affirmedOn: daysAgo(200),
        checkedOn: daysAgo(199),
        awardedOn: daysAgo(198),
      }),
      201,
    );
    const l = await list(t);
    expect(l.items[0]?.currency.state).toBe("not_current");
    expect(l.check.issues.map((i) => i.message).join(" ")).toContain("POA&M closeout");
    // The dashboard's list puts it first, with the last day it was current.
    expect(l.attention).toEqual([
      expect.objectContaining({
        name: "Acme Anodizing",
        state: "not_current",
        through: daysAgo(20),
      }),
    ]);
  });

  it("refuses bad dates and UIDs, and checks a patch against the whole row", async () => {
    const t = await setupTenant();
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const r1 = await add(t, { ...anodizer(), checkedOn: future });
    expect(r1.status).toBe(400);
    expect(await r1.text()).toContain("cannot be in the future");
    const r2 = await add(t, { ...anodizer(), cmmcUids: "SHORT" });
    expect(r2.status).toBe(400);
    expect(await r2.text()).toContain("is not a CMMC UID");
    const s = await json<Supplier>(add(t, anodizer()), 201);
    const r3 = await api(path(t, `/suppliers/${s.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { affirmedOn: daysAgo(150) },
    });
    expect(r3.status).toBe(400);
    expect(await r3.text()).toContain("cannot be before the CMMC Status Date");
  });

  it("records FCI-only Level 1 flow-down on the free plan; CUI needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    await json(
      add(t, {
        name: "Bob's Bead Blast",
        infoFlowed: "fci",
        requiredLevel: "l1_self",
        status: "final_l1_self",
        statusDate: daysAgo(30),
        affirmedOn: daysAgo(30),
        clauseFlowedDown: true,
        checkedOn: daysAgo(20),
      }),
      201,
    );
    const r = await add(t, anodizer());
    expect(r.status).toBe(402);
    expect(await r.text()).toContain("needs the Level 2 plan");
    const l = await list(t);
    expect(l.check).toMatchObject({ total: 1, ready: 1 });
    const id = l.items[0]?.id;
    const up = await api(path(t, `/suppliers/${id}`), {
      method: "PATCH",
      as: t.userId,
      json: { infoFlowed: "cui" },
    });
    expect(up.status).toBe(402);
    await json(api(path(t, `/suppliers/${id}`), { method: "DELETE", as: t.userId }));
  });

  it("exports CSV with formula cells guarded", async () => {
    const t = await setupTenant();
    await json(add(t, { ...anodizer(), name: "=cmd|calc" }), 201);
    const r = await api(path(t, "/suppliers/export.csv"), { as: t.userId });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/csv");
    const text = await r.text();
    expect(text.split("\r\n")[0]).toContain("Current through");
    expect(text).toContain("'=cmd|calc");
    expect(text).toContain("PO 1042");
  });

  it("viewers read but cannot record; writes are audited", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await list(t, viewer.id);
    expect((await add(t, anodizer(), viewer.id)).status).toBe(403);
    const s = await json<Supplier>(add(t, anodizer()), 201);
    expect(
      (await api(path(t, `/suppliers/${s.id}`), { method: "DELETE", as: viewer.id })).status,
    ).toBe(403);
    await json(
      api(path(t, `/suppliers/${s.id}`), { method: "PATCH", as: t.userId, json: { notes: "ok" } }),
    );
    await json(api(path(t, `/suppliers/${s.id}`), { method: "DELETE", as: t.userId }));
    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(["supplier.create", "supplier.update", "supplier.delete"]),
    );
  });

  it("keeps each organization's suppliers to itself", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const s = await json<Supplier>(add(t, anodizer()), 201);
    expect((await api(path(t, "/suppliers"), { as: other.userId })).status).toBe(404);
    const viaOther = (method: string, body?: unknown) =>
      api(path(other, `/suppliers/${s.id}`), { method, as: other.userId, json: body });
    expect((await viaOther("PATCH", { name: "Taken" })).status).toBe(404);
    expect((await viaOther("DELETE")).status).toBe(404);
    expect((await list(other)).items).toEqual([]);
    expect((await list(t)).items[0]?.name).toBe("Acme Anodizing");
  });
});
