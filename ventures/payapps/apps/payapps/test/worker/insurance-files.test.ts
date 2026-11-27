// Insurance certificates, part 2, through the HTTP API on a local D1 and R2: each certificate keeps
// its files (the certificate PDF, endorsements), listed with it and counted in the one storage limit;
// deleting the certificate deletes its objects; a file copies onto a pay application as backup; the
// role gates; tenant isolation, by id and by another company's own certificate.
import { env } from "cloudflare:workers";
import type {
  InsuranceCertificateDto,
  InsuranceListDto,
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

function upload(path: string, as: string, name: string, body: string, category?: string) {
  const form = new FormData();
  form.set("file", new File([body], name));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

async function company() {
  const { orgId, userId: as } = await setupTenant("owner");
  const cert = await call<InsuranceCertificateDto>(`/api/orgs/${orgId}/insurance`, {
    method: "POST",
    as,
    expect: 201,
    json: { kind: "general_liability", carrier: "Acme Mutual", expiresOn: "2099-06-30" },
  });
  return { orgId, as, cert, path: `/api/orgs/${orgId}/insurance/${cert.id}` };
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

describe("insurance certificate files", () => {
  let t: Awaited<ReturnType<typeof company>>;
  beforeEach(async () => {
    t = await company();
  });

  it("keeps the certificate PDF with the record: listed, on the certificate, downloaded", async () => {
    const res = await upload(t.path, t.as, "ACORD 25 2026.pdf", "%PDF-1.4 cert", "backup");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string };
    expect(added.contentType).toBe("application/pdf");
    await upload(t.path, t.as, "AI endorsement.pdf", "%PDF-1.4 ai", "signed");

    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.items.map((f) => [f.fileName, f.category])).toEqual(
      expect.arrayContaining([
        ["ACORD 25 2026.pdf", "backup"],
        ["AI endorsement.pdf", "signed"],
      ]),
    );
    expect(list.storage.usedBytes).toBe("%PDF-1.4 cert".length + "%PDF-1.4 ai".length);
    const certs = await call<InsuranceListDto>(`/api/orgs/${t.orgId}/insurance`, { as: t.as });
    expect(certs.items[0]?.files.map((f) => f.fileName).sort()).toEqual([
      "ACORD 25 2026.pdf",
      "AI endorsement.pdf",
    ]);

    const file = await api(`${t.path}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("%PDF-1.4 cert");
    expect(file.headers.get("Content-Disposition")).toMatch(/^attachment; filename="ACORD 25/);
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await keysUnder(`orgs/${t.orgId}/insurance/${t.cert.id}/`)).toHaveLength(2);

    await call(`${t.path}/attachments/${added.id}`, { method: "DELETE", as: t.as });
    expect((await call<Listed>(`${t.path}/attachments`, { as: t.as })).items).toHaveLength(1);
    expect(await keysUnder(`orgs/${t.orgId}/insurance/${t.cert.id}/`)).toHaveLength(1);
  });

  it("refuses page-like types and unknown kinds; counts in the shared storage limit", async () => {
    expect((await upload(t.path, t.as, "cert.html", "<script>")).status).toBe(400);
    expect((await upload(t.path, t.as, "cert.pdf", "x", "secret")).status).toBe(400);
    await upload(t.path, t.as, "cert.pdf", "12345");
    const appPath = await draftPayApp(t.orgId, t.as);
    const appList = await call<Listed>(`${appPath}/attachments`, { as: t.as });
    expect(appList.storage.usedBytes).toBe(5);
  });

  it("deleting the certificate deletes its files", async () => {
    await upload(t.path, t.as, "cert.pdf", "c");
    await upload(t.path, t.as, "endorsement.pdf", "e", "signed");
    await call(t.path, { method: "DELETE", as: t.as });
    expect(await keysUnder(`orgs/${t.orgId}/`)).toEqual([]);
    expect((await api(`${t.path}/attachments`, { as: t.as })).status).toBe(404);
  });

  it("copies a certificate file onto a pay application as backup", async () => {
    const { id } = (await (await upload(t.path, t.as, "ACORD 25.pdf", "%PDF cert")).json()) as {
      id: string;
    };
    const appPath = await draftPayApp(t.orgId, t.as);
    const copied = await call<{ id: string; fileName: string; category: string }>(
      `${appPath}/attachments/from-insurance`,
      { method: "POST", as: t.as, expect: 201, json: { certificateId: t.cert.id, fileId: id } },
    );
    expect(copied).toMatchObject({ fileName: "ACORD 25.pdf", category: "backup" });
    const onApp = await api(`${appPath}/attachments/${copied.id}`, { as: t.as });
    expect(await onApp.text()).toBe("%PDF cert");
    // A copy: deleting the certificate's file leaves the pay application's.
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect((await call<Listed>(`${appPath}/attachments`, { as: t.as })).items).toHaveLength(1);
    expect(
      (
        await api(`${appPath}/attachments/from-insurance`, {
          method: "POST",
          as: t.as,
          json: { certificateId: t.cert.id, fileId: id },
        })
      ).status,
    ).toBe(404);
  });

  it("viewers list and download; adding, deleting and copying need an editor", async () => {
    const { id } = (await (await upload(t.path, t.as, "cert.pdf", "c")).json()) as { id: string };
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
        await api(`${appPath}/attachments/from-insurance`, {
          method: "POST",
          as: viewer.id,
          json: { certificateId: t.cert.id, fileId: id },
        })
      ).status,
    ).toBe(403);
  });

  it("another company sees 404 for the files, and cannot copy one onto its own pay app", async () => {
    const { id } = (await (await upload(t.path, t.as, "cert.pdf", "c")).json()) as { id: string };
    const other = await company();
    const crossed = t.path.replace(t.orgId, other.orgId);
    for (const [path, init] of [
      [`${crossed}/attachments`, {}],
      [`${crossed}/attachments/${id}`, {}],
      [`${crossed}/attachments/${id}`, { method: "DELETE" }],
      // Their own certificate id with our file id.
      [`${other.path}/attachments/${id}`, {}],
    ] as const) {
      expect((await api(path, { ...init, as: other.as })).status).toBe(404);
    }
    expect((await upload(crossed, other.as, "x.pdf", "x")).status).toBe(404);
    const theirApp = await draftPayApp(other.orgId, other.as);
    for (const certificateId of [t.cert.id, other.cert.id]) {
      const res = await api(`${theirApp}/attachments/from-insurance`, {
        method: "POST",
        as: other.as,
        json: { certificateId, fileId: id },
      });
      expect(res.status).toBe(404);
    }
    expect(await keysUnder(`orgs/${other.orgId}/`)).toEqual([]);
  });
});
