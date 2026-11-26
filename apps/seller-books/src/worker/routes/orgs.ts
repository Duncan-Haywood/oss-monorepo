// Create / list orgs (a seller's business; several people can share one). Deleting an org removes all
// of its rows (ON DELETE CASCADE from organization).
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { member, organization } from "../db/schema";
import { newId } from "../lib/ids";
import { validate } from "../lib/validate";
import { requireUser } from "../middleware/session";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
routes.use("*", requireUser);

routes.post(
  "/",
  validate("json", z.object({ name: z.string().trim().min(1).max(120) })),
  async (c) => {
    const user = c.var.user;
    if (!user) throw new Error("unreachable");
    const { name } = c.req.valid("json");
    const orgId = newId("org");
    await c.var.ctx.db.batch([
      c.var.ctx.db.insert(organization).values({ id: orgId, name, slug: orgId }),
      c.var.ctx.db
        .insert(member)
        .values({ id: newId("mem"), organizationId: orgId, userId: user.id, role: "owner" }),
    ]);
    return c.json({ orgId }, 201);
  },
);

routes.get("/", async (c) => {
  const user = c.var.user;
  if (!user) throw new Error("unreachable");
  const items = await c.var.ctx.db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, user.id));
  return c.json({ items });
});

export default routes;
