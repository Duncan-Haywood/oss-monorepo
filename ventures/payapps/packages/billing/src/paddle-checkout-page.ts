// Paddle Checkout's page, as code. A Paddle Billing checkout is a payment link: the default payment
// link (or a transaction's own `checkout.url`) with `?_ptxn=<transaction id>` appended. That page must
// be on a domain the Paddle account has approved and must load Paddle.js, initialised with a
// client-side token; Paddle.js then opens the checkout for the transaction by itself.
// Source, read 2026-11-27: developer.paddle.com/build/transactions/default-payment-link,
// /api-reference/client-tokens, /api-reference/settings/update-checkout-url and
// /api-reference/transactions/create-transaction (`checkout.url`).
//
// Until this module, nothing set any of the three: Paddle refuses to create a transaction while the
// account has no default payment link, and without a page that loads Paddle.js a live checkout link
// would open an app page that does nothing. Now the deploy:
//   1. finds the active client-side token named "<app> checkout" or creates it (client_token.read and
//      .write). A client-side token is public by design (Paddle: "safe to use in frontend code"); it
//      can only open checkouts and preview prices, never read or change account data;
//   2. sets the account's default payment link to <APP_URL>/pay only when the account has none
//      (checkout_settings.read and .write). One Paddle account serves several apps, so a link another
//      app set is left alone: PayApps passes its own `checkout.url` on every transaction anyway.
// In a live account both the default link and `checkout.url` must be on an approved domain, and a
// subdomain needs its own approval (payapps.marisstella.app is not covered by marisstella.app). That
// approval is a Paddle dashboard step with no API; Paddle's `checkout_url_domain_not_approved` error
// is reported as such so the deploy log says exactly what is missing.
import { paddleBaseUrl } from "./paddle.ts";

export const PAY_PATH = "/pay";

/** The public client-side token's shape: `live_` or `test_` and letters/digits. */
export function isClientToken(v: unknown): v is string {
  return typeof v === "string" && /^(live|test)_[A-Za-z0-9]{10,}$/.test(v);
}

/** The environment a client-side token belongs to, for Paddle.Environment.set. */
export function clientTokenEnvironment(token: string): "production" | "sandbox" {
  return token.startsWith("test_") ? "sandbox" : "production";
}

/**
 * `<origin>/pay` for an app URL. Only https on a real host name, as the webhook URL: Paddle sends
 * every customer of this account to this page, so a typo would hand them to someone else's site.
 */
export function payPageUrl(appUrl: string): string {
  let u: URL;
  try {
    u = new URL(appUrl.trim());
  } catch {
    throw new Error(`app URL ${JSON.stringify(appUrl)} is not a URL`);
  }
  if (u.protocol !== "https:") throw new Error("app URL must be https");
  if (u.username || u.password || u.search || u.hash)
    throw new Error("app URL must be a bare origin (no credentials, query or fragment)");
  if (!/^([a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(u.hostname))
    throw new Error(`app URL host ${JSON.stringify(u.hostname)} is not a public host name`);
  if (u.pathname !== "/" && u.pathname !== "")
    throw new Error("app URL must have no path (the pay path is added here)");
  return `${u.origin}${PAY_PATH}`;
}

export interface PaddleClientToken {
  id: string;
  token: string;
  name: string;
  status: string;
}

export const clientTokenName = (app: string) => `${app} checkout`;

/** The token to use: the newest active one with our name (Paddle lists id[DESC] by default). */
export function pickClientToken(
  tokens: readonly PaddleClientToken[],
  app: string,
): PaddleClientToken | null {
  const name = clientTokenName(app);
  return (
    tokens.find((t) => t.name === name && t.status === "active" && isClientToken(t.token)) ?? null
  );
}

export type DefaultLinkAction =
  | { kind: "set"; url: string }
  | { kind: "keep"; url: string; ours: boolean };

/** Set the default payment link only when the account has none; never replace another app's. */
export function planDefaultLink(current: string | null, payUrl: string): DefaultLinkAction {
  if (!current) return { kind: "set", url: payUrl };
  return { kind: "keep", url: current, ours: current === payUrl };
}

export class PaddleApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Json = Record<string, unknown>;

const PERMISSION: Record<string, [string, string]> = {
  "/client-tokens": ["client_token.read", "client_token.write"],
  "/settings/checkout-url": ["checkout_settings.read", "checkout_settings.write"],
};

/** Minimal client for the two endpoints above (plain fetch). Never logs the key. */
export class PaddleCheckoutClient {
  private readonly apiKey: string;
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  constructor(apiKey: string, opts: { fetch?: typeof fetch; baseUrl?: string } = {}) {
    this.apiKey = apiKey;
    this.base = opts.baseUrl ?? paddleBaseUrl(apiKey);
    this.fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
  }

  private async call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
    const res = await this.fetchFn(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const err = (json.error ?? {}) as Json;
      const code = String(err.code ?? "");
      const bare = path.split("?")[0] ?? path;
      const perms = PERMISSION[bare];
      const perm = perms ? (method === "GET" ? perms[0] : perms[1]) : "";
      const hint =
        res.status === 403 && perm
          ? ` (give the key ${perm})`
          : code === "checkout_url_domain_not_approved"
            ? " (approve this exact host under Paddle > Settings > Website approval)"
            : "";
      throw new PaddleApiError(
        `Paddle ${method} ${bare} failed: ${res.status} ${code}${hint}`.trim(),
        res.status,
        code,
      );
    }
    return json;
  }

  async listClientTokens(): Promise<PaddleClientToken[]> {
    const out: PaddleClientToken[] = [];
    let next: string | null = "/client-tokens?status=active&per_page=200";
    for (let page = 0; next && page < 10; page++) {
      const json = await this.call("GET", next);
      out.push(...((json.data as PaddleClientToken[]) ?? []));
      const pagination = ((json.meta as Json)?.pagination ?? {}) as Json;
      const url = pagination.has_more ? String(pagination.next ?? "") : "";
      // Only a next page on our own API base: any other host would get the key.
      next = url.startsWith(`${this.base}/`) ? url.slice(this.base.length) : null;
    }
    return out;
  }

  async createClientToken(app: string): Promise<PaddleClientToken> {
    return (
      await this.call("POST", "/client-tokens", {
        name: clientTokenName(app),
        description: `Opens Paddle Checkout on ${app}'s /pay page (managed by the ${app} deploy)`,
      })
    ).data as PaddleClientToken;
  }

  async getDefaultLink(): Promise<string | null> {
    const json = await this.call("GET", "/settings/checkout-url");
    const v = ((json.data ?? {}) as Json).default_url;
    return typeof v === "string" && v ? v : null;
  }

  async setDefaultLink(url: string): Promise<string | null> {
    const json = await this.call("PATCH", "/settings/checkout-url", { default_url: url });
    const v = ((json.data ?? {}) as Json).default_url;
    return typeof v === "string" && v ? v : null;
  }
}

export interface CheckoutPageResult {
  /** The client-side token for Paddle.js (public), or null on a plan-only run that would create one. */
  token: string | null;
  tokenAction: "found" | "created" | "would create";
  payUrl: string;
  defaultLink: DefaultLinkAction;
  /** Why the default link could not be read or set; the token is still usable. */
  defaultLinkError: string | null;
}

/**
 * Brings the account in line for the app's /pay page. apply=false only reads. A failure on the
 * default link (permission, or the domain not yet approved) is reported, not thrown: the token is
 * what the Worker needs, and the per-transaction `checkout.url` works once the domain is approved.
 */
export async function syncCheckoutPage(
  client: PaddleCheckoutClient,
  want: { app: string; appUrl: string },
  opts: { apply: boolean },
): Promise<CheckoutPageResult> {
  const payUrl = payPageUrl(want.appUrl);
  const found = pickClientToken(await client.listClientTokens(), want.app);
  let token: string | null = found?.token ?? null;
  let tokenAction: CheckoutPageResult["tokenAction"] = found ? "found" : "would create";
  if (!found && opts.apply) {
    const made = await client.createClientToken(want.app);
    if (!isClientToken(made.token))
      throw new Error("Paddle created a client-side token of an unexpected shape");
    token = made.token;
    tokenAction = "created";
  }
  let defaultLink: DefaultLinkAction = { kind: "keep", url: "", ours: false };
  let defaultLinkError: string | null = null;
  try {
    defaultLink = planDefaultLink(await client.getDefaultLink(), payUrl);
    if (defaultLink.kind === "set" && opts.apply) await client.setDefaultLink(payUrl);
  } catch (e) {
    defaultLinkError = (e as Error).message;
  }
  return { token, tokenAction, payUrl, defaultLink, defaultLinkError };
}

export function describeCheckoutPage(r: CheckoutPageResult, applied: boolean): string[] {
  const lines = [`client-side token "${r.tokenAction}"`];
  if (r.defaultLinkError) lines.push(`default payment link: ${r.defaultLinkError}`);
  else if (r.defaultLink.kind === "set")
    lines.push(
      `default payment link ${applied ? "set to" : "would be set to"} ${r.defaultLink.url}`,
    );
  else if (r.defaultLink.ours) lines.push(`default payment link is already ${r.payUrl}`);
  else
    lines.push(
      `default payment link belongs to another page (${r.defaultLink.url}): kept; this app passes ${r.payUrl}/<org> on each transaction`,
    );
  return lines;
}
