// Purchase receipts (2026-11-28, purchase-receipts): the receipt behind what was paid for stock, on a lot
// (one receipt covers every item in it) or on an item bought on its own. Stored exactly like expense
// receipts (receipts.ts: D1 chunks, the same file checks, one storage allowance for both), in
// `purchase_receipt` and `purchase_receipt_chunk` (migration 0019).
import {
  checkReceipt,
  cleanReceiptName,
  MAX_RECEIPTS_PER_PURCHASE,
  purchaseProof,
} from "@shared/receipts";
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { inventoryItem, inventoryLot, purchaseReceipt } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId, sha256HexBytes } from "../../lib/ids";
import { assertReceiptRoom, chunkBytes, receiptBytes } from "./receipts";

/** What a purchase receipt is on: a lot, or one item. */
export type PurchaseTarget = { kind: "lot"; id: string } | { kind: "item"; id: string };

export interface PurchaseReceiptRow {
  id: string;
  lotId: string | null;
  itemId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: Date;
}

const columns = {
  id: purchaseReceipt.id,
  lotId: purchaseReceipt.lotId,
  itemId: purchaseReceipt.itemId,
  fileName: purchaseReceipt.fileName,
  contentType: purchaseReceipt.contentType,
  size: purchaseReceipt.size,
  createdAt: purchaseReceipt.createdAt,
};

const targetColumn = (t: PurchaseTarget) =>
  t.kind === "lot" ? purchaseReceipt.lotId : purchaseReceipt.itemId;

async function assertTarget(ctx: AppContext, orgId: string, t: PurchaseTarget) {
  const row =
    t.kind === "lot"
      ? await ctx.db
          .select({ id: inventoryLot.id })
          .from(inventoryLot)
          .where(and(eq(inventoryLot.id, t.id), eq(inventoryLot.orgId, orgId)))
          .get()
      : await ctx.db
          .select({ id: inventoryItem.id })
          .from(inventoryItem)
          .where(and(eq(inventoryItem.id, t.id), eq(inventoryItem.orgId, orgId)))
          .get();
  if (!row) throw notFound(t.kind === "lot" ? "Lot" : "Item");
}

export async function listPurchaseReceipts(
  ctx: AppContext,
  orgId: string,
  t: PurchaseTarget,
): Promise<PurchaseReceiptRow[]> {
  await assertTarget(ctx, orgId, t);
  return ctx.db
    .select(columns)
    .from(purchaseReceipt)
    .where(and(eq(purchaseReceipt.orgId, orgId), eq(targetColumn(t), t.id)))
    .orderBy(asc(purchaseReceipt.createdAt), asc(purchaseReceipt.id));
}

/** Receipts per lot and per loose item, for the inventory lists. */
export async function purchaseReceiptCounts(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({ lotId: purchaseReceipt.lotId, itemId: purchaseReceipt.itemId, n: count() })
    .from(purchaseReceipt)
    .where(eq(purchaseReceipt.orgId, orgId))
    .groupBy(purchaseReceipt.lotId, purchaseReceipt.itemId);
  const lots = new Map<string, number>();
  const items = new Map<string, number>();
  for (const r of rows) {
    if (r.lotId) lots.set(r.lotId, r.n);
    else if (r.itemId) items.set(r.itemId, r.n);
  }
  return { lots, items };
}

export async function addPurchaseReceipt(
  ctx: AppContext,
  orgId: string,
  t: PurchaseTarget,
  input: { fileName: string; bytes: Uint8Array<ArrayBuffer>; userId: string | null },
): Promise<PurchaseReceiptRow> {
  await assertTarget(ctx, orgId, t);
  const fileName = cleanReceiptName(input.fileName);
  const check = checkReceipt(fileName, input.bytes);
  if (!check.ok) throw badRequest(check.reason);
  const [{ n }] = (await ctx.db
    .select({ n: count() })
    .from(purchaseReceipt)
    .where(and(eq(purchaseReceipt.orgId, orgId), eq(targetColumn(t), t.id)))) as [{ n: number }];
  if (n >= MAX_RECEIPTS_PER_PURCHASE) {
    throw badRequest(
      `A ${t.kind} can carry up to ${MAX_RECEIPTS_PER_PURCHASE} receipts. Delete one to add another.`,
    );
  }
  const size = input.bytes.byteLength;
  await assertReceiptRoom(ctx, orgId, size);
  const row: PurchaseReceiptRow = {
    id: newId("prc"),
    lotId: t.kind === "lot" ? t.id : null,
    itemId: t.kind === "item" ? t.id : null,
    fileName,
    contentType: check.contentType,
    size,
    createdAt: new Date(),
  };
  const sha256 = await sha256HexBytes(input.bytes);
  const db = ctx.env.DB;
  // One batch, one transaction: a reader never sees half a file, a failed upload leaves nothing.
  await db.batch([
    db
      .prepare(
        "INSERT INTO purchase_receipt (id, org_id, lot_id, item_id, file_name, content_type, size, sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        row.id,
        orgId,
        row.lotId,
        row.itemId,
        row.fileName,
        row.contentType,
        size,
        sha256,
        input.userId,
        row.createdAt.getTime(),
      ),
    ...chunkBytes(input.bytes).map((part, i) =>
      db
        .prepare("INSERT INTO purchase_receipt_chunk (receipt_id, chunk, bytes) VALUES (?, ?, ?)")
        .bind(row.id, i, part),
    ),
  ]);
  return row;
}

export async function readPurchaseReceipt(
  ctx: AppContext,
  orgId: string,
  t: PurchaseTarget,
  receiptId: string,
): Promise<PurchaseReceiptRow & { bytes: Uint8Array<ArrayBuffer> }> {
  const meta = await ctx.db
    .select(columns)
    .from(purchaseReceipt)
    .where(
      and(
        eq(purchaseReceipt.id, receiptId),
        eq(purchaseReceipt.orgId, orgId),
        eq(targetColumn(t), t.id),
      ),
    )
    .get();
  if (!meta) throw notFound("Receipt");
  return {
    ...meta,
    bytes: await receiptBytes(ctx, meta.id, meta.size, "purchase_receipt_chunk"),
  };
}

export async function deletePurchaseReceipt(
  ctx: AppContext,
  orgId: string,
  t: PurchaseTarget,
  receiptId: string,
): Promise<void> {
  const res = await ctx.db
    .delete(purchaseReceipt)
    .where(
      and(
        eq(purchaseReceipt.id, receiptId),
        eq(purchaseReceipt.orgId, orgId),
        eq(targetColumn(t), t.id),
      ),
    )
    .returning({ id: purchaseReceipt.id });
  if (res.length === 0) throw notFound("Receipt");
  await ctx.env.DB.prepare("DELETE FROM purchase_receipt_chunk WHERE receipt_id = ?")
    .bind(receiptId)
    .run();
}

/**
 * The year's stock purchases (Schedule C line 36: items bought in the year, not the copies a refund put
 * back in stock) and how many have a receipt behind their cost, with the cost that has none.
 */
export async function purchaseProofForYear(ctx: AppContext, orgId: string, year: number) {
  const items = await ctx.db
    .select({
      id: inventoryItem.id,
      lotId: inventoryItem.lotId,
      costCents: inventoryItem.costCents,
      title: inventoryItem.title,
      sku: inventoryItem.sku,
      acquiredDate: inventoryItem.acquiredDate,
    })
    .from(inventoryItem)
    .where(
      and(
        eq(inventoryItem.orgId, orgId),
        isNull(inventoryItem.returnSaleId),
        sql`${inventoryItem.acquiredDate} >= ${`${year}-01-01`}`,
        sql`${inventoryItem.acquiredDate} <= ${`${year}-12-31`}`,
      ),
    )
    .orderBy(asc(inventoryItem.acquiredDate), asc(inventoryItem.id));
  const receipts = await ctx.db
    .selectDistinct({ lotId: purchaseReceipt.lotId, itemId: purchaseReceipt.itemId })
    .from(purchaseReceipt)
    .where(eq(purchaseReceipt.orgId, orgId));
  const proof = purchaseProof(items, {
    lots: new Set(receipts.flatMap((r) => (r.lotId ? [r.lotId] : []))),
    items: new Set(receipts.flatMap((r) => (r.itemId ? [r.itemId] : []))),
  });
  const missing = new Set(proof.missingIds);
  const { missingIds: _ids, ...totals } = proof;
  return {
    year,
    ...totals,
    /** The first items with no receipt, largest cost first, so the ones that matter most are named. */
    missingItems: items
      .filter((i) => missing.has(i.id))
      .sort((a, b) => b.costCents - a.costCents || a.acquiredDate.localeCompare(b.acquiredDate))
      .slice(0, 50),
  };
}

/** Receipts on the year's purchases (lots and loose items bought in the year), for the year-end ZIP. */
export async function yearPurchaseReceipts(ctx: AppContext, orgId: string, year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const onLots = await ctx.db
    .select({
      ...columns,
      date: inventoryLot.acquiredDate,
      name: inventoryLot.name,
      vendor: inventoryLot.vendor,
      amountCents: inventoryLot.totalCostCents,
    })
    .from(purchaseReceipt)
    .innerJoin(inventoryLot, eq(inventoryLot.id, purchaseReceipt.lotId))
    .where(
      and(
        eq(purchaseReceipt.orgId, orgId),
        isNotNull(purchaseReceipt.lotId),
        sql`${inventoryLot.acquiredDate} >= ${from}`,
        sql`${inventoryLot.acquiredDate} <= ${to}`,
      ),
    );
  const onItems = await ctx.db
    .select({
      ...columns,
      date: inventoryItem.acquiredDate,
      name: inventoryItem.title,
      vendor: inventoryItem.source,
      amountCents: inventoryItem.costCents,
    })
    .from(purchaseReceipt)
    .innerJoin(inventoryItem, eq(inventoryItem.id, purchaseReceipt.itemId))
    .where(
      and(
        eq(purchaseReceipt.orgId, orgId),
        isNotNull(purchaseReceipt.itemId),
        isNull(inventoryItem.returnSaleId),
        sql`${inventoryItem.acquiredDate} >= ${from}`,
        sql`${inventoryItem.acquiredDate} <= ${to}`,
      ),
    );
  return [...onLots, ...onItems].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The receipt's name in the year-end ZIP: purchase-receipts/2026-03-04 Estate sale lot 30.00 prc_xxxx.pdf,
 * by the purchase's date, the vendor (else the lot or item name) and what was paid.
 */
export function purchaseReceiptZipName(r: {
  id: string;
  date: string;
  name: string;
  vendor: string | null;
  amountCents: number;
  fileName: string;
}): string {
  const ext = /\.([A-Za-z0-9]+)$/.exec(r.fileName)?.[1]?.toLowerCase() ?? "bin";
  const label = (r.vendor || r.name)
    .replace(/[^A-Za-z0-9 &.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const amount = (r.amountCents / 100).toFixed(2);
  return `purchase-receipts/${[r.date, label, amount, r.id].filter(Boolean).join(" ")}.${ext}`;
}
