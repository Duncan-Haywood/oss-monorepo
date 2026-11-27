import type { MeDto } from "@shared/api/types";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest, unauthorized } from "../lib/errors";
import { validate } from "../lib/validate";
import { acceptInvitation, declineInvitation, listMyInvitations } from "../services/invitations";
import { acceptLegal, legalStatus } from "../services/legal";
import { listMemberships } from "../services/orgs";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  const body: MeDto = {
    user: { id: user.id, email: user.email, name: user.name },
    memberships: await listMemberships(c.var.ctx, user.id),
    legal: await legalStatus(c.var.ctx, user.id),
  };
  return c.json(body);
});

const acceptBody = z.object({ version: z.string().min(1).max(20) });

/** Accept the current Terms, Privacy, Refund and Acceptable Use documents (the version shown). */
routes.post("/legal/accept", validate("json", acceptBody), async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  const { version } = c.req.valid("json");
  const status = await acceptLegal(c.var.ctx, user.id, version);
  if (!status)
    throw badRequest(
      "These documents have changed since you opened them. Reload and read the current version.",
    );
  return c.json(status);
});

/** Invitations to my verified email address (empty until the address is verified). */
routes.get("/invitations", async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  return c.json({ items: await listMyInvitations(c.var.ctx, user) });
});

routes.post("/invitations/:invitationId/accept", async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  return c.json(await acceptInvitation(c.var.ctx, user, c.req.param("invitationId")));
});

routes.post("/invitations/:invitationId/decline", async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  await declineInvitation(c.var.ctx, user, c.req.param("invitationId"));
  return c.json({ ok: true });
});

export default routes;
