// OWNER: auth agent — /api/orgs/:orgId/members, /invitations

import { MEMBER_ROLES } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  changeMemberRole,
  createInvitation,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
} from "../../services/auth";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(MEMBER_ROLES).default("viewer"),
});
const roleSchema = z.object({ role: z.enum(MEMBER_ROLES) });

routes.get("/", async (c) => {
  return c.json({ items: await listMembers(c.var.ctx, c.var.tenant.orgId) });
});

// Invitation routes are registered before "/:memberId" so "invitations" is never read as an id.
routes.get("/invitations", async (c) => {
  return c.json({ items: await listInvitations(c.var.ctx, c.var.tenant.orgId) });
});

routes.post("/invitations", requireRole("admin"), validate("json", inviteSchema), async (c) => {
  const inv = await createInvitation(c.var.ctx, c.var.tenant, c.req.valid("json"), c.var.requestId);
  return c.json(inv, 201);
});

routes.delete("/invitations/:id", requireRole("admin"), async (c) => {
  await revokeInvitation(c.var.ctx, c.var.tenant, c.req.param("id"), c.var.requestId);
  return c.json({ ok: true });
});

routes.patch("/:memberId", requireRole("admin"), validate("json", roleSchema), async (c) => {
  const updated = await changeMemberRole(
    c.var.ctx,
    c.var.tenant,
    c.req.param("memberId"),
    c.req.valid("json").role,
    c.var.requestId,
  );
  return c.json(updated);
});

routes.delete("/:memberId", requireRole("admin"), async (c) => {
  await removeMember(c.var.ctx, c.var.tenant, c.req.param("memberId"), c.var.requestId);
  return c.json({ ok: true });
});

export default routes;
