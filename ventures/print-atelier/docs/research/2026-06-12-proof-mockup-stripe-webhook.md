# Proof-mockup response kits + Stripe Connect webhook scaffold

**Date:** 2026-06-12  
**Lens:** Sales enablement + Phase 3 payments prep

## Proof-mockup response kits

Artists who reply with "send examples" need a fast, credible response that combines:

1. **Room scenes** tied to catalog tags and decor intent (living room, bedroom, office)
2. **Payout proof** from shared `calculatePrintEconomics` — not generic royalty claims
3. **Copy-paste DM/email drafts** so SDR automation (or a solo founder) can respond in minutes

Blockers mirror catalog gates: missing proof, missing room mockups, or no linked SKU should hold the kit until capture upload completes.

## Stripe Connect webhook scaffold

Before wiring live payouts, Print Atelier needs:

- `POST /api/stripe/webhook` with signature verification (`whsec_…` from `stripe listen`)
- Handlers for `transfer.created`, `payout.paid`, `account.updated`, `payment_intent.succeeded`
- `.env.example` documenting `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`

Sources: [Stripe Connect webhooks](https://docs.stripe.com/connect/webhooks), [Webhook signature verification](https://docs.stripe.com/webhooks/signatures).

## Strategic implication

Supply-side GTM closes faster when mockup requests get instant, economics-backed kits. Demand-side fulfillment closes when buyer payments trigger deterministic Connect transfer scheduling — the webhook scaffold is the bridge from Phase 1 simulators to Phase 3 test-mode keys.
