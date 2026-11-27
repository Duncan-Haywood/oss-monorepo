// Company documents, part 2, through the HTTP API on a local D1 and R2: each document keeps its
// files (the license card, the bonding letter), listed with it and counted in the one storage limit;
// a W-9's file needs the consent to keep the tax ID it shows; deleting the document deletes its
// objects; a file copies onto a pay application as backup; the role gates; tenant isolation, by id
// and by another company's own document.
import { env } from "cloudflare:workers";
import type {
  CompanyDocumentDto,
  CompanyDocumentListDto,
  PayAppDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

interface Listed {
  items: { id: string; fileName: string; category: string; sizeBytes: number }[];
  storage: { usedBytes: number; limitBytes: number };
}

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const keysUnder = async (prefix: string) =>
  (await files.list({ prefix })).objects.map((o) => o.key);

function upload(
  path: string,
  as: string,
  name: string,
  body: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("file", new File([body], name));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

async function addDocument(orgId: string, as: string, json: Record<string, unknown>) {
  const doc = await call<CompanyDocumentDto>(`/api/orgs/${orgId}/documents`, {
    method: "POST",
    as,
    expect: 201,
    json,
  });
  return { doc, path: `/api/orgs/${orgId}/documents/${doc.id}` };
}

async function company() {
  const { orgId, userId: as } = await setupTenant("owner");
  const { doc, path } = await addDocument(orgId, as, {
    kind: "contractor_license",
    jurisdiction: "CA",
    number: "1012345",
    expiresOn: "2099-06-30",
  });
  return { orgId, as, doc, path };
}

async function draftPayApp(orgId: string, as: string) {
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Clinic TI", gcName: "Sierra Builders", originalContractSumCents: 1_000_000 },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  await call(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 1_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  return `${base}/pay-apps/${app.id}`;
}

describe("company document files", () => {
  let t: Awaited<ReturnType<typeof company>>;
  beforeEach(async () => {
    t = await company();
  });

  it("keeps the license card with the record: listed, on the document, downloaded, deleted", async () => {
    const res = await upload(t.path, t.as, "CSLB card.pdf", "%PDF-1.4 card", {
      category: "backup",
    });
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string };
    expect(added.contentType).toBe("application/pdf");
    await upload(t.path, t.as, "board printout.png", "png", { category: "other" });

    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.items.map((f) => [f.fileName, f.category])).toEqual(
      expect.arrayContaining([
        ["CSLB card.pdf", "backup"],
        ["board printout.png", "other"],
      ]),
    );
    expect(list.storage.usedBytes).toBe("%PDF-1.4 card".length + "png".length);
    const docs = await call<CompanyDocumentListDto>(`/api/orgs/${t.orgId}/documents`, {
      as: t.as,
    });
    expect(docs.items[0]?.files.map((f) => f.fileName).sort()).toEqual([
      "CSLB card.pdf",
      "board printout.png",
    ]);

    const file = await api(`${t.path}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("%PDF-1.4 card");
    expect(file.headers.get("Content-Disposition")).toMatch(/^attachment; filename="CSLB card/);
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await keysUnder(`orgs/${t.orgId}/documents/${t.doc.id}/`)).toHaveLength(2);

    await call(`${t.path}/attachments/${added.id}`, { method: "DELETE", as: t.as });
    expect((await call<Listed>(`${t.path}/attachments`, { as: t.as })).items).toHaveLength(1);
    expect(await keysUnder(`orgs/${t.orgId}/documents/${t.doc.id}/`)).toHaveLength(1);
  });

  it("keeps a signed W-9 only when told it may keep the tax ID on it", async () => {
    const w9 = await addDocument(t.orgId, t.as, { kind: "w9", effectiveOn: "2026-01-05" });
    const refused = await upload(w9.path, t.as, "W-9 signed.pdf", "%PDF w9");
    expect(refused.status).toBe(400);
    expect(await refused.text()).toMatch(/taxpayer identification number/);
    expect((await upload(w9.path, t.as, "W-9.pdf", "%PDF w9", { keepTaxId: "no" })).status).toBe(
      400,
    );
    expect(await keysUnder(`orgs/${t.orgId}/documents/${w9.doc.id}/`)).toEqual([]);
    expect((await upload(w9.path, t.as, "W-9.pdf", "%PDF w9", { keepTaxId: "yes" })).status).toBe(
      201,
    );
    // Another kind needs no such answer, and a document with files cannot become a W-9 silently.
    await upload(t.path, t.as, "card.pdf", "c");
    const turned = await api(t.path, { method: "PATCH", as: t.as, json: { kind: "w9" } });
    expect(turned.status).toBe(400);
  });

  it("refuses page-like types and unknown kinds; counts in the shared storage limit", async () => {
    expect((await upload(t.path, t.as, "card.html", "<script>")).status).toBe(400);
    expect((await upload(t.path, t.as, "card.pdf", "x", { category: "secret" })).status).toBe(400);
    await upload(t.path, t.as, "card.pdf", "12345");
    const appPath = await draftPayApp(t.orgId, t.as);
    const appList = await call<Listed>(`${appPath}/attachments`, { as: t.as });
    expect(appList.storage.usedBytes).toBe(5);
  });

  it("deleting the document deletes its files", async () => {
    await upload(t.path, t.as, "card.pdf", "c");
    await upload(t.path, t.as, "renewal.pdf", "r", { category: "other" });
    await call(t.path, { method: "DELETE", as: t.as });
    expect(await keysUnder(`orgs/${t.orgId}/`)).toEqual([]);
    expect((await api(`${t.path}/attachments`, { as: t.as })).status).toBe(404);
  });

  it("copies a document file onto a pay application as backup", async () => {
    const { id } = (await (await upload(t.path, t.as, "License.pdf", "%PDF lic")).json()) as {
      id: string;
    };
    const appPath = await draftPayApp(t.orgId, t.as);
    const copied = await call<{ id: string; fileName: string; category: string }>(
      `${appPath}/attachments/from-documents`,
      { method: "POST", as: t.as, expect: 201, json: { documentId: t.doc.id, fileId: id } },
    );
    expect(copied).toMatchObject({ fileName: "License.pdf", category: "backup" });
    const onApp = await api(`${appPath}/attachments/${copied.id}`, { as: t.as });
    expect(await onApp.text()).toBe("%PDF lic");
    // A copy: deleting the document's file leaves the pay application's.
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect((await call<Listed>(`${appPath}/attachments`, { as: t.as })).items).toHaveLength(1);
    expect(
      (
        await api(`${appPath}/attachments/from-documents`, {
          method: "POST",
          as: t.as,
          json: { documentId: t.doc.id, fileId: id },
        })
      ).status,
    ).toBe(404);
  });

  it("viewers list and download; adding, deleting and copying need an editor", async () => {
    const { id } = (await (await upload(t.path, t.as, "card.pdf", "c")).json()) as { id: string };
    const appPath = await draftPayApp(t.orgId, t.as);
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await call<Listed>(`${t.path}/attachments`, { as: viewer.id })).items).toHaveLength(1);
    expect((await api(`${t.path}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.path, viewer.id, "x.pdf", "x")).status).toBe(403);
    expect(
      (await api(`${t.path}/attachments/${id}`, { method: "DELETE", as: viewer.id })).status,
    ).toBe(403);
    expect(
      (
        await api(`${appPath}/attachments/from-documents`, {
          method: "POST",
          as: viewer.id,
          json: { documentId: t.doc.id, fileId: id },
        })
      ).status,
    ).toBe(403);
  });

  it("another company sees 404 for the files, and cannot copy one onto its own pay app", async () => {
    const { id } = (await (await upload(t.path, t.as, "card.pdf", "c")).json()) as { id: string };
    const other = await company();
    const crossed = t.path.replace(t.orgId, other.orgId);
    for (const [path, init] of [
      [`${crossed}/attachments`, {}],
      [`${crossed}/attachments/${id}`, {}],
      [`${crossed}/attachments/${id}`, { method: "DELETE" }],
      // Their own document id with our file id.
      [`${other.path}/attachments/${id}`, {}],
    ] as const) {
      expect((await api(path, { ...init, as: other.as })).status).toBe(404);
    }
    expect((await upload(crossed, other.as, "x.pdf", "x")).status).toBe(404);
    const theirApp = await draftPayApp(other.orgId, other.as);
    for (const documentId of [t.doc.id, other.doc.id]) {
      const res = await api(`${theirApp}/attachments/from-documents`, {
        method: "POST",
        as: other.as,
        json: { documentId, fileId: id },
      });
      expect(res.status).toBe(404);
    }
    expect(await keysUnder(`orgs/${other.orgId}/`)).toEqual([]);
  });
});
