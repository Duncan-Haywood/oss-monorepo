// Estimates: numbered per company, priced from cost lines with markup by category and tax on
// material, a proposal PDF with prices only, sent/lost status, and a won bid becoming a job with its
// schedule of values (and, on Crew and up, its cost budgets). Editors write, viewers read; another
// company's estimates answer 404; the Free plan's one active job holds back a second win.
import type { EstimateDetailDto, EstimateListDto, ProjectDetailDto } from "@shared/api/types";
import { jobCostBudgets } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

const body = {
  name: "Riverside Clinic, mechanical",
  gcName: "Harbor Builders",
  gcContactName: "Dana Ruiz",
  gcContactEmail: "dana@harbor.example",
  location: "410 River Rd",
  bidDueOn: "2026-12-10",
  laborMarkupBps: 1500,
  materialMarkupBps: 1000,
  subcontractMarkupBps: 500,
  materialTaxBps: 750,
  inclusions: "Ductwork and equipment setting as drawn on M-101 to M-301.",
  exclusions: "Controls wiring, roof curbs, and anything by others.",
};

const lines = [
  {
    bidItem: "Ductwork",
    category: "labor",
    description: "Sheet metal crew",
    quantityMilli: 120_000,
    unit: "HR",
    unitCostMicros: 68_500_000,
  },
  {
    bidItem: "Ductwork",
    category: "material",
    description: "Galvanized duct",
    quantityMilli: 1_450_000,
    unit: "LB",
    unitCostMicros: 4_875_000,
  },
  {
    bidItem: "Equipment setting",
    category: "subcontract",
    description: "Crane and rigging",
    quantityMilli: 1_000,
    unit: "LS",
    unitCostMicros: 3_200_000_000,
  },
];

async function tenant(plan?: string) {
  const t = await setupTenant("owner");
  if (plan) await grantPlan(t.orgId, plan, "active");
  return { ...t, as: t.userId, base: `/api/orgs/${t.orgId}/estimates` };
}

async function priced(base: string, as: string) {
  const e = await call<EstimateDetailDto>(base, { method: "POST", as, expect: 201, json: body });
  return call<EstimateDetailDto>(`${base}/${e.id}/lines`, {
    method: "PUT",
    as,
    json: { lines },
  });
}

describe("estimates", () => {
  it("numbers and prices an estimate, and prints a proposal with prices only", async () => {
    const { base, as } = await tenant();
    const empty = await call<EstimateListDto>(base, { as });
    expect(empty.items).toEqual([]);
    expect(empty.nextNumber).toBe(1);

    const e = await priced(base, as);
    expect(e.number).toBe(1);
    expect(e.label).toBe("EST-0001");
    expect(e.status).toBe("draft");
    expect(e.lines.map((l) => l.costCents)).toEqual([822_000, 706_875, 320_000]);
    // Ductwork: cost 15,288.75; tax 530.16; markup 1,233.00 + 759.89; price 17,811.80.
    expect(e.bidItems.map((b) => [b.itemNumber, b.description, b.priceCents])).toEqual([
      ["1", "Ductwork", 1_781_180],
      ["2", "Equipment setting", 336_000],
    ]);
    expect(e.totals.priceCents).toBe(2_117_180);
    expect(e.winProblems).toEqual([]);

    const second = await call<EstimateDetailDto>(base, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Bay Tower", gcName: "Northline" },
    });
    expect(second.number).toBe(2);

    const res = await api(`${base}/${e.id}/proposal.pdf`, { as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(
      "proposal-est-0001-riverside-clinic-mechanical.pdf",
    );
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).toContain("(Proposal)");
    expect(text).toContain("($17,811.80)");
    expect(text).toContain("($21,171.80)");
    expect(text).toContain("Controls wiring");
    // Cost lines and markup are the contractor's, not the GC's.
    expect(text).not.toContain("Sheet metal crew");
    expect(text).not.toContain("$8,220.00");

    const list = await call<EstimateListDto>(base, { as });
    expect(list.items.map((i) => i.number)).toEqual([2, 1]);
    expect(list.pipeline).toEqual({
      openCount: 2,
      openPriceCents: 2_117_180,
      wonCount: 0,
      lostCount: 0,
    });
  });

  it("tracks sent and lost, and refuses bad lines", async () => {
    const { base, as } = await tenant();
    const e = await priced(base, as);
    const sent = await call<EstimateDetailDto>(`${base}/${e.id}`, {
      method: "PATCH",
      as,
      json: { status: "sent" },
    });
    expect(sent.status).toBe("sent");
    expect(sent.sentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const lost = await call<EstimateDetailDto>(`${base}/${e.id}`, {
      method: "PATCH",
      as,
      json: { status: "lost" },
    });
    expect(lost.status).toBe("lost");
    expect(lost.decidedOn).not.toBeNull();
    // "won" only through POST .../win, which makes the job.
    await call(`${base}/${e.id}`, { method: "PATCH", as, expect: 400, json: { status: "won" } });
    await call(`${base}/${e.id}/lines`, {
      method: "PUT",
      as,
      expect: 400,
      json: { lines: [{ ...lines[0], bidItem: "  " }] },
    });
    await call(`${base}/${e.id}/lines`, {
      method: "PUT",
      as,
      expect: 400,
      json: { lines: [{ ...lines[0], unitCostMicros: -1 }] },
    });
  });

  it("makes a won estimate a job with its SOV and cost budgets on Crew", async () => {
    const { base, as, orgId } = await tenant("crew");
    const e = await priced(base, as);
    const won = await call<{
      estimate: EstimateDetailDto;
      project: { id: string };
      budgetsSet: boolean;
    }>(`${base}/${e.id}/win`, {
      method: "POST",
      as,
      expect: 201,
      json: { contractDate: "2026-12-20", retainagePctBps: 500 },
    });
    expect(won.budgetsSet).toBe(true);
    expect(won.estimate.status).toBe("won");
    expect(won.estimate.projectId).toBe(won.project.id);

    const job = await call<ProjectDetailDto>(`/api/orgs/${orgId}/projects/${won.project.id}`, {
      as,
    });
    expect(job.name).toBe(body.name);
    expect(job.gcName).toBe("Harbor Builders");
    expect(job.gcPmEmail).toBe("dana@harbor.example");
    expect(job.originalContractSumCents).toBe(2_117_180);
    expect(job.retainagePctBps).toBe(500);
    expect(job.sovLines.map((l) => [l.itemNumber, l.description, l.originalCents])).toEqual([
      ["1", "Ductwork", 1_781_180],
      ["2", "Equipment setting", 336_000],
    ]);
    const budgets = await testDb()
      .select()
      .from(jobCostBudgets)
      .where(eq(jobCostBudgets.projectId, won.project.id));
    const byLine = new Map(budgets.map((b) => [b.sovLineId, b.budgetCents]));
    // Cost with tax: 15,288.75 + 530.16; 3,200.00.
    expect(job.sovLines.map((l) => byLine.get(l.id))).toEqual([1_581_891, 320_000]);

    // Locked once won; a second win is refused.
    await call(`${base}/${e.id}/win`, { method: "POST", as, expect: 409, json: {} });
    await call(`${base}/${e.id}/lines`, { method: "PUT", as, expect: 409, json: { lines } });
    await call(`${base}/${e.id}`, { method: "PATCH", as, expect: 409, json: { name: "x" } });
  });

  it("sets no budgets on Free, and the one active job holds back a second win", async () => {
    const { base, as } = await tenant();
    const a = await priced(base, as);
    const b = await priced(base, as);
    const won = await call<{ budgetsSet: boolean; estimate: EstimateDetailDto }>(
      `${base}/${a.id}/win`,
      { method: "POST", as, expect: 201, json: {} },
    );
    expect(won.budgetsSet).toBe(false);
    expect(won.estimate.budgetsOnWin).toBe(false);
    const res = await api(`${base}/${b.id}/win`, { method: "POST", as, json: {} });
    expect(res.status).toBe(402);
    // Not won after all: the job could not be made.
    const after = await call<EstimateDetailDto>(`${base}/${b.id}`, { as });
    expect(after.status).toBe("draft");
    expect(after.projectId).toBeNull();
  });

  it("refuses to win an empty estimate", async () => {
    const { base, as } = await tenant();
    const e = await call<EstimateDetailDto>(base, { method: "POST", as, expect: 201, json: body });
    expect(e.winProblems.length).toBeGreaterThan(0);
    await call(`${base}/${e.id}/win`, { method: "POST", as, expect: 400, json: {} });
  });

  it("prices add and deduct alternates and starts the job with the ones accepted", async () => {
    const { base, as, orgId } = await tenant("crew");
    const e = await call<EstimateDetailDto>(base, { method: "POST", as, expect: 201, json: body });
    const controls = {
      bidItem: "Controls",
      category: "other",
      description: "Controls package",
      quantityMilli: 1_000,
      unit: "LS",
      unitCostMicros: 1_500_000_000,
    };
    const priced = await call<EstimateDetailDto>(`${base}/${e.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [...lines, controls],
        alternates: [
          { bidItem: "Equipment setting", kind: "deduct" },
          { bidItem: "controls", kind: "add" },
          { bidItem: "Not an item", kind: "add" },
        ],
      },
    });
    expect(priced.alternates).toEqual({ "equipment setting": "deduct", controls: "add" });
    expect(priced.bidItems.map((b) => [b.itemNumber, b.alternate, b.priceCents])).toEqual([
      ["1", null, 1_781_180],
      ["2", "deduct", 336_000],
      ["Alt 2", "add", 150_000],
    ]);
    expect(priced.totals.priceCents).toBe(2_117_180);
    expect(priced.totals.addAlternatesCents).toBe(150_000);

    // Saving lines without alternates keeps them; renaming an item drops its alternate.
    const kept = await call<EstimateDetailDto>(`${base}/${e.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [...lines, controls] },
    });
    expect(kept.alternates).toEqual(priced.alternates);
    const renamed = await call<EstimateDetailDto>(`${base}/${e.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [...lines, { ...controls, bidItem: "BAS controls" }] },
    });
    expect(renamed.alternates).toEqual({ "equipment setting": "deduct" });
    await call(`${base}/${e.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [...lines, controls],
        alternates: Object.entries(priced.alternates).map(([bidItem, kind]) => ({ bidItem, kind })),
      },
    });

    const text = new TextDecoder().decode(
      await (await api(`${base}/${e.id}/proposal.pdf`, { as })).arrayBuffer(),
    );
    expect(text).toContain("(Base bid)");
    expect(text).toContain("(Alternates)");
    expect(text).toContain("(Add $1,500.00)");
    expect(text).toContain("(Deduct $3,360.00)");
    expect(text).toContain("($21,171.80)");

    // A base item cannot be "accepted".
    await call(`${base}/${e.id}/win`, {
      method: "POST",
      as,
      expect: 400,
      json: { acceptedAlternates: ["Ductwork"] },
    });
    const won = await call<{ estimate: EstimateDetailDto; project: { id: string } }>(
      `${base}/${e.id}/win`,
      {
        method: "POST",
        as,
        expect: 201,
        json: { acceptedAlternates: ["Controls", "Equipment setting"] },
      },
    );
    expect(won.estimate.acceptedAlternates.sort()).toEqual(["controls", "equipment setting"]);
    const job = await call<ProjectDetailDto>(`/api/orgs/${orgId}/projects/${won.project.id}`, {
      as,
    });
    // Ductwork plus Controls; Equipment setting deducted.
    expect(job.originalContractSumCents).toBe(1_931_180);
    expect(job.sovLines.map((l) => [l.itemNumber, l.description, l.originalCents])).toEqual([
      ["1", "Ductwork", 1_781_180],
      ["2", "Controls", 150_000],
    ]);
  });

  it("keeps another company's alternates apart", async () => {
    const a = await tenant();
    const e = await priced(a.base, a.as);
    const b = await tenant();
    const res = await api(`${b.base}/${e.id}/lines`, {
      method: "PUT",
      as: b.as,
      json: { lines, alternates: [{ bidItem: "Ductwork", kind: "add" }] },
    });
    expect(res.status).toBe(404);
    expect((await call<EstimateDetailDto>(`${a.base}/${e.id}`, { as: a.as })).alternates).toEqual(
      {},
    );
  });

  it("lets viewers read and not write, and keeps companies apart", async () => {
    const a = await tenant();
    const e = await priced(a.base, a.as);
    const viewer = await createTestUser();
    await addToOrg(a.orgId, viewer.id, "viewer");
    await call(`${a.base}/${e.id}`, { as: viewer.id });
    expect((await api(`${a.base}/${e.id}/proposal.pdf`, { as: viewer.id })).status).toBe(200);
    await call(a.base, { method: "POST", as: viewer.id, expect: 403, json: body });
    await call(`${a.base}/${e.id}/lines`, {
      method: "PUT",
      as: viewer.id,
      expect: 403,
      json: { lines },
    });
    await call(`${a.base}/${e.id}/win`, { method: "POST", as: viewer.id, expect: 403, json: {} });

    const b = await tenant();
    // Another company's member cannot reach company A's estimates through either org id.
    expect((await api(a.base, { as: b.as })).status).toBe(404);
    expect((await api(`${b.base}/${e.id}`, { as: b.as })).status).toBe(404);
    expect((await api(`${b.base}/${e.id}/proposal.pdf`, { as: b.as })).status).toBe(404);
    expect(
      (await api(`${b.base}/${e.id}/lines`, { method: "PUT", as: b.as, json: { lines } })).status,
    ).toBe(404);
    expect(
      (await api(`${b.base}/${e.id}/win`, { method: "POST", as: b.as, json: {} })).status,
    ).toBe(404);
    expect((await api(`${b.base}/${e.id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    expect((await call<EstimateListDto>(b.base, { as: b.as })).items).toEqual([]);
    // Still there for A.
    await call(`${a.base}/${e.id}`, { as: a.as });
    await call(`${a.base}/${e.id}`, { method: "DELETE", as: a.as });
    expect((await api(`${a.base}/${e.id}`, { as: a.as })).status).toBe(404);
  });
});
