// OWNER: updates — /api/orgs/:orgId/updates (quick updates + check-in status)
import { INPUT_MODES } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createQuickUpdate,
  getQuickUpdate,
  getUpdateStatus,
  MAX_UPDATE_CHARS,
} from "../../services/updates";
import type { AppEnv } from "../../types";

const CreateBody = z.object({
  text: z.string().trim().min(3).max(MAX_UPDATE_CHARS),
  inputMode: z.enum(INPUT_MODES).default("text"),
});

const routes = new Hono<AppEnv>()
  .get("/status", async (c) => c.json(await getUpdateStatus(c.var.ctx, c.var.tenant.orgId)))
  .post("/", requireRole("editor"), validate("json", CreateBody), async (c) => {
    const body = c.req.valid("json");
    const result = await createQuickUpdate(c.var.ctx, c.var.tenant.orgId, {
      text: body.text,
      inputMode: body.inputMode,
      userId: c.var.tenant.userId,
      requestId: c.var.requestId,
    });
    return c.json(result, 201);
  })
  .get("/:documentId", async (c) =>
    c.json(await getQuickUpdate(c.var.ctx, c.var.tenant.orgId, c.req.param("documentId"))),
  );

export default routes;
