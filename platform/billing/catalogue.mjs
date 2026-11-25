// @ts-check
// What the portfolio sells through Paddle, as code (goals.md, "Direction:
// everything as code"). Every value here is public. The owner fills in the
// empty ones once, from the Paddle dashboard and `keygen.mjs`, then runs
// `node platform/billing/sync.mjs` so each venture's `checkout.mjs` picks them
// up. Until a product has a price id, and the shared values below are set, its
// pack stays dark (`client.mjs`, `onSale`).
//
// `billing` follows `portfolio/monetization/models.yaml`. A subscription key
// carries an expiry (the paid period's end plus GRACE_DAYS) and renews itself
// from the edge Worker; a one-off key never expires.

export const GRACE_DAYS = 7;

export const CATALOGUE = {
  rail: "paddle",
  // "sandbox" until a test purchase has gone end to end, then "production".
  environment: "sandbox",
  // Paddle > Developer tools > Authentication > Client-side tokens. Public by
  // design (it can only open checkouts); never paste an API key here.
  clientToken: "",
  // The Ed25519 public key printed by `node platform/billing/keygen.mjs`.
  publicKey: "",
  // The edge Worker that receives Paddle's webhook and hands out keys
  // (platform/edge/site.json).
  edge: "https://monorepo-projects-edge.duncan-andrew-haywood.workers.dev",
  products: {
    "wall-framing-takeoff": { name: "Branded bid package", billing: "subscription", priceId: "" },
    "league-schedule-generator": { name: "Season print pack", billing: "one-off", priceId: "" },
    "shift-roster-builder": { name: "Branded staff schedule pack", billing: "one-off", priceId: "" },
    "shed-designer": { name: "Branded shed build pack", billing: "one-off", priceId: "" },
    "einvoice-preflight": { name: "Branded audit pack", billing: "one-off", priceId: "" },
    "changepoint-detector": { name: "Branded change report", billing: "one-off", priceId: "" },
    "ai-bookkeeper": { name: "Branded close pack", billing: "one-off", priceId: "" },
  },
};

/** The public config one venture's page needs. @param {string} product @param {typeof CATALOGUE} [cat] */
export function productConfig(product, cat = CATALOGUE) {
  const p = cat.products[product];
  if (!p) throw new Error("not in the catalogue: " + product);
  return {
    product,
    priceId: p.priceId,
    clientToken: cat.clientToken,
    publicKey: cat.publicKey,
    edge: cat.edge,
    environment: cat.environment,
  };
}

/** Which catalogue product a Paddle price id sells. @param {string} priceId @param {typeof CATALOGUE} [cat] */
export function productForPrice(priceId, cat = CATALOGUE) {
  if (!priceId) return null;
  for (const [slug, p] of Object.entries(cat.products)) if (p.priceId && p.priceId === priceId) return { slug, ...p };
  return null;
}
