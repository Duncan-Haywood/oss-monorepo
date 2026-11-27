// Members and invitations. An invitation is emailed to the invited address (docs/EMAIL.md) and its
// one-time link is also returned, for the admin to share if the email does not arrive; only the
// token's SHA-256 is stored. Invitation emails are throttled per shop (INVITE_EMAIL_THROTTLE).
import { MEMBER_ROLES } from "@shared/enums";
import { and, eq, gte, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { invitation, member, organization, user } from "../../db/schema";
import { badRequest, conflict, notFound, tooManyRequests } from "../../lib/errors";
import { newId, randomToken, sha256Hex } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { allowSend, invitationEmail } from "../../services/auth/emails";
import { assertSeat } from "../../services/billing/service";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_EMAIL_THROTTLE = { limit: 20, windowMs: 60 * 60 * 1000 };
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
    const ctx = c.var.ctx;
    const { orgId, userId } = c.var.tenant;
    const { role } = c.req.valid("json");
    const email = c.req.valid("json").email.trim().toLowerCase();
    const alreadyMember = await ctx.db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, orgId), eq(user.email, email)))
      .get();
    if (alreadyMember) throw conflict("That person is already a member of this shop.");
    // Re-inviting an address replaces its pending invitation (a new link and a new 7-day clock), so
    // a lost email can be sent again without using up a seat.
    const previous = await ctx.db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, orgId),
          eq(invitation.email, email),
          eq(invitation.status, "pending"),
          gte(invitation.expiresAt, ctx.now()),
        ),
      )
      .all();
    await assertSeat(ctx, orgId, { countPending: true, replacing: previous.length });
    // Refused before anything is created, so a shop account cannot be used to mail strangers in bulk.
    const { limit, windowMs } = INVITE_EMAIL_THROTTLE;
    if (!(await allowSend(ctx, `invite:${orgId}`, limit, windowMs))) {
      ctx.logger.warn("invitation.throttled", { orgId });
      throw tooManyRequests(`A shop can send ${limit} invitations an hour. Try again later.`);
    }
    const token = randomToken();
    const id = newId("inv");
    await ctx.db.batch([
      ctx.db
        .update(invitation)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitation.organizationId, orgId),
            eq(invitation.email, email),
            eq(invitation.status, "pending"),
          ),
        ),
      ctx.db.insert(invitation).values({
        id,
        organizationId: orgId,
        email,
        role,
        tokenHash: await sha256Hex(token),
        expiresAt: new Date(ctx.now().getTime() + INVITE_TTL_MS),
        inviterId: userId,
      }),
    ]);
    const url = `${c.env.APP_URL.replace(/\/+$/, "")}/invite?token=${token}`;

    // The email never decides the answer: the admin still gets the link to share if it fails.
    let emailSent = false;
    try {
      const [org, inviter] = await Promise.all([
        ctx.db
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, orgId))
          .get(),
        ctx.db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get(),
      ]);
      const msg = invitationEmail(
        {
          email,
          orgName: org?.name ?? "a shop",
          inviterName: inviter?.name ?? null,
          role,
          days: Math.round(INVITE_TTL_MS / 86_400_000),
        },
        url,
      );
      await ctx.email.send({ to: [email], subject: msg.subject, text: msg.text, html: msg.html });
      // A fake (tests, offline demo) or log-only sender sends nothing a person will read.
      emailSent = ctx.email.delivers;
    } catch (e) {
      ctx.logger.warn("invitation.email_failed", { orgId, invitationId: id, error: String(e) });
    }
    return c.json({ id, url, emailSent }, 201);
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
