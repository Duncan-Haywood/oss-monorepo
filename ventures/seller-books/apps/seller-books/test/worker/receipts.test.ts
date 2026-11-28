// Receipts on expenses: upload, list, download byte for byte, delete, the checks on what is kept, the
// limits, roles, other shops, cascade on deleting the expense, the shop export and the year-end ZIP.
import { env } from "cloudflare:workers";
import { MAX_RECEIPTS_PER_EXPENSE } from "@shared/receipts";
import { member } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, createTestUser, json, setupTenant, testDb } from "./helpers";

const enc = new TextEncoder();
/** A tiny file whose first bytes are a real PDF header. */
const pdf = (text = "receipt") => enc.encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);
/** JPEG magic, then filler to a size. */
const jpeg = (size: number) => {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) b[i] = i % 251;
  return b;
};

async function addExpense(orgId: string, userId: string, date = "2026-03-04", vendor = "Uline") {
  const res = await api(`/api/orgs/${orgId}/expenses`, {
    method: "POST",
    as: userId,
    json: { date, category: "supplies", amountCents: 4217, vendor },
  });
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).id;
}

const upload = (
  orgId: string,
  expenseId: string,
  name: string,
  body: Uint8Array<ArrayBuffer>,
  as: string,
) =>
  api(`/api/orgs/${orgId}/expenses/${expenseId}/receipts?name=${encodeURIComponent(name)}`, {
    method: "POST",
    as,
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });

describe("expense receipts", () => {
  it("keeps a receipt and gives back the same bytes, as a download", async () => {
    const { userId, orgId } = await setupTenant();
    const exp = await addExpense(orgId, userId);
    // Over one D1 chunk (1 MiB), so the file is stored in two rows and joined on the way out.
    const photo = jpeg(1024 * 1024 + 4321);
    const res = await upload(orgId, exp, "IMG_0042.JPG", photo, userId);
    expect(res.status).toBe(201);
    const row = await json<{ id: string; contentType: string; size: number; fileName: string }>(
      res,
    );
    expect(row).toMatchObject({
      contentType: "image/jpeg",
      size: photo.byteLength,
      fileName: "IMG_0042.JPG",
    });
    const chunks = await env.DB.prepare(
      "SELECT count(*) AS n FROM expense_receipt_chunk WHERE receipt_id = ?",
    )
      .bind(row.id)
      .first<{ n: number }>();
    expect(chunks?.n).toBe(2);

    const list = await json<{ items: { id: string }[] }>(
      await api(`/api/orgs/${orgId}/expenses/${exp}/receipts`, { as: userId }),
    );
    expect(list.items.map((r) => r.id)).toEqual([row.id]);
    const expenses = await json<{ items: { id: string; receiptCount: number }[] }>(
      await api(`/api/orgs/${orgId}/expenses`, { as: userId }),
    );
    expect(expenses.items.find((e) => e.id === exp)?.receiptCount).toBe(1);

    const dl = await api(`/api/orgs/${orgId}/expenses/${exp}/receipts/${row.id}`, { as: userId });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Type")).toBe("image/jpeg");
    expect(dl.headers.get("Content-Disposition")).toMatch(/^attachment; filename="IMG_0042\.JPG"/);
    expect(dl.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(dl.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(photo);

    const usage = await json<{ usedBytes: number; limitBytes: number }>(
      await api(`/api/orgs/${orgId}/expenses/receipts/usage`, { as: userId }),
    );
    expect(usage.usedBytes).toBe(photo.byteLength);

    const del = await api(`/api/orgs/${orgId}/expenses/${exp}/receipts/${row.id}`, {
      method: "DELETE",
      as: userId,
    });
    expect(del.status).toBe(200);
    const left = await env.DB.prepare(
      "SELECT count(*) AS n FROM expense_receipt_chunk WHERE receipt_id = ?",
    )
      .bind(row.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
    expect(
      (await api(`/api/orgs/${orgId}/expenses/${exp}/receipts/${row.id}`, { as: userId })).status,
    ).toBe(404);
  });

  it("refuses a file that is not what its name says, an unknown type and an empty file", async () => {
    const { userId, orgId } = await setupTenant();
    const exp = await addExpense(orgId, userId);
    const page = enc.encode("<html><script>alert(1)</script></html>");
    const fake = await upload(orgId, exp, "receipt.pdf", page, userId);
    expect(fake.status).toBe(400);
    expect((await json<{ error: { message: string } }>(fake)).error.message).toContain(
      "is not one",
    );
    const html = await upload(orgId, exp, "receipt.html", page, userId);
    expect(html.status).toBe(400);
    const swapped = await upload(orgId, exp, "receipt.png", pdf(), userId);
    expect((await json<{ error: { message: string } }>(swapped)).error.message).toContain(
      "is a PDF file",
    );
    expect((await upload(orgId, exp, "empty.pdf", new Uint8Array(0), userId)).status).toBe(400);
    const none = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${orgId}/expenses/${exp}/receipts`, { as: userId }),
    );
    expect(none.items).toEqual([]);
  });

  it("strips folders from the name and caps receipts per expense", async () => {
    const { userId, orgId } = await setupTenant();
    const exp = await addExpense(orgId, userId);
    const first = await json<{ fileName: string }>(
      await upload(orgId, exp, "../../etc/scan.pdf", pdf(), userId),
    );
    expect(first.fileName).toBe("scan.pdf");
    for (let i = 1; i < MAX_RECEIPTS_PER_EXPENSE; i++) {
      expect((await upload(orgId, exp, `page-${i}.pdf`, pdf(String(i)), userId)).status).toBe(201);
    }
    const over = await upload(orgId, exp, "one-more.pdf", pdf("x"), userId);
    expect(over.status).toBe(400);
    expect((await json<{ error: { message: string } }>(over)).error.message).toContain(
      `up to ${MAX_RECEIPTS_PER_EXPENSE} receipts`,
    );
  });

  it("is closed to other shops and read-only for a viewer", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const exp = await addExpense(a.orgId, a.userId);
    const row = await json<{ id: string }>(await upload(a.orgId, exp, "r.pdf", pdf(), a.userId));
    // B's member reaching A's expense through A's org: not a member, answered as not found.
    expect(
      (await api(`/api/orgs/${a.orgId}/expenses/${exp}/receipts/${row.id}`, { as: b.userId }))
        .status,
    ).toBe(404);
    // Through B's own org with A's ids: not found.
    expect(
      (await api(`/api/orgs/${b.orgId}/expenses/${exp}/receipts/${row.id}`, { as: b.userId }))
        .status,
    ).toBe(404);
    expect((await upload(b.orgId, exp, "r.pdf", pdf(), b.userId)).status).toBe(404);
    expect(
      (
        await api(`/api/orgs/${b.orgId}/expenses/${exp}/receipts/${row.id}`, {
          method: "DELETE",
          as: b.userId,
        })
      ).status,
    ).toBe(404);

    const viewer = await createTestUser();
    await testDb()
      .insert(member)
      .values({ id: newId("mem"), organizationId: a.orgId, userId: viewer.id, role: "viewer" });
    expect(
      (await api(`/api/orgs/${a.orgId}/expenses/${exp}/receipts/${row.id}`, { as: viewer.id }))
        .status,
    ).toBe(200);
    expect((await upload(a.orgId, exp, "v.pdf", pdf(), viewer.id)).status).toBe(403);
    expect(
      (
        await api(`/api/orgs/${a.orgId}/expenses/${exp}/receipts/${row.id}`, {
          method: "DELETE",
          as: viewer.id,
        })
      ).status,
    ).toBe(403);
  });

  it("goes with its expense, is listed in the shop export and lands in the year-end ZIP", async () => {
    const { userId, orgId } = await setupTenant();
    const kept = await addExpense(orgId, userId, "2026-03-04", "Uline");
    const gone = await addExpense(orgId, userId, "2026-04-01", "Staples");
    const nextYear = await addExpense(orgId, userId, "2027-01-02", "Next year");
    const body = pdf("uline");
    const r1 = await json<{ id: string }>(await upload(orgId, kept, "uline.pdf", body, userId));
    const r2 = await json<{ id: string }>(await upload(orgId, gone, "staples.pdf", pdf(), userId));
    await upload(orgId, nextYear, "later.pdf", pdf(), userId);

    expect(
      (await api(`/api/orgs/${orgId}/expenses/${gone}`, { method: "DELETE", as: userId })).status,
    ).toBe(200);
    const orphan = await env.DB.prepare(
      "SELECT (SELECT count(*) FROM expense_receipt WHERE id = ?1) + (SELECT count(*) FROM expense_receipt_chunk WHERE receipt_id = ?1) AS n",
    )
      .bind(r2.id)
      .first<{ n: number }>();
    expect(orphan?.n).toBe(0);

    const exported = await json<{
      counts: Record<string, number>;
      records: Record<string, Record<string, unknown>[]>;
    }>(await api(`/api/orgs/${orgId}/export`, { as: userId }));
    expect(exported.counts.expenseReceipts).toBe(2);
    expect(exported.records.expenseReceipts?.[0]).not.toHaveProperty("bytes");

    const res = await api(`/api/orgs/${orgId}/reports/year-end.zip?year=2026`, { as: userId });
    expect(res.status).toBe(200);
    const files = unzipStoredBytes(new Uint8Array(await res.arrayBuffer()));
    const name = `receipts/2026-03-04 Uline 42.17 ${r1.id}.pdf`;
    expect([...files.keys()].filter((k) => k.startsWith("receipts/"))).toEqual([name]);
    expect(files.get(name)).toEqual(body);
    const readme = new TextDecoder().decode(files.get("README.txt"));
    expect(readme).toContain("1 file(s) on 1 of the 1 expense(s)");
  });

  it("says so in the year-end README when no receipts are attached", async () => {
    const { userId, orgId } = await setupTenant();
    await addExpense(orgId, userId);
    const res = await api(`/api/orgs/${orgId}/reports/year-end.zip?year=2026`, { as: userId });
    const files = unzipStoredBytes(new Uint8Array(await res.arrayBuffer()));
    expect([...files.keys()].some((k) => k.startsWith("receipts/"))).toBe(false);
    expect(new TextDecoder().decode(files.get("README.txt"))).toContain(
      "no receipt files are attached",
    );
  });
});

/** Reads a stored-only ZIP (the app writes no compression) through its central directory, as bytes. */
function unzipStoredBytes(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.set(name, buf.slice(start, start + size));
    p += 46 + nameLen;
  }
  return out;
}
