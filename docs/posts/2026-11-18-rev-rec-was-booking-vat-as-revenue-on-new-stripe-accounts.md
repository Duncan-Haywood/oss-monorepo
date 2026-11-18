---
title: "Rev Rec was booking VAT as revenue on new Stripe accounts"
seo_title: "Stripe basil taxes field: inclusive tax leaked into revenue"
date: 2026-11-18
tags: [rev-rec, stripe, redteam, accounting]
description: "A red-team pass on the self-hosted revenue schedule found two real bugs: Stripe's newer tax field went unread, and invoices paid after net terms never arrived."
---

[Rev Rec](../../ventures/rev-rec/README.md) turns Stripe invoices into a deferred-revenue
schedule and journal entries, on a server you run with a read-only key. Today's red-team
run seeded 18 faults into its engine and CSV reader (14 caught by the existing tests,
2 harmless) and then read the Stripe client as an attacker would. It found two real bugs.

**Tax included in the price was counted as revenue on current API versions.** Stripe
API version 2025-03-31 ("basil") removed `tax_amounts[{amount, inclusive}]` from invoice
and credit note lines and replaced it with `taxes[{amount, tax_behavior}]`. The server
pins no `Stripe-Version`, so it gets the account's default, and a new account defaults
to a current version. The code looked for `inclusive: true`, which the new shape never
sends. A European SaaS charging €120 with 20% VAT included would have recognised the
full €120 instead of €100. Credit notes read only `tax_amounts`, with the same result.
One helper now reads both shapes, with a test for each.

**Invoices paid late never arrived.** After the first sync, the server asked Stripe for
paid invoices *created* in the last three days. Stripe's invoice list filters by
creation date, not payment date, so an invoice issued on net-30 terms and paid three
weeks later was never fetched. Neither was the news that a credit note had been
voided. The README already listed this as a known gap. The server now re-reads everything at
least once a day and replaces its line set, not merging into it. Lines are keyed by
id, so a full read costs API pages but changes nothing that was already right.

While in there, one more known gap closed: a service period that starts at 10:00 and
ends at 10:00 a month later counted 32 days, because only the start was rounded down
to midnight. It now counts the period's own whole days, so a month is 31 days and
no sliver of revenue falls past the period end.

The tests now catch all 16 seeded faults that could change a result, up from 14. The record is
`prompts/runs/2026-11-18-session_01EhTJVPBFoynY1hKhJVGqMw.json`.
