// OWNER: billing agent — /api/orgs/:orgId/billing (plan, usage, checkout, portal)
//   GET  /          viewer+  -> BillingOverviewDto (graceUntil: past_due grace banner)
//   POST /checkout  admin+   { planKey, promoCode?, interval? } -> { url }
//                            records a pending_checkouts row; the provider gets only its signed token
//   POST /portal    admin+   -> { url }

import { addMonthsUtc } from "@shared/billing/period";
import { checkoutPriceKey, PAID_PLAN_KEYS, PLAN_LIST } from "@shared/billing/plans";
import type { BillingOverviewDto } from "@shared/billing/types";
import { Hono } from "hono";
import { z } from "zod";
import { AppError, badRequest, conflict, unauthorized } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { PromoCodeError } from "../../ports/billing/crypto";
import { getEntitlement, getUsageSummary } from "../../services/billing";
import { consumePendingCheckout, createPendingCheckout } from "../../services/billing/checkout";
import { upsertProviderSubscription } from "../../services/billing/webhooks";
import { audit } from "../../services/privacy/audit";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const checkoutSchema = z.object({
  planKey: z.enum(PAID_PLAN_KEYS),
  promoCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Promo codes contain only letters, numbers, - and _")
    .optional(),
  interval: z.enum(["month", "year"]).default("month"),
});

const unavailable = () =>
  new AppError(503, "billing_unavailable", "Online billing is not configured yet");

const billingPageUrl = (appUrl: string, orgId: string) =>
  `${appUrl.replace(/\/$/, "")}/orgs/${orgId}/settings/billing`;

routes.get("/", async (c) => {
  const ctx = c.var.ctx;
  const { orgId } = c.var.tenant;
  const [ent, usage] = await Promise.all([getEntitlement(ctx, orgId), getUsageSummary(ctx, orgId)]);
  const body = {
    subscription: ent.subscription,
    plan: ent.plan,
    status: ent.status,
    active: ent.active,
    graceUntil: ent.graceUntil,
    usage,
    plans: PLAN_LIST.filter((p) => p.purchasable),
    provider: ctx.billing?.name ?? null,
  };
  // Dates serialize to ISO strings, matching SubscriptionDto.
  return c.json(body as unknown as BillingOverviewDto);
});

routes.post("/checkout", requireRole("admin"), validate("json", checkoutSchema), async (c) => {
  const ctx = c.var.ctx;
  const { orgId, userId } = c.var.tenant;
  const user = c.var.user;
  if (!user) throw unauthorized();
  const provider = ctx.billing;
  if (!provider) throw unavailable();
  const { planKey, promoCode, interval } = c.req.valid("json");
  const fake = provider.name === "fake";

  const ent = await getEntitlement(ctx, orgId);
  const sub = ent.subscription;
  if (
    !fake &&
    sub?.providerSubscriptionId &&
    ["active", "trialing", "past_due", "paused"].includes(sub.status)
  ) {
    throw conflict(
      "This organization already has a subscription. Use the billing portal to change plans.",
    );
  }

  const page = billingPageUrl(ctx.env.APP_URL, orgId);
  // The webhook binds the subscription to this org only through this server-side row's token.
  const pending = await createPendingCheckout(ctx, {
    orgId,
    planKey,
    interval,
    createdBy: userId,
  });
  let url: string;
  try {
    ({ url } = await provider.createCheckout({
      checkoutToken: pending.token,
      planKey: checkoutPriceKey(planKey, interval),
      customerEmail: user.email,
      successUrl: `${page}?checkout=success`,
      cancelUrl: `${page}?checkout=canceled`,
      promoCode,
      providerCustomerId: sub?.providerCustomerId ?? null,
    }));
  } catch (e) {
    if (e instanceof PromoCodeError) throw badRequest(e.message);
    throw e;
  }

  if (fake && ctx.env.FAKE_EXTERNALS === "true") {
    // Offline demo: no real checkout page exists, so activate the plan as if the webhook arrived.
    const now = ctx.now();
    const providerSubscriptionId = newId("sub").replace("sub_", "fake_sub_");
    await consumePendingCheckout(ctx, pending.id, orgId, providerSubscriptionId);
    await upsertProviderSubscription(
      ctx,
      orgId,
      provider.name,
      {
        planKey,
        status: "active",
        providerCustomerId: sub?.providerCustomerId ?? `fake_ctm_${orgId}`,
        providerSubscriptionId,
        currentPeriodStart: now,
        currentPeriodEnd: addMonthsUtc(now, interval === "year" ? 12 : 1),
        cancelAtPeriodEnd: false,
      },
      { simulated: true, promoCode: promoCode ?? null, interval },
      { providerUpdatedAt: now, pastDueSince: null },
    );
  }

  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    action: "billing.checkout_started",
    targetType: "subscription",
    targetId: orgId,
    metadata: {
      planKey,
      interval,
      promoCode: promoCode ?? null,
      provider: provider.name,
      checkoutId: pending.id,
    },
    requestId: c.var.requestId,
  });
  return c.json({ url });
});

routes.post("/portal", requireRole("admin"), async (c) => {
  const ctx = c.var.ctx;
  const { orgId, userId } = c.var.tenant;
  const provider = ctx.billing;
  if (!provider) throw unavailable();
  const ent = await getEntitlement(ctx, orgId);
  const customerId = ent.subscription?.providerCustomerId;
  if (!customerId) throw badRequest("This organization has no paid subscription to manage.");
  const { url } = await provider.createPortalSession(
    customerId,
    billingPageUrl(ctx.env.APP_URL, orgId),
  );
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    action: "billing.portal_opened",
    targetType: "subscription",
    targetId: orgId,
    requestId: c.var.requestId,
  });
  return c.json({ url });
});

export default routes;
