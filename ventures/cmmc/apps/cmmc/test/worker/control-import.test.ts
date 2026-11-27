import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

const json = async <T>(res: Response) => (await res.json()) as T;

interface Preview {
  changes: {
    controlId: string;
    status?: { from: string; to: string };
    owner?: { toUserId: string };
    notes?: boolean;
    statement?: boolean;
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  applied: boolean;
}

const sheet = (ownerEmail: string) =>
  [
    "Control,Status,Implementation Statement,Comments,Owner",
    `3.1.1,Met,"Accounts are issued by IT, reviewed quarterly.",,${ownerEmail}`,
    "3.1.2,Not met,,Needs a role matrix,",
    "3.12.4,Implemented,,,",
    "3.5.3,Partially implemented,,,stranger@elsewhere.test",
  ].join("\n");

describe("control import from a spreadsheet", () => {
  it("previews without writing, then applies and rescores", async () => {
    const t = await setupTenant();
    const path = `/api/orgs/${t.orgId}/controls/import`;
    const csv = sheet(t.user.email);
    const preview = await json<Preview>(
      await api(path, { method: "POST", as: t.userId, json: { level: 2, csv } }),
    );
    expect(preview.applied).toBe(false);
    expect(preview.changes.map((c) => c.controlId)).toEqual([
      "AC.L2-3.1.1",
      "AC.L2-3.1.2",
      "CA.L2-3.12.4",
      "IA.L2-3.5.3",
    ]);
    expect(preview.changes[0]).toMatchObject({
      status: { from: "not_assessed", to: "implemented" },
      owner: { toUserId: t.userId },
      statement: true,
    });
    expect(preview.issues).toHaveLength(1);
    expect(preview.issues[0]?.message).toContain("stranger@elsewhere.test is not a member");
    const before = await json<{ items: { record: unknown }[] }>(
      await api(`/api/orgs/${t.orgId}/controls?level=2`, { as: t.userId }),
    );
    expect(before.items.every((i) => i.record === null)).toBe(true);

    const applied = await json<Preview>(
      await api(path, { method: "POST", as: t.userId, json: { level: 2, csv, apply: true } }),
    );
    expect(applied.applied).toBe(true);
    const rec = await json<{ record: { status: string; statement: string; ownerUserId: string } }>(
      await api(`/api/orgs/${t.orgId}/controls/AC.L2-3.1.1`, { as: t.userId }),
    );
    expect(rec.record).toMatchObject({
      status: "implemented",
      statement: "Accounts are issued by IT, reviewed quarterly.",
      ownerUserId: t.userId,
    });
    const notes = await json<{ record: { notes: string; status: string } }>(
      await api(`/api/orgs/${t.orgId}/controls/AC.L2-3.1.2`, { as: t.userId }),
    );
    expect(notes.record).toMatchObject({ status: "not_implemented", notes: "Needs a role matrix" });

    // Importing the same file again changes nothing.
    const again = await json<Preview>(
      await api(path, { method: "POST", as: t.userId, json: { level: 2, csv } }),
    );
    expect(again.changes).toHaveLength(0);
    expect(again.unchanged).toBe(4);

    const log = await json<{ items: { action: string }[] }>(
      await api(`/api/orgs/${t.orgId}/audit-log`, { as: t.userId }),
    );
    expect(log.items.filter((i) => i.action === "control.import")).toHaveLength(1);
  });

  it("previews Level 2 on the free plan but needs the Level 2 plan to apply", async () => {
    const t = await setupTenant("owner", "Free Shop", null);
    const path = `/api/orgs/${t.orgId}/controls/import`;
    const csv = "Control,Status\n3.1.1,Met\n";
    const preview = await api(path, { method: "POST", as: t.userId, json: { level: 2, csv } });
    expect(preview.status).toBe(200);
    expect((await json<Preview>(preview)).changes).toHaveLength(1);
    const apply = await api(path, {
      method: "POST",
      as: t.userId,
      json: { level: 2, csv, apply: true },
    });
    expect(apply.status).toBe(402);
    const l1 = await api(path, {
      method: "POST",
      as: t.userId,
      json: { level: 1, csv: "Practice,Status\nAC.L1-b.1.i,Met\n", apply: true },
    });
    expect(l1.status).toBe(200);
    expect((await json<Preview>(l1)).applied).toBe(true);
  });

  it("is refused to viewers and to other organizations", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    const path = `/api/orgs/${t.orgId}/controls/import`;
    const body = { level: 2, csv: "Control,Status\n3.1.1,Met\n", apply: true };
    expect((await api(path, { method: "POST", as: viewer.id, json: body })).status).toBe(403);
    const other = await setupTenant("owner", "Other Shop");
    expect((await api(path, { method: "POST", as: other.userId, json: body })).status).toBe(404);
    const rec = await json<{ record: unknown }>(
      await api(`/api/orgs/${t.orgId}/controls/AC.L2-3.1.1`, { as: t.userId }),
    );
    expect(rec.record).toBeNull();
  });
});
