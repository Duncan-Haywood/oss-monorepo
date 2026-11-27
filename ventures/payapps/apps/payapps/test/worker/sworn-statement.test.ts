// Contractor's sworn statement through the HTTP API: a statement that adds up prints a PDF named for
// its pay application, with the parties, totals and the notary block; rows over their contract are
// refused with the reason; a viewer can print; another company's job is a 404; nothing is stored.

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
      name: "Oak Park Library",
      location: "834 Lake St, Oak Park IL",
      gcName: "Prairie Builders",
      originalContractSumCents: 48_000_000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
});

// The public guide's worked example (pay-app-guides/sworn.mjs EXAMPLE), in cents.
const STATEMENT = {
  state: "IL",
  role: "subcontractor",
  projectName: "Oak Park Library",
  givenTo: "Prairie Builders",
  contractorName: "Lakeside Electric LLC",
  payApp: "No. 4, period to 2026-10-31",
  statementDate: "2026-11-26",
  contractSumCents: 48_000_000,
  requestedCents: 3_290_000,
  rows: [
    {
      name: "Own forces (labor and profit)",
      work: "Electrical labor; overhead and profit",
      contractCents: 26_800_000,
      changesCents: 1_200_000,
      retainageCents: 560_000,
      paidCents: 4_000_000,
      owingCents: 1_040_000,
    },
    {
      name: "Valley Electric Supply",
      address: "120 Mill Rd, Springfield",
      work: "Wire and gear",
      contractCents: 15_000_000,
      retainageCents: 750_000,
      paidCents: 4_500_000,
      owingCents: 2_250_000,
      billedToDateCents: 7_500_000,
    },
    {
      name: "Lowvolt Systems LLC",
      address: "8 Oak St, Springfield",
      work: "Fire alarm",
      contractCents: 5_000_000,
    },
  ],
  affiantName: "Jordan Lee",
  affiantTitle: "President",
};

const print = (json: unknown, user = as, path = base) =>
  api(`${path}/sworn-statement.pdf`, { method: "POST", as: user, json });

describe("sworn statement PDF", () => {
  it("prints a statement that ties out, named for its pay application", async () => {
    const res = await print(STATEMENT);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(
      "sworn-statement-pay-app-4-2026-11-26.pdf",
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("(Valley Electric Supply)");
    expect(text).toContain("(480,000.00)"); // adjusted contract total
    expect(text).toContain("(32,900.00)"); // owing total = requested
    expect(text).toContain("Subscribed and sworn to");
    expect(text).not.toContain("SAMPLE DATA");
  });

  it("refuses a row that is paid past its contract, with the reason", async () => {
    const bad = structuredClone(STATEMENT);
    const r = bad.rows[2];
    if (!r) throw new Error("no row");
    r.paidCents = 6_000_000;
    const res = await print(bad);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/Lowvolt Systems LLC.*more than the contract/);
  });

  it("refuses a statement with no parties or no company name", async () => {
    expect((await print({ ...STATEMENT, rows: [] })).status).toBe(400);
    expect((await print({ ...STATEMENT, contractorName: "" })).status).toBe(400);
  });

  it("a viewer can print (it reads only)", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await print(STATEMENT, viewer.id)).status).toBe(200);
  });

  it("another company's job is not found", async () => {
    const other = await setupTenant("owner");
    expect((await print(STATEMENT, other.userId)).status).toBe(404);
    const otherBase = base.replace(orgId, other.orgId);
    expect((await print(STATEMENT, other.userId, otherBase)).status).toBe(404);
  });
});
