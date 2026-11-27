// Photos and files kept with a daily report through the HTTP API on a local D1 and R2: upload, list,
// download headers, the file count on the log, the one-PDF "PDF + photos" packet (without a signed
// copy of the report), the shared storage limit, job history for the report and its files, roles,
// tenancy and cleanup when the report or the job is deleted.
import { env } from "cloudflare:workers";
import type { DailyReportDto, DailyReportLogDto, ProjectDto } from "@shared/api/types";
import { addDays } from "@shared/daily-reports";
import { PdfReader } from "@shared/pdf/reader";
import { beforeEach, describe, expect, it } from "vitest";
import { PdfDocument } from "../../src/worker/services/export/pdf";
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

const yesterday = () => addDays(new Date().toISOString().slice(0, 10), -1);

async function jobWithReport() {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Mesa Clinic TI", gcName: "Copper State Builders", originalContractSumCents: 1 },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const report = await call<DailyReportDto>(`${base}/daily-reports`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      reportDate: yesterday(),
      weather: "Rain until 10 am",
      crew: [{ company: null, trade: "Electricians", workers: 4, hoursEach: 8 }],
      workPerformed: "Pulled feeders to L1.",
    },
  });
  return {
    orgId,
    as,
    base,
    projectId: created.id,
    reportId: report.id,
    path: `${base}/daily-reports/${report.id}`,
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

describe("daily report files", () => {
  let t: Awaited<ReturnType<typeof jobWithReport>>;
  beforeEach(async () => {
    t = await jobWithReport();
  });

  it("uploads a photo by default, lists it, counts it on the log and downloads it as an attachment", async () => {
    const res = await upload(t.path, t.as, "level 2 boxes.jpg", "\xff\xd8\xff photo");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string; category: string };
    expect(added).toMatchObject({ contentType: "image/jpeg", category: "photo" });

    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toEqual([expect.objectContaining({ fileName: "level 2 boxes.jpg" })]);
    const log = await call<DailyReportLogDto>(`${t.base}/daily-reports`, { as: t.as });
    expect(log.items[0]?.fileCount).toBe(1);

    const file = await api(`${t.path}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("image/jpeg");
    expect(file.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="level 2 boxes.jpg"/,
    );
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toEqual([
      `orgs/${t.orgId}/projects/${t.projectId}/daily-reports/${t.reportId}/${added.id}`,
    ]);
  });

  it("refuses page-like file types and unknown categories", async () => {
    expect((await upload(t.path, t.as, "x.html", "<script>")).status).toBe(400);
    expect((await upload(t.path, t.as, "x.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.path, t.as, "x.pdf", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("puts the report, an index and its files in one PDF, without a signed copy", async () => {
    await upload(t.path, t.as, "delivery ticket 4471.pdf", pdf(2, "Ticket"), "backup");
    await upload(t.path, t.as, "signed report.pdf", pdf(1, "Signed"), "signed");
    const res = await api(`${t.path}/packet.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="daily-report-${yesterday()}-mesa-clinic-ti-with-files.pdf"`,
    );
    expect(res.headers.get("X-Packet-Files")).toBe("1");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = latin1(bytes);
    expect(text).toContain(`(Photos and files for the ${yesterday()} daily report)`);
    expect(text).toContain("(delivery ticket 4471.pdf)");
    expect(text).not.toContain("(signed report.pdf)");
    const total = (await PdfReader.open(bytes)).pages().length;
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it("counts daily report files against the company's one storage limit", async () => {
    await upload(t.path, t.as, "a.pdf", "12345");
    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.storage.usedBytes).toBe(5);
  });

  it("records the report and each file added and removed in the job history", async () => {
    const { id } = (await (await upload(t.path, t.as, "rain.jpg", "x")).json()) as { id: string };
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    await call(t.path, {
      method: "PATCH",
      as: t.as,
      json: { delayHours: 2, delays: "Rain until 10 am" },
    });
    // Sending back an unchanged value is not a change.
    await call(t.path, { method: "PATCH", as: t.as, json: { weather: "Rain until 10 am" } });
    const csv = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    const d = yesterday();
    expect(csv).toContain(`Daily report for ${d} entered (4 workers, 32 man-hours)`);
    expect(csv).toContain(`Daily report for ${d}: file attached, rain.jpg`);
    expect(csv).toContain(`Daily report for ${d}: file removed, rain.jpg`);
    expect(csv).toContain(`Daily report for ${d} changed: hours lost, delays`);
    expect(csv.match(/changed:/g)?.length).toBe(1);
    expect(csv).toContain(`Daily report ${d}`);
    await call(t.path, { method: "DELETE", as: t.as });
    const after = await (await api(`${t.base}/history.csv`, { as: t.as })).text();
    expect(after).toContain(`Daily report for ${d} deleted`);
  });

  it("deletes a file and its object, and clears every file when the report or the job goes", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.path}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.path, t.as, "b.pdf", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.path, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithReport();
    await upload(again.path, again.as, "c.pdf", "z");
    await call(again.base, { method: "DELETE", as: again.as });
    expect(await objectCount(`orgs/${again.orgId}/`)).toBe(0);
  });

  it("lets a viewer read and download but not upload or delete", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.path}/attachments`, { as: viewer.id });
    expect((await api(`${t.path}/attachments/${id}`, { as: viewer.id })).status).toBe(200);
    expect((await api(`${t.path}/packet.pdf`, { as: viewer.id })).status).toBe(200);
    expect((await upload(t.path, viewer.id, "b.pdf", "y")).status).toBe(403);
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: viewer.id, expect: 403 });
  });

  it("never shows one company's daily report files to another", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await jobWithReport();
    const foreign = t.path.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    await call(`${foreign}/packet.pdf`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.pdf", "y")).status).toBe(404);
    await call(`${t.path}/attachments`, { as: other.as, expect: 404 });
    await call(`${other.path}/attachments/${id}`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
