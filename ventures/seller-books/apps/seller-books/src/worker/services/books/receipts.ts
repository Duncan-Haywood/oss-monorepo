// Receipt files on expenses, kept in D1 (shared/receipts.ts says why and what is accepted).
//
// Metadata goes through Drizzle; the bytes go through D1 prepared statements so each chunk is bound as a
// plain Uint8Array (no Buffer). A receipt and its chunks are written in one batch, which D1 runs as one
// transaction: a reader never sees half a file, and a failed upload leaves nothing behind.
import {
  checkReceipt,
  cleanReceiptName,
  MAX_RECEIPTS_PER_EXPENSE,
  megabytes,
  RECEIPT_CHUNK_BYTES,
  SHOP_RECEIPT_LIMIT_BYTES,
  TOTAL_RECEIPT_LIMIT_BYTES,
} from "@shared/receipts";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { expense, expenseReceipt } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { newId, sha256HexBytes } from "../../lib/ids";

export interface ReceiptRow {
  id: string;
  expenseId: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: Date;
}

const receiptColumns = {
  id: expenseReceipt.id,
  expenseId: expenseReceipt.expenseId,
  fileName: expenseReceipt.fileName,
  contentType: expenseReceipt.contentType,
  size: expenseReceipt.size,
  createdAt: expenseReceipt.createdAt,
};

/** Split bytes into D1-sized chunks. */
export function chunkBytes(bytes: Uint8Array, size = RECEIPT_CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) out.push(bytes.subarray(at, at + size));
  return out;
}

const storageFull = (message: string) => new AppError(507, "receipt_storage_full", message);

async function assertExpense(ctx: AppContext, orgId: string, expenseId: string) {
  const row = await ctx.db
    .select({ id: expense.id })
    .from(expense)
    .where(and(eq(expense.id, expenseId), eq(expense.orgId, orgId)))
    .get();
  if (!row) throw notFound("Expense");
}

/**
 * Bytes of receipts the shop keeps, and every shop's together: expense receipts and purchase receipts
 * (purchase-receipts.ts) share one allowance, since both live in the same D1 database.
 */
export async function receiptUsage(ctx: AppContext, orgId: string) {
  const row = await ctx.env.DB.prepare(
    `SELECT coalesce(sum(CASE WHEN org_id = ?1 THEN size ELSE 0 END), 0) AS shop, coalesce(sum(size), 0) AS total
       FROM (SELECT org_id, size FROM expense_receipt UNION ALL SELECT org_id, size FROM purchase_receipt)`,
  )
    .bind(orgId)
    .first<{ shop: number; total: number }>();
  return { shopBytes: Number(row?.shop ?? 0), totalBytes: Number(row?.total ?? 0) };
}

/** The shop and deployment limits every new receipt is checked against, with the message to show. */
export async function assertReceiptRoom(ctx: AppContext, orgId: string, size: number) {
  const usage = await receiptUsage(ctx, orgId);
  if (usage.shopBytes + size > SHOP_RECEIPT_LIMIT_BYTES) {
    throw storageFull(
      `Receipts can use up to ${megabytes(SHOP_RECEIPT_LIMIT_BYTES)} a shop for now, and this shop has ${megabytes(usage.shopBytes)}. Delete receipts you no longer need, or shrink the photo (a receipt reads fine at 1 to 2 MB).`,
    );
  }
  if (usage.totalBytes + size > TOTAL_RECEIPT_LIMIT_BYTES) {
    throw storageFull("Receipt storage on this site is full for now. Try again later.");
  }
}

export async function listReceipts(
  ctx: AppContext,
  orgId: string,
  expenseId: string,
): Promise<ReceiptRow[]> {
  await assertExpense(ctx, orgId, expenseId);
  return ctx.db
    .select(receiptColumns)
    .from(expenseReceipt)
    .where(and(eq(expenseReceipt.orgId, orgId), eq(expenseReceipt.expenseId, expenseId)))
    .orderBy(asc(expenseReceipt.createdAt), asc(expenseReceipt.id));
}

/** How many receipts each expense has, for the expense list. */
export async function receiptCounts(
  ctx: AppContext,
  orgId: string,
  expenseIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const CHUNK = 90; // D1 binds at most 100 parameters a statement
  for (let i = 0; i < expenseIds.length; i += CHUNK) {
    const ids = expenseIds.slice(i, i + CHUNK);
    const rows = await ctx.db
      .select({ expenseId: expenseReceipt.expenseId, n: count() })
      .from(expenseReceipt)
      .where(and(eq(expenseReceipt.orgId, orgId), inArray(expenseReceipt.expenseId, ids)))
      .groupBy(expenseReceipt.expenseId);
    for (const r of rows) out.set(r.expenseId, r.n);
  }
  return out;
}

export async function addReceipt(
  ctx: AppContext,
  orgId: string,
  expenseId: string,
  input: { fileName: string; bytes: Uint8Array<ArrayBuffer>; userId: string | null },
): Promise<ReceiptRow> {
  await assertExpense(ctx, orgId, expenseId);
  const fileName = cleanReceiptName(input.fileName);
  const check = checkReceipt(fileName, input.bytes);
  if (!check.ok) throw badRequest(check.reason);
  const [{ n }] = (await ctx.db
    .select({ n: count() })
    .from(expenseReceipt)
    .where(and(eq(expenseReceipt.orgId, orgId), eq(expenseReceipt.expenseId, expenseId)))) as [
    { n: number },
  ];
  if (n >= MAX_RECEIPTS_PER_EXPENSE) {
    throw badRequest(
      `An expense can carry up to ${MAX_RECEIPTS_PER_EXPENSE} receipts. Delete one to add another.`,
    );
  }
  const size = input.bytes.byteLength;
  await assertReceiptRoom(ctx, orgId, size);
  const row: ReceiptRow = {
    id: newId("rct"),
    expenseId,
    fileName,
    contentType: check.contentType,
    size,
    createdAt: new Date(),
  };
  const sha256 = await sha256HexBytes(input.bytes);
  const db = ctx.env.DB;
  await db.batch([
    db
      .prepare(
        "INSERT INTO expense_receipt (id, org_id, expense_id, file_name, content_type, size, sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        row.id,
        orgId,
        expenseId,
        row.fileName,
        row.contentType,
        size,
        sha256,
        input.userId,
        row.createdAt.getTime(),
      ),
    ...chunkBytes(input.bytes).map((part, i) =>
      db
        .prepare("INSERT INTO expense_receipt_chunk (receipt_id, chunk, bytes) VALUES (?, ?, ?)")
        .bind(row.id, i, part),
    ),
  ]);
  return row;
}

/** A receipt's metadata and bytes; a missing or short file is an error, never a truncated download. */
export async function readReceipt(
  ctx: AppContext,
  orgId: string,
  expenseId: string,
  receiptId: string,
): Promise<ReceiptRow & { bytes: Uint8Array<ArrayBuffer> }> {
  const meta = await ctx.db
    .select(receiptColumns)
    .from(expenseReceipt)
    .where(
      and(
        eq(expenseReceipt.id, receiptId),
        eq(expenseReceipt.orgId, orgId),
        eq(expenseReceipt.expenseId, expenseId),
      ),
    )
    .get();
  if (!meta) throw notFound("Receipt");
  return { ...meta, bytes: await receiptBytes(ctx, meta.id, meta.size) };
}

export async function receiptBytes(
  ctx: AppContext,
  receiptId: string,
  size: number,
  chunkTable: "expense_receipt_chunk" | "purchase_receipt_chunk" = "expense_receipt_chunk",
): Promise<Uint8Array<ArrayBuffer>> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT chunk, bytes FROM ${chunkTable} WHERE receipt_id = ? ORDER BY chunk`,
  )
    .bind(receiptId)
    .all<{ chunk: number; bytes: ArrayBuffer | number[] }>();
  const out = new Uint8Array(size);
  let at = 0;
  for (const r of results) {
    const part =
      r.bytes instanceof ArrayBuffer ? new Uint8Array(r.bytes) : Uint8Array.from(r.bytes);
    if (at + part.byteLength > size)
      throw new Error(`receipt ${receiptId}: more than ${size} bytes`);
    out.set(part, at);
    at += part.byteLength;
  }
  if (at !== size) throw new Error(`receipt ${receiptId}: ${at} of ${size} bytes`);
  return out;
}

export async function deleteReceipt(
  ctx: AppContext,
  orgId: string,
  expenseId: string,
  receiptId: string,
): Promise<void> {
  const res = await ctx.db
    .delete(expenseReceipt)
    .where(
      and(
        eq(expenseReceipt.id, receiptId),
        eq(expenseReceipt.orgId, orgId),
        eq(expenseReceipt.expenseId, expenseId),
      ),
    )
    .returning({ id: expenseReceipt.id });
  if (res.length === 0) throw notFound("Receipt");
  // The chunks go by ON DELETE CASCADE; this also covers a database opened without foreign keys.
  await ctx.env.DB.prepare("DELETE FROM expense_receipt_chunk WHERE receipt_id = ?")
    .bind(receiptId)
    .run();
}

/** Every receipt on the year's expenses, with the expense it belongs to, for the year-end ZIP. */
export async function yearReceipts(ctx: AppContext, orgId: string, year: number) {
  return ctx.db
    .select({
      ...receiptColumns,
      date: expense.date,
      vendor: expense.vendor,
      amountCents: expense.amountCents,
    })
    .from(expenseReceipt)
    .innerJoin(expense, eq(expense.id, expenseReceipt.expenseId))
    .where(
      and(
        eq(expenseReceipt.orgId, orgId),
        sql`${expense.date} >= ${`${year}-01-01`}`,
        sql`${expense.date} <= ${`${year}-12-31`}`,
      ),
    )
    .orderBy(
      asc(expense.date),
      asc(expense.id),
      asc(expenseReceipt.createdAt),
      asc(expenseReceipt.id),
    );
}

/**
 * The receipt's name inside the year-end ZIP: receipts/2026-03-04 Uline 42.17 rct_xxxx.pdf. The date and
 * vendor sort and name it for a preparer; the id keeps two receipts on one expense apart.
 */
export function receiptZipName(r: {
  id: string;
  date: string;
  vendor: string | null;
  amountCents: number;
  fileName: string;
}): string {
  const ext = /\.([A-Za-z0-9]+)$/.exec(r.fileName)?.[1]?.toLowerCase() ?? "bin";
  const vendor = (r.vendor ?? "")
    .replace(/[^A-Za-z0-9 &.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const amount = (r.amountCents / 100).toFixed(2);
  return `receipts/${[r.date, vendor, amount, r.id].filter(Boolean).join(" ")}.${ext}`;
}
