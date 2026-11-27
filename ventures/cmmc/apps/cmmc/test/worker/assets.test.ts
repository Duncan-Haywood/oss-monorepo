// Level 2 asset inventory: create, edit, the specialized-type rule, the inventory checks, the SSP
// section, CSV export, the plan gate, roles, audit and tenant isolation.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Asset {
  id: string;
  name: string;
  category: string;
  specializedType: string | null;
  notes: string;
}
type Diagram = { id: string; title: string; fileName: string; sha256: string } | null;
interface Inventory {
  items: Asset[];
  networkDiagram: Diagram;
  check: { total: number; counts: Record<string, number>; issues: { message: string }[] };
  categories: { key: string; label: string }[];
  verification: { readOn: string };
}

const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/assets"), { method: "POST", as, json: body });
const inventory = (t: Tenant, as = t.userId) => json<Inventory>(api(path(t, "/assets"), { as }));
const linkDiagram = (t: Tenant, evidenceId: string | null, as = t.userId) =>
  api(path(t, "/assets/network-diagram"), { method: "PUT", as, json: { evidenceId } });

async function upload(t: Tenant, title: string) {
  const fd = new FormData();
  fd.set("file", new File([`${title} contents`], "scope.pdf", { type: "application/pdf" }));
  fd.set("title", title);
  fd.set("noCui", "true");
  return json<{ id: string; sha256: string }>(
    api(path(t, "/evidence"), { method: "POST", as: t.userId, body: fd }),
    201,
  );
}

describe("asset inventory", () => {
  it("records assets by category and reports what is missing", async () => {
    const t = await setupTenant();
    const empty = await inventory(t);
    expect(empty.items).toEqual([]);
    expect(empty.categories).toHaveLength(5);
    expect(empty.verification.readOn).toBe("2026-11-25");

    const laptop = await json<Asset>(
      add(t, { name: "Office laptop", category: "cui", assetType: "Laptop" }),
      201,
    );
    await json(
      add(t, {
        name: "Haas VF-2 controller",
        category: "specialized",
        specializedType: "ot",
      }),
      201,
    );
    const data = await inventory(t);
    expect(data.check.counts).toMatchObject({ cui: 1, specialized: 1 });
    expect(data.check.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("No Security Protection Asset"),
      expect.stringContaining("No network diagram is linked"),
      "Haas VF-2 controller: add a note saying how risk-based practices manage it.",
    ]);

    // Edit one field; the rest stay.
    const updated = await json<Asset>(
      api(path(t, `/assets/${laptop.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { notes: "BitLocker, MFA" },
      }),
    );
    expect(updated.notes).toBe("BitLocker, MFA");
  });

  it("needs a specialized type for specialized assets only", async () => {
    const t = await setupTenant();
    const missing = await add(t, { name: "CMM", category: "specialized" });
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("Choose which kind of specialized asset");
    const wrong = await add(t, { name: "PC", category: "cui", specializedType: "iot" });
    expect(wrong.status).toBe(400);
    const bad = await add(t, { name: "PC", category: "everything" });
    expect(bad.status).toBe(400);

    const cmm = await json<Asset>(
      add(t, { name: "CMM", category: "specialized", specializedType: "test_equipment" }),
      201,
    );
    // Moving it to another category drops the type.
    const moved = await json<Asset>(
      api(path(t, `/assets/${cmm.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { category: "out_of_scope", notes: "Not networked" },
      }),
    );
    expect(moved).toMatchObject({ category: "out_of_scope", specializedType: null });
  });

  it("prints the inventory in the Level 2 SSP and exports CSV", async () => {
    const t = await setupTenant();
    await json(
      add(t, { name: "=cmd|calc", category: "security_protection", notes: "Firewall" }),
      201,
    );
    const ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).toContain("### Asset inventory (32 CFR 170.19(c))");
    expect(ssp.markdown).toContain(
      '**Security Protection Assets (1)**: "Assets that provide security functions',
    );
    const csv = await api(path(t, "/assets/export.csv"), { as: t.userId });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain("asset-inventory.csv");
    const text = await csv.text();
    expect(text).toContain("'=cmd|calc,Security Protection Assets");
  });

  it("is readable on every plan; recording needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    await inventory(t);
    const res = await add(t, { name: "Laptop", category: "cui" });
    expect(res.status).toBe(402);
    expect(await res.text()).toContain(
      "Recording the Level 2 asset inventory needs the Level 2 plan",
    );
  });

  it("viewers read but cannot record; writes are audited", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await inventory(t, viewer.id);
    expect((await add(t, { name: "Laptop", category: "cui" }, viewer.id)).status).toBe(403);
    const a = await json<Asset>(add(t, { name: "Laptop", category: "cui" }), 201);
    expect(
      (await api(path(t, `/assets/${a.id}`), { method: "DELETE", as: viewer.id })).status,
    ).toBe(403);
    await json(api(path(t, `/assets/${a.id}`), { method: "DELETE", as: t.userId }));
    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    const actions = log.items.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["asset.create", "asset.delete"]));
  });

  it("links a network diagram file, names it in the SSP and unlinks it when the file goes", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    await json(add(t, { name: "Office laptop", category: "cui" }), 201);
    const before = await inventory(t);
    expect(before.networkDiagram).toBeNull();
    expect(before.check.issues.map((i) => i.message)).toContain(
      'No network diagram is linked. For every in-scope category the rule says: "Document in the network diagram of the CMMC Assessment Scope." Link the diagram file under Network diagram.',
    );
    let ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).toContain(
      "Network diagram of the assessment scope: _Not yet linked (Assets tab)._",
    );

    // Another organization's file is refused, as is an id that does not exist.
    const theirs = await upload(other, "Their diagram");
    for (const id of [theirs.id, "evd_missing"]) {
      const res = await linkDiagram(t, id);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("evidence file this organization holds");
    }
    const file = await upload(t, "Scope diagram v2");
    const linked = await json<{ networkDiagram: Diagram }>(linkDiagram(t, file.id));
    expect(linked.networkDiagram).toMatchObject({ id: file.id, title: "Scope diagram v2" });
    const after = await inventory(t);
    expect(after.networkDiagram?.fileName).toBe("scope.pdf");
    expect(after.check.issues.map((i) => i.message)).not.toContainEqual(
      expect.stringContaining("network diagram"),
    );
    ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).toContain(
      `Network diagram of the assessment scope: evidence file "Scope diagram v2" (scope.pdf, sha256 ${file.sha256.slice(0, 12)}).`,
    );
    // The other org's inventory never sees it.
    expect((await inventory(other)).networkDiagram).toBeNull();

    // Deleting the file clears the link.
    await json(api(path(t, `/evidence/${file.id}`), { method: "DELETE", as: t.userId }));
    expect((await inventory(t)).networkDiagram).toBeNull();

    // Null unlinks; both are audited.
    const again = await upload(t, "Scope diagram v3");
    await json(linkDiagram(t, again.id));
    expect(
      (await json<{ networkDiagram: Diagram }>(linkDiagram(t, null))).networkDiagram,
    ).toBeNull();
    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(["asset_inventory.diagram_link", "asset_inventory.diagram_unlink"]),
    );
  });

  it("asks for no diagram when only out-of-scope assets are listed", async () => {
    const t = await setupTenant();
    await json(
      add(t, { name: "Break room TV", category: "out_of_scope", notes: "Guest Wi-Fi" }),
      201,
    );
    const data = await inventory(t);
    expect(data.check.issues.map((i) => i.message)).not.toContainEqual(
      expect.stringContaining("network diagram"),
    );
    const ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).not.toContain("Network diagram of the assessment scope");
  });

  it("linking a diagram needs the Level 2 plan and an editor; unlinking needs neither plan", async () => {
    const free = await setupTenant("owner", "Shop", null);
    const f = await upload(free, "Diagram");
    const res = await linkDiagram(free, f.id);
    expect(res.status).toBe(402);
    expect(await res.text()).toContain("Linking the network diagram needs the Level 2 plan");
    await json(linkDiagram(free, null));

    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    const file = await upload(t, "Diagram");
    expect((await linkDiagram(t, file.id, viewer.id)).status).toBe(403);
    expect((await linkDiagram(t, null, viewer.id)).status).toBe(403);
    // A user outside the org gets 404 on the whole org.
    const other = await setupTenant("owner", "Other Shop");
    expect((await linkDiagram(t, file.id, other.userId)).status).toBe(404);
  });

  it("keeps each organization's assets to itself", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const mine = await json<Asset>(add(t, { name: "Laptop", category: "cui" }), 201);
    // Not a member: 404 on the whole org.
    expect((await api(path(t, "/assets"), { as: other.userId })).status).toBe(404);
    // A member of another org cannot reach this asset through their own org.
    const viaOther = (m: string, json?: unknown) =>
      api(path(other, `/assets/${mine.id}`), { method: m, as: other.userId, json });
    expect((await viaOther("PATCH", { name: "Taken" })).status).toBe(404);
    expect((await viaOther("DELETE")).status).toBe(404);
    expect((await inventory(other)).items).toEqual([]);
    expect((await inventory(t)).items.map((i) => i.name)).toEqual(["Laptop"]);
  });
});
