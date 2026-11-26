// OWNER: retrieval agent — /api/orgs/:orgId/search (semantic + keyword search over the knowledge base)

import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { DEFAULT_TOP_K, retrieveChunks } from "../../services/retrieval";
import type { AppEnv } from "../../types";

const searchBody = z.object({
  query: z.string().trim().min(1).max(500),
  topK: z.number().int().min(1).max(20).optional(),
});

const routes = new Hono<AppEnv>();

routes.post("/", validate("json", searchBody), async (c) => {
  const { query, topK } = c.req.valid("json");
  const items = await retrieveChunks(c.var.ctx, c.var.tenant.orgId, query, {
    topK: topK ?? DEFAULT_TOP_K,
  });
  return c.json({ items });
});

export default routes;
