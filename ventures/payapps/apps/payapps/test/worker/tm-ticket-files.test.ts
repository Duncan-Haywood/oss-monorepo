// Photos and files kept with a T&M ticket through the HTTP API on a local D1 and R2: upload, list,
// download headers, the file count on the log, the "PDF + photos" packet for one ticket and for every
// ticket on a change order (a paper-signed scan included), files staying open on signed and billed
// tickets, the shared storage limit, job history for the ticket (written up, changed with rates apart
// from quantities, signed, signature taken off, billed, deleted) and its files, roles, tenancy and
// cleanup when the ticket or the job is deleted.
import { env } from "cloudflare:workers";
import type { ProjectDto, TmTicketDto, TmTicketLogDto } from "@shared/api/types";
import { PdfReader } from "@shared/pdf/reader";
import { addDays } from "@shared/tm-tickets";
import { beforeEach, describe, expect, it } from "vitest";
import { PdfDocument } from "../../src/worker/services/export/pdf";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

interface Listed {
  items: { id: string; fileName: string; contentType: string; category: string }[];
  storage: { usedBytes: number; limitBytes: number };
  enabled: boolean;
}

const day = (n: number) => addDays(new Date().toISOString().slice(0, 10), -n);

const ticketBody = (over: Record<string, unknown> = {}) => ({
  workDate: day(2),
  description: "Relocate two receptacles at the nurse station",
  location: "Level 2",
  directedBy: "Dana Ortiz",
  labor: [{ trade: "Journeyman electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 }],
  material: [{ description: "3/4 in EMT", quantity: 40, unit: "ft", unitCostCents: 87 }],
  equipment: [],
  laborMarkupBps: 1500,
  materialMarkupBps: 1000,
  ...over,
});

async function jobWithTicket() {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Mesa Clinic TI", gcName: "Copper State Builders", originalContractSumCents: 1 },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const tm = `${base}/tm-tickets`;
  const ticket = await call<TmTicketDto>(tm, {
    method: "POST",
    as,
    expect: 201,
    json: ticketBody(),
  });
  return {
    orgId,
    as,
    base,
    tm,
    projectId: created.id,
    ticketId: ticket.id,
    path: `${tm}/${ticket.id}`,
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

const sign = (path: string, as: string) =>
  call<TmTicketDto>(`${path}/signature`, {
    method: "PUT",
    as,
    json: { signedName: "Dana Ortiz", signedTitle: "Superintendent", signedOn: day(1) },
  });

const files = (env as unknown as { FILES: R2Bucket }).FILES;
const objectCount = async (prefix: string) => (await files.list({ prefix })).objects.length;
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const history = async (t: { base: string; as: string }) =>
  (await api(`${t.base}/history.csv`, { as: t.as })).text();

describe("T&M ticket files", () => {
  let t: Awaited<ReturnType<typeof jobWithTicket>>;
  beforeEach(async () => {
    t = await jobWithTicket();
  });

  it("uploads a photo by default, lists it, counts it on the log and downloads it as an attachment", async () => {
    const res = await upload(t.path, t.as, "before.jpg", "\xff\xd8\xff photo");
    expect(res.status).toBe(201);
    const added = (await res.json()) as { id: string; contentType: string; category: string };
    expect(added).toMatchObject({ contentType: "image/jpeg", category: "photo" });

    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.enabled).toBe(true);
    expect(list.items).toEqual([expect.objectContaining({ fileName: "before.jpg" })]);
    const log = await call<TmTicketLogDto>(t.tm, { as: t.as });
    expect(log.items[0]?.fileCount).toBe(1);

    const file = await api(`${t.path}/attachments/${added.id}`, { as: t.as });
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Type")).toBe("image/jpeg");
    expect(file.headers.get("Content-Disposition")).toMatch(/^attachment; filename="before.jpg"/);
    expect(file.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const keys = (await files.list({ prefix: `orgs/${t.orgId}/` })).objects.map((o) => o.key);
    expect(keys).toEqual([
      `orgs/${t.orgId}/projects/${t.projectId}/tm-tickets/${t.ticketId}/${added.id}`,
    ]);
  });

  it("refuses page-like file types and unknown categories", async () => {
    expect((await upload(t.path, t.as, "x.html", "<script>")).status).toBe(400);
    expect((await upload(t.path, t.as, "x.svg", "<svg/>")).status).toBe(400);
    expect((await upload(t.path, t.as, "x.pdf", "x", "secret")).status).toBe(400);
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
  });

  it("puts the priced ticket, an index and every file in one PDF, the paper-signed scan included", async () => {
    await upload(t.path, t.as, "emt receipt.pdf", pdf(1, "Receipt"), "backup");
    await upload(t.path, t.as, "signed paper ticket.pdf", pdf(1, "Signed"), "signed");
    const res = await api(`${t.path}/packet.pdf`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="tm-ticket-1-mesa-clinic-ti-with-files.pdf"',
    );
    expect(res.headers.get("X-Packet-Files")).toBe("2");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = latin1(bytes);
    expect(text).toContain("(Photos and files for T&M 1)");
    expect(text).toContain("(emt receipt.pdf)");
    expect(text).toContain("(signed paper ticket.pdf)");
    expect((await PdfReader.open(bytes)).pages().length).toBeGreaterThanOrEqual(4);
  });

  it("keeps files open on signed and billed tickets, and puts every ticket's files behind the change order", async () => {
    const second = await call<TmTicketDto>(t.tm, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: ticketBody({ description: "Add a junction box above the corridor ceiling" }),
    });
    const secondPath = `${t.tm}/${second.id}`;
    await sign(t.path, t.as);
    await sign(secondPath, t.as);
    // Signed: a photo found later is still evidence.
    expect((await upload(t.path, t.as, "after.pdf", pdf(1, "After"))).status).toBe(201);
    const co = await call<{ changeOrderId: string; number: string }>(`${t.tm}/change-order`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: {
        ticketIds: [t.ticketId, second.id],
        number: "CO-4",
        target: { newLine: { itemNumber: "CO 4" } },
      },
    });
    // Billed: still open.
    expect((await upload(secondPath, t.as, "box.pdf", pdf(1, "Box"))).status).toBe(201);

    const res = await api(`${t.tm}/change-order/${co.changeOrderId}/backup-with-files.pdf`, {
      as: t.as,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="tm-tickets-co-co-4-mesa-clinic-ti-with-files.pdf"',
    );
    expect(res.headers.get("X-Packet-Files")).toBe("2");
    const text = latin1(new Uint8Array(await res.arrayBuffer()));
    expect(text).toContain("(Photos and files for T&M tickets on change order CO-4)");
    // Each file is named with the ticket it belongs to.
    expect(text).toContain("T&M 1: Photo of the extra work");
    expect(text).toContain("T&M 2: Photo of the extra work");

    const csv = await history(t);
    expect(csv).toContain("T&M 1 billed on change order CO-4 for $");
    expect(csv).toContain("T&M 2 billed on change order CO-4 for $");
  });

  it("counts T&M ticket files against the company's one storage limit", async () => {
    await upload(t.path, t.as, "a.pdf", "12345");
    const list = await call<Listed>(`${t.path}/attachments`, { as: t.as });
    expect(list.storage.usedBytes).toBe(5);
  });

  it("records the ticket, its signature and each file in the job history", async () => {
    const d = day(2);
    const { id } = (await (await upload(t.path, t.as, "before.jpg", "x")).json()) as { id: string };
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    await call(t.path, {
      method: "PATCH",
      as: t.as,
      json: {
        workDate: day(3),
        labor: [{ trade: "Journeyman electrician", workers: 2, hoursEach: 4, rateCents: 9850 }],
      },
    });
    // Sending back an unchanged value is not a change.
    await call(t.path, { method: "PATCH", as: t.as, json: { location: "Level 2" } });
    await sign(t.path, t.as);
    // After the signature only rates may change, and the history says so.
    await call(t.path, {
      method: "PATCH",
      as: t.as,
      json: {
        labor: [{ trade: "Journeyman electrician", workers: 2, hoursEach: 4, rateCents: 10200 }],
      },
    });
    await call(`${t.path}/signature`, { method: "DELETE", as: t.as });

    const csv = await history(t);
    expect(csv).toContain(`T&M 1 written up for work on ${d}: Relocate two receptacles`);
    expect(csv).toContain("T&M 1: file attached, before.jpg");
    expect(csv).toContain("T&M 1: file removed, before.jpg");
    expect(csv).toContain(
      `T&M 1 changed: work date changed from ${d} to ${day(3)}, labor (trades, workers or hours)`,
    );
    expect(csv).toContain("T&M 1 changed: labor rates");
    expect(csv.match(/T&M 1 changed:/g)?.length).toBe(2);
    expect(csv).toContain(
      `T&M 1 signed for the GC by Dana Ortiz (Superintendent) on ${day(1)}, on paper`,
    );
    expect(csv).toContain(
      `T&M 1: signature by Dana Ortiz (Superintendent) dated ${day(1)} taken off`,
    );
    // The CSV's "About" column names the ticket.
    expect(csv).toMatch(/,T&M 1,T&M 1 written up/);

    await call(t.path, { method: "DELETE", as: t.as });
    expect(await history(t)).toContain(`T&M 1 for work on ${day(3)} deleted`);
  });

  it("deletes a file and its object, and clears every file when the ticket or the job goes", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    await call(`${t.path}/attachments/${id}`, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);
    await call(`${t.path}/attachments/${id}`, { as: t.as, expect: 404 });

    await upload(t.path, t.as, "b.pdf", "y");
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(1);
    await call(t.path, { method: "DELETE", as: t.as });
    expect(await objectCount(`orgs/${t.orgId}/`)).toBe(0);

    const again = await jobWithTicket();
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

  it("never shows one company's T&M ticket files to another", async () => {
    const { id } = (await (await upload(t.path, t.as, "a.pdf", "x")).json()) as { id: string };
    const other = await jobWithTicket();
    const foreign = t.path.replace(t.orgId, other.orgId);
    await call(`${foreign}/attachments`, { as: other.as, expect: 404 });
    await call(`${foreign}/attachments/${id}`, { as: other.as, expect: 404 });
    await call(`${foreign}/packet.pdf`, { as: other.as, expect: 404 });
    expect((await upload(foreign, other.as, "b.pdf", "y")).status).toBe(404);
    await call(`${t.path}/attachments`, { as: other.as, expect: 404 });
    await call(`${other.path}/attachments/${id}`, { as: other.as, expect: 404 });
    // Another company's ticket id under one's own job is not found either.
    await call(`${other.tm}/${t.ticketId}/attachments`, { as: other.as, expect: 404 });
    expect(await objectCount(`orgs/${other.orgId}/`)).toBe(0);
  });
});
