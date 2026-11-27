// Files kept with an RFI through the HTTP API on a local D1 and R2: upload, list, download headers,
// the RFI PDF's "Attached" list and the one-PDF packet (both leave out the response that came back),
// the file count on the log, the shared storage limit, job history, roles, tenancy and cleanup when
// the RFI or the job is deleted.
import { env } from "cloudflare:workers";
import type { ProjectDto, RfiDto, RfiLogDto } from "@shared/api/types";
import { PdfReader } from "@shared/pdf/reader";
import { beforeEach, describe, expect, it } from "vitest";
import { PdfDocument } from "../../src/worker/services/export/pdf";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

interface Listed {
  items: { id: string; fileName: string; contentType: string; sizeBytes: number }[];
  storage: { usedBytes: number; limitBytes: number };
  enabled: boolean;
}

async function jobWithRfi() {
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
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const rfi = await call<RfiDto>(`${base}/rfis`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      subject: "Duct clash at grid C/4",
      question: "The 24x12 supply duct hits the beam at C/4. Can we drop it 6 inches?",
      reference: "M-201 detail 4",
    },
  });
  return { orgId, as, base, rfiId: rfi.id, rfiPath: `${base}/rfis/${rfi.id}` };
}

function upload(
  path: string,
  as: string,
  name: string,
  body: Uint8Array | string,
  category?: string,
) {
  const form = new FormData();
  const part = typeof body === "string" ? body : body.slice();
  form.set("file", new File([part], name, { type: "text/html" }));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

const pdf = (pages: number) => {
  const doc = new PdfDocument({ title: "markup" });
  for (let i = 0; i < pages; i++) doc.addPage().text(40, 60, `Sheet M-201 page ${i + 1}`);
  return doc.toBytes();
};

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const pdfText = async (path: string, as: string) => {
  const res = await api(path, { as });
  expect(res.status).toBe(200);
  return latin1(new Uint8Array(await res.arrayBuffer()));
};

describe("RFI files", () => {
  let t: Awaited<ReturnType<typeof jobWithRfi>>;
  beforeEach(async () => {
    t = await jobWithRfi();
  });

  it("uploads, lists and downloads a file as an attachment with the type from its extension", async () => {
    const res = await upload(t.rfiPath, t.as, "M-201 marked up.pdf", "%PDF-1.4 q", "backup");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string };
    expect(added.contentType).toBe("application/pdf");

    const list = await call<Listed>(`${t.rfiPath}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toEqual([
      expect.objectContaining({ fileName: "M-201 marked up.pdf", sizeBytes: 10 }),
    ]);
    const log = await call<RfiLogDto>(`${t.base}/rfis`, { as: t.as });
    expect(log.items[0]?.fileCount).toBe(1);

    const file = await api(`${t.rfiPath}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("application/pdf");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="M-201 marked up.pdf"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe("%PDF-1.4 q");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toEqual([
      `orgs/${t.orgId}/projects/${t.base.split("/").pop()}/rfis/${t.rfiId}/${added.id}`,
    ]);
  });

  it("refuses page-like file types and unknown categories", async () => {
    expect((await upload(t.rfiPath, t.as, "sketch.html", "<script>")).status).toBe(400);
    expect((await upload(t.rfiPath, t.as, "a.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.rfiPath, t.as, "a.pdf", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("lists the files sent on the RFI PDF and merges them into the packet, without the response", async () => {
    expect(await pdfText(`${t.rfiPath}/rfi.pdf`, t.as)).not.toContain("(Attached) Tj");
    await upload(t.rfiPath, t.as, "M-201 marked up.pdf", pdf(2), "backup");
    await upload(t.rfiPath, t.as, "ASI-3 response.pdf", pdf(1), "signed");
    const text = await pdfText(`${t.rfiPath}/rfi.pdf`, t.as);
    expect(text).toContain("(Attached) Tj");
    expect(text).toContain("(M-201 marked up.pdf) Tj");
    expect(text).toContain("(Marked-up sheet or detail) Tj");
    expect(text).not.toContain("ASI-3 response.pdf");

    const res = await api(`${t.rfiPath}/packet.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="rfi-001-riverside-clinic-with-files.pdf"',
    );
    expect(res.headers.get("X-Packet-Files")).toBe("1");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const packet = latin1(bytes);
    expect(packet).toContain("(Files for RFI 001)");
    expect(packet).toContain("(M-201 marked up.pdf)");
    expect(packet).not.toContain("(ASI-3 response.pdf)");
    const total = (await PdfReader.open(bytes)).pages().length;
    expect(packet).toContain(`(RFI 001 - page ${total} of ${total})`);
  });

  it("counts RFI files against the company's one storage limit", async () => {
    await upload(t.rfiPath, t.as, "a.pdf", "12345");
    const list = await call<Listed>(`${t.rfiPath}/attachments`, { as: t.as });
    expect(list.storage.usedBytes).toBe(5);
    await call(`${t.base}/sov-lines/bulk`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Ductwork", originalCents: 5_000_000 }] },
    });
    const pay = await call<{ id: string }>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    const appList = await call<Listed>(`${t.base}/pay-apps/${pay.id}/attachments`, { as: t.as });
    expect(appList.storage.usedBytes).toBe(5);
  });

  it("records each file added and removed in the job history", async () => {
    const { id } = (await (await upload(t.rfiPath, t.as, "C4 photo.jpg", "x", "photo")).json()) as {
      id: string;
    };
    await call(`${t.rfiPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    const csv = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    expect(csv).toContain("RFI 001: file attached, C4 photo.jpg");
    expect(csv).toContain("RFI 001: file removed, C4 photo.jpg");
  });

  it("deletes a file and its object, and clears every file when the RFI or the job goes", async () => {
    const { id } = (await (await upload(t.rfiPath, t.as, "a.pdf", "x")).json()) as { id: string };
    await call(`${t.rfiPath}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.rfiPath}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.rfiPath, t.as, "b.pdf", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.rfiPath, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithRfi();
    await upload(again.rfiPath, again.as, "c.pdf", "z");
    await call(again.base, { method: "DELETE", as: again.as });
    expect(await objectCount(`orgs/${again.orgId}/`)).toBe(0);
  });

  it("lets a viewer read and download but not upload or delete", async () => {
    const { id } = (await (await upload(t.rfiPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.rfiPath}/attachments`, { as: viewer.id });
    expect((await api(`${t.rfiPath}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await api(`${t.rfiPath}/packet.pdf`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.rfiPath, viewer.id, "b.pdf", "y")).status).toBe(403);
    await call(`${t.rfiPath}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's RFI files to another", async () => {
    const { id } = (await (await upload(t.rfiPath, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await jobWithRfi();
    // Their org in the path, our RFI: not found.
    const foreign = t.rfiPath.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    await call(`${foreign}/packet.pdf`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.pdf", "y")).status).toBe(404);
    // Our path as them: not a member.
    await call(`${t.rfiPath}/attachments`, { as: other.as, expect: 404 });
    // Our file id under their own RFI: not found.
    await call(`${other.rfiPath}/attachments/${id}`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
