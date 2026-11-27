import type { MeDto } from "@shared/api/types";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest, unauthorized } from "../lib/errors";
import { validate } from "../lib/validate";
import { acceptInvitation, declineInvitation, listMyInvitations } from "../services/invitations";
import { acceptLegal, legalStatus } from "../services/legal";
import { listMemberships } from "../services/orgs";
import { recordSignupSource } from "../services/signup-source";
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

const sourceBody = z.object({ source: z.string().min(1).max(200) });

/**
 * Which of our pages sent this account (the "Start free" link's `from`), posted once by the browser
 * after the first sign-in. Answers 200 either way ({ recorded: false, reason } when the account is
 * not new or already has one); a value that is not one of our page names in shape is a 400.
 */
routes.post("/signup-source", validate("json", sourceBody), async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  const result = await recordSignupSource(c.var.ctx, user.id, c.req.valid("json").source);
  if (!result.recorded && result.reason === "invalid") throw badRequest("Not a page name.");
  return c.json(result);
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
