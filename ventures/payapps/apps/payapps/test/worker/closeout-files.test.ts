// Files kept with a close-out document through the HTTP API on a local D1 and R2: upload, list,
// download headers, the file count on the checklist, the close-out binder (transmittal, index, the
// required documents' files without the GC's receipt or a not-required document's files), the
// shared storage limit, job history, roles, tenancy and cleanup when the item or the job goes.
import { env } from "cloudflare:workers";
import type { CloseoutDto, CloseoutItemDto, ProjectDto } from "@shared/api/types";
import { PdfReader } from "@shared/pdf/reader";
import { beforeEach, describe, expect, it } from "vitest";
import { PdfDocument } from "../../src/worker/services/export/pdf";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

interface Listed {
  items: { id: string; fileName: string; contentType: string; category: string }[];
  storage: { usedBytes: number; limitBytes: number };
  enabled: boolean;
}

async function jobWithItems() {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Mesa Clinic TI", gcName: "Copper State Builders", originalContractSumCents: 1 },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const url = `${base}/closeout`;
  const warranty = await call<CloseoutItemDto>(url, {
    method: "POST",
    as,
    expect: 201,
    json: { kind: "warranty", title: "One-year warranty letter", requiredBy: "Exhibit D" },
  });
  const stock = await call<CloseoutItemDto>(url, {
    method: "POST",
    as,
    expect: 201,
    json: { kind: "attic_stock", title: "Attic stock: 2 cases ceiling tile" },
  });
  return {
    orgId,
    as,
    base,
    url,
    projectId: created.id,
    itemId: warranty.id,
    stockId: stock.id,
    path: `${url}/${warranty.id}`,
    stockPath: `${url}/${stock.id}`,
  };
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

const pdf = (pages: number, text: string) => {
  const doc = new PdfDocument({ title: text });
  for (let i = 0; i < pages; i++) doc.addPage().text(40, 60, `${text} page ${i + 1}`);
  return doc.toBytes();
};

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("close-out document files", () => {
  let t: Awaited<ReturnType<typeof jobWithItems>>;
  beforeEach(async () => {
    t = await jobWithItems();
  });

  it("uploads the document, lists it, counts it on the checklist and downloads it as an attachment", async () => {
    const res = await upload(t.path, t.as, "warranty letter.pdf", pdf(1, "Warranty"));
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string; category: string };
    expect(added).toMatchObject({ contentType: "application/pdf", category: "backup" });

    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toEqual([expect.objectContaining({ fileName: "warranty letter.pdf" })]);
    const checklist = await call<CloseoutDto>(t.url, { as: t.as });
    expect(checklist.items.map((i) => i.files)).toEqual([1, 0]);

    const file = await api(`${t.path}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("application/pdf");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="warranty letter.pdf"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toEqual([
      `orgs/${t.orgId}/projects/${t.projectId}/closeout/${t.itemId}/${added.id}`,
    ]);
  });

  it("refuses page-like file types and unknown categories", async () => {
    expect((await upload(t.path, t.as, "x.html", "<script>")).status).toBe(400);
    expect((await upload(t.path, t.as, "x.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.path, t.as, "x.pdf", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("builds one binder: transmittal, index, then required documents' files, not the GC's receipt", async () => {
    await upload(t.path, t.as, "warranty letter.pdf", pdf(2, "Warranty"), "backup");
    await upload(t.path, t.as, "gc receipt.pdf", pdf(1, "Receipt"), "signed");
    await upload(t.stockPath, t.as, "tile delivered.pdf", pdf(1, "Tile"), "photo");
    // A document marked not required stays on the transmittal, but its files stay out.
    const extra = await call<CloseoutItemDto>(t.url, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { kind: "training", title: "Owner training sign-in" },
    });
    await upload(`${t.url}/${extra.id}`, t.as, "training.pdf", pdf(1, "Training"));
    await call(`${t.url}/${extra.id}`, {
      method: "PATCH",
      as: t.as,
      json: { waivedNote: "No equipment to train on" },
    });

    const res = await api(`${t.url}/binder.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="closeout-mesa-clinic-ti-binder.pdf"',
    );
    expect(res.headers.get("X-Packet-Files")).toBe("2");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = latin1(bytes);
    expect(text).toContain("(Close-out Transmittal)");
    expect(text).toContain("(One-year warranty letter)");
    expect(text).toContain("(Not required: No equipment");
    expect(text).toContain("(warranty letter.pdf)");
    expect(text).toContain("(tile delivered.pdf)");
    expect(text).not.toContain("(gc receipt.pdf)");
    expect(text).not.toContain("(training.pdf)");
    // Transmittal (1+) + index (1+) + 2 warranty pages + 1 tile page.
    const total = (await PdfReader.open(bytes)).pages().length;
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it("prints a binder with no files: the transmittal says they are sent separately", async () => {
    const res = await api(`${t.url}/binder.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Packet-Files")).toBe("0");
    const text = latin1(new Uint8Array(await res.arrayBuffer()));
    expect(text).toContain("No files are kept with these documents yet");
  });

  it("counts close-out files against the company's one storage limit", async () => {
    await upload(t.path, t.as, "a.pdf", "12345");
    const list = await call<Listed>(`${t.stockPath}/attachments`, { as: t.as });
    expect(list.storage.usedBytes).toBe(5);
  });

  it("records each file added and removed in the job history", async () => {
    const { id } = (await (await upload(t.path, t.as, "letter.pdf", "x")).json()) as { id: string };
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    const csv = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    expect(csv).toContain("Close-out, One-year warranty letter: file attached, letter.pdf");
    expect(csv).toContain("Close-out, One-year warranty letter: file removed, letter.pdf");
  });

  it("deletes a file and its object, and clears every file when the item or the job goes", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.path}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.path, t.as, "b.pdf", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.path, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithItems();
    await upload(again.path, again.as, "c.pdf", "z");
    await call(again.base, { method: "DELETE", as: again.as });
    expect(await objectCount(`orgs/${again.orgId}/`)).toBe(0);
  });

  it("lets a viewer read, download and print the binder but not upload or delete", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.path}/attachments`, { as: viewer.id });
    expect((await api(`${t.path}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await api(`${t.url}/binder.pdf`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.path, viewer.id, "b.pdf", "y")).status).toBe(403);
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's close-out files or binder to another", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await jobWithItems();
    const foreign = t.path.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    await call(`${t.url.replace(t.orgId, other.orgId)}/binder.pdf`, { as: other.as, expect: 404 });
    // Another company's file id under this company's own item is not found either.
    await call(`${other.path}/attachments/${id}`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.pdf", "y")).status).toBe(404);
    // Nor can the other company reach this company's URLs at all.
    await call(`${t.path}/attachments`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
