// The first-run checklist: every step ticks from the shop's own rows, and only members can read it.
import { describe, expect, it } from "vitest";
import etsyOrdersCsv from "../fixtures/etsy-sold-orders.csv?raw";
import { api, createTestUser, json, setupTenant } from "./helpers";

type Checklist = {
  steps: { key: string; done: boolean; detail: string }[];
  doneCount: number;
  allDone: boolean;
};

const read = async (orgId: string, as: string) =>
  json<Checklist>(await api(`/api/orgs/${orgId}/getting-started`, { as }));
const done = (c: Checklist) => Object.fromEntries(c.steps.map((s) => [s.key, s.done]));

describe("getting started", () => {
  it("ticks each step as the books fill in", async () => {
    const { userId, orgId } = await setupTenant();
    const first = await read(orgId, userId);
    expect(done(first)).toEqual({ import: false, cost: false, link: false, expenses: false });
    expect(first.allDone).toBe(false);

    // A lot whose SKU matches one Etsy order, so the import links that sale.
    const lot = await api(`/api/orgs/${orgId}/inventory/lots`, {
      method: "POST",
      as: userId,
      json: {
        name: "Estate sale haul",
        acquiredDate: "2025-12-20",
        totalCostCents: 3000,
        items: [{ title: "Blue glass vase", sku: "VASE-03" }],
      },
    });
    expect(lot.status).toBe(201);
    expect(done(await read(orgId, userId))).toMatchObject({ cost: true, import: false });

    const up = await api(`/api/orgs/${orgId}/imports`, {
      method: "POST",
      as: userId,
      json: { report: "etsy_sold_orders", fileName: "orders.csv", csv: etsyOrdersCsv },
    });
    expect(up.status).toBe(201);
    const afterImport = await read(orgId, userId);
    expect(done(afterImport)).toMatchObject({ import: true, link: true, expenses: false });
    expect(afterImport.steps[0]?.detail).toBe("1 report imported from 1 platform.");

    await api(`/api/orgs/${orgId}/mileage`, {
      method: "POST",
      as: userId,
      json: { date: "2026-05-06", purpose: "Estate sale pickup", miles: 12.5, roundTrip: true },
    });
    const last = await read(orgId, userId);
    expect(last.allDone).toBe(true);
    expect(last.doneCount).toBe(4);
  });

  it("viewers can read it; a non-member gets 404", async () => {
    const { userId, orgId } = await setupTenant("viewer");
    expect((await api(`/api/orgs/${orgId}/getting-started`, { as: userId })).status).toBe(200);
    const stranger = await createTestUser();
    expect((await api(`/api/orgs/${orgId}/getting-started`, { as: stranger.id })).status).toBe(404);
  });
});
