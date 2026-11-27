// Asset list import: preview without writing, apply, re-import as updates only, the plan gate,
// roles, audit and tenant isolation.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Preview {
  changes: { line: number; name: string; kind: "new" | "update"; fields: string[] }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  applied: boolean;
}
interface Asset {
  id: string;
  name: string;
  category: string;
  specializedType: string | null;
  owner: string;
  notes: string;
}

const SHEET = [
  "Asset,Category,Specialized asset type,Type,Owner,Notes",
  "CAM-01,CUI,,Workstation,Programmer,",
  "Haas VF-2 controller,Specialized,OT,CNC,Shop lead,Air-gapped; files by DNC only",
  "Firewall,SPA,,Firewall,MSP,",
  "Owner's phone,,,Phone,Owner,",
].join("\n");

const run = (t: Tenant, csv: string, apply = false, as = t.userId) =>
  api(path(t, "/assets/import"), { method: "POST", as, json: { csv, apply } });
const items = (t: Tenant, as = t.userId) =>
  json<{ items: Asset[] }>(api(path(t, "/assets"), { as })).then((r) => r.items);

// The public scoping worksheet's saved file: answers, not categories.
const WORKSHEET_FILE = JSON.stringify({
  format: "machine-shop-guides/cmmc-scope",
  version: 1,
  level: "2",
  company: "Example Precision (invented)",
  assets: [
    { name: "CAM-01", kind: "cam", owner: "Programmer", cui: "yes" },
    { name: "Mill 1 controller", kind: "cnc", owner: "Shop lead", location: "Cell 1", cui: "yes" },
    { name: "M365 GCC High", kind: "cloud", espData: "cui", csp: true },
    { name: "Owner's phone", kind: "mobile", cui: "can" },
  ],
});

describe("asset list import", () => {
  it("imports the scoping worksheet's saved file by the worksheet's own categories", async () => {
    const t = await setupTenant();
    const preview = await json<Preview & { format: string }>(run(t, WORKSHEET_FILE));
    expect(preview.format).toBe("worksheet-json");
    expect(preview.changes.map((c) => [c.line, c.name, c.kind])).toEqual([
      [1, "CAM-01", "new"],
      [2, "Mill 1 controller", "new"],
      [3, "M365 GCC High", "new"],
    ]);
    expect(preview.issues).toEqual([{ line: 4, message: expect.stringContaining("Not resolved") }]);
    await json<Preview>(run(t, WORKSHEET_FILE, true));
    const saved = await items(t);
    expect(saved.map((a) => [a.name, a.category, a.specializedType]).sort()).toEqual([
      ["CAM-01", "cui", null],
      ["M365 GCC High", "cui", null],
      ["Mill 1 controller", "specialized", "ot"],
    ]);
    const again = await json<Preview>(run(t, WORKSHEET_FILE));
    expect(again.changes).toEqual([]);
    expect(again.unchanged).toBe(3);
  });

  it("previews without writing, applies, then re-imports as updates only", async () => {
    const t = await setupTenant();
    const preview = await json<Preview>(run(t, SHEET));
    expect(preview.applied).toBe(false);
    expect(preview.changes.map((c) => [c.name, c.kind])).toEqual([
      ["CAM-01", "new"],
      ["Haas VF-2 controller", "new"],
      ["Firewall", "new"],
    ]);
    expect(preview.issues).toEqual([{ line: 5, message: expect.stringContaining("no category") }]);
    expect(await items(t)).toEqual([]);

    const applied = await json<Preview>(run(t, SHEET, true));
    expect(applied.applied).toBe(true);
    const saved = await items(t);
    expect(saved).toHaveLength(3);
    expect(saved.find((a) => a.name === "Haas VF-2 controller")).toMatchObject({
      category: "specialized",
      specializedType: "ot",
      owner: "Shop lead",
      notes: "Air-gapped; files by DNC only",
    });

    const again = await json<Preview>(run(t, SHEET));
    expect(again.changes).toEqual([]);
    expect(again.unchanged).toBe(3);

    // A later copy moves the firewall to the MSP's name and recategorises CAM-01; a blank cell keeps.
    const later = SHEET.replace("Firewall,SPA,,Firewall,MSP,", "firewall,SPA,,,Acme MSP,").replace(
      "CAM-01,CUI,,Workstation",
      "CAM-01,Out of scope,,",
    );
    const changed = await json<Preview>(run(t, later, true));
    expect(changed.changes.map((c) => [c.name, c.kind, c.fields])).toEqual([
      ["CAM-01", "update", ["category"]],
      ["firewall", "update", ["owner"]],
    ]);
    const after = await items(t);
    expect(after).toHaveLength(3);
    expect(after.find((a) => a.name === "Firewall")?.owner).toBe("Acme MSP");
    expect(after.find((a) => a.name === "CAM-01")?.category).toBe("out_of_scope");

    const log = await json<{ items: { action: string; targetId: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.filter((e) => e.action === "asset.import").map((e) => e.targetId)).toEqual(
      expect.arrayContaining(["new:3,updated:0", "new:0,updated:2"]),
    );
  });

  it("previews on every plan; applying needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    expect((await json<Preview>(run(t, SHEET))).changes).toHaveLength(3);
    const res = await run(t, SHEET, true);
    expect(res.status).toBe(402);
    expect(await items(t)).toEqual([]);
  });

  it("is for editors; viewers cannot import", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await run(t, SHEET, false, viewer.id)).status).toBe(403);
    expect((await run(t, SHEET, true, viewer.id)).status).toBe(403);
  });

  it("matches and writes only inside the caller's organization", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    await json(run(t, SHEET, true));
    // Not a member of t's org.
    expect((await run(t, SHEET, true, other.userId)).status).toBe(404);
    // The other org's own import sees none of t's assets as existing.
    const theirs = await json<Preview>(run(other, SHEET));
    expect(theirs.existing).toBe(0);
    expect(theirs.changes.every((c) => c.kind === "new")).toBe(true);
    await json(run(other, SHEET, true));
    expect(await items(t)).toHaveLength(3);
    expect(await items(other)).toHaveLength(3);
  });
});
