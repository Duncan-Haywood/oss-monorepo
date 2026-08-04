# Market launch readiness — fulfillment & ad partners

**Date:** 2026-06-11  
**Sources:** Printful API docs, Gelato developer portal, Meta Business Help Center (catalog/pixel), Google Merchant Center policy overview.

## Fulfillment (POD)

- **Printful** and **Gelato** both expose REST APIs for product catalog sync, order routing, and webhook status — suitable for software-first fulfillment without manual ops.
- Multi-partner routing lets Print Atelier optimize margin by region (US primary via Printful, EU/APAC via Gelato) before raising retail prices.
- Launch blocker pattern: listings with POD cost above margin guardrails should not route to production API until retail price or partner SKU is fixed.

## Advertising (programmatic)

- **Meta** and **Pinterest** require product catalog feeds with stable SKUs, images, and policy-compliant creative before scaling paid social.
- **Google** performance max / search campaigns benefit from programmatic SEO landing pages tied to artwork tags (long-tail intent).
- Room mockup coverage correlates with conversion lift in buyer-preview experiments — ad platforms should not receive flat product images when mockups are missing.

## Strategic implication

Market launch is gated by **four scores**: catalog supply, consent/legal ops, fulfillment partner configuration, and ad-ready creative coverage. A single investor snapshot should surface all four before spend or outreach scales.
