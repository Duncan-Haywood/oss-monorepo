// OWNER: billing agent — POST /api/billing/webhook (merchant-of-record events, signature verified)
// Unauthenticated + outside the Origin check: trust comes only from the provider signature. Even a
// signed event never names its org directly: services/billing/webhooks.ts binds it from our own
// signed checkout token or an existing subscription (crafted custom_data is ignored).
import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { WebhookSignatureError } from "../ports/billing/crypto";
import { applyBillingEvent } from "../services/billing/webhooks";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.post("/", async (c) => {
  const ctx = c.var.ctx;
  const provider = ctx.billing;
  if (!provider) throw new AppError(503, "billing_unavailable", "Billing is not configured");
  let event: Awaited<ReturnType<typeof provider.parseWebhook>>;
  try {
    event = await provider.parseWebhook(c.req.raw);
  } catch (e) {
    ctx.logger.warn("billing.webhook_rejected", {
      provider: provider.name,
      reason: e instanceof WebhookSignatureError ? e.message : "parse_error",
    });
    throw new AppError(401, "invalid_signature", "Webhook signature verification failed");
  }
  if (!event.providerEventId) throw new AppError(400, "bad_request", "Event id missing");
  const result = await applyBillingEvent(ctx, provider.name, event);
  ctx.logger.info("billing.webhook", {
    provider: provider.name,
    type: event.type,
    outcome: result.outcome,
    ...(result.outcome === "ignored" ? { reason: result.reason } : {}),
  });
  return c.json({ received: true, outcome: result.outcome });
});

export default routes;
