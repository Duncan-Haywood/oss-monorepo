---
title: "Quality fix: a closed month in Rev Rec now stays closed"
seo_title: "Rev Rec period lock: late Stripe payments no longer rewrite closed months"
date: 2026-11-18
tags: [quality-audit, ventures, accounting]
description: "Rev Rec, our free deferred-revenue schedule for Stripe, rewrote months you had already exported and left Accounts receivable growing. Both are fixed, with tests."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The queue's first high-severity row was in [Rev Rec](https://marisstella.app/rev-rec/),
the free self-hosted deferred-revenue schedule for Stripe. Its
[2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-rev-rec.json) found that
incremental syncs missed invoices paid more than three days after they were
issued. That one had already landed: the red team's PR #17139 added a full
re-read every day. Three other defects in the same audit had been fixed
without being recorded: the time-of-day extra day and the newer Stripe tax shape
(#17139), and zero-decimal currencies such as JPY (#17161). This session
recorded those four and then fixed the two defects a bookkeeper would hit at the
first month-end close.

## What was wrong

**Closed months moved.** Rev Rec rebuilt the whole schedule from every
invoice line on each request. Take a net-30 invoice for a January to March
service period that is paid on 10 March. Once it was paid, January and February
revenue went up after you had already exported those months to your ledger.
Your books and the tool no longer agreed, and nothing told you so.

**Accounts receivable never cleared.** Each billing was posted as a debit to
Accounts receivable on the date the invoice was *paid*. Nothing ever credited
it, so the receivable grew by your whole billing volume every month.

## What changed

- `CLOSED_THROUGH=YYYY-MM` (or `?closed_through=` on any endpoint) locks
  months you have closed. When a line is paid after the close, the amounts it
  would have billed or recognised in those months go into the first open month
  as a catch-up entry, which is how an accountant books a late item. In the
  test case above, March shows 12,100 recognised: 3,100 of its own share plus
  9,000 for the late line. January and February match their values from before
  the payment, and the totals and closing deferred balance are unchanged.
  A malformed month returns a 400 error, not a 500.
- Billings now debit **Stripe balance** (cash). Lines are dated on the day they
  were paid, so the money has already arrived. `ACCOUNT_CASH` sets the account
  name, and the older `ACCOUNT_RECEIVABLE` still works.
- Two seeded bugs the audit said would survive the tests are now caught: one
  sends the rounding remainder to the wrong months, the other changes the
  three-day sync overlap. A mutant that disables the lock is also caught
  (`quality_mutate.py`, all three `caught: true`). The suite went from 64 to 70
  tests, all passing.

## Still not at the bar

- A **setup fee** is recognised in full on its date. Under ASC 606-10-55-51 a
  non-distinct upfront fee is spread over the service period. The README now
  says so and tells you to book that adjustment by hand.
- The lock covers late payments. A **void** of an invoice paid inside a
  closed month still rewrites that month on the next full re-read.
- No standalone-selling-price allocation for bundles.

The scores in the audit file are the scores from before these fixes. A later
round re-audits the product.
