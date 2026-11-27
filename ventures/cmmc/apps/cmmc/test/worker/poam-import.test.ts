import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

const json = async <T>(res: Response) => (await res.json()) as T;

interface Preview {
  changes: {
    line: number;
    controlId: string;
    kind: "new" | "update";
    fields: string[];
    eligible: boolean;
    eligibilityReason: string;
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  applied: boolean;
}

interface Item {
  id: string;
  controlId: string;
  weakness: string;
  remediation: string;
  responsible: string;
  scheduledCompletion: string;
  status: string;
  closedAt: string | null;
}

const SHEET = [
  "Requirement,Weakness,Remediation,Responsible,Scheduled completion,Status",
  "3.1.20,No list of external systems,Write the list,IT lead,12/31/2026,Open",
  "3.1.1,No account review,Quarterly review,IT lead,2027-01-15,Open",
  "3.4.1,Old baseline,New baseline,Ops,2026-10-01,Completed",
  "3.5.3,MFA missing,Tokens,IT lead,31/12/2026,Open",
].join("\n");

describe("POA&M import from a spreadsheet", () => {
  it("previews without writing, applies, then re-imports as updates only", async () => {
    const t = await setupTenant();
    const path = `/api/orgs/${t.orgId}/poam/import`;
    const preview = await json<Preview>(
      await api(path, { method: "POST", as: t.userId, json: { level: 2, csv: SHEET } }),
    );
    expect(preview.applied).toBe(false);
    expect(preview.changes.map((c) => [c.controlId, c.kind])).toEqual([
      ["AC.L2-3.1.20", "new"],
      ["AC.L2-3.1.1", "new"],
      ["CM.L2-3.4.1", "new"],
    ]);
    // 3.1.20 is never allowed on a POA&M; the preview says so, the import still records the item.
    expect(preview.changes[0]).toMatchObject({ eligible: false });
    expect(preview.changes[0]?.eligibilityReason).toContain("170.21(a)(2)(iv)");
    expect(preview.issues).toHaveLength(1);
    expect(preview.issues[0]).toMatchObject({ line: 5 });
    const list = () =>
      api(`/api/orgs/${t.orgId}/poam`, { as: t.userId }).then((r) => json<{ items: Item[] }>(r));
    expect((await list()).items).toHaveLength(0);

    const applied = await json<Preview>(
      await api(path, {
        method: "POST",
        as: t.userId,
        json: { level: 2, csv: SHEET, apply: true },
      }),
    );
    expect(applied.applied).toBe(true);
    const items = (await list()).items;
    expect(items).toHaveLength(3);
    const byControl = new Map(items.map((i) => [i.controlId, i]));
    expect(byControl.get("AC.L2-3.1.20")).toMatchObject({
      weakness: "No list of external systems",
      remediation: "Write the list",
      responsible: "IT lead",
      scheduledCompletion: "2026-12-31",
      status: "open",
      closedAt: null,
    });
    expect(byControl.get("CM.L2-3.4.1")?.status).toBe("closed");
    expect(byControl.get("CM.L2-3.4.1")?.closedAt).not.toBeNull();

    // Same file again: nothing changes.
    const again = await json<Preview>(
      await api(path, { method: "POST", as: t.userId, json: { level: 2, csv: SHEET } }),
    );
    expect(again.changes).toHaveLength(0);
    expect(again.unchanged).toBe(3);

    // A later copy of the sheet moves a date and closes an item: those two items update in place.
    const later = SHEET.replace("2027-01-15,Open", "2027-02-15,Open").replace(
      "IT lead,12/31/2026,Open",
      "IT lead,12/31/2026,Closed",
    );
    const upd = await json<Preview>(
      await api(path, {
        method: "POST",
        as: t.userId,
        json: { level: 2, csv: later, apply: true },
      }),
    );
    expect(upd.changes.map((c) => [c.controlId, c.kind, c.fields])).toEqual([
      ["AC.L2-3.1.20", "update", ["status"]],
      ["AC.L2-3.1.1", "update", ["scheduledCompletion"]],
    ]);
    const after = new Map((await list()).items.map((i) => [i.controlId, i]));
    expect(after.size).toBe(3);
    expect(after.get("AC.L2-3.1.20")?.status).toBe("closed");
    expect(after.get("AC.L2-3.1.1")?.scheduledCompletion).toBe("2027-02-15");

    const log = await json<{ items: { action: string }[] }>(
      await api(`/api/orgs/${t.orgId}/audit-log`, { as: t.userId }),
    );
    expect(log.items.filter((i) => i.action === "poam.import")).toHaveLength(2);
  });

  it("previews Level 2 items on the free plan but needs the Level 2 plan to apply", async () => {
    const t = await setupTenant("owner", "Free Shop", null);
    const path = `/api/orgs/${t.orgId}/poam/import`;
    const csv = "Requirement,Weakness,Due date\n3.1.1,No review,2027-01-01\n";
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
      json: {
        level: 1,
        csv: "Practice,Weakness,Due date\nAC.L1-b.1.i,Shared login,2027-01-01\n",
        apply: true,
      },
    });
    expect(l1.status).toBe(200);
    expect((await json<Preview>(l1)).applied).toBe(true);
  });

  it("is refused to viewers and to other organizations", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    const path = `/api/orgs/${t.orgId}/poam/import`;
    const body = {
      level: 2,
      csv: "Requirement,Weakness,Due date\n3.1.1,No review,2027-01-01\n",
      apply: true,
    };
    expect((await api(path, { method: "POST", as: viewer.id, json: body })).status).toBe(403);
    const other = await setupTenant("owner", "Other Shop");
    expect((await api(path, { method: "POST", as: other.userId, json: body })).status).toBe(404);
    const items = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${t.orgId}/poam`, { as: t.userId }),
    );
    expect(items.items).toHaveLength(0);
  });
  it("reads a day-first sheet by its own dates, or in the order the person picks", async () => {
    const t = await setupTenant();
    const path = `/api/orgs/${t.orgId}/poam/import`;
    const csv = [
      "Requirement,Weakness,Due date",
      "3.1.1,No account review,03/04/2027",
      "3.5.3,MFA missing,31/12/2026",
    ].join("\n");
    const detected = await json<Preview & { dates: { order: string; source: string } }>(
      await api(path, { method: "POST", as: t.userId, json: { level: 2, csv, apply: true } }),
    );
    expect(detected.dates).toMatchObject({ order: "dmy", source: "detected" });
    const items = await api(`/api/orgs/${t.orgId}/poam`, { as: t.userId }).then((r) =>
      json<{ items: Item[] }>(r),
    );
    expect(items.items.map((i) => [i.controlId, i.scheduledCompletion]).sort()).toEqual([
      ["AC.L2-3.1.1", "2027-04-03"],
      ["IA.L2-3.5.3", "2026-12-31"],
    ]);
    // Chosen month first: the same sheet moves 3.1.1 to 4 March and leaves the day-first row out.
    const chosen = await json<Preview & { dates: { order: string; source: string } }>(
      await api(path, {
        method: "POST",
        as: t.userId,
        json: { level: 2, csv, dateOrder: "mdy" },
      }),
    );
    expect(chosen.dates).toMatchObject({ order: "mdy", source: "chosen" });
    expect(chosen.changes.map((c) => [c.controlId, c.kind, c.fields])).toEqual([
      ["AC.L2-3.1.1", "update", ["scheduledCompletion"]],
    ]);
    expect(chosen.issues.map((i) => i.line)).toEqual([3]);
    const bad = await api(path, {
      method: "POST",
      as: t.userId,
      json: { level: 2, csv, dateOrder: "ymd" },
    });
    expect(bad.status).toBe(400);
  });
});
