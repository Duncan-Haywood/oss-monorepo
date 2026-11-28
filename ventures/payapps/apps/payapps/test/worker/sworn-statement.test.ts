// Contractor's sworn statement through the HTTP API: a statement that adds up prints a PDF named for
// its pay application, with the parties, totals and the notary block; rows over their contract are
// refused with the reason; a viewer can print; another company's job is a 404. The draft between
// months is saved with the job: editors save and clear it, viewers read it, half-typed is fine.

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

describe("sworn statement draft saved with the job", () => {
  const draftPath = () => `${base}/sworn-statement/draft`;
  interface Dto {
    draft: (typeof STATEMENT & { rows: { name: string; paidCents?: number }[] }) | null;
    updatedAt: string | null;
    updatedByName: string | null;
  }

  it("starts empty, saves, reads back for another member, and clears", async () => {
    // Its own company and job, so the order of the tests does not matter.
    const t = await setupTenant("owner");
    const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { name: "Draft job", gcName: "Prairie Builders", originalContractSumCents: 1_000_000 },
    });
    const path = `/api/orgs/${t.orgId}/projects/${p.id}/sworn-statement/draft`;
    const as = t.userId;
    expect(await call<Dto>(path, { as })).toEqual({
      draft: null,
      updatedAt: null,
      updatedByName: null,
    });

    const saved = await call<Dto>(path, { method: "PUT", as, json: STATEMENT });
    expect(saved.draft?.rows[1]?.paidCents).toBe(4_500_000);
    expect(saved.updatedByName).toBe("Test User");
    expect(saved.updatedAt).not.toBeNull();

    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    const read = await call<Dto>(path, { as: viewer.id });
    expect(read.draft?.contractorName).toBe("Lakeside Electric LLC");
    expect(read.draft?.rows.map((r) => r.name)).toEqual(STATEMENT.rows.map((r) => r.name));

    // A save replaces the whole draft.
    const next = { ...STATEMENT, rows: [{ ...STATEMENT.rows[0], paidCents: 5_040_000 }] };
    const replaced = await call<Dto>(path, { method: "PUT", as, json: next });
    expect(replaced.draft?.rows).toHaveLength(1);
    expect(replaced.draft?.rows[0]?.paidCents).toBe(5_040_000);

    await call(path, { method: "DELETE", as });
    expect((await call<Dto>(path, { as })).draft).toBeNull();
  });

  it("keeps a half-typed draft that printing would refuse", async () => {
    const half = {
      ...STATEMENT,
      contractorName: "",
      statementDate: "",
      rows: [{ name: "", contractCents: 0 }],
    };
    const res = await call<Dto>(draftPath(), { method: "PUT", as, json: half });
    expect(res.draft?.rows[0]?.name).toBe("");
    expect((await print(half)).status).toBe(400);
  });

  it("refuses money that is not whole cents, and too many rows", async () => {
    const bad = { ...STATEMENT, rows: [{ name: "A", contractCents: 1.5 }] };
    expect((await api(draftPath(), { method: "PUT", as, json: bad })).status).toBe(400);
    const many = {
      ...STATEMENT,
      rows: Array.from({ length: 301 }, (_, i) => ({ name: `P${i}`, contractCents: 0 })),
    };
    expect((await api(draftPath(), { method: "PUT", as, json: many })).status).toBe(400);
  });

  it("a viewer cannot save or clear it", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const put = await api(draftPath(), { method: "PUT", as: viewer.id, json: STATEMENT });
    expect(put.status).toBe(403);
    expect((await api(draftPath(), { method: "DELETE", as: viewer.id })).status).toBe(403);
  });

  it("another company cannot read, save or clear it", async () => {
    await call(draftPath(), { method: "PUT", as, json: STATEMENT });
    const other = await setupTenant("owner");
    expect((await api(draftPath(), { as: other.userId })).status).toBe(404);
    const otherPath = draftPath().replace(orgId, other.orgId);
    expect((await api(otherPath, { as: other.userId })).status).toBe(404);
    expect(
      (await api(otherPath, { method: "PUT", as: other.userId, json: STATEMENT })).status,
    ).toBe(404);
    expect((await api(otherPath, { method: "DELETE", as: other.userId })).status).toBe(404);
    // Still there for its own company.
    expect((await call<Dto>(draftPath(), { as })).draft?.contractorName).toBe(
      "Lakeside Electric LLC",
    );
  });
});

describe("sworn statements kept as given", () => {
  interface Summary {
    id: string;
    payApp: string;
    statementDate: string;
    parties: number;
    paidCents: number;
    owingCents: number;
    createdByName: string | null;
  }

  async function job() {
    const t = await setupTenant("owner");
    const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { name: "Given job", gcName: "Prairie Builders", originalContractSumCents: 48_000_000 },
    });
    return { ...t, path: `/api/orgs/${t.orgId}/projects/${p.id}/sworn-statements` };
  }

  it("keeps each pay application's statement, a reprint replaces it, and prints it again", async () => {
    const t = await job();
    const as = t.userId;
    expect(await call<Summary[]>(t.path, { as })).toEqual([]);

    const first = await call<Summary>(t.path, { method: "POST", as, expect: 201, json: STATEMENT });
    expect(first).toMatchObject({
      payApp: "No. 4, period to 2026-10-31",
      statementDate: "2026-11-26",
      parties: 3,
      paidCents: 8_500_000,
      owingCents: 3_290_000,
      createdByName: "Test User",
    });

    // The same pay application and date again: replaced, not a second row.
    const fixed = structuredClone(STATEMENT);
    const r = fixed.rows[2];
    if (!r) throw new Error("no row");
    r.address = "8 Oak St, Springfield IL";
    const again = await call<Summary>(t.path, { method: "POST", as, expect: 201, json: fixed });
    expect(again.id).toBe(first.id);

    // Next month's is its own row, listed first.
    const december = {
      ...STATEMENT,
      payApp: "No. 5, period to 2026-11-30",
      statementDate: "2026-12-24",
    };
    const second = await call<Summary>(t.path, { method: "POST", as, expect: 201, json: december });
    const list = await call<Summary[]>(t.path, { as });
    expect(list.map((g) => g.id)).toEqual([second.id, first.id]);

    // A viewer lists, reads and reprints; the full statement comes back as kept.
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    const full = await call<{ statement: typeof STATEMENT }>(`${t.path}/${first.id}`, {
      as: viewer.id,
    });
    expect(full.statement.rows[2]?.address).toBe("8 Oak St, Springfield IL");
    const pdf = await api(`${t.path}/${first.id}/statement.pdf`, { as: viewer.id });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Disposition")).toContain(
      "sworn-statement-pay-app-4-2026-11-26.pdf",
    );
    const text = new TextDecoder().decode(await pdf.arrayBuffer());
    expect(text).toContain("(Lowvolt Systems LLC)");

    // A viewer cannot keep or delete one; an editor deletes.
    expect((await api(t.path, { method: "POST", as: viewer.id, json: STATEMENT })).status).toBe(
      403,
    );
    expect((await api(`${t.path}/${first.id}`, { method: "DELETE", as: viewer.id })).status).toBe(
      403,
    );
    await call(`${t.path}/${first.id}`, { method: "DELETE", as });
    expect((await call<Summary[]>(t.path, { as })).map((g) => g.id)).toEqual([second.id]);
    expect((await api(`${t.path}/${first.id}/statement.pdf`, { as })).status).toBe(404);
  });

  it("refuses to keep a statement that would not print", async () => {
    const t = await job();
    const bad = structuredClone(STATEMENT);
    const r = bad.rows[2];
    if (!r) throw new Error("no row");
    r.paidCents = 6_000_000;
    const res = await api(t.path, { method: "POST", as: t.userId, json: bad });
    expect(res.status).toBe(400);
    expect((await call<Summary[]>(t.path, { as: t.userId })).length).toBe(0);
  });

  it("another company cannot list, read, print or delete them", async () => {
    const t = await job();
    const kept = await call<Summary>(t.path, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: STATEMENT,
    });
    const other = await setupTenant("owner");
    const theirs = t.path.replace(t.orgId, other.orgId);
    for (const path of [t.path, theirs]) {
      expect((await api(path, { as: other.userId })).status).toBe(404);
      expect((await api(`${path}/${kept.id}`, { as: other.userId })).status).toBe(404);
      expect((await api(`${path}/${kept.id}/statement.pdf`, { as: other.userId })).status).toBe(
        404,
      );
      expect((await api(`${path}/${kept.id}`, { method: "DELETE", as: other.userId })).status).toBe(
        404,
      );
    }
    expect((await call<Summary[]>(t.path, { as: t.userId })).length).toBe(1);
  });
});
