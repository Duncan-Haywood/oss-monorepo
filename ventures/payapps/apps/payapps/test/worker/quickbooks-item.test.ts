// QuickBooks, the company's own invoice item (docs/QUICKBOOKS.md, "Your own item"): admins list the
// connected company's items and choose the one work lines are billed with; the send uses it, stops
// when it was made inactive, goes back to the default on null, and connecting a different company
// clears the choice.

import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
  QuickBooksItemsDto,
  QuickBooksStatusDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let app1: string;
let app2: string;
let laborId: string;
let retainageId: string;

async function connect(org: string, user: string) {
  const { url } = await call<{ url: string }>(`/api/orgs/${org}/quickbooks/connect`, {
    method: "POST",
    as: user,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as: user, redirect: "manual" });
}

async function books() {
  const row = await testDb()
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.orgId, orgId))
    .get();
  return fakeQuickBooks.books(row?.realmId ?? "");
}

const itemsUrl = () => `/api/orgs/${orgId}/quickbooks/items`;
const chooseUrl = () => `/api/orgs/${orgId}/quickbooks/invoice-item`;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Desert View Library",
      number: "25-031",
      gcName: "Saguaro General",
      originalContractSumCents: 8_000_000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Branch wiring", originalCents: 8_000_000 }] },
  });
  const sovLineId = d.sovLines[0]?.id;
  const mk = async (from: string, to: string, work: number) => {
    const a = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: from, periodTo: to, applicationDate: to },
    });
    await call(`${base}/pay-apps/${a.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId,
            workThisPeriodCents: work,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    await call(`${base}/pay-apps/${a.id}/submit`, { method: "POST", as });
    return a.id;
  };
  app1 = await mk("2026-09-01", "2026-09-30", 2_000_000);
  app2 = await mk("2026-10-01", "2026-10-31", 1_000_000);
  await connect(orgId, as);
  // The bookkeeper's own chart: an income account with a labor item, and the retainage setup.
  const b = await books();
  const income = await b.ensureAccount({ name: "Construction Income", accountType: "Income" });
  laborId = (
    await b.ensureItem({ name: "Electrical Labor", type: "Service", incomeAccountId: income.id })
  ).id;
  retainageId = (await b.ensureRetainageSetup()).item.id;
});

describe("QuickBooks invoice item", () => {
  it("lists the company's items for admins only, with the default named", async () => {
    const list = await call<QuickBooksItemsDto>(itemsUrl(), { as });
    expect(list.current).toBeNull();
    expect(list.defaultItemName).toBe("Contract Billing");
    expect(list.defaultAccountName).toBe("Contract Income");
    expect(list.items.find((i) => i.id === laborId)).toMatchObject({
      name: "Electrical Labor",
      type: "Service",
      incomeAccountName: "Construction Income",
    });
    const editor = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    expect((await api(itemsUrl(), { as: editor.id })).status).toBe(403);
    const put = await api(chooseUrl(), { method: "PUT", as: editor.id, json: { itemId: laborId } });
    expect(put.status).toBe(403);
  });

  it("refuses the retainage item, an unknown item and a malformed id", async () => {
    const r1 = await api(chooseUrl(), { method: "PUT", as, json: { itemId: retainageId } });
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { error: { message: string } }).error.message).toMatch(
      /retainage item/,
    );
    const r2 = await api(chooseUrl(), { method: "PUT", as, json: { itemId: "99999" } });
    expect(r2.status).toBe(400);
    const r3 = await api(chooseUrl(), { method: "PUT", as, json: { itemId: "1 OR 1=1" } });
    expect(r3.status).toBe(400);
    const r4 = await api(chooseUrl(), { method: "PUT", as, json: {} });
    expect(r4.status).toBe(400);
    const s = await call<QuickBooksStatusDto>(`/api/orgs/${orgId}/quickbooks`, { as });
    expect(s.connection?.invoiceItem).toBeNull();
  });

  it("bills work lines with the chosen item and creates no default item", async () => {
    const chosen = await call<QuickBooksItemsDto>(chooseUrl(), {
      method: "PUT",
      as,
      json: { itemId: laborId },
    });
    expect(chosen.current).toEqual({ id: laborId, name: "Electrical Labor" });
    const s = await call<QuickBooksStatusDto>(`/api/orgs/${orgId}/quickbooks`, { as });
    expect(s.connection?.invoiceItem).toEqual({ id: laborId, name: "Electrical Labor" });
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    expect(q.preview?.workItemName).toBe("Electrical Labor");

    await call(`${base}/pay-apps/${app1}/quickbooks`, { method: "POST", as });
    const b = await books();
    const invoice = await b.findInvoiceByDocNumber("PA25-031-01");
    const work = invoice?.lines.filter((l) => l.itemId !== retainageId) ?? [];
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((l) => l.itemId === laborId)).toBe(true);
    expect(await b.findItemByName("Contract Billing")).toBeNull();
    expect(await b.findAccountByName("Contract Income")).toBeNull();
  });

  it("stops, sending nothing, when the chosen item was made inactive", async () => {
    const b = await books();
    b.inactiveItems.add(laborId);
    const res = await api(`${base}/pay-apps/${app2}/quickbooks`, { method: "POST", as });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /"Electrical Labor"\) is no longer active.*nothing was sent/,
    );
    expect(await b.findInvoiceByDocNumber("PA25-031-02")).toBeNull();
    expect(
      (await call<QuickBooksItemsDto>(itemsUrl(), { as })).items.map((i) => i.id),
    ).not.toContain(laborId);
  });

  it("goes back to the default item on null", async () => {
    const reset = await call<QuickBooksItemsDto>(chooseUrl(), {
      method: "PUT",
      as,
      json: { itemId: null },
    });
    expect(reset.current).toBeNull();
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app2}/quickbooks`, {
      method: "POST",
      as,
    });
    expect(q.sent?.docNumber).toBe("PA25-031-02");
    const b = await books();
    const contract = await b.findItemByName("Contract Billing");
    const invoice = await b.findInvoiceByDocNumber("PA25-031-02");
    expect(invoice?.lines.some((l) => l.itemId === contract?.id)).toBe(true);
  });

  it("another company cannot list or choose this company's items", async () => {
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    expect((await api(itemsUrl(), { as: other.userId })).status).toBe(404);
    const put = await api(chooseUrl(), {
      method: "PUT",
      as: other.userId,
      json: { itemId: null },
    });
    expect(put.status).toBe(404);
  });

  it("connecting a different QuickBooks company clears the choice", async () => {
    (await books()).inactiveItems.delete(laborId);
    await call(chooseUrl(), { method: "PUT", as, json: { itemId: laborId } });
    // The fake gateway gives every connection a new company (realm).
    await connect(orgId, as);
    const s = await call<QuickBooksStatusDto>(`/api/orgs/${orgId}/quickbooks`, { as });
    expect(s.connection?.invoiceItem).toBeNull();
  });
});
