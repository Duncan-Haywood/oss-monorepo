// /api/orgs/:orgId/projects/:projectId/job-cost/quickbooks — job costs read from QuickBooks
// (services/payapps/job-cost-qbo.ts, docs/QUICKBOOKS.md "Job costs from QuickBooks"). Every member
// sees whether the job is linked; editors on Crew and up pick the customer (or class), read and import lines
// (bills, checks, card charges and vendor credits as costs; purchase orders as commitments).
import {
  jobCostQboImportSchema,
  jobCostQboLinkSchema,
  jobCostQboWindowSchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { assertJobCosting } from "../../services/billing";
import {
  importQboCosts,
  importQboPurchaseOrders,
  jobCostQuickBooks,
  listCostClasses,
  listCostCustomers,
  qboCostLines,
  qboPurchaseOrderLines,
  setCostLink,
} from "../../services/payapps/job-cost-qbo";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

routes.get("/", async (c) =>
  c.json(await jobCostQuickBooks(c.var.ctx, c.var.tenant.orgId, projectId(c))),
);

routes.get("/customers", editor, async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  return c.json({ customers: await listCostCustomers(c.var.ctx, c.var.tenant.orgId) });
});

routes.get("/classes", editor, async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  return c.json(await listCostClasses(c.var.ctx, c.var.tenant.orgId, projectId(c)));
});

routes.put("/link", editor, validate("json", jobCostQboLinkSchema), async (c) =>
  c.json(await setCostLink(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json"))),
);

routes.get("/lines", editor, validate("query", jobCostQboWindowSchema), async (c) =>
  c.json(await qboCostLines(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("query"))),
);

routes.post("/import", editor, validate("json", jobCostQboImportSchema), async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  return c.json(await importQboCosts(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json")));
});

// Purchase orders tagged to the job's customer, imported as commitments.
routes.get("/purchase-orders", editor, validate("query", jobCostQboWindowSchema), async (c) =>
  c.json(
    await qboPurchaseOrderLines(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("query")),
  ),
);

routes.post(
  "/purchase-orders/import",
  editor,
  validate("json", jobCostQboImportSchema),
  async (c) => {
    await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
    return c.json(
      await importQboPurchaseOrders(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json")),
    );
  },
);

export default routes;
