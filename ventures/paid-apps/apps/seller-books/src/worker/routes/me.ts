// The signed-in user, their memberships, and whether they accepted the current legal documents
// (the documents themselves are public at /api/legal, routes/legal.ts).
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { member, organization } from "../db/schema";
import { badRequest } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireUser } from "../middleware/session";
import { acceptLegal, legalStatus } from "../services/legal";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
routes.use("*", requireUser);

routes.get("/", async (c) => {
  const user = c.var.user;
  if (!user) throw new Error("unreachable");
  const memberships = await c.var.ctx.db
    .select({ orgId: organization.id, orgName: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, user.id));
  return c.json({ user, memberships, legal: await legalStatus(c.var.ctx, user.id) });
});

const acceptLegalSchema = z.object({ version: z.string().min(1).max(20) });

/** Accept the current Terms, Privacy, Refund and Acceptable Use documents (the version shown). */
routes.post("/legal/accept", validate("json", acceptLegalSchema), async (c) => {
  const user = c.var.user;
  if (!user) throw new Error("unreachable");
  const status = await acceptLegal(c.var.ctx, user.id, c.req.valid("json").version);
  if (!status)
    throw badRequest(
      "These documents have changed since you opened them. Reload and read the current version.",
    );
  return c.json(status);
});

export default routes;
