// Accept an invitation link (signed-in user whose email matches the invitation).
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { invitation, member } from "../db/schema";
import { conflict, forbidden, notFound } from "../lib/errors";
import { newId, sha256Hex } from "../lib/ids";
import { validate } from "../lib/validate";
import { requireUser } from "../middleware/session";
import { assertSeat } from "../services/billing/service";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
routes.use("*", requireUser);

routes.post(
  "/accept",
  validate("json", z.object({ token: z.string().min(20).max(200) })),
  async (c) => {
    const user = c.var.user;
    if (!user) throw new Error("unreachable");
    const db = c.var.ctx.db;
    const inv = await db
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, await sha256Hex(c.req.valid("json").token)))
      .get();
    if (inv?.status !== "pending" || inv.expiresAt < c.var.ctx.now()) throw notFound("Invitation");
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw forbidden("This invitation was sent to a different email address.");
    }
    const existing = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, inv.organizationId), eq(member.userId, user.id)))
      .get();
    if (existing) throw conflict("You are already a member of this organization.");
    // The plan may have changed since the invitation was sent (a lapsed Business plan).
    await assertSeat(c.var.ctx, inv.organizationId, { countPending: false });
    await db.batch([
      db.insert(member).values({
        id: newId("mem"),
        organizationId: inv.organizationId,
        userId: user.id,
        role: inv.role,
      }),
      db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, inv.id)),
    ]);
    return c.json({ orgId: inv.organizationId });
  },
);

export default routes;
