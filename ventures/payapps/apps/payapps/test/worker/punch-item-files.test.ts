// Photos kept with a punch list item through the HTTP API on a local D1 and R2: upload, list,
// download headers, the photo count on the list, the CSV and the PDF, the shared storage limit,
// job history, roles, tenancy and cleanup when the item or the job is deleted.
import { env } from "cloudflare:workers";
import type { ProjectDto, PunchItemDto, PunchListDto } from "@shared/api/types";
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

async function jobWithItem() {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const item = await call<PunchItemDto>(`${base}/punch-list`, {
    method: "POST",
    as,
    expect: 201,
    json: { description: "Scuffed door frame", location: "Room 104", source: "gc" },
  });
  return {
    orgId,
    as,
    base,
    projectId: created.id,
    itemId: item.id,
    itemPath: `${base}/punch-list/${item.id}`,
  };
}

function upload(path: string, as: string, name: string, body: string, category?: string) {
  const form = new FormData();
  form.set("file", new File([body], name, { type: "text/html" }));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;

describe("punch item photos", () => {
  let t: Awaited<ReturnType<typeof jobWithItem>>;
  beforeEach(async () => {
    t = await jobWithItem();
  });

  it("uploads before and after photos, lists them and downloads one as an attachment", async () => {
    // No category sent: a punch item's file is a photo (before) by default.
    const res = await upload(t.itemPath, t.as, "frame before.jpg", "jpegbytes");
    expect(res.status).toBe(201);
    const before = (await res.json()) as { id: string; contentType: string; category: string };
    expect(before.contentType).toBe("image/jpeg");
    expect(before.category).toBe("photo");
    expect((await upload(t.itemPath, t.as, "frame after.jpg", "x", "signed")).status).toBe(201);

    const list = await call<Listed>(`${t.itemPath}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items.map((i) => [i.fileName, i.category]).sort()).toEqual([
      ["frame after.jpg", "signed"],
      ["frame before.jpg", "photo"],
    ]);
    const punch = await call<PunchListDto>(`${t.base}/punch-list`, { as: t.as });
    expect(punch.items[0]?.fileCount).toBe(2);
    // A change to the item answers with its photo count too.
    const patched = await call<PunchItemDto>(t.itemPath, {
      method: "PATCH",
      as: t.as,
      json: { location: "Room 105" },
    });
    expect(patched.fileCount).toBe(2);

    const file = await api(`${t.itemPath}/attachments/${before.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("image/jpeg");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="frame before.jpg"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe("jpegbytes");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toContain(
      `orgs/${t.orgId}/projects/${t.projectId}/punch/${t.itemId}/${before.id}`,
    );
  });

  it("refuses page-like file types, unknown categories and more than ten files", async () => {
    expect((await upload(t.itemPath, t.as, "a.html", "<script>")).status).toBe(400);
    expect((await upload(t.itemPath, t.as, "a.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.itemPath, t.as, "a.jpg", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    for (let i = 0; i < 10; i++) {
      expect((await upload(t.itemPath, t.as, `p${i}.jpg`, "x")).status).toBe(201);
    }
    const res = await upload(t.itemPath, t.as, "p10.jpg", "x");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("punch item");
  });

  it("puts the photo count on the CSV and the PDF", async () => {
    await upload(t.itemPath, t.as, "a.jpg", "x");
    const csv = await (await api(`${t.base}/punch-list/punch-list.csv`, { as: t.as })).text();
    const [header, row] = csv.split("\r\n");
    expect(header?.endsWith(",Photos kept")).toBe(true);
    expect(row?.endsWith(",1")).toBe(true);
    const pdf = await api(`${t.base}/punch-list/punch-list.pdf`, { as: t.as });
    const text = Array.from(new Uint8Array(await pdf.arrayBuffer()), (c) =>
      String.fromCharCode(c),
    ).join("");
    expect(text).toContain("1 photo kept");
  });

  it("counts punch photos against the company's one storage limit", async () => {
    await upload(t.itemPath, t.as, "a.jpg", "12345");
    const list = await call<Listed>(`${t.itemPath}/attachments`, { as: t.as });
    expect(list.storage.usedBytes).toBe(5);
  });

  it("records each photo added and removed in the job history", async () => {
    const { id } = (await (await upload(t.itemPath, t.as, "frame.jpg", "x")).json()) as {
      id: string;
    };
    await call(`${t.itemPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    const csv = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    expect(csv).toContain("Punch item P-001: photo attached, frame.jpg");
    expect(csv).toContain("Punch item P-001: photo removed, frame.jpg");
  });

  it("deletes a photo and its object, and clears every photo when the item or the job goes", async () => {
    const { id } = (await (await upload(t.itemPath, t.as, "a.jpg", "x")).json()) as { id: string };
    await call(`${t.itemPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.itemPath}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.itemPath, t.as, "b.jpg", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.itemPath, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithItem();
    await upload(again.itemPath, again.as, "c.jpg", "z");
    await call(again.base, { method: "DELETE", as: again.as });
    expect(await objectCount(`orgs/${again.orgId}/`)).toBe(0);
  });

  it("lets a viewer read and download but not upload or delete", async () => {
    const { id } = (await (await upload(t.itemPath, t.as, "a.jpg", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.itemPath}/attachments`, { as: viewer.id });
    expect((await api(`${t.itemPath}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.itemPath, viewer.id, "b.jpg", "y")).status).toBe(403);
    await call(`${t.itemPath}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's punch photos to another", async () => {
    const { id } = (await (await upload(t.itemPath, t.as, "a.jpg", "x")).json()) as { id: string };
    const other = await jobWithItem();
    const foreign = t.itemPath.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.jpg", "y")).status).toBe(404);
    await call(`${t.itemPath}/attachments`, { as: other.as, expect: 404 });
    await call(`${other.itemPath}/attachments/${id}`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
