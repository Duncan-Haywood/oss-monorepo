// Public billing routes: the plan list (pricing page) and the provider webhook. The webhook is
// unauthenticated by design; the provider's signature is the authentication (services/billing.ts).
import { PUBLIC_PLANS } from "@shared/plans";
import { Hono } from "hono";
import { handleWebhook, InvalidWebhookError, publicPlan } from "../services/billing/service";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.get("/plans", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ items: PUBLIC_PLANS.map(publicPlan) });
});

routes.post("/webhook", async (c) => {
  try {
    // Always 200 once verified (applied / duplicate / ignored) so the provider stops retrying.
    return c.json(await handleWebhook(c.var.ctx, c.req.raw));
  } catch (e) {
    if (e instanceof InvalidWebhookError) {
      return c.json({ error: { code: "bad_signature", message: "Invalid webhook" } }, 401);
    }
    throw e;
  }
});

export default routes;
