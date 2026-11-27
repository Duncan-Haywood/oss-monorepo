// The Terms bind before any use of the books, on the server as well as in the browser.
// The client shows the "Before you continue" card (client/routes/legal.tsx), but a script or an
// older tab can call the API directly, so every shop route and creating a shop also check that the
// signed-in user accepted the current POLICY_VERSION (routes/me.ts records it). Exempt on purpose:
// /api/me (it reports the status and takes the acceptance), the public legal documents, sign-in,
// accepting an invitation (the invitee is asked for the terms on first opening the shop), the
// Paddle webhook and the platform admin API.
import { createMiddleware } from "hono/factory";
import { termsNotAccepted, unauthorized } from "../lib/errors";
import { legalStatus } from "../services/legal";
import type { AppEnv } from "../types";

export const requireCurrentTerms = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  const status = await legalStatus(c.var.ctx, user.id);
  if (!status.acceptedAt) throw termsNotAccepted(status.version);
  await next();
});
