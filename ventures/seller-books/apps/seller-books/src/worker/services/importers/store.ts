// Persists a parsed report for one org: a batch row, then sales (+ fees) and charges, skipping rows already
// imported (same org + platform + external id), and auto-linking orders to in-stock inventory by SKU.
import type { Platform } from "@shared/enums";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { rowsPerInsert } from "../../db/client";
import { importBatch, inventoryItem, platformCharge, sale, saleFee } from "../../db/schema";
import { badRequest } from "../../lib/errors";
import { newId, sha256Hex } from "../../lib/ids";
import { assertImportAllowed } from "../billing/service";
import { type FreeUnit, takeUnits } from "../books/units";
import { ImportFormatError, REPORTS, type ReportKey } from "./index";

export interface ImportSummary {
  id: string;
  platform: Platform;
  reportKind: string;
  rowCount: number;
  salesCreated: number;
  chargesCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  itemsLinked: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
}

export async function importReport(
  ctx: AppContext,
  orgId: string,
  userId: string,
  report: ReportKey,
  fileName: string,
  text: string,
): Promise<ImportSummary> {
  const def = REPORTS[report];
  let parsed: ReturnType<typeof def.parse>;
  try {
    parsed = def.parse(text);
  } catch (e) {
    if (e instanceof ImportFormatError) throw badRequest(e.message, e.details);
    throw e;
  }
  const platform = def.platform as Platform;
  const db = ctx.db;

  // De-duplicate against what this org already has (and within the file itself).
  const existingSales = new Set<string>();
  const saleIds = [...new Set(parsed.sales.map((s) => s.externalId))];
  for (let i = 0; i < saleIds.length; i += 50) {
    const rows = await db
      .select({ ext: sale.externalId })
      .from(sale)
      .where(
        and(
          eq(sale.orgId, orgId),
          eq(sale.platform, platform),
          inArray(sale.externalId, saleIds.slice(i, i + 50)),
        ),
      );
    for (const r of rows) existingSales.add(r.ext);
  }
  const existingCharges = new Set<string>();
  const chargeIds = [...new Set(parsed.charges.map((c) => c.externalId))];
  for (let i = 0; i < chargeIds.length; i += 50) {
    const rows = await db
      .select({ ext: platformCharge.externalId })
      .from(platformCharge)
      .where(
        and(
          eq(platformCharge.orgId, orgId),
          eq(platformCharge.platform, platform),
          inArray(platformCharge.externalId, chargeIds.slice(i, i + 50)),
        ),
      );
    for (const r of rows) existingCharges.add(r.ext);
  }
  let duplicates = 0;
  const newSales = parsed.sales.filter((s) => {
    if (existingSales.has(s.externalId)) {
      duplicates++;
      return false;
    }
    existingSales.add(s.externalId);
    return true;
  });
  const newCharges = parsed.charges.filter((c) => {
    if (existingCharges.has(c.externalId)) {
      duplicates++;
      return false;
    }
    existingCharges.add(c.externalId);
    return true;
  });

  // The plan's platforms and (free plan) monthly order cap, before anything is written.
  await assertImportAllowed(
    ctx,
    orgId,
    platform,
    newSales.filter((s) => s.kind === "order").map((s) => s.date),
  );

  // Auto-link orders to in-stock items with the same SKU: as many items as the order's quantity, bought on
  // or before the sale date, first acquired first (services/books/units.ts).
  const skus = [
    ...new Set(newSales.filter((s) => s.kind === "order" && s.sku).map((s) => s.sku as string)),
  ];
  const freeBySku = new Map<string, FreeUnit[]>();
  for (let i = 0; i < skus.length; i += 50) {
    const rows = await db
      .select({
        id: inventoryItem.id,
        sku: inventoryItem.sku,
        acquiredDate: inventoryItem.acquiredDate,
      })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.orgId, orgId),
          eq(inventoryItem.status, "in_stock"),
          inArray(inventoryItem.sku, skus.slice(i, i + 50)),
        ),
      )
      .orderBy(inventoryItem.acquiredDate);
    for (const r of rows) {
      const list = freeBySku.get(r.sku ?? "") ?? [];
      list.push({ id: r.id, acquiredDate: r.acquiredDate });
      freeBySku.set(r.sku ?? "", list);
    }
  }

  const batchId = newId("imp");
  await db.insert(importBatch).values({
    id: batchId,
    orgId,
    platform,
    reportKind: parsed.reportKind,
    fileName: fileName.slice(0, 200),
    sha256: await sha256Hex(text),
    rowCount: parsed.rowCount,
    salesCreated: newSales.length,
    chargesCreated: newCharges.length,
    duplicatesSkipped: duplicates,
    rowsSkipped: parsed.skipped.length,
    warnings: parsed.warnings.slice(0, 50),
    createdBy: userId,
  });

  const saleRows: (typeof sale.$inferInsert)[] = [];
  const feeRows: (typeof saleFee.$inferInsert)[] = [];
  const links: { itemId: string; saleId: string; date: string }[] = [];
  for (const s of newSales) {
    const id = newId("sal");
    let inventoryItemId: string | null = null;
    if (s.kind === "order" && s.sku) {
      const units = takeUnits(freeBySku.get(s.sku) ?? [], s.date, s.quantity);
      inventoryItemId = units[0]?.id ?? null;
      for (const u of units) links.push({ itemId: u.id, saleId: id, date: s.date });
    }
    saleRows.push({
      id,
      orgId,
      platform,
      kind: s.kind,
      externalId: s.externalId,
      orderId: s.orderId,
      date: s.date,
      title: s.title?.slice(0, 300) ?? null,
      sku: s.sku,
      quantity: s.quantity,
      itemCents: s.itemCents,
      shippingChargedCents: s.shippingChargedCents,
      salesTaxCents: s.salesTaxCents,
      refundCents: s.refundCents,
      shippingLabelCents: s.shippingLabelCents,
      netCents: s.netCents,
      inventoryItemId,
      importBatchId: batchId,
    });
    for (const f of s.fees) {
      feeRows.push({
        id: newId("fee"),
        orgId,
        saleId: id,
        kind: f.kind,
        amountCents: f.amountCents,
        sourceColumn: f.sourceColumn,
      });
    }
  }
  const chargeRows = newCharges.map((c) => ({
    id: newId("chg"),
    orgId,
    platform,
    externalId: c.externalId,
    date: c.date,
    kind: c.kind,
    amountCents: c.amountCents,
    orderId: c.orderId,
    description: c.description?.slice(0, 300) ?? null,
    importBatchId: batchId,
  }));

  const saleChunk = rowsPerInsert(sale);
  for (let i = 0; i < saleRows.length; i += saleChunk)
    await db.insert(sale).values(saleRows.slice(i, i + saleChunk));
  const feeChunk = rowsPerInsert(saleFee);
  for (let i = 0; i < feeRows.length; i += feeChunk)
    await db.insert(saleFee).values(feeRows.slice(i, i + feeChunk));
  const chargeChunk = rowsPerInsert(platformCharge);
  for (let i = 0; i < chargeRows.length; i += chargeChunk)
    await db.insert(platformCharge).values(chargeRows.slice(i, i + chargeChunk));
  for (const l of links) {
    await db
      .update(inventoryItem)
      .set({ status: "sold", disposedDate: l.date, soldBySaleId: l.saleId })
      .where(and(eq(inventoryItem.id, l.itemId), eq(inventoryItem.orgId, orgId)));
  }

  ctx.logger.info("import.done", {
    orgId,
    platform,
    report,
    sales: saleRows.length,
    charges: chargeRows.length,
  });
  return {
    id: batchId,
    platform,
    reportKind: parsed.reportKind,
    rowCount: parsed.rowCount,
    salesCreated: saleRows.length,
    chargesCreated: chargeRows.length,
    duplicatesSkipped: duplicates,
    rowsSkipped: parsed.skipped.length,
    itemsLinked: links.length,
    skipped: parsed.skipped.slice(0, 100),
    warnings: parsed.warnings,
  };
}
