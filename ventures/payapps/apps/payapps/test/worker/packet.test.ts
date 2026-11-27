// The backup packet through the HTTP API in workerd with local D1 and R2: the application, an
// index and the attached PDFs and photos in one PDF; the default selection (no signed copy, no
// spreadsheet), a chosen selection and order, a damaged upload listed rather than fatal, roles and
// tenancy.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { PdfReader } from "@shared/pdf/reader";
import { describe, expect, it } from "vitest";
import { PdfDocument } from "../../src/worker/services/export/pdf";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

async function draftApp() {
  const { orgId, userId: as } = await setupTenant("owner");
  const project = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm St clinic",
      number: "2417",
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
  return { orgId, as, appPath: `${base}/pay-apps/${app.id}` };
}

const pdf = (pages: number) => {
  const doc = new PdfDocument({ title: "backup" });
  for (let i = 0; i < pages; i++) doc.addPage().text(40, 60, `Invoice page ${i + 1}`);
  return doc.toBytes();
};

/** A minimal JPEG header (SOF0 8-bit RGB) with EXIF orientation 6, as a phone writes. */
const jpeg = () => {
  const tiff = [
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    0,
    exif.length + 2,
    ...exif,
    0xff,
    0xc0,
    0,
    17,
    8,
    0,
    30,
    0,
    40,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ]);
};

async function upload(
  path: string,
  as: string,
  name: string,
  body: Uint8Array | string,
  category: string,
) {
  const form = new FormData();
  form.set("file", new File([typeof body === "string" ? body : body.slice()], name));
  form.set("category", category);
  const res = await api(`${path}/attachments`, { method: "POST", as, body: form });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const latin1 = (b: Uint8Array) => Array.from(b, (x) => String.fromCharCode(x)).join("");

describe("backup packet", () => {
  it("merges the application, an index and the backup into one PDF, numbered throughout", async () => {
    const t = await draftApp();
    await upload(t.appPath, t.as, "Stored materials inv 1042.pdf", pdf(3), "backup");
    await upload(t.appPath, t.as, "north wall.jpg", jpeg(), "photo");
    await upload(t.appPath, t.as, "Certified payroll.xlsx", "PK not really", "backup");
    await upload(t.appPath, t.as, "Signed by GC.pdf", pdf(1), "signed");
    await upload(t.appPath, t.as, "Scan.pdf", "%PDF-1.4 truncated", "other");

    const res = await api(`${t.appPath}/packet.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="2417-payapp-1-with-backup.pdf"',
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String(bytes.length)).toBe(res.headers.get("Content-Length"));
    const reader = await PdfReader.open(bytes);
    const total = reader.pages().length;
    // Backup PDF (3) and photo (1) go in; the signed copy is left out by default, the
    // spreadsheet and the damaged scan are listed on the index instead.
    expect(res.headers.get("X-Packet-Files")).toBe("2");
    expect(res.headers.get("X-Packet-Skipped")).toBe("2");
    const text = latin1(bytes);
    expect(text).toContain("(Backup for Application #1)");
    expect(text).toContain("(Stored materials inv 1042.pdf)");
    expect(text).toContain("(Certified payroll.xlsx \\(Backup\\))");
    expect(text).toContain("(Scan.pdf \\(Other\\))");
    expect(text).not.toContain("(Signed by GC.pdf)");
    expect(text).toContain(`(Application #1 - page ${total} of ${total})`);
    expect(text).toContain("(Invoice page 3)");
    // The application's own pages come first, then one index page, the 3-page PDF and the photo.
    const appPages = total - 1 - 3 - 1;
    expect(appPages).toBeGreaterThanOrEqual(1);
    expect(text).toContain(`(${appPages + 2}-${appPages + 4})`);
    expect(reader.pages()[total - 1]?.mediaBox).toEqual([0, 0, 612, 792]);
  });

  it("takes the files chosen, in that order, including a signed copy if asked", async () => {
    const t = await draftApp();
    const a = await upload(t.appPath, t.as, "a.pdf", pdf(1), "backup");
    const s = await upload(t.appPath, t.as, "signed.pdf", pdf(2), "signed");
    const res = await api(`${t.appPath}/packet.pdf?files=${s},${a}`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Packet-Files")).toBe("2");
    const text = latin1(new Uint8Array(await res.arrayBuffer()));
    expect(text.indexOf("(signed.pdf)")).toBeLessThan(text.indexOf("(a.pdf)"));
    // None chosen: the application and the index only.
    const none = await api(`${t.appPath}/packet.pdf?files=`, { as: t.as });
    expect(none.headers.get("X-Packet-Files")).toBe("0");
    await call(`${t.appPath}/packet.pdf?files=att_not_here`, { as: t.as, expect: 400 });
  });

  it("is readable by a viewer and invisible to another company", async () => {
    const t = await draftApp();
    const id = await upload(t.appPath, t.as, "a.pdf", pdf(1), "backup");
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await api(`${t.appPath}/packet.pdf`, { as: viewer.id })).status).toBe(200);
    const other = await setupTenant("owner");
    const foreign = t.appPath.replace(t.orgId, other.orgId);
    await call(`${foreign}/packet.pdf`, { as: other.userId, expect: 404 });
    // Another company's file id cannot be pulled into a packet of one's own.
    const mine = await draftApp();
    await call(`${mine.appPath}/packet.pdf?files=${id}`, { as: mine.as, expect: 400 });
  });

  it("merges a change order request with its backup, leaving out the signed copy", async () => {
    const t = await draftApp();
    const base = t.appPath.slice(0, t.appPath.indexOf("/pay-apps/"));
    const job = await call<ProjectDetailDto>(base, { as: t.as });
    const after = await call<ProjectDetailDto>(`${base}/change-orders`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: {
        number: "7",
        description: "Two EV chargers in the garage",
        items: [{ sovLineId: job.sovLines[0]?.id, amountCents: 900_000 }],
      },
    });
    const coPath = `${base}/change-orders/${after.changeOrders[0]?.id}`;
    await upload(coPath, t.as, "Supplier quote.pdf", pdf(2), "backup");
    await upload(coPath, t.as, "garage.jpg", jpeg(), "photo");
    await upload(coPath, t.as, "Signed CO.pdf", pdf(1), "signed");
    const res = await api(`${coPath}/packet.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="co-7-2417-with-backup.pdf"',
    );
    expect(res.headers.get("X-Packet-Files")).toBe("2");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = latin1(bytes);
    expect(text).toContain("(Backup for change order 7)");
    expect(text).toContain("(Supplier quote.pdf)");
    expect(text).not.toContain("(Signed CO.pdf)");
    const total = (await PdfReader.open(bytes)).pages().length;
    expect(text).toContain(`(Change order 7 - page ${total} of ${total})`);
    const other = await setupTenant("owner");
    await call(`${coPath.replace(t.orgId, other.orgId)}/packet.pdf`, {
      as: other.userId,
      expect: 404,
    });
  });
});
