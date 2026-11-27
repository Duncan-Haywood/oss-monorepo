// Deterministic billing provider for tests and offline demos (no network, no Paddle account).
// It VERIFIES webhook signatures, so an app's webhook rejection path is exercised in tests:
// header `x-fake-signature: <hex HMAC-SHA256(secret, rawBody)>` (see signFakeWebhook).
import { CHECKOUT_TOKEN_KEY } from "./checkout-token.ts";
import { hmacSha256Hex, PromoCodeError, timingSafeEqual, WebhookSignatureError } from "./crypto.ts";
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutRequest,
  ProviderSubscriptionStatus,
  SubscriptionPrice,
  UsageChargeRequest,
} from "./provider.ts";

/** Public, test-only secret. Never use it for a real provider. */
export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret";
export const FAKE_SIGNATURE_HEADER = "x-fake-signature";
/** Promo codes the fake accepts by default (anything else is rejected like an unknown discount). */
export const FAKE_PROMO_CODES: readonly string[] = ["PILOT50", "NONPROFIT10"];

export const signFakeWebhook = (body: string, secret = FAKE_WEBHOOK_SECRET) =>
  hmacSha256Hex(secret, body);

/** JSON body the fake's webhook accepts (build it in tests, sign it with signFakeWebhook). */
export interface FakeWebhookBody {
  providerEventId?: string;
  type?: string;
  occurredAt?: string | null;
  /** Mirrors Paddle's data.custom_data: only `checkoutToken` is read; anything else is ignored. */
  customData?: Record<string, unknown> | null;
  providerSubscriptionId?: string | null;
  subscription?: {
    planKey: string;
    status: ProviderSubscriptionStatus;
    providerCustomerId: string;
    providerSubscriptionId: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    /** The billed recurring price, as a real Paddle event would carry it. */
    price?: SubscriptionPrice;
  };
}

/** Builds a signed Request for the fake provider's parseWebhook (tests / demo scripts). */
export async function fakeWebhookRequest(
  url: string,
  body: FakeWebhookBody,
  secret = FAKE_WEBHOOK_SECRET,
): Promise<Request> {
  const raw = JSON.stringify(body);
  return new Request(url, {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw, secret),
    },
  });
}

export interface FakeProviderOptions {
  secret?: string;
  promoCodes?: readonly string[];
}

const toDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export class SignedFakeBillingProvider implements BillingProvider {
  readonly name = "fake";
  private readonly secret: string;
  private readonly promoCodes: readonly string[];

  constructor(opts: FakeProviderOptions | string = {}) {
    const o = typeof opts === "string" ? { secret: opts } : opts;
    this.secret = o.secret || FAKE_WEBHOOK_SECRET;
    this.promoCodes = (o.promoCodes ?? FAKE_PROMO_CODES).map((c) => c.toUpperCase());
  }

  async createCheckout(req: CheckoutRequest) {
    if (req.promoCode && !this.promoCodes.includes(req.promoCode.toUpperCase())) {
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

  /** Usage charges this fake was asked for, in order (tests read them). */
  readonly usageCharges: UsageChargeRequest[] = [];

  async chargeUsage(req: UsageChargeRequest) {
    if (!Number.isSafeInteger(req.amountMinor) || req.amountMinor <= 0) {
      throw new Error("fake: a usage charge needs a positive whole amount");
    }
    this.usageCharges.push({ ...req });
    return { chargeId: `fake_charge_${this.usageCharges.length}` };
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
    const event: BillingWebhookEvent = {
      providerEventId: parsed.providerEventId ?? "",
      type: parsed.type ?? "subscription.updated",
      occurredAt: toDate(parsed.occurredAt),
      checkoutToken: typeof token === "string" && token ? token : null,
      providerSubscriptionId: s?.providerSubscriptionId ?? parsed.providerSubscriptionId ?? null,
      raw: parsed as Record<string, unknown>,
    };
    if (s) {
      event.subscription = {
        planKey: s.planKey,
        status: s.status,
        providerCustomerId: s.providerCustomerId,
        providerSubscriptionId: s.providerSubscriptionId,
        currentPeriodStart: toDate(s.currentPeriodStart),
        currentPeriodEnd: toDate(s.currentPeriodEnd),
        cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
      };
      if (s.price) event.subscription.price = s.price;
    }
    return event;
  }
}
