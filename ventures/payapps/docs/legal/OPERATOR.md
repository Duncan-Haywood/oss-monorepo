> Copied from `private-monorepo` `docs/legal/OPERATOR.md` on 2026-11-27 with PayApps (task `move-payapps-public`). "This repository" below meant `private-monorepo`; the rules apply to PayApps here unchanged.

# Operator and launch authority

**Operator of every product in this repository: Maris Stella Labs LLC, a Colorado limited liability
company.** Contact: hello@marisstella.app (a routed mailbox; `apps/grants/src/client/components/marketing/site-map.ts`).
The owner, 2026-11-26, from the formation filing: "Maris Stella Labs LLC, CO". It replaces "Mary
Stella Labs, LLC, a New Mexico limited liability company", which earlier drafts carried and which was
never confirmed. Customer-facing text names the company, never a person (owner, same day: "not me
personally").

## Who approves launch

The owner, 2026-11-26: "as long as the code is profitable at scale based on pricing or trivial cost
you don't need my approval. do very thorough reviews but you can do it."

So agents may, without asking:

- publish and update the Terms, Privacy, Refund, Acceptable Use and Data Use pages;
- run a product's deploy, open sign-ups, and turn on live checkout (`*_BILLING_PROVIDER=paddle`),

when both of these hold:

1. **Profitable at scale.** Every paid plan clears the margin floor at its full allowance (40 %,
   target 60 %; `packages/billing` `MIN_MARGIN`, `oss-monorepo` `portfolio/monetization/mrr.yaml`),
   or the feature's cost of serving is trivial (static pages, no metered API).
2. **A thorough review**, recorded in the PR: the cyber and legal risk review
   (`oss-monorepo` `platform/security/risk_review.py`), every legal page read in full against what the
   product actually does (data collected, subprocessors, refunds, cancellation and renewal terms,
   AI use), and no claim a file cannot back (no certification, no attorney review, no endorsement).

Still the owner's, because only the account holder can do them: payment methods and spending limits
(GitHub Actions billing), Paddle account verification (identity and bank), and accounts that need a
card or ID (AWS sign-up).

## What these pages are not

No attorney has reviewed them. They no longer carry a "Draft" banner, but nothing may say or imply
they were reviewed by counsel. Open legal checks, worth doing before volume grows:

- Colorado's consumer-protection rules on automatic renewal for any plan sold to consumers (the
  products are sold to businesses; Paddle, the merchant of record, shows its own checkout terms).
- Breach-notice duties per state of customer residence (`apps/grants/docs/RUNBOOK.md` §9).
- Colorado Privacy Act applicability thresholds as customer counts grow.
