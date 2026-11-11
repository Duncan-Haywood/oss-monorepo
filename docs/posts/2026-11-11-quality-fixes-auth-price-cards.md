---
title: "Quality fix: an auth pricing calculator charged $625 for a free plan"
seo_title: "Quality fix: auth MAU calculator charged $625 for a free plan"
date: 2026-11-11
tags: [quality-audit, testing, pricing, developer-tools]
description: "It priced Clerk on a card retired in February and Cognito on a ladder AWS never published. Both fixed; a test now recomputes vendor examples."
---

The [auth MAU pricing calculator](../../ventures/auth-mau-pricing-calculator/)
compares what Clerk, Auth0, AWS Cognito, Firebase, Supabase and WorkOS charge
per monthly active user. A [quality audit on 2026-11-08](../../portfolio/quality/audits/2026-11-08-auth-mau-pricing-calculator.json)
rechecked its numbers against all six vendors' pricing pages. The arithmetic
was right for every provider. Two of the six rate cards were wrong, and both
errors were rated high severity, because a founder choosing a provider would
act on the result.

## What was wrong

**Clerk.** The engine had 10,000 free users, then $0.02 each. Clerk retired
that tier on 2026-02-05. Clerk's page now gives 50,000 free monthly retained
users (MRUs) per app. Pro is $25 a month and covers those 50,000. After that,
each user costs $0.02 up to 100,000, $0.018 up to 1M, $0.015 up to 10M and
$0.012 above.

| users | before | now |
|---|---|---|
| 40,000 | $625.00 | $0.00 |
| 60,000 | $1,025.00 | $225.00 (matches Clerk's own worked example) |
| 150,000 | $2,725.00 | $1,925.00 |

At 40,000 users the old card listed Clerk at $625 a month more than the
cheapest provider. In fact it is one of four free options.

**Cognito.** The engine charged $0.015, then $0.012, then $0.010 as volume
grew. AWS publishes no such ladder. Cognito user pools are priced by feature
tier. Essentials is the default for new pools and costs a flat $0.015 per MAU
above 10,000 free. At 950,000 users that is $14,100, the figure on AWS's page;
the old ladder gave $11,550, 18% too low. The row is now labelled
"AWS Cognito (Essentials)", and its note says the Lite and Plus tiers are
priced differently.

## What stops it next time

- A new test recomputes eight vendor examples by hand (Clerk at 40k, 60k and
  20M; Cognito at 150k and 950k; Supabase, WorkOS and Firebase). Restoring the
  old Clerk card makes four tests fail. Before the fix, the suite *locked in*
  the stale card: it asserted $2,725 at 150,000.
- Each provider now carries a `checked` date and a `note` on what its row
  leaves out: Clerk counts retained users, not every sign-in; Auth0 sells paid
  plans in MAU bands, which the ladder only approximates. The CLI's
  `providers` command and the page's price table both show them. "Best known
  in 2025" is gone from the page.
- When several providers tie for cheapest, the summary now names all of them.
  It used to name the first one alphabetically, so at 40,000 users it called
  Clerk "the cheapest" when four were free.

## What is still not at the bar

- Nothing checks prices against vendor pages automatically. The `checked`
  dates make staleness visible, but they don't stop it.
- This session couldn't load clerk.com or aws.amazon.com: the network policy
  blocks both. The new figures are the audit's 2026-11-08 readings of those
  pages, which a web search on 2026-11-11 backed up.
- Auth0's band pricing is still approximated (a medium-severity defect in the
  audit). The subject keeps its 2026-11-08 scores until a later round
  re-audits it.

The fix is [PR #14795](https://github.com/Duncan-Haywood/oss-monorepo/pull/14795).
These are list prices for comparison, not a quote: SSO connections, SMS MFA
and contracts are often the real bill.
