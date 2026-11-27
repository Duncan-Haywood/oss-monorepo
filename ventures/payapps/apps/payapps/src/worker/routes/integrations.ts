// /api/integrations/quickbooks/callback — Intuit redirects the admin's browser here after consent.
// Behind the session middleware: the state must belong to the signed-in user (services/quickbooks.ts).
import { Hono } from "hono";
import { finishConnect } from "../services/quickbooks";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.get("/quickbooks/callback", async (c) => {
  const user = c.var.user;
  if (!user) return c.redirect("/?quickbooks=signin", 302);
  const r = await finishConnect(c.var.ctx, user.id, c.req.url);
  const q = r.ok ? "connected=1" : `error=${encodeURIComponent(r.reason)}`;
  return c.redirect(
    r.orgId ? `/orgs/${encodeURIComponent(r.orgId)}/quickbooks?${q}` : `/?quickbooks_${q}`,
    302,
  );
});

export default routes;
