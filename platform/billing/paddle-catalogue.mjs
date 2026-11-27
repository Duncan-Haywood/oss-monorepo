#!/usr/bin/env node
// @ts-check
// The Paddle catalogue as code (README.md, "Next"; goals.md, "Direction: everything as code"): creates
// each pack's Paddle product and price from `catalogue.mjs` and `prices.mjs`, idempotently, and writes the
// price ids back into `catalogue.mjs`, so "Going live" step 4 is one command instead of fourteen
// dashboard forms.
//
// THE OWNER RUNS THIS, on their own machine, with their own key:
//
//   PADDLE_API_KEY=... node platform/billing/paddle-catalogue.mjs            # dry run: prints the plan
//   PADDLE_API_KEY=... node platform/billing/paddle-catalogue.mjs --apply    # creates, then writes ids
//
// The key is read from the environment only, never printed, never written anywhere, and never belongs
// in a session, a workflow or this repository (goals.md, "Payments"; README, "Where the billing Worker
// runs"). Nothing in .github/workflows runs this file (billing.test.mjs checks).
//
// Identity is custom_data, not names: products carry { catalogue: "marisstella-packs", product: <slug> },
// prices add { amount, currency, interval }. The sync reads and changes only items carrying that tag and
// never deletes. A changed amount makes a NEW price and archives the old one; a key bought on the old
// price is already signed, so nobody loses what they paid for. Environment comes from
// CATALOGUE.environment (sandbox until a test purchase has gone end to end).
//
// Paddle's API shapes (POST/PATCH /products and /prices, `unit_price`, `billing_cycle`, `custom_data`,
// `meta.pagination.next`) follow ventures/seller-books/packages/billing/src/paddle-catalog.ts, which was
// written from the same docs; neither has run against a live account yet, so run the dry run first.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATALOGUE } from "./catalogue.mjs";
import { PRICES } from "./prices.mjs";

export const TAG = "marisstella-packs";
export const API = { sandbox: "https://sandbox-api.paddle.com", production: "https://api.paddle.com" };
const CATALOGUE_FILE = fileURLToPath(new URL("./catalogue.mjs", import.meta.url));

/**
 * @typedef {{ id: string, name: string, status: string, custom_data: Record<string, unknown> | null }} PaddleProduct
 * @typedef {{ id: string, product_id: string, status: string, unit_price: { amount: string, currency_code: string }, billing_cycle: { interval: string, frequency: number } | null, custom_data: Record<string, unknown> | null }} PaddlePrice
 * @typedef {{ slug: string, name: string, cents: number, currency: "USD" | "EUR", interval: null | "year" }} Want
 * @typedef {{ kind: "create-product", slug: string, body: Record<string, unknown> }
 *   | { kind: "rename-product", slug: string, productId: string, body: Record<string, unknown> }
 *   | { kind: "create-price", slug: string, body: Record<string, unknown> }
 *   | { kind: "archive-price", slug: string, priceId: string, reason: string }
 *   | { kind: "keep-price", slug: string, priceId: string }
 *   | { kind: "skip", slug: string, reason: string }} Action
 */

/** @param {Record<string, unknown> | null | undefined} d @param {string} k */
const tag = (d, k) => (d && typeof d === "object" && typeof d[k] === "string" ? /** @type {string} */ (d[k]) : null);

/**
 * What should exist in Paddle: catalogue products that have a price. Refuses a malformed price, a billing
 * kind that disagrees with the catalogue, or a slug sync.mjs would refuse.
 * @param {typeof CATALOGUE} cat @param {Record<string, import("./prices.mjs").PackPrice>} prices
 * @returns {{ wants: Want[], skips: Action[] }}
 */
export function wanted(cat, prices) {
  /** @type {Want[]} */
  const wants = [];
  /** @type {Action[]} */
  const skips = [];
  for (const [slug, p] of Object.entries(cat.products)) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) throw new Error(`bad product slug ${JSON.stringify(slug)}`);
    const price = Object.hasOwn(prices, slug) ? prices[slug] : null;
    if (!price || price.cents === null) { skips.push({ kind: "skip", slug, reason: "no price in prices.mjs" }); continue; }
    if (!Number.isInteger(price.cents) || price.cents < 100 || price.cents > 100000) throw new Error(`${slug}: cents must be a whole number from 100 to 100000`);
    if (price.currency !== "USD" && price.currency !== "EUR") throw new Error(`${slug}: currency must be USD or EUR`);
    if (price.interval !== null && price.interval !== "year") throw new Error(`${slug}: interval must be null (one-off) or "year"`);
    const kind = price.interval ? "subscription" : "one-off";
    if (p.billing !== kind) throw new Error(`${slug}: catalogue.mjs says ${p.billing}, prices.mjs says ${kind}`);
    if (typeof p.name !== "string" || !p.name.trim()) throw new Error(`${slug}: missing name`);
    wants.push({ slug, name: p.name, cents: price.cents, currency: price.currency, interval: price.interval });
  }
  return { wants, skips };
}

/** @param {Want} w @param {string} productId */
export function priceBody(w, productId) {
  const amount = (w.cents / 100).toFixed(2);
  return {
    product_id: productId,
    description: `${w.name}: ${w.currency} ${amount}${w.interval ? " a year" : " one-off"}`,
    name: w.interval ? "Yearly" : "One-off",
    unit_price: { amount: String(w.cents), currency_code: w.currency },
    ...(w.interval ? { billing_cycle: { interval: w.interval, frequency: 1 } } : {}),
    tax_mode: "account_setting",
    quantity: { minimum: 1, maximum: 1 },
    custom_data: { catalogue: TAG, product: w.slug, amount: String(w.cents), currency: w.currency, interval: w.interval || "one-off" },
  };
}

/** @param {PaddlePrice} pr @param {Want} w */
const matches = (pr, w) => pr.unit_price && pr.unit_price.amount === String(w.cents) && pr.unit_price.currency_code === w.currency
  && (w.interval ? !!pr.billing_cycle && pr.billing_cycle.interval === w.interval && pr.billing_cycle.frequency === 1 : !pr.billing_cycle);

/**
 * What to change so Paddle matches the wants. Pure; only active items tagged TAG are read.
 * A product that does not exist yet gets `create-product`; its price is planned on the second pass,
 * once the product id is known (`sync`).
 * @param {Want[]} wants @param {PaddleProduct[]} products @param {PaddlePrice[]} prices
 * @returns {Action[]}
 */
export function plan(wants, products, prices) {
  /** @type {Action[]} */
  const out = [];
  const ours = products.filter((p) => p.status === "active" && tag(p.custom_data, "catalogue") === TAG);
  const ourPrices = prices.filter((p) => p.status === "active" && tag(p.custom_data, "catalogue") === TAG);
  for (const w of wants) {
    const product = ours.find((p) => tag(p.custom_data, "product") === w.slug);
    if (!product) {
      out.push({ kind: "create-product", slug: w.slug, body: { name: w.name, tax_category: "standard", description: `${w.name} (marisstella.app/${w.slug})`, custom_data: { catalogue: TAG, product: w.slug } } });
      continue;
    }
    if (product.name !== w.name) out.push({ kind: "rename-product", slug: w.slug, productId: product.id, body: { name: w.name } });
    const current = ourPrices.filter((pr) => pr.product_id === product.id && tag(pr.custom_data, "product") === w.slug);
    const keep = current.find((pr) => matches(pr, w));
    out.push(keep ? { kind: "keep-price", slug: w.slug, priceId: keep.id } : { kind: "create-price", slug: w.slug, body: priceBody(w, product.id) });
    for (const stale of current) if (stale !== keep) out.push({ kind: "archive-price", slug: w.slug, priceId: stale.id, reason: `${stale.unit_price?.amount} ${stale.unit_price?.currency_code} replaced by ${w.cents} ${w.currency}` });
  }
  return out;
}

/**
 * catalogue.mjs's source with each product's priceId set. Touches only the `priceId: "..."` on the line
 * that opens that product's entry; a product with no such line is reported, never guessed.
 * @param {string} source @param {Record<string, string>} ids slug -> pri_ id
 * @returns {{ source: string, missing: string[] }}
 */
export function withPriceIds(source, ids) {
  let out = source;
  const missing = [];
  for (const [slug, id] of Object.entries(ids)) {
    if (!/^pri_[a-z0-9]{10,40}$/.test(id)) throw new Error(`${slug}: not a Paddle price id: ${JSON.stringify(id)}`);
    const re = new RegExp(`^(\\s*"${slug.replace(/[-]/g, "\\-")}":\\s*\\{[^\\n]*?priceId:\\s*")[^"]*(")`, "m");
    if (!re.test(out)) { missing.push(slug); continue; }
    out = out.replace(re, `$1${id}$2`);
  }
  return { source: out, missing };
}

/** @param {string} line */
const say = (line) => process.stdout.write(line + "\n");

/** @param {Action} a */
export function describe(a) {
  switch (a.kind) {
    case "create-product": return `${a.slug}: create product "${a.body.name}"`;
    case "rename-product": return `${a.slug}: rename product ${a.productId} to "${a.body.name}"`;
    case "create-price": { const u = /** @type {any} */ (a.body).unit_price; return `${a.slug}: create price ${u.amount} ${u.currency_code} (${/** @type {any} */ (a.body).billing_cycle ? "yearly" : "one-off"})`; }
    case "archive-price": return `${a.slug}: archive price ${a.priceId} (${a.reason})`;
    case "keep-price": return `${a.slug}: price ${a.priceId} is current`;
    case "skip": return `${a.slug}: skipped, ${a.reason}`;
  }
}

/**
 * A minimal Paddle client over fetch. The key stays in this closure.
 * @param {string} key @param {"sandbox" | "production"} environment @param {typeof fetch} [f]
 */
export function client(key, environment, f = fetch) {
  const base = API[environment];
  if (!base) throw new Error(`unknown environment ${environment}`);
  /** @param {string} method @param {string} pathOrUrl @param {unknown} [body] */
  const call = async (method, pathOrUrl, body) => {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : base + pathOrUrl;
    if (!url.startsWith(base + "/")) throw new Error("refusing to follow a link off the Paddle API: " + url);
    const r = await f(url, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = /** @type {any} */ (await r.json().catch(() => null));
    if (!r.ok) throw new Error(`Paddle ${method} ${url.slice(base.length).split("?")[0]} answered ${r.status}: ${j?.error?.detail || j?.error?.code || "no detail"}`);
    return j;
  };
  /** @param {string} path */
  const all = async (path) => {
    const items = [];
    for (let url = path, pages = 0; url && pages < 50; pages++) {
      const j = await call("GET", url);
      items.push(...(Array.isArray(j?.data) ? j.data : []));
      url = j?.meta?.pagination?.has_more ? j.meta.pagination.next : "";
    }
    return items;
  };
  return {
    products: () => all("/products?status=active&per_page=200"),
    prices: () => all("/prices?status=active&per_page=200"),
    /** @param {Record<string, unknown>} b */ createProduct: async (b) => (await call("POST", "/products", b)).data,
    /** @param {string} id @param {Record<string, unknown>} b */ updateProduct: async (id, b) => (await call("PATCH", `/products/${id}`, b)).data,
    /** @param {Record<string, unknown>} b */ createPrice: async (b) => (await call("POST", "/prices", b)).data,
    /** @param {string} id */ archivePrice: async (id) => (await call("PATCH", `/prices/${id}`, { status: "archived" })).data,
  };
}

/**
 * Plan, and with apply: true carry it out in two passes (products, then prices for new products).
 * @param {ReturnType<typeof client>} c @param {{ apply: boolean, cat?: typeof CATALOGUE, prices?: typeof PRICES, log?: (s: string) => void }} o
 * @returns {Promise<{ actions: Action[], ids: Record<string, string> }>}
 */
export async function sync(c, o) {
  const log = o.log || say;
  const { wants, skips } = wanted(o.cat || CATALOGUE, o.prices || PRICES);
  let products = await c.products();
  let prices = await c.prices();
  let actions = [...skips, ...plan(wants, products, prices)];
  for (const a of actions) log((o.apply ? "" : "would ") + describe(a));
  if (!o.apply) return { actions, ids: {} };
  for (const a of actions) {
    if (a.kind === "create-product") products = [...products, await c.createProduct(a.body)];
    if (a.kind === "rename-product") await c.updateProduct(a.productId, a.body);
  }
  // second pass: new products now have ids, so their prices are planned and created
  actions = plan(wants, products, prices);
  /** @type {Record<string, string>} */
  const ids = {};
  for (const a of actions) {
    if (a.kind === "create-price") { const pr = await c.createPrice(a.body); prices = [...prices, pr]; ids[a.slug] = pr.id; log(describe(a) + ` -> ${pr.id}`); }
    if (a.kind === "keep-price") ids[a.slug] = a.priceId;
  }
  for (const a of actions) if (a.kind === "archive-price") { await c.archivePrice(a.priceId); log(describe(a)); }
  return { actions, ids };
}

/**
 * Refuse a key whose environment visibly disagrees with the catalogue's (Paddle's newer keys carry
 * `_sdbx_` or `_live_`; an older key without either passes).
 * @param {string} key @param {string} environment
 */
export function keyMatches(key, environment) {
  if (/_live_/.test(key)) return environment === "production";
  if (/_sdbx_/.test(key)) return environment === "sandbox";
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = (process.env.PADDLE_API_KEY || "").trim();
  const apply = process.argv.includes("--apply");
  const env = /** @type {"sandbox" | "production"} */ (CATALOGUE.environment);
  if (!key) { process.stderr.write("Set PADDLE_API_KEY in this shell (your own machine only; see the header of this file).\n"); process.exit(2); }
  if (!keyMatches(key, env)) { process.stderr.write(`PADDLE_API_KEY is for the other environment; catalogue.mjs says "${env}".\n`); process.exit(2); }
  say(`Paddle ${env}${apply ? "" : " (dry run; add --apply to make these changes)"}`);
  try {
    const { ids } = await sync(client(key, env), { apply });
    if (apply && Object.keys(ids).length) {
      const { source, missing } = withPriceIds(readFileSync(CATALOGUE_FILE, "utf8"), ids);
      writeFileSync(CATALOGUE_FILE, source);
      say(`Wrote ${Object.keys(ids).length - missing.length} price id(s) to platform/billing/catalogue.mjs.${missing.length ? ` Not found there: ${missing.join(", ")}.` : ""}`);
      say("Next: node platform/billing/sync.mjs, run the venture tests, and merge (README, Going live step 6).");
    }
  } catch (e) {
    process.stderr.write(String(e instanceof Error ? e.message : e).replaceAll(key, "[key]") + "\n");
    process.exit(1);
  }
}
