import { addMemberSchema, inviteMemberSchema, updateMemberSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { cancelInvitation, createInvitation, listInvitations } from "../../services/invitations";
import { addMember, changeMemberRole, listMembers, removeMember } from "../../services/orgs";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => c.json({ items: await listMembers(c.var.ctx, c.var.tenant.orgId) }));

routes.post("/", requireRole("admin"), validate("json", addMemberSchema), async (c) => {
  const { email, role } = c.req.valid("json");
  return c.json(await addMember(c.var.ctx, c.var.tenant, email, role), 201);
});

// Invitations (admins): anyone by email, with or without an account. Registered before /:memberId.
routes.get("/invitations", requireRole("admin"), async (c) =>
  c.json({ items: await listInvitations(c.var.ctx, c.var.tenant.orgId) }),
);

routes.post("/invitations", requireRole("admin"), validate("json", inviteMemberSchema), async (c) =>
  c.json(await createInvitation(c.var.ctx, c.var.tenant, c.req.valid("json")), 201),
);

routes.delete("/invitations/:invitationId", requireRole("admin"), async (c) => {
  await cancelInvitation(c.var.ctx, c.var.tenant, c.req.param("invitationId"));
  return c.json({ ok: true });
});

routes.patch(
  "/:memberId",
  requireRole("admin"),
  validate("json", updateMemberSchema),
  async (c) => {
    await changeMemberRole(
      c.var.ctx,
      c.var.tenant,
      c.req.param("memberId"),
      c.req.valid("json").role,
    );
    return c.json({ ok: true });
  },
);

routes.delete("/:memberId", requireRole("admin"), async (c) => {
  await removeMember(c.var.ctx, c.var.tenant, c.req.param("memberId"));
  return c.json({ ok: true });
});

export default routes;
