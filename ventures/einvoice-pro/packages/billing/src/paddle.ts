// Paddle Billing adapter (merchant of record: Paddle is the seller, so it calculates, collects and
// remits sales tax / VAT, issues invoices and handles refunds + chargebacks).
// API: https://developer.paddle.com/api-reference/overview — plain fetch, no SDK.
// Owner setup (Paddle dashboard) is in this package's README ("Paddle setup").
// Sandbox vs live is inferred from the API key prefix (pdl_sdbx_… → sandbox-api.paddle.com).
import { CHECKOUT_TOKEN_KEY } from "./checkout-token.ts";
import { hmacSha256Hex, PromoCodeError, timingSafeEqual, WebhookSignatureError } from "./crypto.ts";
import { parseCheckoutPriceKey } from "./price-keys.ts";
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutRequest,
  ProviderSubscriptionStatus,
  SubscriptionPrice,
  UsageChargeRequest,
} from "./provider.ts";

export const PADDLE_SIGNATURE_HEADER = "paddle-signature";

export interface PaddleOptions {
  apiKey: string;
  webhookSecret: string;
  /** Checkout price key ("starter", "starter:annual", ...) -> Paddle price id (pri_...). */
  priceIds: Record<string, string>;
  /**
   * Purchasable plan keys. When set, a billed price whose key names any other plan yields no
   * subscription data (the event is then ignored by the app).
   */
  planKeys?: readonly string[];
  /** Max clock skew for webhook timestamps (replay protection). Default 300s. */
  toleranceSeconds?: number;
  fetch?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
}

const STATUS_MAP: Record<string, ProviderSubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  paused: "paused",
  canceled: "canceled",
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const INTERVALS = ["day", "week", "month", "year"] as const;
const posInt = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/**
 * The recurring price of a Paddle subscription item, exactly as the webhook reports it
 * (`price.unit_price.amount` in minor units, `price.billing_cycle`, `quantity`), or null when any
 * part is missing or malformed. `discount` is the subscription's `discount` field.
 */
export function paddleSubscriptionPrice(
  item: unknown,
  discount: unknown,
): SubscriptionPrice | null {
  const it = obj(item);
  const price = obj(it.price);
  const unit = obj(price.unit_price);
  const cycle = obj(price.billing_cycle);
  const amount = posInt(unit.amount);
  const currency = str(unit.currency_code)?.toUpperCase() ?? null;
  const interval = INTERVALS.find((i) => i === cycle.interval) ?? null;
  const frequency = posInt(cycle.frequency);
  const quantity = it.quantity === undefined ? 1 : posInt(it.quantity);
  if (amount === null || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  if (!interval || !frequency || quantity === null) return null;
  return {
    unitAmountMinor: amount,
    currency,
    interval,
    frequency,
    quantity,
    discounted: Boolean(discount && typeof discount === "object"),
  };
}

export function paddleBaseUrl(apiKey: string): string {
  return apiKey.startsWith("pdl_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

/**
 * Verifies `Paddle-Signature: ts=<unix>;h1=<hex hmac>` over `${ts}:${rawBody}` (5-minute tolerance by
 * default). Throws WebhookSignatureError when the header is missing/malformed, stale, or no h1 matches.
 */
export async function verifyPaddleSignature(
  header: string | null,
  body: string,
  secret: string,
  opts: { nowMs?: number; toleranceSeconds?: number } = {},
): Promise<void> {
  if (!header) throw new WebhookSignatureError("Missing Paddle-Signature header");
  let ts: string | null = null;
  const h1: string[] = [];
  for (const part of header.split(";")) {
    const [k, v] = part.split("=", 2).map((x) => x.trim());
    if (k === "ts" && v) ts = v;
    if (k === "h1" && v) h1.push(v.toLowerCase());
  }
  if (!ts || !/^\d+$/.test(ts) || h1.length === 0) {
    throw new WebhookSignatureError("Malformed Paddle-Signature header");
  }
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - Number(ts)) > (opts.toleranceSeconds ?? 300)) {
    throw new WebhookSignatureError("Stale webhook timestamp");
  }
  const expected = await hmacSha256Hex(secret, `${ts}:${body}`);
  if (!h1.some((sig) => timingSafeEqual(sig, expected))) throw new WebhookSignatureError();
}

/** Signs a body the way Paddle does (tests, local replays). Returns the Paddle-Signature value. */
export async function signPaddleWebhook(
  body: string,
  secret: string,
  tsSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return `ts=${tsSeconds};h1=${await hmacSha256Hex(secret, `${tsSeconds}:${body}`)}`;
}

export class PaddleBillingProvider implements BillingProvider {
  readonly name = "paddle";
  private readonly opts: PaddleOptions;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: PaddleOptions) {
    this.opts = opts;
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.baseUrl = opts.baseUrl ?? paddleBaseUrl(opts.apiKey);
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Json> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = obj(await res.json().catch(() => ({})));
    if (!res.ok) {
      const err = obj(json.error);
      // Never echo the request (it may carry an email) or the key; path without query + code only.
      throw new Error(
        `Paddle ${method} ${path.split("?")[0]} failed: ${res.status} ${str(err.code) ?? ""}`.trim(),
      );
    }
    return json;
  }

  private async findOrCreateCustomer(email: string): Promise<string> {
    const list = await this.call("GET", `/customers?email=${encodeURIComponent(email)}`);
    const existing = Array.isArray(list.data) ? str(obj(list.data[0]).id) : null;
    if (existing) return existing;
    const created = await this.call("POST", "/customers", { email });
    const id = str(obj(created.data).id);
    if (!id) throw new Error("Paddle: customer creation returned no id");
    return id;
  }

  private async discountIdFor(code: string): Promise<string> {
    const list = await this.call(
      "GET",
      `/discounts?code=${encodeURIComponent(code)}&status=active`,
    );
    const match = (Array.isArray(list.data) ? list.data : [])
      .map(obj)
      .find((d) => str(d.code)?.toLowerCase() === code.toLowerCase());
    const id = match ? str(match.id) : null;
    if (!id) throw new PromoCodeError(code);
    return id;
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string }> {
    const priceId = this.opts.priceIds[req.planKey];
    if (!priceId) throw new Error(`Paddle: no price id configured for ${req.planKey}`);
    const [customerId, discountId] = await Promise.all([
      req.providerCustomerId
        ? Promise.resolve(req.providerCustomerId)
        : this.findOrCreateCustomer(req.customerEmail),
      req.promoCode ? this.discountIdFor(req.promoCode) : Promise.resolve(null),
    ]);
    const txn = await this.call("POST", "/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      customer_id: customerId,
      ...(discountId ? { discount_id: discountId } : {}),
      collection_mode: "automatic",
      // Only the opaque signed token: the org is bound server-side (pending checkouts), and the
      // plan comes from the billed price. Anything else here could be forged by a crafted checkout.
      custom_data: { [CHECKOUT_TOKEN_KEY]: req.checkoutToken },
    });
    const url = str(obj(obj(txn.data).checkout).url);
    if (!url) {
      throw new Error("Paddle: transaction has no checkout url (set a default payment link)");
    }
    return { url };
  }

  async createPortalSession(providerCustomerId: string, _returnUrl: string) {
    const res = await this.call(
      "POST",
      `/customers/${encodeURIComponent(providerCustomerId)}/portal-sessions`,
      {},
    );
    const url = str(obj(obj(obj(res.data).urls).general).overview);
    if (!url) throw new Error("Paddle: portal session has no url");
    return { url };
  }

  /**
   * Metered usage as a one-time charge on the subscription, billed with its next renewal
   * (POST /subscriptions/{id}/charge, effective_from next_billing_period). The item is a non-catalog
   * price on the plan's own catalog product, which is read from the plan's configured price id, so
   * no extra product id is configured. Paddle refuses charges on past_due subscriptions.
   */
  async chargeUsage(req: UsageChargeRequest): Promise<{ chargeId: string | null }> {
    if (!Number.isSafeInteger(req.amountMinor) || req.amountMinor <= 0) {
      throw new Error("Paddle: a usage charge needs a positive whole amount");
    }
    if (!/^[A-Z]{3}$/.test(req.currency)) throw new Error("Paddle: currency must be ISO 4217");
    const priceId = this.opts.priceIds[req.planKey];
    if (!priceId) throw new Error(`Paddle: no price id configured for ${req.planKey}`);
    const price = await this.call("GET", `/prices/${encodeURIComponent(priceId)}`);
    const productId = str(obj(price.data).product_id);
    if (!productId) throw new Error(`Paddle: price for ${req.planKey} has no product`);
    await this.call(
      "POST",
      `/subscriptions/${encodeURIComponent(req.providerSubscriptionId)}/charge`,
      {
        effective_from: "next_billing_period",
        items: [
          {
            quantity: 1,
            price: {
              product_id: productId,
              name: req.name.slice(0, 50),
              description: req.description.slice(0, 200),
              tax_mode: "account_setting",
              unit_price: { amount: String(req.amountMinor), currency_code: req.currency },
            },
          },
        ],
      },
    );
    // Paddle answers with the subscription, not the charge; the charge shows on its next transaction.
    return { chargeId: null };
  }

  async parseWebhook(request: Request): Promise<BillingWebhookEvent> {
    const header = request.headers.get(PADDLE_SIGNATURE_HEADER);
    if (!header) throw new WebhookSignatureError("Missing Paddle-Signature header");
    const body = await request.text();
    await verifyPaddleSignature(header, body, this.opts.webhookSecret, {
      nowMs: this.opts.now?.() ?? Date.now(),
      toleranceSeconds: this.opts.toleranceSeconds,
    });
    let raw: Json;
    try {
      raw = obj(JSON.parse(body));
    } catch {
      throw new WebhookSignatureError("Webhook body is not JSON");
    }
    return this.normalize(raw);
  }

  /** Normalizes an already-verified Paddle event payload. */
  normalize(raw: Json): BillingWebhookEvent {
    const type = str(raw.event_type) ?? "unknown";
    const data = obj(raw.data);
    const custom = obj(data.custom_data);
    const isSubscription = type.startsWith("subscription.");
    const event: BillingWebhookEvent = {
      providerEventId: str(raw.event_id) ?? str(raw.notification_id) ?? "",
      type,
      occurredAt: date(raw.occurred_at),
      // custom_data.orgId / planKey are ignored on purpose; only the signed token binds an org.
      checkoutToken: str(custom[CHECKOUT_TOKEN_KEY]),
      providerSubscriptionId: isSubscription ? str(data.id) : str(data.subscription_id),
      raw,
    };
    if (isSubscription) {
      const status = STATUS_MAP[str(data.status) ?? ""];
      const items = Array.isArray(data.items) ? data.items.map(obj) : [];
      const priceId = str(obj(items[0]?.price).id);
      const fromPrice = priceId
        ? Object.entries(this.opts.priceIds).find(([, id]) => id === priceId)?.[0]
        : undefined;
      // The plan comes ONLY from the price actually billed. custom_data is not authoritative: it
      // can be set client-side (Paddle.js checkouts) and survives in-portal plan changes, so
      // trusting custom_data.planKey would let a starter-priced subscription unlock "pro".
      const planKey = fromPrice
        ? (parseCheckoutPriceKey(fromPrice, this.opts.planKeys)?.planKey ?? null)
        : null;
      const period = obj(data.current_billing_period);
      const subId = str(data.id);
      const customerId = str(data.customer_id);
      if (status && planKey && subId && customerId) {
        event.subscription = {
          planKey,
          status,
          providerCustomerId: customerId,
          providerSubscriptionId: subId,
          currentPeriodStart: date(period.starts_at),
          currentPeriodEnd: date(period.ends_at),
          cancelAtPeriodEnd: str(obj(data.scheduled_change).action) === "cancel",
        };
        const price = paddleSubscriptionPrice(items[0], data.discount);
        if (price) event.subscription.price = price;
      }
    }
    return event;
  }
}
