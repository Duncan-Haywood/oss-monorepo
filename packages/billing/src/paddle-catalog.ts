// Paddle catalog as code: products and prices are created from a committed catalog file, never by
// hand in the dashboard (owner, 2026-11-24: minimal click ops; "products and prices as code").
//
// Identity is custom_data, not names: every product carries {app, plan} and every price carries
// {app, plan, interval}. The sync only ever reads or changes items tagged with its own app, and it
// never deletes. A changed amount makes a NEW price and archives the old one: existing subscribers
// keep the price they bought at (Paddle bills an existing subscription's item on its own price id),
// and new checkouts get the new amount.
//
// The planner is pure (planCatalogSync); PaddleCatalogClient does the I/O with plain fetch.
import { paddleBaseUrl } from "./paddle.ts";
import { checkoutPriceKey } from "./price-keys.ts";
import type { BillingInterval } from "./provider.ts";

export interface CatalogPlan {
  key: string;
  name: string;
  description: string;
  /** Monthly price in the catalog currency's minor unit (cents). */
  monthlyCents: number;
  /** Annual price, or null when the plan is not sold annually. */
  annualCents: number | null;
}

export interface CatalogFile {
  /** Short app id, e.g. "grants". Becomes custom_data.app on every product and price. */
  app: string;
  /** Product name prefix shown to buyers, e.g. "Grant Autopilot". */
  productName: string;
  /** Catalog currency. EUR is for apps sold to European buyers (apps/einvoice-preflight). */
  currency: "USD" | "EUR";
  /** Paddle tax category for the products. */
  taxCategory: "saas" | "standard" | "digital-goods";
  /** Purchasable plans only (complimentary/staff plans are never sold). */
  plans: CatalogPlan[];
}

export interface PaddleProduct {
  id: string;
  name: string;
  description: string | null;
  status: string;
  custom_data: Record<string, unknown> | null;
}

export interface PaddlePrice {
  id: string;
  product_id: string;
  status: string;
  description: string;
  unit_price: { amount: string; currency_code: string };
  billing_cycle: { interval: string; frequency: number } | null;
  custom_data: Record<string, unknown> | null;
}

export type CatalogAction =
  | { kind: "create-product"; plan: string; body: Record<string, unknown> }
  | { kind: "update-product"; plan: string; productId: string; body: Record<string, unknown> }
  | { kind: "create-price"; plan: string; interval: BillingInterval; body: Record<string, unknown> }
  | { kind: "archive-price"; plan: string; interval: string; priceId: string; reason: string };

const PLAN_KEY_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/** Throws on a catalog that must never reach Paddle. Returns it typed. */
export function validateCatalog(raw: unknown): CatalogFile {
  const c = raw as CatalogFile;
  const fail = (m: string): never => {
    throw new Error(`invalid catalog: ${m}`);
  };
  if (!c || typeof c !== "object") fail("not an object");
  if (!PLAN_KEY_RE.test(String(c.app))) fail(`bad app id ${JSON.stringify(c.app)}`);
  if (typeof c.productName !== "string" || !c.productName.trim()) fail("missing productName");
  if (c.currency !== "USD" && c.currency !== "EUR") fail("currency must be USD or EUR");
  if (!["saas", "standard", "digital-goods"].includes(c.taxCategory)) fail("bad taxCategory");
  if (!Array.isArray(c.plans) || c.plans.length === 0) fail("no plans");
  const seen = new Set<string>();
  for (const p of c.plans) {
    if (!PLAN_KEY_RE.test(String(p.key))) fail(`bad plan key ${JSON.stringify(p.key)}`);
    if (seen.has(p.key)) fail(`duplicate plan ${p.key}`);
    seen.add(p.key);
    if (!Number.isInteger(p.monthlyCents) || p.monthlyCents <= 0)
      fail(`${p.key}: monthlyCents must be a positive integer`);
    if (p.annualCents !== null && (!Number.isInteger(p.annualCents) || p.annualCents <= 0)) {
      fail(`${p.key}: annualCents must be a positive integer or null`);
    }
    if (typeof p.name !== "string" || !p.name.trim()) fail(`${p.key}: missing name`);
  }
  return c;
}

/** Builds the catalog file from an app's plan list (purchasable plans only). */
export function catalogFromPlans(
  base: Omit<CatalogFile, "plans">,
  plans: readonly {
    key: string;
    name: string;
    description: string;
    priceCents: number;
    annualPriceCents: number | null;
    purchasable: boolean;
  }[],
): CatalogFile {
  return validateCatalog({
    ...base,
    plans: plans
      .filter((p) => p.purchasable)
      .map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        monthlyCents: p.priceCents,
        annualCents: p.annualPriceCents,
      })),
  });
}

const tag = (v: Record<string, unknown> | null | undefined, k: string): string | null =>
  v && typeof v[k] === "string" ? (v[k] as string) : null;

const productTitle = (c: CatalogFile, p: CatalogPlan) => `${c.productName} ${p.name}`;

function wantedPrices(p: CatalogPlan) {
  const out: { interval: BillingInterval; cents: number }[] = [
    { interval: "month", cents: p.monthlyCents },
  ];
  if (p.annualCents !== null) out.push({ interval: "year", cents: p.annualCents });
  return out;
}

/**
 * What to change in Paddle so it matches `catalog`. Only active items tagged custom_data.app ==
 * catalog.app are considered. A product that is missing gets `create-product`; its prices are then
 * created by a second pass once the product id exists (see syncCatalog).
 */
export function planCatalogSync(
  catalog: CatalogFile,
  products: readonly PaddleProduct[],
  prices: readonly PaddlePrice[],
): CatalogAction[] {
  const app = catalog.app;
  const actions: CatalogAction[] = [];
  const ours = products.filter((p) => p.status === "active" && tag(p.custom_data, "app") === app);
  const ourPrices = prices.filter(
    (p) => p.status === "active" && tag(p.custom_data, "app") === app,
  );
  const wantedPlans = new Set(catalog.plans.map((p) => p.key));

  for (const plan of catalog.plans) {
    const product = ours.find((p) => tag(p.custom_data, "plan") === plan.key);
    const name = productTitle(catalog, plan);
    if (!product) {
      actions.push({
        kind: "create-product",
        plan: plan.key,
        body: {
          name,
          description: plan.description,
          tax_category: catalog.taxCategory,
          custom_data: { app, plan: plan.key },
        },
      });
      continue;
    }
    if (product.name !== name || (product.description ?? "") !== plan.description) {
      actions.push({
        kind: "update-product",
        plan: plan.key,
        productId: product.id,
        body: { name, description: plan.description },
      });
    }
    for (const want of wantedPrices(plan)) {
      const current = ourPrices.filter(
        (pr) =>
          pr.product_id === product.id &&
          tag(pr.custom_data, "plan") === plan.key &&
          tag(pr.custom_data, "interval") === want.interval,
      );
      const match = current.find(
        (pr) =>
          pr.unit_price.amount === String(want.cents) &&
          pr.unit_price.currency_code === catalog.currency &&
          pr.billing_cycle?.interval === want.interval &&
          pr.billing_cycle?.frequency === 1,
      );
      if (!match) {
        actions.push({
          kind: "create-price",
          plan: plan.key,
          interval: want.interval,
          body: priceBody(catalog, plan, want.interval, want.cents, product.id),
        });
      }
      for (const stale of current.filter((pr) => pr !== match)) {
        actions.push({
          kind: "archive-price",
          plan: plan.key,
          interval: want.interval,
          priceId: stale.id,
          reason: `amount ${stale.unit_price.amount} ${stale.unit_price.currency_code} replaced by ${want.cents}`,
        });
      }
    }
    if (plan.annualCents === null) {
      for (const pr of ourPrices.filter(
        (x) => x.product_id === product.id && tag(x.custom_data, "interval") === "year",
      )) {
        actions.push({
          kind: "archive-price",
          plan: plan.key,
          interval: "year",
          priceId: pr.id,
          reason: "plan no longer sold annually",
        });
      }
    }
  }
  // Prices of plans the catalog dropped: archive, so no new checkout can use them. Products stay
  // (Paddle keeps them for existing subscriptions); nothing is deleted.
  for (const pr of ourPrices) {
    const plan = tag(pr.custom_data, "plan");
    if (plan && !wantedPlans.has(plan)) {
      actions.push({
        kind: "archive-price",
        plan,
        interval: tag(pr.custom_data, "interval") ?? "?",
        priceId: pr.id,
        reason: "plan removed from the catalog",
      });
    }
  }
  return actions;
}

function priceBody(
  c: CatalogFile,
  p: CatalogPlan,
  interval: BillingInterval,
  cents: number,
  productId: string,
) {
  return {
    product_id: productId,
    description: `${c.productName} ${p.name}, billed ${interval === "year" ? "yearly" : "monthly"}`,
    name: interval === "year" ? "Yearly" : "Monthly",
    unit_price: { amount: String(cents), currency_code: c.currency },
    billing_cycle: { interval, frequency: 1 },
    custom_data: { app: c.app, plan: p.key, interval },
  };
}

/** BILLING_PRICE_IDS for the app, from Paddle's active prices: {"starter":"pri_…","starter:annual":"pri_…"}. */
export function priceIdsFromPaddle(
  catalog: CatalogFile,
  prices: readonly PaddlePrice[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const plan of catalog.plans) {
    for (const want of wantedPrices(plan)) {
      const pr = prices.find(
        (x) =>
          x.status === "active" &&
          tag(x.custom_data, "app") === catalog.app &&
          tag(x.custom_data, "plan") === plan.key &&
          tag(x.custom_data, "interval") === want.interval &&
          x.unit_price.amount === String(want.cents),
      );
      if (pr) out[checkoutPriceKey(plan.key, want.interval)] = pr.id;
    }
  }
  return out;
}

type Json = Record<string, unknown>;

/** Minimal Paddle Billing catalog client (plain fetch). Never logs the key. */
export class PaddleCatalogClient {
  private readonly apiKey: string;
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  constructor(apiKey: string, opts: { fetch?: typeof fetch; baseUrl?: string } = {}) {
    this.apiKey = apiKey;
    this.base = opts.baseUrl ?? paddleBaseUrl(apiKey);
    this.fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
  }

  get sandbox(): boolean {
    return this.apiKey.startsWith("pdl_sdbx_");
  }

  private async call(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<Json> {
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
      throw new Error(
        `Paddle ${method} ${path.split("?")[0]} failed: ${res.status} ${String(err.code ?? "")} ${String(err.detail ?? "")}`.trim(),
      );
    }
    return json;
  }

  private async list<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = `${path}${path.includes("?") ? "&" : "?"}per_page=200`;
    for (let page = 0; next && page < 50; page++) {
      const json = await this.call("GET", next);
      out.push(...((json.data as T[]) ?? []));
      const pagination = ((json.meta as Json)?.pagination ?? {}) as Json;
      const url = pagination.has_more ? String(pagination.next ?? "") : "";
      next = url ? url.replace(this.base, "") : null;
    }
    return out;
  }

  listProducts(): Promise<PaddleProduct[]> {
    return this.list<PaddleProduct>("/products?status=active");
  }

  listPrices(): Promise<PaddlePrice[]> {
    return this.list<PaddlePrice>("/prices?status=active");
  }

  async createProduct(body: Json): Promise<PaddleProduct> {
    return (await this.call("POST", "/products", body)).data as PaddleProduct;
  }

  async updateProduct(id: string, body: Json): Promise<void> {
    await this.call("PATCH", `/products/${encodeURIComponent(id)}`, body);
  }

  async createPrice(body: Json): Promise<PaddlePrice> {
    return (await this.call("POST", "/prices", body)).data as PaddlePrice;
  }

  async archivePrice(id: string): Promise<void> {
    await this.call("PATCH", `/prices/${encodeURIComponent(id)}`, { status: "archived" });
  }
}

export interface SyncResult {
  applied: CatalogAction[];
  priceIds: Record<string, string>;
}

/**
 * Brings Paddle in line with the catalog. With apply=false it only plans (reads, never writes).
 * Refuses to archive more than `maxArchive` prices in one run, so a broken catalog file cannot
 * take every plan off sale at once.
 */
export async function syncCatalog(
  client: PaddleCatalogClient,
  catalog: CatalogFile,
  opts: { apply: boolean; maxArchive?: number; log?: (line: string) => void },
): Promise<SyncResult> {
  const log = opts.log ?? (() => {});
  const maxArchive = opts.maxArchive ?? 4;
  let products = await client.listProducts();
  let prices = await client.listPrices();
  const applied: CatalogAction[] = [];

  for (let pass = 0; pass < 2; pass++) {
    const actions = planCatalogSync(catalog, products, prices);
    if (actions.length === 0) break;
    const archives = actions.filter((a) => a.kind === "archive-price").length;
    if (archives > maxArchive) {
      throw new Error(
        `refusing to archive ${archives} prices in one run (limit ${maxArchive}); check the catalog file`,
      );
    }
    for (const a of actions) log(describe(a));
    if (!opts.apply) return { applied: actions, priceIds: priceIdsFromPaddle(catalog, prices) };
    for (const a of actions) {
      if (a.kind === "create-product") products = [...products, await client.createProduct(a.body)];
      else if (a.kind === "update-product") await client.updateProduct(a.productId, a.body);
      else if (a.kind === "create-price") prices = [...prices, await client.createPrice(a.body)];
      else {
        await client.archivePrice(a.priceId);
        prices = prices.map((p) => (p.id === a.priceId ? { ...p, status: "archived" } : p));
      }
      applied.push(a);
    }
  }
  return { applied, priceIds: priceIdsFromPaddle(catalog, prices) };
}

export function describe(a: CatalogAction): string {
  switch (a.kind) {
    case "create-product":
      return `create product ${a.plan}: ${String(a.body.name)}`;
    case "update-product":
      return `update product ${a.plan} (${a.productId}): ${String(a.body.name)}`;
    case "create-price": {
      const up = a.body.unit_price as { amount: string; currency_code: string };
      return `create price ${a.plan}/${a.interval}: ${up.amount} ${up.currency_code}`;
    }
    case "archive-price":
      return `archive price ${a.plan}/${a.interval} (${a.priceId}): ${a.reason}`;
  }
}
