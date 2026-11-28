// Report uploads. POST takes the file as text (the SPA reads it in the browser) so one JSON request carries
// everything; 5 MB is ~40k rows of a typical export.
import {
  MAPPED_FEE_KINDS,
  MAPPED_PLATFORMS,
  MAX_MAPPED_FEES,
  PRICE_INCLUDES,
} from "@shared/column-mapping";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { importBatch, importMapping } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { releaseItemsOfBatch } from "../../services/books/service";
import { REPORT_KEYS } from "../../services/importers";
import { importReport } from "../../services/importers/store";
import type { AppEnv } from "../../types";
import { page, pageQuery } from "./schemas";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const routes = new Hono<AppEnv>();

routes.post(
  "/",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      report: z.enum(REPORT_KEYS),
      fileName: z.string().trim().min(1).max(200),
      csv: z.string().min(1).max(MAX_IMPORT_BYTES),
    }),
  ),
  async (c) => {
    const { orgId, userId } = c.var.tenant;
    const { report, fileName, csv } = c.req.valid("json");
    const summary = await importReport(c.var.ctx, orgId, userId, report, fileName, csv);
    return c.json(summary, 201);
  },
);

routes.get("/", validate("query", pageQuery), async (c) => {
  const { orgId } = c.var.tenant;
  const { limit, cursor } = c.req.valid("query");
  const rows = await c.var.ctx.db
    .select()
    .from(importBatch)
    .where(eq(importBatch.orgId, orgId))
    .orderBy(desc(importBatch.createdAt))
    .limit(limit + 1)
    .offset(cursor);
  return c.json(page(rows, limit, cursor));
});

routes.delete("/:id", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const id = c.req.param("id");
  const batch = await c.var.ctx.db
    .select({ id: importBatch.id })
    .from(importBatch)
    .where(and(eq(importBatch.id, id), eq(importBatch.orgId, orgId)))
    .get();
  if (!batch) throw notFound("Import");
  const released = await releaseItemsOfBatch(c.var.ctx, orgId, id);
  await c.var.ctx.db
    .delete(importBatch)
    .where(and(eq(importBatch.id, id), eq(importBatch.orgId, orgId)));
  return c.json({ ok: true, itemsReturnedToStock: released });
});

const header = z.string().trim().min(1).max(200);
const optionalHeader = header.optional();

/** The columns the seller chose for a marketplace with no fixed layout (src/shared/column-mapping.ts). */
const mappingSchema = z.object({
  date: header,
  itemPrice: header,
  title: optionalHeader,
  orderId: optionalHeader,
  sku: optionalHeader,
  quantity: optionalHeader,
  shipping: optionalHeader,
  salesTax: optionalHeader,
  shippingLabel: optionalHeader,
  refund: optionalHeader,
  net: optionalHeader,
  status: optionalHeader,
  priceIncludes: z.array(z.enum(PRICE_INCLUDES)).max(PRICE_INCLUDES.length).optional(),
  fees: z
    .array(z.object({ column: header, kind: z.enum(MAPPED_FEE_KINDS) }))
    .max(MAX_MAPPED_FEES)
    .optional(),
});

routes.post(
  "/mapped",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      platform: z.enum(MAPPED_PLATFORMS),
      mapping: mappingSchema,
      fileName: z.string().trim().min(1).max(200),
      csv: z.string().min(1).max(MAX_IMPORT_BYTES),
    }),
  ),
  async (c) => {
    const { orgId, userId } = c.var.tenant;
    const { platform, mapping, fileName, csv } = c.req.valid("json");
    const summary = await importReport(
      c.var.ctx,
      orgId,
      userId,
      { platform, mapping },
      fileName,
      csv,
    );
    // Saved only once a file has imported with it, so the next file from this platform starts there.
    await c.var.ctx.db
      .insert(importMapping)
      .values({ orgId, platform, mapping })
      .onConflictDoUpdate({
        target: [importMapping.orgId, importMapping.platform],
        set: { mapping, updatedAt: new Date() },
      });
    return c.json(summary, 201);
  },
);

routes.get("/mappings", async (c) => {
  const { orgId } = c.var.tenant;
  const rows = await c.var.ctx.db
    .select({
      platform: importMapping.platform,
      mapping: importMapping.mapping,
      updatedAt: importMapping.updatedAt,
    })
    .from(importMapping)
    .where(eq(importMapping.orgId, orgId));
  return c.json({ items: rows });
});

export default routes;
