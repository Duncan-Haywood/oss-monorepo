# Product detail preview CTA + partner credential vault

**Date:** 2026-06-12  
**Sources:** Shopify 3D/AR conversion studies; Printful/Gelato API docs; Meta/Google/Pinterest catalog API requirements.

## Product detail preview CTA

Room visualization is a conversion lever, not decoration. Industry benchmarks (Shopify, Rebecca Minkoff) show 40–94% conversion lift when buyers can visualize products in context. Print Atelier gates the room-preview CTA on mockup + proof readiness so paid traffic does not assume lift on under-proofed SKUs.

`compareProductDetailPreviewModes` models flat vs in-room preview conversion and add-to-cart rates from shared catalog state.

## Partner credential vault

Programmatic fulfillment and ad catalog sync require env-scoped API keys before Phase 2 persistence:

- **Printful/Gelato** — product variant mapping + margin routing
- **Meta/Google/Pinterest** — pixel + catalog feed credentials
- **Stripe Connect** — already scaffolded via webhook route

`buildPartnerCredentialVault` checks `.env.example` keys and surfaces launch blockers without exposing secret values.

## Strategic implication

Market launch needs three parallel gates: buyer conversion (preview CTA), supply economics (artist earnings calculator), and ops credentials (partner vault). All three ship as interactive prototypes wired to shared `marketplace.ts` math before Convex/Supabase persistence.
