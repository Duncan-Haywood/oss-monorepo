---
kind: polish
date: 2026-11-04
tagged: auto
---
# Polish 2026-11-04: answer-first lead on the Amazon FBA calculator

**Weak surface.** The Amazon FBA calculator, a high-intent page, had no `data-answer-lead`.

**Change.** Lead states $0.99 per item (Individual) and $39.99 a month (Professional), and that Professional is cheaper from 41 units a month (40 x $0.99 = $39.60 < $39.99 < 41 x $0.99). Source fetched directly from sell.amazon.com/pricing on 2026-11-04 (HTTP 200 through the proxy). Added to `answer-lead.test.mjs` against `SELLER_PLAN_DEFAULTS`.

**Measured.** answer-lead test 18/18; amazon-fba-calculator suite 326/326. No site build; rankings not measured.

**Reachability probe (2026-11-04).** 200: sell.amazon.com/pricing, stripe.com/pricing, squareup.com/us/en/pricing, paypal merchant-fees. 403/404: etsy.com/legal/fees, irs.gov newsroom fsa-limits, dol.gov factsheet.

**Next.** Stripe/Square/PayPal leads for card-processing-fee-audit (stripe shows 2.9% + 30c domestic). Etsy stays blocked.
