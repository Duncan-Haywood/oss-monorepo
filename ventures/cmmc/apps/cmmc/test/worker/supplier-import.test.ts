// Supplier list import: preview and apply, matching by name, the "what the order sends" choice, the
// cross-field rules, re-importing the register's own export, the plan gate, roles, audit and tenants.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

interface Preview {
  changes: {
    line: number;
    name: string;
    kind: string;
    infoFlowed: string;
    infoSource: string;
    fields: string[];
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  needInfo: number;
  existing: number;
  needsLevel2Plan: boolean;
  applied: boolean;
}
interface SupplierList {
  items: {
    id: string;
    name: string;
    infoFlowed: string;
    status: string | null;
    statusDate: string | null;
    affirmedOn: string | null;
    subcontractRef: string;
    supplies: string;
  }[];
}

const send = (t: Tenant, body: Record<string, unknown>, as = t.userId) =>
  api(path(t, "/suppliers/import"), { method: "POST", as, json: body });
const list = (t: Tenant) => json<SupplierList>(api(path(t, "/suppliers"), { as: t.userId }));

const ASL = [
  "Supplier Name,Process,Status,Information flowed,CMMC Status,CMMC Status Date,Latest affirmation,PO",
  `Acme Anodizing,Type II anodize,Approved,CUI,Final Level 2 (Self),${daysAgo(100)},${daysAgo(90)},PO 1042`,
  "Bob's Bead Blast,Bead blast,Approved,FCI,,,,",
  "Steel Depot,Bar stock,Approved,,,,,",
].join("\n");

describe("supplier list import", () => {
  it("previews without writing, leaves out rows that do not say what they send, then applies", async () => {
    const t = await setupTenant();
    const p = await json<Preview>(send(t, { csv: ASL }));
    expect(p.applied).toBe(false);
    expect(p.changes.map((c) => [c.name, c.kind, c.infoFlowed, c.infoSource])).toEqual([
      ["Acme Anodizing", "new", "cui", "file"],
      ["Bob's Bead Blast", "new", "fci", "file"],
    ]);
    expect(p.needInfo).toBe(1);
    expect(p.issues.map((i) => i.message).join(" ")).toContain("Steel Depot: the row does not say");
    expect(p.needsLevel2Plan).toBe(true);
    expect((await list(t)).items).toEqual([]);

    const a = await json<Preview>(send(t, { csv: ASL, apply: true, infoDefault: "none" }));
    expect(a.applied).toBe(true);
    expect(a.changes.find((c) => c.name === "Steel Depot")).toMatchObject({
      infoFlowed: "none",
      infoSource: "choice",
    });
    const l = await list(t);
    expect(l.items.map((s) => [s.name, s.infoFlowed, s.status])).toEqual([
      ["Acme Anodizing", "cui", "final_l2_self"],
      ["Bob's Bead Blast", "fci", null],
      ["Steel Depot", "none", null],
    ]);
    expect(l.items[0]).toMatchObject({ subcontractRef: "PO 1042", supplies: "Type II anodize" });

    // The same file again changes nothing.
    const again = await json<Preview>(send(t, { csv: ASL, infoDefault: "none" }));
    expect(again.changes).toEqual([]);
    expect(again.unchanged).toBe(3);
    const log = await json<{ items: { action: string; targetId: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.find((e) => e.action === "supplier.import")?.targetId).toBe("new:3,updated:0");
  });

  it("updates only the fields the file fills, keeps what the order sends, and re-reads its export", async () => {
    const t = await setupTenant();
    await json(send(t, { csv: ASL, apply: true, infoDefault: "fci" }));
    // Blank cells leave the supplier as it is; a different PO is an update of that field only.
    const edit = [
      "Vendor,PO Number,Notes",
      "ACME anodizing,PO 2000,",
      "Steel Depot,,",
      "New Shop,PO 7,first order",
    ].join("\n");
    const p = await json<Preview>(send(t, { csv: edit, apply: true, infoDefault: "none" }));
    expect(p.changes.map((c) => [c.name, c.kind, c.fields, c.infoSource])).toEqual([
      ["ACME anodizing", "update", ["subcontractRef"], "kept"],
      ["New Shop", "new", ["infoFlowed", "subcontractRef", "notes"], "choice"],
    ]);
    expect(p.unchanged).toBe(1);
    const l = await list(t);
    expect(l.items.find((s) => s.name === "Acme Anodizing")).toMatchObject({
      infoFlowed: "cui",
      status: "final_l2_self",
      subcontractRef: "PO 2000",
    });
    expect(l.items.find((s) => s.name === "Steel Depot")?.infoFlowed).toBe("fci");

    const csv = await (await api(path(t, "/suppliers/export.csv"), { as: t.userId })).text();
    const back = await json<Preview>(send(t, { csv }));
    expect(back.changes).toEqual([]);
    expect(back.unchanged).toBe(4);
  });

  it("blanks a date that would break the form's rules, and keeps the row", async () => {
    const t = await setupTenant();
    const csv = [
      "Supplier,Information flowed,CMMC status,CMMC Status Date,Latest affirmation",
      `No Status,FCI,,${daysAgo(10)},`,
      `Early Affirm,CUI,Final Level 2 (Self),${daysAgo(10)},${daysAgo(20)}`,
    ].join("\n");
    const p = await json<Preview>(send(t, { csv, apply: true }));
    expect(p.changes.map((c) => [c.name, c.fields])).toEqual([
      ["No Status", ["infoFlowed"]],
      ["Early Affirm", ["infoFlowed", "status", "statusDate"]],
    ]);
    const text = p.issues.map((i) => i.message).join(" | ");
    expect(text).toContain("No Status: a CMMC Status Date with no CMMC status is left blank");
    expect(text).toContain("Early Affirm: the latest affirmation");
    const l = await list(t);
    expect(l.items.find((s) => s.name === "Early Affirm")).toMatchObject({
      statusDate: daysAgo(10),
      affirmedOn: null,
    });
  });

  it("imports FCI-only Level 1 suppliers on the free plan; CUI needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    const fciOnly = [
      "Supplier,Information flowed,Level flowed down",
      "Bob's Bead Blast,FCI,Level 1",
    ].join("\n");
    const ok = await json<Preview>(send(t, { csv: fciOnly, apply: true }));
    expect(ok.needsLevel2Plan).toBe(false);
    expect(ok.applied).toBe(true);
    const preview = await json<Preview>(send(t, { csv: ASL }));
    expect(preview.needsLevel2Plan).toBe(true);
    const r = await send(t, { csv: ASL, apply: true });
    expect(r.status).toBe(402);
    expect(await r.text()).toContain("needs the Level 2 plan");
    expect((await list(t)).items.map((s) => s.name)).toEqual(["Bob's Bead Blast"]);
  });

  it("viewers cannot import, and an import touches only its own organization", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await send(t, { csv: ASL }, viewer.id)).status).toBe(403);
    await json(send(other, { csv: ASL, apply: true, infoDefault: "fci" }));
    const p = await json<Preview>(send(t, { csv: ASL, infoDefault: "fci" }));
    expect(p.existing).toBe(0);
    expect(p.changes.every((c) => c.kind === "new")).toBe(true);
    expect((await send(other, { csv: ASL }, t.userId)).status).toBe(404);
  });
});
