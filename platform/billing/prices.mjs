// @ts-check
// What each paid pack costs, for `paddle-catalogue.mjs` (the Paddle catalogue as code, README "Next").
// Kept apart from `catalogue.mjs` so a price change never touches the file `sync.mjs` copies from.
//
// Each amount is a choice inside the band `portfolio/monetization/models.yaml` gives that venture
// (`price_hypothesis`), quoted in `basis`. None is validated by a sale yet. `interval` null is a one-off
// price; "year" is a yearly subscription. A product with no row here (or `cents: null`) is not created.
// A slug here that `catalogue.mjs` does not list yet is ignored by the sync, so this file may run ahead
// of the catalogue.

/** @typedef {{ cents: number | null, currency: "USD" | "EUR", interval: null | "year", basis: string }} PackPrice */

/** @type {Record<string, PackPrice>} */
export const PRICES = {
  "wall-framing-takeoff": { cents: 7900, currency: "USD", interval: "year", basis: "models.yaml: $49 to $99 a year (yearly licence)" },
  "league-schedule-generator": { cents: 1500, currency: "USD", interval: null, basis: "models.yaml: $10 to $25 a season, one-off" },
  "shift-roster-builder": { cents: 1500, currency: "USD", interval: null, basis: "models.yaml: $10 to $25 one-off" },
  "shed-designer": { cents: 1500, currency: "USD", interval: null, basis: "models.yaml: $10 to $25 one-off; the top is a stretch next to $4-35 Etsy plans" },
  "einvoice-preflight": { cents: 2900, currency: "EUR", interval: null, basis: "models.yaml: around $15 to $40 one-off; EUR because the buyers are DE/FR accountants" },
  "changepoint-detector": { cents: 900, currency: "USD", interval: null, basis: "models.yaml: $5 to $15 one-off per report pack" },
  "ai-bookkeeper": { cents: null, currency: "USD", interval: null, basis: "models.yaml: not priced, so not created" },
  "residential-takeoff": { cents: 2900, currency: "USD", interval: null, basis: "ventures/residential-takeoff/apps/wall-framing-takeoff/docs/PRICING.md: $29 per house, one-off" },
};
