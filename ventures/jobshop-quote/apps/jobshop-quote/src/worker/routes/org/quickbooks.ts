// /api/orgs/:orgId/quickbooks: connection status (any member); connect, disconnect and the item
// invoices are billed with (admins). Sending a won quote is under /quotes/:quoteId/quickbooks
// (routes/org/work.ts).
import { setQuickBooksItemSchema } from "@shared/api";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  disconnect,
  listInvoiceItems,
  quickbooksStatus,
  setInvoiceItem,
  startConnect,
} from "../../services/quickbooks";
import type { AppEnv } from "../../types";

export const quickbooksRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await quickbooksStatus(c.var.ctx, c.var.tenant.orgId)))
  .post("/connect", requireRole("admin"), async (c) =>
    c.json(await startConnect(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId)),
  )
  .delete("/", requireRole("admin"), async (c) => {
    await disconnect(c.var.ctx, c.var.tenant.orgId);
    return c.json(await quickbooksStatus(c.var.ctx, c.var.tenant.orgId));
  })
  .get("/items", requireRole("admin"), async (c) =>
    c.json(await listInvoiceItems(c.var.ctx, c.var.tenant.orgId)),
  )
  .put("/item", requireRole("admin"), validate("json", setQuickBooksItemSchema), async (c) =>
    c.json(await setInvoiceItem(c.var.ctx, c.var.tenant.orgId, c.req.valid("json").itemId)),
  );
