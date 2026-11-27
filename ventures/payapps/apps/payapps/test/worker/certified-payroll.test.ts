// Certified payroll (WH-347 layout) through the HTTP API: a valid week prints a two-page PDF with
// the statement of compliance; arithmetic errors (a full SSN, deductions over gross) are refused with
// the reason; a viewer can print; another company's job is a 404; nothing is stored.

import type { ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "VA Clinic Electrical",
      location: "1055 Clermont St, Denver CO",
      gcName: "Front Range Builders",
      originalContractSumCents: 25_000_000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
});

const week = (h: number[]) => h;
const PAYROLL = {
  role: "sub",
  projectName: "VA Clinic Electrical",
  projectNumber: "36C25925C0001",
  payrollNo: "3",
  businessName: "Mile High Electric LLC",
  businessAddress: "200 Main St, Denver CO 80202",
  projectLocation: "1055 Clermont St, Denver CO",
  wageDeterminations: "CO20250012 Mod 3",
  weekEnding: "2026-11-21",
  workers: [
    {
      lastName: "Lopez",
      firstName: "Ana",
      middleInitial: "M",
      idNo: "4821",
      rows: [
        {
          classification: "Electrician",
          status: "J",
          st: week([0, 800, 800, 800, 800, 800, 0]),
          ot: week([0, 0, 0, 0, 0, 200, 0]),
          stRateCents: 4_200,
          otRateCents: 6_300,
          cashInLieuHourlyCents: 0,
        },
      ],
      taxCents: 22_000,
      ficaCents: 17_000,
      fringeCreditsCents: [1_850],
    },
  ],
  fringePlans: [{ name: "IBEW Local 68 H&W", type: "Health", planNo: "68-H", funded: true }],
  certifierName: "Dana Ruiz",
  certifierTitle: "Payroll manager",
};

const print = (json: unknown, user = as, path = base) =>
  api(`${path}/certified-payroll.pdf`, { method: "POST", as: user, json });

describe("certified payroll PDF", () => {
  it("prints a valid week as a PDF named for the payroll and week", async () => {
    const res = await print(PAYROLL);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("certified-payroll-3-2026-11-21.pdf");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("(Lopez)");
    expect(text).toContain("I paid or supervised the payment");
  });

  it("refuses a full Social Security number with the reason", async () => {
    const bad = structuredClone(PAYROLL);
    const w0 = bad.workers[0];
    if (!w0) throw new Error("no worker");
    w0.idNo = "123-45-6789";
    const res = await print(bad);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/full Social Security number/);
  });

  it("refuses deductions larger than gross and a missing header field", async () => {
    const bad = structuredClone(PAYROLL);
    const w1 = bad.workers[0];
    if (!w1) throw new Error("no worker");
    w1.taxCents = 10_000_000;
    expect((await print(bad)).status).toBe(400);
    const { wageDeterminations: _, ...noWd } = PAYROLL;
    const res = await print(noWd);
    expect(res.status).toBe(400);
  });

  it("a viewer can print (it reads only)", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await print(PAYROLL, viewer.id)).status).toBe(200);
  });

  it("another company's job is not found", async () => {
    const other = await setupTenant("owner");
    expect((await print(PAYROLL, other.userId)).status).toBe(404);
    const otherBase = base.replace(orgId, other.orgId);
    expect((await print(PAYROLL, other.userId, otherBase)).status).toBe(404);
  });
});
