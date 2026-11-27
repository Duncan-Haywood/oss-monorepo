// External service providers: create, edit, the table 4 scope on each row, the checks, the SSP
// section and per-requirement lines, the plan gate, roles, audit and tenant isolation.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Provider {
  id: string;
  name: string;
  data: string;
  isCsp: boolean;
  crmRef: string;
  crmEvidenceId: string | null;
  controls: { controlId: string; responsibility: string }[];
}
type LinkedFile = { id: string; title: string } | null;
interface ProviderList {
  items: (Provider & {
    scope: { label: string; inScope: boolean; rule: string };
    crmFile: LinkedFile;
    serviceDescriptionFile: LinkedFile;
  })[];
  check: { total: number; inScope: number; issues: { message: string }[] };
  options: { key: string }[];
  verification: { readOn: string };
}

interface ControlItem {
  id: string;
  providers: { name: string; responsibility: string }[];
}

async function upload(t: Tenant, title: string) {
  const fd = new FormData();
  fd.set("file", new File([`${title} contents`], "crm.xlsx", { type: "text/csv" }));
  fd.set("title", title);
  fd.set("noCui", "true");
  return json<{ id: string; sha256: string }>(
    api(path(t, "/evidence"), { method: "POST", as: t.userId, body: fd }),
    201,
  );
}

const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/service-providers"), { method: "POST", as, json: body });
const list = (t: Tenant, as = t.userId) =>
  json<ProviderList>(api(path(t, "/service-providers"), { as }));

const gcc = {
  name: "Microsoft 365 GCC High",
  data: "cui",
  isCsp: true,
  services: "Email and file storage",
  serviceDescriptionRef: "Service description PDF (evidence)",
  crmRef: "Microsoft CRM workbook (evidence)",
  controls: [
    { controlId: "SC.L2-3.13.11", responsibility: "provider" },
    { controlId: "AC.L2-3.1.1", responsibility: "shared" },
  ],
};

describe("external service providers", () => {
  it("records a provider, scopes it by table 4 and reports what is missing", async () => {
    const t = await setupTenant();
    const empty = await list(t);
    expect(empty.items).toEqual([]);
    expect(empty.options.map((o) => o.key)).toEqual(["cui", "spd", "neither"]);
    expect(empty.verification.readOn).toBe("2026-11-26");

    const created = await json<Provider>(add(t, gcc), 201);
    expect(created.controls).toHaveLength(2);
    const data = await list(t);
    expect(data.items[0]?.scope).toMatchObject({
      label: "Cloud provider holding CUI",
      inScope: true,
      rule: "The CSP shall meet the FedRAMP requirements in 48 CFR 252.204-7012",
    });
    expect(data.check.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("record the FedRAMP basis"),
    ]);

    const updated = await json<Provider>(
      api(path(t, `/service-providers/${created.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { fedrampBasis: "FedRAMP High authorization (marketplace listing)" },
      }),
    );
    expect(updated.crmRef).toBe(gcc.crmRef);
    expect((await list(t)).check.issues).toEqual([]);
  });

  it("refuses requirements that are not Level 2, or listed twice", async () => {
    const t = await setupTenant();
    const l1 = await add(t, {
      ...gcc,
      controls: [{ controlId: "AC.L1-b.1.i", responsibility: "provider" }],
    });
    expect(l1.status).toBe(400);
    expect(await l1.text()).toContain("not a Level 2 requirement");
    const twice = await add(t, {
      ...gcc,
      controls: [
        { controlId: "AC.L2-3.1.1", responsibility: "provider" },
        { controlId: "AC.L2-3.1.1", responsibility: "shared" },
      ],
    });
    expect(twice.status).toBe(400);
    expect((await add(t, { ...gcc, data: "everything" })).status).toBe(400);
  });

  it("prints the providers and each requirement they carry in the Level 2 SSP", async () => {
    const t = await setupTenant();
    await json(add(t, { ...gcc, name: "GCC | High" }), 201);
    await json(
      add(t, { name: "Payroll service", data: "neither", notes: "Names and pay only" }),
      201,
    );
    const ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).toContain("### External service providers (32 CFR 170.19(c)(2))");
    expect(ssp.markdown).toContain(
      "| GCC \\| High | CUI (with or without Security Protection Data) | Yes |",
    );
    expect(ssp.markdown).toContain("Not an ESP");
    expect(ssp.markdown).toContain("- External service providers: carried by GCC \\| High");
    expect(ssp.markdown).toContain("- External service providers: shared with GCC \\| High");
    const l1 = await json<{ markdown: string }>(api(path(t, "/ssp?level=1"), { as: t.userId }));
    expect(l1.markdown).not.toContain("External service providers");
  });

  it("is readable on every plan; recording needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    await list(t);
    const res = await add(t, gcc);
    expect(res.status).toBe(402);
    expect(await res.text()).toContain(
      "Recording external service providers needs the Level 2 plan",
    );
  });

  it("viewers read but cannot record; writes are audited", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await list(t, viewer.id);
    expect((await add(t, gcc, viewer.id)).status).toBe(403);
    const p = await json<Provider>(add(t, gcc), 201);
    expect(
      (await api(path(t, `/service-providers/${p.id}`), { method: "DELETE", as: viewer.id }))
        .status,
    ).toBe(403);
    await json(api(path(t, `/service-providers/${p.id}`), { method: "DELETE", as: t.userId }));
    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(["service_provider.create", "service_provider.delete"]),
    );
  });

  it("links the service description and CRM to evidence files, unlinked when a file is deleted", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const crm = await upload(t, "Microsoft CRM workbook v3");
    const desc = await upload(t, "GCC High service description");
    const theirs = await upload(other, "Their CRM");
    const body = { ...gcc, serviceDescriptionRef: "", crmRef: "", isCsp: false };

    // Another organization's file is refused, as is an id that does not exist.
    for (const id of [theirs.id, "evd_missing"]) {
      const res = await add(t, { ...body, crmEvidenceId: id });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("evidence file this organization holds");
    }
    const created = await json<Provider>(
      add(t, { ...body, crmEvidenceId: crm.id, serviceDescriptionEvidenceId: desc.id }),
      201,
    );
    const data = await list(t);
    expect(data.check.issues).toEqual([]);
    expect(data.items[0]?.crmFile).toMatchObject({
      id: crm.id,
      title: "Microsoft CRM workbook v3",
    });
    expect(data.items[0]?.serviceDescriptionFile?.id).toBe(desc.id);

    const ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).toContain(
      `evidence file "Microsoft CRM workbook v3" (sha256 ${crm.sha256.slice(0, 12)})`,
    );

    // PATCH to another org's file is refused too; null unlinks.
    const patch = (json: unknown) =>
      api(path(t, `/service-providers/${created.id}`), { method: "PATCH", as: t.userId, json });
    expect((await patch({ serviceDescriptionEvidenceId: theirs.id })).status).toBe(400);
    expect((await json<Provider>(patch({ serviceDescriptionEvidenceId: null }))).id).toBe(
      created.id,
    );
    expect((await list(t)).check.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("attach its service description"),
    ]);

    // Deleting the CRM file clears the link, and the check asks for it again.
    await json(api(path(t, `/evidence/${crm.id}`), { method: "DELETE", as: t.userId }));
    const after = await list(t);
    expect(after.items[0]?.crmEvidenceId).toBeNull();
    expect(after.items[0]?.crmFile).toBeNull();
    expect(after.check.issues.map((i) => i.message)).toContain(
      "Microsoft 365 GCC High: attach its customer responsibility matrix (CRM) from Evidence, or note where it is kept.",
    );
  });

  it("shows the providers that carry each requirement on the Controls list and detail", async () => {
    const t = await setupTenant();
    await json(add(t, gcc), 201);
    await json(
      add(t, {
        ...gcc,
        name: "Acme MSP",
        isCsp: false,
        data: "spd",
        controls: [{ controlId: "AC.L2-3.1.1", responsibility: "provider" }],
      }),
      201,
    );
    // A non-ESP never shows, whatever it was marked with.
    await json(add(t, { name: "Payroll", data: "neither", notes: "Names only" }), 201);
    const l2 = await json<{ items: ControlItem[] }>(
      api(path(t, "/controls?level=2"), { as: t.userId }),
    );
    const byId = new Map(l2.items.map((i) => [i.id, i.providers]));
    expect(byId.get("SC.L2-3.13.11")).toEqual([
      { name: "Microsoft 365 GCC High", responsibility: "provider" },
    ]);
    // Providers come in name order.
    expect(byId.get("AC.L2-3.1.1")).toEqual([
      { name: "Acme MSP", responsibility: "provider" },
      { name: "Microsoft 365 GCC High", responsibility: "shared" },
    ]);
    expect(byId.get("AC.L2-3.1.2")).toEqual([]);
    const detail = await json<ControlItem>(api(path(t, "/controls/AC.L2-3.1.1"), { as: t.userId }));
    expect(detail.providers).toHaveLength(2);
    const l1 = await json<{ items: ControlItem[] }>(
      api(path(t, "/controls?level=1"), { as: t.userId }),
    );
    expect(l1.items.every((i) => i.providers.length === 0)).toBe(true);
    // Another organization sees none of them.
    const other = await setupTenant("owner", "Other Shop");
    const theirs = await json<ControlItem>(
      api(path(other, "/controls/AC.L2-3.1.1"), { as: other.userId }),
    );
    expect(theirs.providers).toEqual([]);
  });

  it("keeps each organization's providers to itself", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const mine = await json<Provider>(add(t, gcc), 201);
    expect((await api(path(t, "/service-providers"), { as: other.userId })).status).toBe(404);
    const viaOther = (m: string, body?: unknown) =>
      api(path(other, `/service-providers/${mine.id}`), {
        method: m,
        as: other.userId,
        json: body,
      });
    expect((await viaOther("PATCH", { name: "Taken" })).status).toBe(404);
    expect((await viaOther("DELETE")).status).toBe(404);
    expect((await list(other)).items).toEqual([]);
    expect((await list(t)).items.map((i) => i.name)).toEqual([gcc.name]);
  });
});
