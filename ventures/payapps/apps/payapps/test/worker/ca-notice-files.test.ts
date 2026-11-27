// California notices given, part 3, through the HTTP API on a local D1 and R2: the first-furnished
// date and each notice record land in the job history (and its CSV); each record keeps its own files
// (the § 8118(b) mailing receipt or proof of delivery, the signed proof), counted on the log, against
// the shared storage limit and in the history; deleting the record deletes its objects; the plan and
// role gates; tenant isolation.
import { env } from "cloudflare:workers";
import type {
  CaNoticeSendDto,
  JobEventDto,
  NoticeOverviewDto,
  PayAppDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

interface Listed {
  items: { id: string; fileName: string; category: string; sizeBytes: number }[];
  storage: { usedBytes: number; limitBytes: number };
}

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const keysUnder = async (prefix: string) =>
  (await files.list({ prefix })).objects.map((o) => o.key);

const SEND = {
  recipient: "owner",
  recipientNameAddress: "Valley Medical Partners LLC\n2100 Tulare St, Fresno CA 93721",
  method: "certified-mail",
  givenOn: "2026-11-10",
  place: "Fresno, California",
  tracking: "9407 1111 2222",
};

async function caJob() {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Valley Clinic TI",
      gcName: "Sierra Builders Inc.",
      ownerName: "Valley Medical Partners LLC",
      originalContractSumCents: 18_000_000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const send = await call<CaNoticeSendDto>(`${base}/notices/ca/sends`, {
    method: "POST",
    as,
    expect: 201,
    json: SEND,
  });
  return { orgId, as, base, projectId: p.id, send, path: `${base}/notices/ca/sends/${send.id}` };
}

function upload(path: string, as: string, name: string, body: string, category?: string) {
  const form = new FormData();
  form.set("file", new File([body], name));
  if (category) form.set("category", category);
  return api(`${path}/attachments`, { method: "POST", as, body: form });
}

const history = (base: string, as: string) =>
  call<{ items: JobEventDto[] }>(`${base}/history`, { as }).then((r) => r.items);
const overview = (base: string, as: string) =>
  call<NoticeOverviewDto>(`${base}/notices?state=CA`, { as });

describe("California notices given: history and files", () => {
  let t: Awaited<ReturnType<typeof caJob>>;
  beforeEach(async () => {
    t = await caJob();
  });

  it("records the first-furnished date and the notice in the job history and its CSV", async () => {
    const put = (firstFurnishedOn: string | null) =>
      call(`${t.base}/notices/ca/first-furnished`, {
        method: "PUT",
        as: t.as,
        json: { firstFurnishedOn },
      });
    await put("2026-11-01");
    await put("2026-11-01"); // unchanged: no second row
    await put(null);
    const texts = (await history(t.base, t.as)).map((e) => e.text);
    expect(texts.slice(0, 3)).toEqual([
      "Day first furnished work (California § 8204(a)) cleared",
      "Day first furnished work (California § 8204(a)) set to 2026-11-01",
      "California preliminary notice to the owner recorded as given by certified mail on 2026-11-10, tracking or receipt number 9407 1111 2222",
    ]);
    const csv = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    expect(csv).toContain(
      'Preliminary notice,"California preliminary notice to the owner recorded',
    );
  });

  it("keeps a receipt with the record: listed, counted, downloaded, in the history", async () => {
    const res = await upload(t.path, t.as, "PS Form 3800 receipt.jpg", "jpeg-bytes", "backup");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string };
    expect(added.contentType).toBe("image/jpeg");
    await upload(t.path, t.as, "Green card.pdf", "%PDF-1.4", "photo");

    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.items.map((f) => [f.fileName, f.category])).toEqual(
      expect.arrayContaining([
        ["PS Form 3800 receipt.jpg", "backup"],
        ["Green card.pdf", "photo"],
      ]),
    );
    const log = (await overview(t.base, t.as)).ca;
    expect(log?.sends[0]?.fileCount).toBe(2);

    const file = await api(`${t.path}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Disposition")).toMatch(/^attachment; filename="PS Form 3800/);
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(
      await keysUnder(`orgs/${t.orgId}/projects/${t.projectId}/notices/${t.send.id}/`),
    ).toHaveLength(2);

    await call(`${t.path}/attachments/${added.id}`, { method: "DELETE", as: t.as });
    const texts = (await history(t.base, t.as)).map((e) => e.text);
    expect(texts.slice(0, 3)).toEqual([
      "California preliminary notice to the owner: file removed, PS Form 3800 receipt.jpg",
      "California preliminary notice to the owner: file attached, Green card.pdf",
      "California preliminary notice to the owner: file attached, PS Form 3800 receipt.jpg",
    ]);
    expect((await overview(t.base, t.as)).ca?.sends[0]?.fileCount).toBe(1);
  });

  it("refuses page-like types, and counts notice files in the one storage limit", async () => {
    expect((await upload(t.path, t.as, "receipt.html", "<script>")).status).toBe(400);
    expect((await upload(t.path, t.as, "receipt.pdf", "x", "secret")).status).toBe(400);
    await upload(t.path, t.as, "receipt.pdf", "12345");
    await call(`${t.base}/sov-lines/bulk`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 18_000_000 }] },
    });
    const app = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    const appList = await call<Listed>(`${t.base}/pay-apps/${app.id}/attachments`, { as: t.as });
    expect(appList.storage.usedBytes).toBe(5);
  });

  it("deleting the record deletes its files and says so in the history", async () => {
    await upload(t.path, t.as, "receipt.pdf", "r");
    await upload(t.path, t.as, "signed proof.pdf", "s", "signed");
    await call(t.path, { method: "DELETE", as: t.as });
    expect(await keysUnder(`orgs/${t.orgId}/`)).toEqual([]);
    expect((await overview(t.base, t.as)).ca?.sends).toEqual([]);
    expect((await history(t.base, t.as))[0]?.text).toBe(
      "California preliminary notice to the owner given by certified mail on 2026-11-10, tracking or receipt number 9407 1111 2222: record deleted",
    );
    expect((await api(`${t.path}/attachments`, { as: t.as })).status).toBe(404);
  });

  it("viewers list and download; adding needs an editor and the Crew plan", async () => {
    const { id } = (await (await upload(t.path, t.as, "receipt.pdf", "r")).json()) as {
      id: string;
    };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await call<Listed>(`${t.path}/attachments`, { as: viewer.id })).items).toHaveLength(1);
    expect((await api(`${t.path}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.path, viewer.id, "x.pdf", "x")).status).toBe(403);
    expect(
      (await api(`${t.path}/attachments/${id}`, { method: "DELETE", as: viewer.id })).status,
    ).toBe(403);

    await grantPlan(t.orgId, "free", "active");
    expect((await upload(t.path, t.as, "late.pdf", "x")).status).toBe(402);
    // A downgraded company still reads the proof it kept.
    expect((await api(`${t.path}/attachments/${id}`, { as: t.as })).status).toBe(200);
  });

  it("another company sees 404 for the record's files, by its own job too", async () => {
    const { id } = (await (await upload(t.path, t.as, "receipt.pdf", "r")).json()) as {
      id: string;
    };
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const crossed = t.path.replace(t.orgId, other.orgId);
    for (const [path, init] of [
      [`${crossed}/attachments`, {}],
      [`${crossed}/attachments/${id}`, {}],
      [`${crossed}/attachments/${id}`, { method: "DELETE" }],
    ] as const) {
      expect((await api(path, { ...init, as: other.userId })).status).toBe(404);
    }
    expect((await upload(crossed, other.userId, "x.pdf", "x")).status).toBe(404);
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "X", gcName: "Y", originalContractSumCents: 100 },
    });
    const viaTheirs = `/api/orgs/${other.orgId}/projects/${theirs.id}/notices/ca/sends/${t.send.id}`;
    expect((await api(`${viaTheirs}/attachments/${id}`, { as: other.userId })).status).toBe(404);
    expect((await upload(viaTheirs, other.userId, "x.pdf", "x")).status).toBe(404);
    expect(await keysUnder(`orgs/${other.orgId}/`)).toEqual([]);
  });
});
