// Files on a submittal revision through the HTTP API on a local D1 and R2: upload, list, download
// headers, the transmittal's "Files enclosed" list, the packet (transmittal + files), the shared
// storage limit, roles, tenancy and cleanup when the submittal or the job is deleted.
import { env } from "cloudflare:workers";
import type { ProjectDto, SubmittalDto } from "@shared/api/types";
import { PdfReader } from "@shared/pdf/reader";
import { beforeEach, describe, expect, it } from "vitest";
import { PdfDocument } from "../../src/worker/services/export/pdf";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

interface Listed {
  items: { id: string; fileName: string; contentType: string; sizeBytes: number }[];
  storage: { usedBytes: number; limitBytes: number };
  enabled: boolean;
}

async function jobWithSubmittal() {
  const { orgId, userId: as } = await setupTenant("owner");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Mesa Clinic TI", gcName: "Copper State Builders", originalContractSumCents: 1 },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const s = await call<SubmittalDto>(`${base}/submittals`, {
    method: "POST",
    as,
    expect: 201,
    json: { specSection: "23 31 13", title: "Ductwork shop drawings", type: "shop_drawings" },
  });
  return { orgId, as, base, projectId: p.id, id: s.id, sPath: `${base}/submittals/${s.id}` };
}

function upload(path: string, as: string, name: string, body: BlobPart, category?: string) {
  const form = new FormData();
  form.set("file", new File([body], name, { type: "text/html" }));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

const pdf = (pages: number) => {
  const doc = new PdfDocument({ title: "drawings" });
  for (let i = 0; i < pages; i++) doc.addPage().text(40, 60, `Sheet M-${i + 1}`);
  return new Uint8Array(doc.toBytes());
};

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const transmittalText = async (path: string, as: string) =>
  latin1(new Uint8Array(await (await api(`${path}/transmittal.pdf`, { as })).arrayBuffer()));

describe("submittal files", () => {
  let t: Awaited<ReturnType<typeof jobWithSubmittal>>;
  beforeEach(async () => {
    t = await jobWithSubmittal();
  });

  it("uploads, lists and downloads a file as an attachment with the type from its extension", async () => {
    const res = await upload(t.sPath, t.as, "M-501 duct details.pdf", "%PDF-1.4 q", "backup");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string };
    expect(added.contentType).toBe("application/pdf");

    const list = await call<Listed>(`${t.sPath}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toEqual([
      expect.objectContaining({ fileName: "M-501 duct details.pdf", sizeBytes: 10 }),
    ]);

    const file = await api(`${t.sPath}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("application/pdf");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="M-501 duct details.pdf"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toEqual([
      `orgs/${t.orgId}/projects/${t.projectId}/submittals/${t.id}/${added.id}`,
    ]);
  });

  it("refuses page-like file types and unknown categories", async () => {
    expect((await upload(t.sPath, t.as, "d.html", "<script>")).status).toBe(400);
    expect((await upload(t.sPath, t.as, "d.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.sPath, t.as, "d.pdf", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("lists the files on the transmittal as enclosed, leaving out the stamped copy", async () => {
    expect(await transmittalText(t.sPath, t.as)).not.toContain("Files enclosed");
    await upload(t.sPath, t.as, "M-501 duct details.pdf", "q", "backup");
    await upload(t.sPath, t.as, "Sample flange.jpg", "j", "photo");
    await upload(t.sPath, t.as, "Ductwork reviewed.pdf", "s", "signed");
    const text = await transmittalText(t.sPath, t.as);
    expect(text).toContain("(Files enclosed \\(2\\)) Tj");
    expect(text).toContain("(M-501 duct details.pdf) Tj");
    expect(text).toContain("(Product data / drawings) Tj");
    expect(text).toContain("(Sample flange.jpg) Tj");
    expect(text).not.toContain("Ductwork reviewed.pdf");
  });

  it("merges the transmittal with its enclosed PDFs into one packet", async () => {
    await upload(t.sPath, t.as, "M-501.pdf", pdf(3), "backup");
    await upload(t.sPath, t.as, "Fan schedule.xlsx", "x", "backup");
    await upload(t.sPath, t.as, "Ductwork reviewed.pdf", pdf(1), "signed");
    const res = await api(`${t.sPath}/packet.pdf?today=2026-11-26`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="transmittal-001-mesa-clinic-ti-with-files.pdf"',
    );
    // The drawings go in; the spreadsheet is listed on the index; the stamped copy stays out.
    expect(res.headers.get("X-Packet-Files")).toBe("1");
    expect(res.headers.get("X-Packet-Skipped")).toBe("1");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const reader = await PdfReader.open(bytes);
    // Transmittal (1) + index (1) + drawings (3).
    expect(reader.pages().length).toBe(5);
    const text = latin1(bytes);
    expect(text).toContain("Fan schedule.xlsx");
    expect(text).not.toContain("Ductwork reviewed.pdf");
  });

  it("counts submittal and pay application files against one storage limit", async () => {
    await upload(t.sPath, t.as, "a.pdf", "12345");
    await call(`${t.base}/sov-lines/bulk`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Ductwork", originalCents: 100_000 }] },
    });
    const app = await call<{ id: string }>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    await upload(`${t.base}/pay-apps/${app.id}`, t.as, "b.pdf", "123");
    const appList = await call<Listed>(`${t.base}/pay-apps/${app.id}/attachments`, { as: t.as });
    const subList = await call<Listed>(`${t.sPath}/attachments`, { as: t.as });
    expect(appList.storage.usedBytes).toBe(8);
    expect(subList.storage.usedBytes).toBe(8);
  });

  it("deletes a file and its object, and clears every file when the submittal or job goes", async () => {
    const { id } = (await (await upload(t.sPath, t.as, "a.pdf", "x")).json()) as { id: string };
    await call(`${t.sPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.sPath}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.sPath, t.as, "b.pdf", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.sPath, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithSubmittal();
    await upload(again.sPath, again.as, "c.pdf", "z");
    await call(again.base, { method: "DELETE", as: again.as });
    expect(await objectCount(`orgs/${again.orgId}/`)).toBe(0);
  });

  it("lets a viewer read, download and print the packet but not upload or delete", async () => {
    const { id } = (await (await upload(t.sPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.sPath}/attachments`, { as: viewer.id });
    expect((await api(`${t.sPath}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await api(`${t.sPath}/packet.pdf`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.sPath, viewer.id, "b.pdf", "y")).status).toBe(403);
    await call(`${t.sPath}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's submittal files to another", async () => {
    const { id } = (await (await upload(t.sPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await jobWithSubmittal();
    // Their org in the path, our submittal: not found.
    const foreign = t.sPath.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    await call(`${foreign}/packet.pdf`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.pdf", "y")).status).toBe(404);
    // Our path as them: not a member.
    await call(`${t.sPath}/attachments`, { as: other.as, expect: 404 });
    // Our file id under their own submittal: not found.
    await call(`${other.sPath}/attachments/${id}`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
