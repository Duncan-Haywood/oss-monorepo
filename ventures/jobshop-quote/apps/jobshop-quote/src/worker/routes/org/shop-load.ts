// Shop load and lead time. Mounted under /api/orgs/:orgId behind requireOrg("viewer"): any member
// reads the load and a quote's lead time; estimators save a won quote's job; admins set a
// machine's hours a day (it is rate-card data).
import { machineHoursSchema, shopJobSchema } from "@shared/api";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  getQuoteJob,
  getQuoteLeadTime,
  getShopLoad,
  saveQuoteJob,
  setMachineHours,
} from "../../services/quotes/shop-load";
import type { AppEnv } from "../../types";

export const shopLoadRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await getShopLoad(c.var.ctx, c.var.tenant.orgId)))
  .put(
    "/machines/:machineId",
    requireRole("admin"),
    validate("json", machineHoursSchema),
    async (c) =>
      c.json(
        await setMachineHours(
          c.var.ctx,
          c.var.tenant.orgId,
          c.req.param("machineId"),
          c.req.valid("json").hoursPerDay,
        ),
      ),
  );

/** Mounted under /quotes, beside the quote routes. */
export const quoteJobRoutes = new Hono<AppEnv>()
  .get("/:quoteId/lead-time", async (c) =>
    c.json(await getQuoteLeadTime(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  .get("/:quoteId/job", async (c) =>
    c.json(await getQuoteJob(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  .put("/:quoteId/job", requireRole("estimator"), validate("json", shopJobSchema), async (c) => {
    const t = c.var.tenant;
    return c.json(
      await saveQuoteJob(c.var.ctx, t.orgId, t.userId, c.req.param("quoteId"), c.req.valid("json")),
    );
  });
