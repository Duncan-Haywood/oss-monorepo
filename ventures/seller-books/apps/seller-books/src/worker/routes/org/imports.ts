// Report uploads. POST takes the file as text (the SPA reads it in the browser) so one JSON request carries
// everything; 5 MB is ~40k rows of a typical export.
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { importBatch } from "../../db/schema";
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

export default routes;
