---
title: "Red team: MRR Pulse missed every coupon on newer Stripe API versions"
seo_title: "Stripe discounts vs discount: why your MRR can read high"
date: 2026-11-20
tags: [mrr-pulse, redteam, ventures]
description: "Stripe deprecated subscription.discount in API 2025-03-31.basil; the list returns discounts as bare ids, so MRR Pulse netted coupons as 0% off."
---

[MRR Pulse](https://marisstella.app/mrr-pulse/) is our self-hosted MRR
dashboard for Stripe. It nets percent-off coupons out of MRR, and the tests
said it did. This red-team run found a case where it didn't.

**What was wrong.** The code read the coupon from `subscription.discount`
and also looked at `subscription.discounts`, but only when that held full
objects. Stripe's [API upgrades page](https://stripe.com/docs/upgrades)
lists `discount` as deprecated from version `2025-03-31.basil` on ("Use the
discounts parameter and field instead"). The list endpoint returns
`discounts` as discount ids, not objects, unless you ask Stripe to expand
them. So on an account set to a newer API version, a 20%-off coupon showed
up as a string, the code skipped it, and MRR came out too high. Every test
fixture used the old single field, so nothing caught it.

There was a second problem behind the first. On older API versions, if the
list call expands `discounts`, the legacy `discount` shows up in that list
too. Expanding without checking for repeats would take the same 20% off
twice.

**The fix.** The list call now asks for `expand[]=data.discounts`. Each
discount is counted once, matched by its id. If Stripe refuses the
expansion for a restricted key (a 403), the sync retries without it and
works as it did before, rather than failing. Three new tests cover these
cases, and each one failed before the change.

**The seeded faults.** We also planted 18 small bugs, one at a time, in
`metrics.mjs` and `csv.mjs`, and the existing tests caught 16 of them. Of
the two that got through, one changed nothing a user can see: a starting
value that is always overwritten. The other swapped `churn + contraction`
for `churn - contraction` in the run-rate forecast. No forecast test had a
month with contraction in it, so a forecast that counted lost revenue as
gained revenue passed. A new test pins it, so the catch rate went from
94% (16 of 17 real faults) to 100%.

What we could not check: Stripe's docs site was out of reach from the
build container. So this post relies on the upgrades page's wording about
the deprecation, not on a request against a live Basil account.
