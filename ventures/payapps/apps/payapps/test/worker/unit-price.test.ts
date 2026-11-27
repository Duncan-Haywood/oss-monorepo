// Unit-price lines: quantity × unit price on the schedule of values, billed by quantity installed.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { api, call, setupTenant } from "./helpers";

let as: string;
let base: string;
let mob: string;
let curb: string;
let firstApp: string;

const line = (p: ProjectDetailDto, id: string) => p.sovLines.find((l) => l.id === id);
const entry = (sovLineId: string, w: number, qty: number | null = null) => ({
  sovLineId,
  workThisPeriodCents: w,
  storedMaterialsCents: 0,
  retainageReleasedCents: 0,
  quantityThisPeriodMilli: qty,
});

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Example Road", gcName: "Example Paving", originalContractSumCents: 7_705_000 },
  });
  base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Mobilization", originalCents: 1_500_000 },
        // 3,400 LF at $18.25 = $62,050.00
        {
          itemNumber: "2",
          description: "Concrete curb",
          originalCents: 6_205_000,
          unit: "LF",
          unitPriceMicros: 18_250_000,
          quantityMilli: 3_400_000,
        },
      ],
    },
  });
  [mob = "", curb = ""] = p.sovLines.map((l) => l.id);
});

describe("unit-price lines", () => {
  it("stores the unit, unit price and contract quantity", async () => {
    const p = await call<ProjectDetailDto>(base, { as });
    expect(line(p, curb)).toMatchObject({
      unit: "LF",
      unitPriceMicros: 18_250_000,
      quantityMilli: 3_400_000,
      originalCents: 6_205_000,
    });
    expect(line(p, mob)).toMatchObject({ unit: null, unitPriceMicros: null, quantityMilli: null });
  });

  it("refuses a line whose quantity × price is not its scheduled value", async () => {
    const res = await api(`${base}/sov-lines`, {
      method: "POST",
      as,
      json: {
        itemNumber: "3",
        description: "Base",
        originalCents: 100_000,
        unit: "TON",
        unitPriceMicros: 32_000_000,
        quantityMilli: 10_000,
      },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("$320.00");
    const patch = await api(`${base}/sov-lines/${curb}`, {
      method: "PATCH",
      as,
      json: { originalCents: 6_000_000 },
    });
    expect(patch.status).toBe(400);
    const half = await api(`${base}/sov-lines/${mob}`, {
      method: "PATCH",
      as,
      json: { unit: "LS" },
    });
    expect(half.status).toBe(400);
  });

  it("bills by quantity: cents must be quantity × unit price", async () => {
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-03-01", periodTo: "2026-03-31", applicationDate: "2026-03-31" },
    });
    firstApp = app.id;
    const wrong = await api(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [entry(curb, 1_000_000, 600_000)] },
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain("600 LF × $18.25 is $10,950.00");
    const onLumpSum = await api(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [entry(mob, 100, 1_000)] },
    });
    expect(onLumpSum.status).toBe(400);
    const ok = await call<PayAppDetailDto>(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [entry(mob, 1_500_000), entry(curb, 1_095_000, 600_000)] },
    });
    expect(ok.entries[curb]?.quantityThisPeriodMilli).toBe(600_000);
    expect(ok.entries[mob]?.quantityThisPeriodMilli).toBeNull();
    expect(ok.quantities[curb]).toEqual({
      unit: "LF",
      unitPriceMicros: 18_250_000,
      contractQuantityMilli: 3_400_000,
      thisPeriodMilli: 600_000,
      toDateMilli: 600_000,
      exact: true,
    });
    expect(ok.quantities[mob]).toBeUndefined();
    expect(ok.computed.summary.totalCompletedAndStoredCents).toBe(2_595_000);
  });

  it("keeps the quantity when retainage is released on the draft", async () => {
    const after = await call<PayAppDetailDto & { applied: boolean }>(
      `${base}/pay-apps/${firstApp}/retainage-release`,
      { method: "POST", as, json: { scope: "all", percentBps: 1000, apply: true } },
    );
    expect(after.applied).toBe(true);
    const app = await call<PayAppDetailDto>(`${base}/pay-apps/${firstApp}`, { as });
    expect(app.entries[curb]?.quantityThisPeriodMilli).toBe(600_000);
  });

  it("prints the quantities on the continuation CSV and PDF", async () => {
    const csv = await (await api(`${base}/pay-apps/${firstApp}/continuation.csv`, { as })).text();
    const [header, mobRow, curbRow] = csv.split("\r\n");
    expect(header).toMatch(
      /,Unit,Unit price,Contract quantity,Quantity this period,Quantity to date$/,
    );
    expect(mobRow).toMatch(/,,,,,$/);
    expect(curbRow).toMatch(/,LF,18\.25,3400,600,600$/);
    const pdf = await api(`${base}/pay-apps/${firstApp}/application.pdf`, { as });
    expect(pdf.status).toBe(200);
  });

  it("adds quantities to date across applications and locks the price once submitted", async () => {
    await call(`${base}/pay-apps/${firstApp}/submit`, { method: "POST", as });
    const locked = await api(`${base}/sov-lines/${curb}`, {
      method: "PATCH",
      as,
      json: { unitPriceMicros: 19_000_000 },
    });
    expect(locked.status).toBe(409);
    // A line with no unit price may still get one: its dollars to date are read back at the price.
    await call(`${base}/sov-lines/${mob}`, {
      method: "PATCH",
      as,
      json: { unit: "LS", unitPriceMicros: 15_000_000_000 },
    });
    const app2 = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-04-01", periodTo: "2026-04-30", applicationDate: "2026-04-30" },
    });
    const filled = await call<PayAppDetailDto>(`${base}/pay-apps/${app2.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [entry(curb, 912_500, 500_000)] },
    });
    expect(filled.quantities[curb]).toMatchObject({
      thisPeriodMilli: 500_000,
      toDateMilli: 1_100_000,
      exact: true,
    });
    expect(filled.quantities[mob]).toMatchObject({
      thisPeriodMilli: null,
      toDateMilli: 1_000,
      exact: false,
    });
  });
});
