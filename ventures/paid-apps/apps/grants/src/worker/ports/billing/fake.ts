// Deterministic billing provider for tests and the offline demo (FAKE_EXTERNALS=true).
// Unlike ports/fakes.ts' FakeBillingProvider it VERIFIES webhook signatures, so the webhook route's
// rejection path is exercised in tests: header `x-fake-signature: <hex HMAC-SHA256(secret, body)>`.
import type { BillingProvider, BillingWebhookEvent, CheckoutRequest } from "../billing-provider";
import { CHECKOUT_TOKEN_KEY } from "./checkout-token";
import { hmacSha256Hex, PromoCodeError, timingSafeEqual, WebhookSignatureError } from "./crypto";

export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret";
export const FAKE_SIGNATURE_HEADER = "x-fake-signature";
/** Promo codes the fake accepts (anything else is rejected like an unknown Paddle discount). */
export const FAKE_PROMO_CODES = ["PILOT50", "NONPROFIT10"];

export const signFakeWebhook = (body: string, secret = FAKE_WEBHOOK_SECRET) =>
  hmacSha256Hex(secret, body);

interface FakeWebhookBody {
  providerEventId?: string;
  type?: string;
  occurredAt?: string | null;
  /** Mirrors Paddle's data.custom_data: only `checkoutToken` is read; anything else is ignored. */
  customData?: Record<string, unknown> | null;
  providerSubscriptionId?: string | null;
  subscription?: {
    planKey: string;
    status: NonNullable<BillingWebhookEvent["subscription"]>["status"];
    providerCustomerId: string;
    providerSubscriptionId: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  };
}

export class SignedFakeBillingProvider implements BillingProvider {
  readonly name = "fake";
  constructor(private readonly secret = FAKE_WEBHOOK_SECRET) {}

  async createCheckout(req: CheckoutRequest) {
    if (req.promoCode && !FAKE_PROMO_CODES.includes(req.promoCode.toUpperCase())) {
      throw new PromoCodeError(req.promoCode);
    }
    const sep = req.successUrl.includes("?") ? "&" : "?";
    const promo = req.promoCode ? `&promo=${encodeURIComponent(req.promoCode)}` : "";
    return {
      url: `${req.successUrl}${sep}fake_checkout=${encodeURIComponent(req.planKey)}${promo}`,
    };
  }

  async createPortalSession(_providerCustomerId: string, returnUrl: string) {
    const sep = returnUrl.includes("?") ? "&" : "?";
    return { url: `${returnUrl}${sep}fake_portal=1` };
  }

  async parseWebhook(request: Request): Promise<BillingWebhookEvent> {
    const sig = request.headers.get(FAKE_SIGNATURE_HEADER)?.toLowerCase();
    const body = await request.text();
    if (!sig) throw new WebhookSignatureError("Missing signature");
    if (!timingSafeEqual(sig, await hmacSha256Hex(this.secret, body))) {
      throw new WebhookSignatureError();
    }
    let parsed: FakeWebhookBody;
    try {
      parsed = JSON.parse(body) as FakeWebhookBody;
    } catch {
      throw new WebhookSignatureError("Webhook body is not JSON");
    }
    const s = parsed.subscription;
    const token = parsed.customData?.[CHECKOUT_TOKEN_KEY];
    const occurredAt = parsed.occurredAt ? new Date(parsed.occurredAt) : null;
    return {
      providerEventId: parsed.providerEventId ?? "",
      type: parsed.type ?? "subscription.updated",
      occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
      checkoutToken: typeof token === "string" && token ? token : null,
      providerSubscriptionId: s?.providerSubscriptionId ?? parsed.providerSubscriptionId ?? null,
      subscription: s
        ? {
            planKey: s.planKey,
            status: s.status,
            providerCustomerId: s.providerCustomerId,
            providerSubscriptionId: s.providerSubscriptionId,
            currentPeriodStart: s.currentPeriodStart ? new Date(s.currentPeriodStart) : null,
            currentPeriodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
          }
        : undefined,
      raw: parsed as Record<string, unknown>,
    };
  }
}
