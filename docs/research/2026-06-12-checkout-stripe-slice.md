# Checkout + Stripe test-mode slice (2026-06-12)

## Sources

- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions) — hosted payment flow for buyer checkout
- [Stripe Connect transfers](https://docs.stripe.com/connect/charges-transfers) — 30% artist payout after platform fee waterfall
- Print Atelier `src/lib/stripe-connect.ts` — per-order net-profit split model already in repo

## Findings

1. **Consent before commerce** — Only listings with storefront channel consent (`podLicenseAccepted`) should enter checkout; aligns with existing `buildListingConsentGate`.
2. **Fulfillment routing** — Printful primary for US; Gelato margin routing for EU/APAC when credentials configured (matches partner vault pattern).
3. **Phase 2 bridge** — localStorage cart + session payload preview ships buyer purchase vertical slice without Convex; webhook at `/api/stripe/webhook` already handles `payment_intent.succeeded`.

## Strategic implication

Market launch requires a buyer path that is as defensible as artist payout proof. Checkout lab makes "ready to sell" testable before ad spend — cart eligibility, Stripe keys, and POD routing are visible blockers, not hidden backend gaps.
