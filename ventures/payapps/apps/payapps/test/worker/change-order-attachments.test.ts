// Change order attachments through the HTTP API on a local D1 and R2: upload, list, download
// headers, the request PDF's backup list, the shared storage limit, job history, roles, tenancy and
// cleanup when the change order or the job is deleted.
import { env } from "cloudflare:workers";
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

interface Listed {
  items: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    category: string;
  }[];
  storage: { usedBytes: number; limitBytes: number };
  enabled: boolean;
}

async function jobWithChangeOrder() {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      number: "RC-12",
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  let project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 5_000_000 }] },
  });
  project = await call<ProjectDetailDto>(`${base}/change-orders`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      number: "7",
      description: "Two EV chargers in the garage",
      items: [{ sovLineId: project.sovLines[0]?.id, amountCents: 900_000 }],
    },
  });
  const co = project.changeOrders[0];
  if (!co) throw new Error("no change order");
  return { orgId, as, base, coId: co.id, coPath: `${base}/change-orders/${co.id}` };
}

function upload(path: string, as: string, name: string, body: string, category?: string) {
  const form = new FormData();
  form.set("file", new File([body], name, { type: "text/html" }));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;
const pdfText = async (path: string, as: string) =>
  new TextDecoder().decode(await (await api(`${path}/request.pdf`, { as })).arrayBuffer());

describe("change order attachments", () => {
  let t: Awaited<ReturnType<typeof jobWithChangeOrder>>;
  beforeEach(async () => {
    t = await jobWithChangeOrder();
  });

  it("uploads, lists and downloads a file as an attachment with the type from its extension", async () => {
    const res = await upload(t.coPath, t.as, "Supplier quote 5512.pdf", "%PDF-1.4 q", "backup");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string };
    expect(added.contentType).toBe("application/pdf");

    const list = await call<Listed>(`${t.coPath}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toEqual([
      expect.objectContaining({ fileName: "Supplier quote 5512.pdf", sizeBytes: 10 }),
    ]);

    const file = await api(`${t.coPath}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("application/pdf");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="Supplier quote 5512.pdf"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe("%PDF-1.4 q");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toEqual([
      `orgs/${t.orgId}/projects/${t.base.split("/").pop()}/change-orders/${t.coId}/${added.id}`,
    ]);
  });

  it("refuses page-like file types and unknown categories", async () => {
    expect((await upload(t.coPath, t.as, "quote.html", "<script>")).status).toBe(400);
    expect((await upload(t.coPath, t.as, "a.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.coPath, t.as, "a.pdf", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("lists the backup on the request PDF, leaving out the signed copy", async () => {
    expect(await pdfText(t.coPath, t.as)).not.toContain("(Backup attached) Tj");
    await upload(t.coPath, t.as, "Supplier quote 5512.pdf", "q", "backup");
    await upload(t.coPath, t.as, "Garage wall.jpg", "j", "photo");
    await upload(t.coPath, t.as, "CO7 signed.pdf", "s", "signed");
    const text = await pdfText(t.coPath, t.as);
    expect(text).toContain("(Backup attached) Tj");
    expect(text).toContain("(Supplier quote 5512.pdf) Tj");
    expect(text).toContain("(Pricing backup) Tj");
    expect(text).toContain("(Garage wall.jpg) Tj");
    expect(text).toContain("(Photo of the condition or work) Tj");
    expect(text).not.toContain("CO7 signed.pdf");
  });

  it("counts change order and pay application files against one storage limit", async () => {
    await upload(t.coPath, t.as, "a.pdf", "12345");
    const app = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    await upload(`${t.base}/pay-apps/${app.id}`, t.as, "b.pdf", "123");
    const appList = await call<Listed>(`${t.base}/pay-apps/${app.id}/attachments`, { as: t.as });
    const coList = await call<Listed>(`${t.coPath}/attachments`, { as: t.as });
    expect(appList.storage.usedBytes).toBe(8);
    expect(coList.storage.usedBytes).toBe(8);
  });

  it("records each file added and removed in the job history", async () => {
    const { id } = (await (await upload(t.coPath, t.as, "T&M ticket 14.pdf", "x")).json()) as {
      id: string;
    };
    await call(`${t.coPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    const { items } = await call<{ items: { action: string; summary?: string }[] }>(
      `${t.base}/history`,
      { as: t.as },
    );
    const actions = items.map((e) => e.action);
    expect(actions).toContain("change_order_file_added");
    expect(actions).toContain("change_order_file_deleted");
    const csv = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    expect(csv).toContain("Change order 7: file attached, T&M ticket 14.pdf");
    expect(csv).toContain("Change order 7: file removed, T&M ticket 14.pdf");
  });

  it("deletes a file and its object, and clears every file when the change order or job goes", async () => {
    const { id } = (await (await upload(t.coPath, t.as, "a.pdf", "x")).json()) as { id: string };
    await call(`${t.coPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.coPath}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.coPath, t.as, "b.pdf", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.coPath, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithChangeOrder();
    await upload(again.coPath, again.as, "c.pdf", "z");
    await call(again.base, { method: "DELETE", as: again.as });
    expect(await objectCount(`orgs/${again.orgId}/`)).toBe(0);
  });

  it("lets a viewer read and download but not upload or delete", async () => {
    const { id } = (await (await upload(t.coPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.coPath}/attachments`, { as: viewer.id });
    expect((await api(`${t.coPath}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.coPath, viewer.id, "b.pdf", "y")).status).toBe(403);
    await call(`${t.coPath}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's change order files to another", async () => {
    const { id } = (await (await upload(t.coPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await jobWithChangeOrder();
    // Their org in the path, our change order: not found.
    const foreign = t.coPath.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.pdf", "y")).status).toBe(404);
    // Our path as them: not a member.
    await call(`${t.coPath}/attachments`, { as: other.as, expect: 404 });
    // Our file id under their own change order: not found.
    await call(`${other.coPath}/attachments/${id}`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
