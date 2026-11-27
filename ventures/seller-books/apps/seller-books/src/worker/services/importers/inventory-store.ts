// Persists a parsed sourcing sheet (inventory-sheet.ts) for one org.
//
// - Re-imports are safe: an item is the same as one already in the books when its title, SKU, purchase
//   date and cost all match. For each such key only the extra copies are created, so importing the same
//   sheet twice (or a sheet that grew by a few rows) adds only what is new.
// - Orders imported before the sheet, still without an item, are linked to the new in-stock items with the
//   same SKU, oldest order first, and only to an item bought on or before the sale date. Those items
//   become sold on the sale date, the same as when the sheet comes first (store.ts).
// - `dryRun` parses and counts without writing, so the page can show what would happen first.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { rowsPerInsert } from "../../db/client";
import { inventoryItem, sale } from "../../db/schema";
import { badRequest } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { takeUnits } from "../books/units";
import { parseInventorySheet, type SheetItem } from "./inventory-sheet";
import { ImportFormatError } from "./parse";

export interface InventoryImportSummary {
  dryRun: boolean;
  rowCount: number;
  itemsCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  salesLinked: number;
  totalCostCents: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  matched: Record<string, string>;
}

const itemKey = (i: {
  title: string;
  sku: string | null;
  acquiredDate: string;
  costCents: number;
}) => JSON.stringify([i.title.toLowerCase(), i.sku ?? "", i.acquiredDate, i.costCents]);

const CHUNK = 50;

export async function importInventorySheet(
  ctx: AppContext,
  orgId: string,
  text: string,
  dryRun: boolean,
): Promise<InventoryImportSummary> {
  let parsed: ReturnType<typeof parseInventorySheet>;
  try {
    parsed = parseInventorySheet(text);
  } catch (e) {
    if (e instanceof ImportFormatError) throw badRequest(e.message, e.details);
    throw e;
  }
  const db = ctx.db;

  // Items already in the books with the same key, counted per key.
  const existing = new Map<string, number>();
  const dates = [...new Set(parsed.items.map((i) => i.acquiredDate))];
  for (let i = 0; i < dates.length; i += CHUNK) {
    const rows = await db
      .select({
        title: inventoryItem.title,
        sku: inventoryItem.sku,
        acquiredDate: inventoryItem.acquiredDate,
        costCents: inventoryItem.costCents,
      })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.orgId, orgId),
          inArray(inventoryItem.acquiredDate, dates.slice(i, i + CHUNK)),
        ),
      );
    for (const r of rows) existing.set(itemKey(r), (existing.get(itemKey(r)) ?? 0) + 1);
  }
  const fresh: SheetItem[] = [];
  let duplicates = 0;
  for (const item of parsed.items) {
    const k = itemKey(item);
    const left = existing.get(k) ?? 0;
    if (left > 0) {
      existing.set(k, left - 1);
      duplicates++;
    } else fresh.push(item);
  }

  const rows = fresh.map((i) => ({
    id: newId("itm"),
    orgId,
    lotId: null,
    title: i.title,
    sku: i.sku,
    acquiredDate: i.acquiredDate,
    costCents: i.costCents,
    costIsManual: true,
    status: i.status as string,
    disposedDate: i.disposedDate,
  }));

  // Unlinked orders with a SKU the new in-stock items carry, oldest first.
  const freeBySku = new Map<string, { id: string; acquiredDate: string }[]>();
  for (const r of [...rows].sort((a, b) => a.acquiredDate.localeCompare(b.acquiredDate))) {
    if (r.status !== "in_stock" || !r.sku) continue;
    const list = freeBySku.get(r.sku) ?? [];
    list.push({ id: r.id, acquiredDate: r.acquiredDate });
    freeBySku.set(r.sku, list);
  }
  const skus = [...freeBySku.keys()];
  const links: { saleId: string; itemIds: string[]; date: string }[] = [];
  for (let i = 0; i < skus.length; i += CHUNK) {
    const orders = await db
      .select({ id: sale.id, sku: sale.sku, date: sale.date, quantity: sale.quantity })
      .from(sale)
      .where(
        and(
          eq(sale.orgId, orgId),
          eq(sale.kind, "order"),
          isNull(sale.inventoryItemId),
          inArray(sale.sku, skus.slice(i, i + CHUNK)),
        ),
      )
      .orderBy(asc(sale.date), asc(sale.id));
    for (const o of orders) {
      const free = freeBySku.get(o.sku ?? "");
      if (!free) continue;
      const units = takeUnits(free, o.date, o.quantity);
      if (units.length > 0)
        links.push({ saleId: o.id, itemIds: units.map((u) => u.id), date: o.date });
    }
  }

  const summary: InventoryImportSummary = {
    dryRun,
    rowCount: parsed.rowCount,
    itemsCreated: rows.length,
    duplicatesSkipped: duplicates,
    rowsSkipped: parsed.skipped.length,
    salesLinked: links.length,
    totalCostCents: rows.reduce((s, r) => s + r.costCents, 0),
    skipped: parsed.skipped.slice(0, 100),
    warnings: parsed.warnings,
    matched: parsed.matched,
  };
  if (dryRun) return summary;

  const chunk = rowsPerInsert(inventoryItem);
  for (let i = 0; i < rows.length; i += chunk)
    await db.insert(inventoryItem).values(rows.slice(i, i + chunk));
  // Link each order only if it is still unlinked (another import may have linked it meanwhile), and mark
  // the item sold only when the link took.
  let linked = 0;
  for (const l of links) {
    const done = await db
      .update(sale)
      .set({ inventoryItemId: l.itemIds[0] })
      .where(and(eq(sale.id, l.saleId), eq(sale.orgId, orgId), isNull(sale.inventoryItemId)))
      .returning({ id: sale.id });
    if (done.length === 0) continue;
    linked++;
    await db
      .update(inventoryItem)
      .set({ status: "sold", disposedDate: l.date, soldBySaleId: l.saleId })
      .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, l.itemIds)));
  }
  summary.salesLinked = linked;
  ctx.logger.info("inventory_import.done", {
    orgId,
    items: rows.length,
    duplicates,
    linked,
  });
  return summary;
}
