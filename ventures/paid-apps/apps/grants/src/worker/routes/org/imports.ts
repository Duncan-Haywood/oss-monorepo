// OWNER: imports — /api/orgs/:orgId/imports (grant URL / RFP import, org website crawl)

import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  importOpportunityFromUrl,
  importRfpFile,
  MAX_CRAWL_PAGES,
  MAX_RFP_BYTES,
  requestWebsiteCrawl,
} from "../../services/imports";
import type { AppEnv } from "../../types";

const urlBody = z.object({ url: z.string().trim().min(4).max(2048) });
const websiteBody = z.object({
  url: z.string().trim().min(4).max(2048),
  maxPages: z.number().int().min(1).max(MAX_CRAWL_PAGES).optional(),
});

const routes = new Hono<AppEnv>();

routes.post("/opportunity-url", requireRole("editor"), validate("json", urlBody), async (c) => {
  const { url } = c.req.valid("json");
  const row = await importOpportunityFromUrl(c.var.ctx, {
    orgId: c.var.tenant.orgId,
    userId: c.var.tenant.userId,
    url,
  });
  return c.json(row, 201);
});

routes.post("/rfp", requireRole("editor"), async (c) => {
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_RFP_BYTES + 1024 * 1024) {
    return c.json(
      { error: { code: "file_too_large", message: "RFP files must be 20 MB or smaller" } },
      413,
    );
  }
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw badRequest("Expected a multipart form with a `file` field");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Missing `file`");
  const row = await importRfpFile(c.var.ctx, {
    orgId: c.var.tenant.orgId,
    userId: c.var.tenant.userId,
    file: { name: file.name, type: file.type, bytes: await file.arrayBuffer() },
  });
  return c.json(row, 201);
});

routes.post("/website", requireRole("admin"), validate("json", websiteBody), async (c) => {
  const { url, maxPages } = c.req.valid("json");
  await requestWebsiteCrawl(c.var.ctx, {
    orgId: c.var.tenant.orgId,
    userId: c.var.tenant.userId,
    url,
    maxPages: maxPages ?? 10,
  });
  return c.json({ queued: true as const }, 202);
});

export default routes;
