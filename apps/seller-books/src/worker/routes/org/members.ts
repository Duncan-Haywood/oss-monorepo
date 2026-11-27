// Members and invitations. An invitation returns a one-time link to share (no email provider yet); only
// the token's SHA-256 is stored.
import { MEMBER_ROLES } from "@shared/enums";
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { invitation, member, user } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId, randomToken, sha256Hex } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { assertSeat } from "../../services/billing/service";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const assignable = z.enum(
  MEMBER_ROLES.filter((r) => r !== "owner") as ["admin", "editor", "viewer"],
);

routes.get("/", async (c) => {
  const { orgId } = c.var.tenant;
  const items = await c.var.ctx.db
    .select({
      id: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId));
  return c.json({ items });
});

routes.post(
  "/invitations",
  requireRole("admin"),
  validate("json", z.object({ email: z.email().max(254), role: assignable })),
  async (c) => {
    const { orgId, userId } = c.var.tenant;
    const { email, role } = c.req.valid("json");
    await assertSeat(c.var.ctx, orgId, { countPending: true });
    const token = randomToken();
    const id = newId("inv");
    await c.var.ctx.db.insert(invitation).values({
      id,
      organizationId: orgId,
      email: email.toLowerCase(),
      role,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(c.var.ctx.now().getTime() + INVITE_TTL_MS),
      inviterId: userId,
    });
    const url = `${c.env.APP_URL.replace(/\/+$/, "")}/invite?token=${token}`;
    return c.json({ id, url }, 201);
  },
);

routes.get("/invitations", requireRole("admin"), async (c) => {
  const { orgId } = c.var.tenant;
  const items = await c.var.ctx.db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending")));
  return c.json({ items });
});

routes.delete("/invitations/:id", requireRole("admin"), async (c) => {
  const { orgId } = c.var.tenant;
  const res = await c.var.ctx.db
    .update(invitation)
    .set({ status: "revoked" })
    .where(and(eq(invitation.id, c.req.param("id")), eq(invitation.organizationId, orgId)))
    .returning({ id: invitation.id });
  if (res.length === 0) throw notFound("Invitation");
  return c.json({ ok: true });
});

routes.patch(
  "/:memberId",
  requireRole("admin"),
  validate("json", z.object({ role: assignable })),
  async (c) => {
    const { orgId } = c.var.tenant;
    const res = await c.var.ctx.db
      .update(member)
      .set({ role: c.req.valid("json").role })
      .where(
        and(
          eq(member.id, c.req.param("memberId")),
          eq(member.organizationId, orgId),
          ne(member.role, "owner"),
        ),
      )
      .returning({ id: member.id });
    if (res.length === 0) throw notFound("Member");
    return c.json({ ok: true });
  },
);

routes.delete("/:memberId", requireRole("admin"), async (c) => {
  const { orgId } = c.var.tenant;
  const target = await c.var.ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.id, c.req.param("memberId")), eq(member.organizationId, orgId)))
    .get();
  if (!target) throw notFound("Member");
  if (target.role === "owner") throw badRequest("The owner cannot be removed.");
  await c.var.ctx.db
    .delete(member)
    .where(and(eq(member.id, c.req.param("memberId")), eq(member.organizationId, orgId)));
  return c.json({ ok: true });
});

export default routes;
