---
kind: polish
date: 2026-11-04
tagged: auto
---
# Polish 2026-11-04: answer-first lead on the card processing fee audit

**Weak surface.** The card processing fee audit had no `data-answer-lead`.

**Change.** Lead states Stripe's standard US online price (2.9% + $0.30, read directly from stripe.com/pricing on 2026-11-04, HTTP 200) and says the audit splits that blend into network cost and processor markup. The $0.30 is exported from `calc.mjs` as `STRIPE_STANDARD_PUBLISHED` and checked in `answer-lead.test.mjs`.

**Measured.** answer-lead test 19/19; venture suite 47/47. No site build; rankings not measured.

**Next.** Square and PayPal leads on the vs-* sub-pages (both returned 200 in the earlier probe). Etsy stays blocked.
