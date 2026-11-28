// Purchase receipts (purchase-receipts): receipts on a lot or an item, byte for byte; a lot's receipt
// covering its items in the year's proof; the shared storage allowance; roles and other shops; cascade on
// deleting the lot or item; the shop export and the year-end ZIP's purchase-receipts/ folder.
import { env } from "cloudflare:workers";
import { MAX_RECEIPTS_PER_PURCHASE } from "@shared/receipts";
import { member } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, createTestUser, json, setupTenant, testDb } from "./helpers";

const enc = new TextEncoder();
const pdf = (text = "receipt") => enc.encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const jpeg = (size: number) => {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) b[i] = i % 251;
  return b;
};

async function addLot(orgId: string, as: string, acquiredDate = "2026-03-04") {
  const res = await api(`/api/orgs/${orgId}/inventory/lots`, {
    method: "POST",
    as,
    json: {
      name: "Estate sale haul",
      acquiredDate,
      vendor: "Smith estate sale",
      totalCostCents: 3000,
      items: [{ title: "Pyrex bowl" }, { title: "Wool coat" }, { title: "Lamp" }],
    },
  });
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).id;
}

async function addItem(
  orgId: string,
  as: string,
  title: string,
  costCents: number,
  acquiredDate = "2026-05-06",
) {
  const res = await api(`/api/orgs/${orgId}/inventory/items`, {
    method: "POST",
    as,
    json: { title, costCents, acquiredDate, source: "Goodwill" },
  });
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).id;
}

const upload = (
  orgId: string,
  path: string,
  name: string,
  body: Uint8Array<ArrayBuffer>,
  as: string,
) =>
  api(`/api/orgs/${orgId}/inventory/${path}/receipts?name=${encodeURIComponent(name)}`, {
    method: "POST",
    as,
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });

interface Proof {
  items: number;
  covered: number;
  coveredCents: number;
  zeroCost: number;
  missing: number;
  missingCents: number;
  missingItems: { title: string; costCents: number }[];
}
const proof = async (orgId: string, as: string, year = 2026) =>
  json<Proof>(await api(`/api/orgs/${orgId}/inventory/receipts/proof?year=${year}`, { as }));

describe("purchase receipts", () => {
  it("keeps a lot's receipt byte for byte, and it covers every item in the lot", async () => {
    const { userId, orgId } = await setupTenant();
    const lot = await addLot(orgId, userId);
    const loose = await addItem(orgId, userId, "Denim jacket", 800);
    await addItem(orgId, userId, "Boots", 1500);

    let p = await proof(orgId, userId);
    expect(p).toMatchObject({ items: 5, covered: 0, missing: 5, missingCents: 5300 });
    expect(p.missingItems[0]).toMatchObject({ title: "Boots", costCents: 1500 });

    const photo = jpeg(1024 * 1024 + 99); // two D1 chunks
    const res = await upload(orgId, `lots/${lot}`, "haul.jpg", photo, userId);
    expect(res.status).toBe(201);
    const row = await json<{ id: string; lotId: string; itemId: string | null }>(res);
    expect(row).toMatchObject({ lotId: lot, itemId: null });
    expect(row.id.startsWith("prc_")).toBe(true);

    const dl = await api(`/api/orgs/${orgId}/inventory/lots/${lot}/receipts/${row.id}`, {
      as: userId,
    });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Disposition")).toMatch(/^attachment; filename="haul\.jpg"/);
    expect(dl.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(photo);

    const lots = await json<{ items: { id: string; receiptCount: number }[] }>(
      await api(`/api/orgs/${orgId}/inventory/lots`, { as: userId }),
    );
    expect(lots.items.find((l) => l.id === lot)?.receiptCount).toBe(1);
    const items = await json<{
      items: { id: string; lotId: string | null; receiptCount: number; lotReceiptCount: number }[];
    }>(await api(`/api/orgs/${orgId}/inventory/items`, { as: userId }));
    expect(items.items.filter((i) => i.lotId === lot).every((i) => i.lotReceiptCount === 1)).toBe(
      true,
    );

    expect((await upload(orgId, `items/${loose}`, "jacket.pdf", pdf(), userId)).status).toBe(201);
    p = await proof(orgId, userId);
    expect(p).toMatchObject({
      items: 5,
      covered: 4,
      coveredCents: 3800,
      missing: 1,
      missingCents: 1500,
    });
    // Another year's proof does not count this year's stock.
    expect((await proof(orgId, userId, 2025)).items).toBe(0);

    // Expense and purchase receipts share one allowance.
    const usage = await json<{ usedBytes: number }>(
      await api(`/api/orgs/${orgId}/expenses/receipts/usage`, { as: userId }),
    );
    expect(usage.usedBytes).toBe(photo.byteLength + pdf().byteLength);

    expect(
      (
        await api(`/api/orgs/${orgId}/inventory/lots/${lot}/receipts/${row.id}`, {
          method: "DELETE",
          as: userId,
        })
      ).status,
    ).toBe(200);
    const left = await env.DB.prepare(
      "SELECT count(*) AS n FROM purchase_receipt_chunk WHERE receipt_id = ?",
    )
      .bind(row.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
    expect((await proof(orgId, userId)).covered).toBe(1);
  });

  it("refuses a file that is not what its name says, and caps receipts per lot", async () => {
    const { userId, orgId } = await setupTenant();
    const lot = await addLot(orgId, userId);
    const fake = await upload(
      orgId,
      `lots/${lot}`,
      "r.pdf",
      enc.encode("<html><script>1</script></html>"),
      userId,
    );
    expect(fake.status).toBe(400);
    for (let i = 0; i < MAX_RECEIPTS_PER_PURCHASE; i++) {
      expect((await upload(orgId, `lots/${lot}`, `p${i}.pdf`, pdf(String(i)), userId)).status).toBe(
        201,
      );
    }
    const over = await upload(orgId, `lots/${lot}`, "more.pdf", pdf("x"), userId);
    expect(over.status).toBe(400);
    expect((await json<{ error: { message: string } }>(over)).error.message).toContain(
      `A lot can carry up to ${MAX_RECEIPTS_PER_PURCHASE} receipts`,
    );
  });

  it("is closed to other shops and read-only for a viewer", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const item = await addItem(a.orgId, a.userId, "Denim jacket", 800);
    const row = await json<{ id: string }>(
      await upload(a.orgId, `items/${item}`, "r.pdf", pdf(), a.userId),
    );
    expect(
      (
        await api(`/api/orgs/${a.orgId}/inventory/items/${item}/receipts/${row.id}`, {
          as: b.userId,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(`/api/orgs/${b.orgId}/inventory/items/${item}/receipts/${row.id}`, {
          as: b.userId,
        })
      ).status,
    ).toBe(404);
    expect((await upload(b.orgId, `items/${item}`, "r.pdf", pdf(), b.userId)).status).toBe(404);
    // A's item id under a lot path is not that lot's receipt.
    expect(
      (
        await api(`/api/orgs/${a.orgId}/inventory/lots/${item}/receipts/${row.id}`, {
          as: a.userId,
        })
      ).status,
    ).toBe(404);

    const viewer = await createTestUser();
    await testDb()
      .insert(member)
      .values({ id: newId("mem"), organizationId: a.orgId, userId: viewer.id, role: "viewer" });
    expect(
      (
        await api(`/api/orgs/${a.orgId}/inventory/items/${item}/receipts/${row.id}`, {
          as: viewer.id,
        })
      ).status,
    ).toBe(200);
    expect((await upload(a.orgId, `items/${item}`, "v.pdf", pdf(), viewer.id)).status).toBe(403);
    expect(
      (
        await api(`/api/orgs/${a.orgId}/inventory/items/${item}/receipts/${row.id}`, {
          method: "DELETE",
          as: viewer.id,
        })
      ).status,
    ).toBe(403);
  });

  it("goes with its lot or item, is in the shop export and lands in the year-end ZIP", async () => {
    const { userId, orgId } = await setupTenant();
    const lot = await addLot(orgId, userId, "2026-03-04");
    const kept = await addItem(orgId, userId, "Denim jacket", 800, "2026-05-06");
    const gone = await addItem(orgId, userId, "Boots", 1500);
    const goneLot = await addLot(orgId, userId, "2026-07-01");
    const nextYear = await addItem(orgId, userId, "Later", 100, "2027-01-02");
    const lotBody = pdf("haul");
    const jacketBody = pdf("jacket");
    const r1 = await json<{ id: string }>(
      await upload(orgId, `lots/${lot}`, "haul.pdf", lotBody, userId),
    );
    const r2 = await json<{ id: string }>(
      await upload(orgId, `items/${kept}`, "j.pdf", jacketBody, userId),
    );
    const r3 = await json<{ id: string }>(
      await upload(orgId, `items/${gone}`, "b.pdf", pdf(), userId),
    );
    const r4 = await json<{ id: string }>(
      await upload(orgId, `lots/${goneLot}`, "g.pdf", pdf(), userId),
    );
    await upload(orgId, `items/${nextYear}`, "later.pdf", pdf(), userId);

    expect(
      (await api(`/api/orgs/${orgId}/inventory/items/${gone}`, { method: "DELETE", as: userId }))
        .status,
    ).toBe(200);
    expect(
      (await api(`/api/orgs/${orgId}/inventory/lots/${goneLot}`, { method: "DELETE", as: userId }))
        .status,
    ).toBe(200);
    for (const id of [r3.id, r4.id]) {
      const orphan = await env.DB.prepare(
        "SELECT (SELECT count(*) FROM purchase_receipt WHERE id = ?1) + (SELECT count(*) FROM purchase_receipt_chunk WHERE receipt_id = ?1) AS n",
      )
        .bind(id)
        .first<{ n: number }>();
      expect(orphan?.n).toBe(0);
    }

    const exported = await json<{
      counts: Record<string, number>;
      records: Record<string, Record<string, unknown>[]>;
    }>(await api(`/api/orgs/${orgId}/export`, { as: userId }));
    expect(exported.counts.purchaseReceipts).toBe(3);
    expect(exported.records.purchaseReceipts?.[0]).not.toHaveProperty("bytes");

    const res = await api(`/api/orgs/${orgId}/reports/year-end.zip?year=2026`, { as: userId });
    expect(res.status).toBe(200);
    const files = unzipStoredBytes(new Uint8Array(await res.arrayBuffer()));
    const lotName = `purchase-receipts/2026-03-04 Smith estate sale 30.00 ${r1.id}.pdf`;
    const itemName = `purchase-receipts/2026-05-06 Goodwill 8.00 ${r2.id}.pdf`;
    expect([...files.keys()].filter((k) => k.startsWith("purchase-receipts/"))).toEqual([
      lotName,
      itemName,
    ]);
    expect(files.get(lotName)).toEqual(lotBody);
    expect(files.get(itemName)).toEqual(jacketBody);
    const readme = new TextDecoder().decode(files.get("README.txt"));
    expect(readme).toContain("2 file(s) on 1 lot(s) and 1 item(s)");
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
