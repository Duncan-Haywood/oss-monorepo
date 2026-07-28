# Print routes, Stripe Connect, and metadata confidence — 2026-06-12

## Sources

- [Stripe Connect payouts overview](https://docs.stripe.com/connect/payouts) — transfer timing and connected account balances
- [Stripe pricing](https://stripe.com/pricing) — 2.9% + $0.30 per successful card charge (US baseline for simulator)
- Existing in-repo research: `2026-06-12-competitive-battlecards-seo.md`, `2026-06-08-creative-diversity-demand.md`

## Strategic implication

Digital stock building requires three publish gates in software before ad spend:

1. **Metadata confidence** — tags, SEO copy, room mockups, and proof must score high enough for AI-assisted cataloging
2. **Consent gate** — storefront SEO routes only index when POD license and payout acknowledgement are recorded
3. **Payout simulator** — Stripe Connect test-mode onboarding should only proceed when per-order economics clear blockers

Programmatic `/prints/[slug]` routes make long-tail SEO shippable as static pages while blocked listings remain `noindex` previews.
