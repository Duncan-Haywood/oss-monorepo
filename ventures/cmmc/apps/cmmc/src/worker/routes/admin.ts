// OWNER: platform admin API — /api/admin/* (mounted after sessionMiddleware). Cross-tenant METADATA
// for the owner: sign-ups, orgs, trials, plans, MRR from recorded Paddle prices, cancellations,
// failed payments. Never tenant content. Gate + audit: middleware/platform-admin.ts. Contract:
// packages/admin-metrics (read by the owner console, apps/admin).
import { ADMIN_ACCOUNT_LISTS } from "@admin-metrics";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import {
  assertCanReadAccounts,
  auditAdmin,
  requirePlatformAdmin,
} from "../middleware/platform-admin";
import { accountList, productMetrics } from "../services/admin/metrics";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
routes.use("*", requirePlatformAdmin);
// Never cached anywhere: these answers carry customer names and emails.
routes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

const metricsQuery = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) });

routes.get("/metrics", validate("query", metricsQuery), async (c) => {
  const { days } = c.req.valid("query");
  const body = await productMetrics(c.var.ctx, days);
  await auditAdmin(c, "metrics_read", { days });
  return c.json(body);
});

const accountsQuery = z.object({
  list: z.enum(ADMIN_ACCOUNT_LISTS).default("recent"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

routes.get("/accounts", validate("query", accountsQuery), async (c) => {
  assertCanReadAccounts(c);
  const { list, limit } = c.req.valid("query");
  const body = await accountList(c.var.ctx, list, limit);
  await auditAdmin(c, "accounts_read", { list, limit, returned: body.items.length });
  return c.json(body);
});

export default routes;
