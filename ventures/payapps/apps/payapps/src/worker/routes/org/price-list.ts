// /api/orgs/:orgId/price-list: the company's material prices, labor and equipment rates and sub quotes
// reused across estimates (services/payapps/price-list.ts). Every member reads it (estimators pick from
// it); editors add, change, delete and merge. Every plan, like estimates.
import { mergePriceItemsSchema, priceItemSchema, updatePriceItemSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  addPrice,
  deletePrice,
  listPrices,
  mergePrices,
  updatePrice,
} from "../../services/payapps/price-list";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

routes.get("/", async (c) => c.json(await listPrices(c.var.ctx, c.var.tenant.orgId)));

routes.post("/", editor, validate("json", priceItemSchema), async (c) =>
  c.json(await addPrice(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201),
);

routes.post("/merge", editor, validate("json", mergePriceItemsSchema), async (c) =>
  c.json(await mergePrices(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
);

routes.patch("/:itemId", editor, validate("json", updatePriceItemSchema), async (c) =>
  c.json(
    await updatePrice(c.var.ctx, c.var.tenant.orgId, c.req.param("itemId"), c.req.valid("json")),
  ),
);

routes.delete("/:itemId", editor, async (c) => {
  await deletePrice(c.var.ctx, c.var.tenant.orgId, c.req.param("itemId"));
  return c.json({ ok: true });
});

export default routes;
