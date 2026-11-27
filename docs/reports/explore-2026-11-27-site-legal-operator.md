---
kind: brief
date: 2026-11-27
subjects: [pages, payapps]
title: The site's Privacy, Terms and Cookie pages named the wrong company and state
description: marisstella.app's own legal pages said "Mary Stella Labs, LLC" under New Mexico law while every paid product names Maris Stella Labs LLC, a Colorado LLC; fixed and held together by a test.
---

# Site legal pages: operator corrected to Maris Stella Labs LLC, Colorado

Date: 2026-11-27. Explore run.

**What was wrong.** `platform/pages/legal-pages.mjs` (`LEGAL_OPERATOR`) built
`/privacy/`, `/terms/` and `/cookies/` on https://marisstella.app/ naming
"Mary Stella Labs, LLC", New Mexico, with Terms "governed by the laws of the
State of New Mexico". The owner's filing is Maris Stella Labs LLC, CO
(`prompts/goals.md`, "2026-11-26: agents approve launch"), which is what
PayApps, Job Shop Quote and Seller Books already say in
`ventures/*/apps/*/docs/legal/terms.md`. The product copies were fixed in
private-monorepo#240 (run record 2026-11-26, session ...f53gamiiakrurAMq4);
the site's own pages, added 2026-11-25 from the same early grants draft, were
missed.

**Why it matters now.** The decision queue's top item (`payout-rail`) is
Paddle's account verification, whose domain review reads the merchant
domain's terms, privacy policy and refund policy. A site naming a company and
state that do not match the merchant account is the kind of mismatch that
review flags, and Terms that name a non-existent entity are a liability on
their own.

**What changed.**
- `LEGAL_OPERATOR` is `Maris Stella Labs LLC`, `Colorado`; `LEGAL_UPDATED`
  is 2026-11-27.
- `platform/pages/footer-privacy.test.mjs` has a new test that reads every
  `ventures/*/apps/*/docs/legal/terms.md` and fails if any of them does not
  name `LEGAL_OPERATOR.name` or is not governed by `State of
  <LEGAL_OPERATOR.jurisdiction>` law, and if the site's pages still say
  "Mary Stella" or "New Mexico". A later product's terms or a later edit to
  the site's operator cannot drift apart silently.

**Still open (not this PR).** Paddle's domain review also wants a pricing page
and a refund policy reachable on the domain. The product apps carry their own
(`docs/legal/refunds.md`), but the catalogue deliberately quotes no price
while checkout is dark (`platform/pages/industry-construction.mjs`, header
comment). Whether to publish "planned prices, not on sale yet" for the review
is a judgement for the run that switches checkout on.
