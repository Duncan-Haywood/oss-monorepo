// Paddle Billing adapter (merchant of record: Paddle is the seller, so it calculates, collects and
// remits sales tax / VAT, issues invoices and handles refunds + chargebacks).
// API: https://developer.paddle.com/api-reference/overview  — plain fetch, no SDK.
// Setup (Paddle dashboard):
//   1. Products → one product with monthly + annual prices per paid plan; put their ids in
//      BILLING_PRICE_IDS, e.g. {"starter":"pri_..","starter:annual":"pri_..","standard":"pri_..",...}.
//   2. Checkout settings → Default payment link → a Paddle hosted checkout launch URL (or an approved
//      page on our domain that loads Paddle.js). Transactions created here return `checkout.url` from it.
//   3. Notifications → webhook destination https://<app>/api/billing/webhook for subscription.* and
//      transaction.completed / adjustment.* events; its secret key goes in BILLING_WEBHOOK_SECRET.
//   4. Discounts → create promo codes (e.g. a % off first month) — customers pass them as promoCode.
// Sandbox vs live is inferred from the API key prefix (pdl_sdbx_… → sandbox-api.paddle.com).
import { parseCheckoutPriceKey } from "@shared/billing/plans";
import type { BillingProvider, BillingWebhookEvent, CheckoutRequest } from "../billing-provider";
import { CHECKOUT_TOKEN_KEY } from "./checkout-token";
import { hmacSha256Hex, PromoCodeError, timingSafeEqual, WebhookSignatureError } from "./crypto";

type SubStatus = NonNullable<BillingWebhookEvent["subscription"]>["status"];

export interface PaddleOptions {
  apiKey: string;
  webhookSecret: string;
  /** Checkout price key ("starter", "starter:annual", ...) -> Paddle price id (pri_...). */
  priceIds: Record<string, string>;
  /** Max clock skew for webhook timestamps (replay protection). Default 300s. */
  toleranceSeconds?: number;
  fetch?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
  /**
   * AWS runtime only (docs/AWS.md): the starter's payments sub-stack receives Paddle's webhooks and
   * its entitlement consumer keys rows on custom_data `{ user_sub, product }`. Set to the product
   * name ("grants") to add those keys; user_sub carries the same opaque checkout token, so the org
   * is still bound only through pending_checkouts (services/billing/checkout.ts).
   */
  entitlementProduct?: string;
}

const STATUS_MAP: Record<string, SubStatus> = {
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

export function paddleBaseUrl(apiKey: string): string {
  return apiKey.startsWith("pdl_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

export class PaddleBillingProvider implements BillingProvider {
  readonly name = "paddle";
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly opts: PaddleOptions) {
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
      // Only the opaque signed token: the org is bound server-side (pending_checkouts), and the
      // plan comes from the billed price. Anything else here could be forged by a crafted checkout.
      custom_data: {
        [CHECKOUT_TOKEN_KEY]: req.checkoutToken,
        ...(this.opts.entitlementProduct
          ? { user_sub: req.checkoutToken, product: this.opts.entitlementProduct }
          : {}),
      },
    });
    const url = str(obj(obj(txn.data).checkout).url);
    if (!url)
      throw new Error("Paddle: transaction has no checkout url (set a default payment link)");
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

  /** Verifies `Paddle-Signature: ts=<unix>;h1=<hex hmac>` over `${ts}:${rawBody}`, then normalizes. */
  async parseWebhook(request: Request): Promise<BillingWebhookEvent> {
    // On AWS the payments account verifies webhooks and there is no secret here: fail closed.
    if (!this.opts.webhookSecret) throw new WebhookSignatureError("Webhooks are not received here");
    const header = request.headers.get("paddle-signature");
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
    const nowSec = Math.floor((this.opts.now?.() ?? Date.now()) / 1000);
    if (Math.abs(nowSec - Number(ts)) > (this.opts.toleranceSeconds ?? 300)) {
      throw new WebhookSignatureError("Stale webhook timestamp");
    }
    const body = await request.text();
    const expected = await hmacSha256Hex(this.opts.webhookSecret, `${ts}:${body}`);
    if (!h1.some((sig) => timingSafeEqual(sig, expected))) throw new WebhookSignatureError();
    let raw: Json;
    try {
      raw = obj(JSON.parse(body));
    } catch {
      throw new WebhookSignatureError("Webhook body is not JSON");
    }
    return this.normalize(raw);
  }

  normalize(raw: Json): BillingWebhookEvent {
    const type = str(raw.event_type) ?? "unknown";
    const data = obj(raw.data);
    const custom = obj(data.custom_data);
    const isSubscription = type.startsWith("subscription.");
    const event: BillingWebhookEvent = {
      providerEventId: str(raw.event_id) ?? str(raw.notification_id) ?? "",
      type,
      occurredAt: date(raw.occurred_at),
      // custom_data.orgId / planKey are ignored on purpose; only our signed token binds an org.
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
      const planKey = fromPrice ? (parseCheckoutPriceKey(fromPrice)?.planKey ?? null) : null;
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
      }
    }
    return event;
  }
}
