// /api/orgs/:orgId/quickbooks — connection status (any member); connect and disconnect (admins).

import {
  quickbooksAutoPaymentsSchema,
  quickbooksInvoiceItemSchema,
  quickbooksJobTrackingSchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  disconnect,
  listInvoiceItems,
  listLineItems,
  quickbooksStatus,
  quickbooksTracking,
  setAutoSendPayments,
  setInvoiceItem,
  setJobInvoiceItem,
  setJobTracking,
  setLineInvoiceItem,
  startConnect,
  unsentPayments,
} from "../../services/quickbooks";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => c.json(await quickbooksStatus(c.var.ctx, c.var.tenant.orgId)));

// Payments on invoices already in QuickBooks that are not there yet (any member; the cash report
// lists them, and sending goes through the pay application's own route, editors only).
routes.get("/unsent-payments", async (c) =>
  c.json(await unsentPayments(c.var.ctx, c.var.tenant.orgId)),
);

routes.post("/connect", requireRole("admin"), async (c) =>
  c.json(await startConnect(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId)),
);

// The item work lines are billed with (docs/QUICKBOOKS.md, "Your own item").
routes.get("/items", requireRole("admin"), async (c) =>
  c.json(await listInvoiceItems(c.var.ctx, c.var.tenant.orgId)),
);

routes.put(
  "/invoice-item",
  requireRole("admin"),
  validate("json", quickbooksInvoiceItemSchema),
  async (c) =>
    c.json(await setInvoiceItem(c.var.ctx, c.var.tenant.orgId, c.req.valid("json").itemId)),
);

// One job's own item, when it differs from the company's (docs/QUICKBOOKS.md, "An item per job").
routes.put(
  "/job-items/:projectId",
  requireRole("admin"),
  validate("json", quickbooksInvoiceItemSchema),
  async (c) =>
    c.json(
      await setJobInvoiceItem(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("projectId"),
        c.req.valid("json").itemId,
      ),
    ),
);

// One job's schedule-of-values lines, each with its own item when it has one (docs/QUICKBOOKS.md,
// "An item per line").
routes.get("/job-items/:projectId/lines", requireRole("admin"), async (c) =>
  c.json(await listLineItems(c.var.ctx, c.var.tenant.orgId, c.req.param("projectId"))),
);

routes.put(
  "/job-items/:projectId/lines/:sovLineId",
  requireRole("admin"),
  validate("json", quickbooksInvoiceItemSchema),
  async (c) =>
    c.json(
      await setLineInvoiceItem(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("projectId"),
        c.req.param("sovLineId"),
        c.req.valid("json").itemId,
      ),
    ),
);

// Class and location per job, for QuickBooks Plus and Advanced (docs/QUICKBOOKS.md, "Class and
// location per job").
routes.get("/tracking", requireRole("admin"), async (c) =>
  c.json(await quickbooksTracking(c.var.ctx, c.var.tenant.orgId)),
);

routes.put(
  "/tracking/:projectId",
  requireRole("admin"),
  validate("json", quickbooksJobTrackingSchema),
  async (c) =>
    c.json(
      await setJobTracking(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("projectId"),
        c.req.valid("json"),
      ),
    ),
);

// Send each payment to QuickBooks as it is recorded (docs/QUICKBOOKS.md, "Payments").
routes.put(
  "/auto-payments",
  requireRole("admin"),
  validate("json", quickbooksAutoPaymentsSchema),
  async (c) =>
    c.json(await setAutoSendPayments(c.var.ctx, c.var.tenant.orgId, c.req.valid("json").enabled)),
);

routes.delete("/", requireRole("admin"), async (c) => {
  await disconnect(c.var.ctx, c.var.tenant.orgId);
  return c.json(await quickbooksStatus(c.var.ctx, c.var.tenant.orgId));
});

export default routes;
