// Pay-app attachments through the HTTP API on a local D1 and R2: upload, list, download headers,
// refusals, roles, tenancy and cleanup when a draft pay app or a job is deleted.
import { env } from "cloudflare:workers";
import type { PayAppDetailDto, ProjectDto } from "@shared/api/types";
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

async function draftApp() {
  const { orgId, userId: as } = await setupTenant("owner");
  const project = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm St clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${project.id}`;
  await call(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 10_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  return { orgId, as, base, projectId: project.id, appPath: `${base}/pay-apps/${app.id}` };
}

function upload(path: string, as: string, name: string, body: string, category?: string) {
  const form = new FormData();
  form.set("file", new File([body], name, { type: "text/html" }));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;

describe("pay-app attachments", () => {
  let t: Awaited<ReturnType<typeof draftApp>>;
  beforeEach(async () => {
    t = await draftApp();
  });

  it("uploads, lists and downloads a file as an attachment with the type from its extension", async () => {
    const res = await upload(
      t.appPath,
      t.as,
      "C:\\scans\\Stored materials inv 1042.PDF",
      "%PDF-1.4 fake",
      "backup",
    );
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; fileName: string; contentType: string };
    expect(added).toMatchObject({
      fileName: "Stored materials inv 1042.PDF",
      contentType: "application/pdf",
    });

    const list = await call<Listed>(`${t.appPath}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ category: "backup", sizeBytes: 13 });
    expect(list.storage).toEqual({ usedBytes: 13, limitBytes: 250 * 1024 * 1024 });

    const file = await api(`${t.appPath}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    // The browser's claimed type (text/html) is ignored.
    expect(file.headers.get("Content-Type")).toBe("application/pdf");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="Stored materials inv 1042.PDF"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe("%PDF-1.4 fake");
  });

  it("keeps a non-ASCII name in filename* and an ASCII fallback", async () => {
    const res = await upload(t.appPath, t.as, "Façade photo.jpg", "jpeg", "photo");
    const { id } = (await res.json()) as { id: string };
    const file = await api(`${t.appPath}/attachments/${id}`, { as: t.as });
    const cd = file.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain('filename="Fa_ade photo.jpg"');
    expect(cd).toContain("filename*=UTF-8''Fa%C3%A7ade%20photo.jpg");
  });

  it("refuses file types that could render as a page, empty files and unknown categories", async () => {
    for (const name of ["invoice.html", "logo.svg", "run.js"]) {
      const res = await upload(t.appPath, t.as, name, "<script>alert(1)</script>");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("not a file type");
    }
    expect((await upload(t.appPath, t.as, "a.pdf", "")).status).toBe(400);
    expect((await upload(t.appPath, t.as, "a.pdf", "x", "secret")).status).toBe(400);
    const list = await call<Listed>(`${t.appPath}/attachments`, { as: t.as });
    expect(list.items).toHaveLength(0);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("refuses a body declared over the limit before reading it", async () => {
    const res = await api(`${t.appPath}/attachments`, {
      method: "POST",
      as: t.as,
      headers: {
        "Content-Type": "multipart/form-data; boundary=x",
        "Content-Length": String(16 * 1024 * 1024),
      },
      body: "--x--",
    });
    expect(res.status).toBe(400);
  });

  it("deletes a file and its stored object", async () => {
    const { id } = (await (await upload(t.appPath, t.as, "a.pdf", "x")).json()) as { id: string };
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(`${t.appPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.appPath}/attachments/${id}`, { as: t.as, expect: 404 });
  });

  it("clears the stored files when a draft pay app or the job is deleted", async () => {
    await upload(t.appPath, t.as, "a.pdf", "x");
    await call(t.appPath, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const next = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    await upload(`${t.base}/pay-apps/${next.id}`, t.as, "b.png", "png");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.base, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("lets a viewer read and download but not upload or delete", async () => {
    const { id } = (await (await upload(t.appPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.appPath}/attachments`, { as: viewer.id });
    expect((await api(`${t.appPath}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.appPath, viewer.id, "b.pdf", "y")).status).toBe(403);
    await call(`${t.appPath}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's files to another", async () => {
    const { id } = (await (await upload(t.appPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await setupTenant("owner");
    const foreign = t.appPath.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.userId, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.userId, expect: 404 });
    expect((await upload(foreign, other.userId, "b.pdf", "y")).status).toBe(404);
    await call(`${t.appPath}/attachments`, { as: other.userId, expect: 404 });
  });
});
