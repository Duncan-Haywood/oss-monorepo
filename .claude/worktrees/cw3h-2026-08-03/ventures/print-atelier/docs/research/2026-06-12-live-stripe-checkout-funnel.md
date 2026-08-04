# Live Stripe Checkout + Investor Funnel (2026-06-12)

## Summary

Print Atelier crossed from checkout session **preview** to **live Stripe Checkout Sessions** when test-mode keys are configured. The investor dashboard now surfaces a five-stage buyer funnel: consent-cleared listings → cart eligible → Stripe env → POD fulfillment → live session.

## Sources

- [Stripe Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions/create) — `stripe.checkout.sessions.create` with `line_items.price_data`
- [Stripe Node SDK](https://github.com/stripe/stripe-node) — server-side session creation in Next.js API routes
- Prior art: `docs/research/2026-06-12-checkout-stripe-slice.md`

## Strategic implication

"Ready to sell" now means the product can redirect buyers to Stripe when env keys and POD credentials are present — not just display a JSON payload. The investor funnel makes checkout blockers visible before scaling programmatic ad spend.

## Next persistence steps

1. `payment_intent.succeeded` webhook → Convex/Supabase order record
2. Connect transfer routing per line-item artist metadata
3. Printful/Gelato job trigger from order fulfillment partner ID
