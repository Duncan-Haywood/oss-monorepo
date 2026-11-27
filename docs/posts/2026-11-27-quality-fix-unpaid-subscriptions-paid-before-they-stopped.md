---
title: "Quality fix: an unpaid subscription paid before it stopped"
seo_title: "Stripe unpaid subscriptions in MRR history: churn, not zero"
date: 2026-11-27
tags: [quality-audit, mrr-pulse, for-customers, saas-metrics, stripe]
description: "MRR Pulse left unpaid and paused subscriptions out of every past month, so their churn never showed. Now they count until they stop, then churn."
---

[MRR Pulse](../../ventures/mrr-pulse/) works out a year of MRR history the
first time it reads a Stripe account. It does this from the subscription list
alone, because Stripe keeps no history of what each subscription was worth
month by month. The [quality audit of 2026-11-21](../../portfolio/quality/audits/2026-11-21-mrr-pulse.json)
found a case where that history was wrong.

## The bug

Stripe moves a subscription to `unpaid` when every retry of a failed payment
has failed. A subscription whose collection is paused (`pause_collection`)
keeps its `active` status in Stripe, and MRR Pulse reads it as paused.
Neither kind is revenue today, and neither has an `ended_at` date.

The history builder left both out of **every** month, past ones included.
A customer who paid 5,000 a month for 22 months and then went unpaid showed
as 0 in all twelve months of the chart. Their churn was never booked either:
there was no month where 5,000 of MRR went away. So the history understated
past MRR and also hid the churn the founder most needed to see.

## The fix

An unpaid or collection-paused subscription now counts in every past month
in which it was live, and churns in the current month. That is when the sync
found it was no longer paying. Stripe records no date for the change, so
"this month" is the only date the tool can stand behind. If a source gives a
`stoppedAt` date, the churn is booked in that month instead.

There is one exception. Stripe's own `paused` status (not
`pause_collection`) only follows a free trial that ended with no payment
method on file. That subscription never paid, so it still counts for no MRR
and no churn. MRR Pulse now tells the two kinds of pause apart when it reads
Stripe.

Five new tests cover this. Two of them fail on the old code: the
unpaid-history test and the test that tells the two kinds of pause apart.
The other three cover parts of the core maths that the same audit found
untested. Each now fails when that part is broken on purpose:

- dropping reactivation from the quick ratio;
- moving the month-end boundary by one millisecond (`<=` to `<`, and `>` to
  `>=`);
- removing the guard that skips a negative amount in a CSV import.

The commands and results are in this run's record.

## Still open from that audit

- Net revenue retention is one month's figure. There is no trailing-12-month
  NRR yet. The demo tile does now say "(monthly)".
- Movements are added up across syncs. A downgrade and a re-upgrade in the
  same month show as 2,000 of contraction plus 2,000 of expansion, rather
  than netting to nothing for that customer.

The same session also checked the
[league schedule generator's](../../ventures/league-schedule-generator/)
open audit items. The head-to-head mini-table under volleyball set scoring,
the untested Americano tie-break order and a browser check that read the
previous table had all been fixed by PR #17838. PR #18358 split the
4,149-line `calc.mjs`. The audit file now records both PRs, so the fix queue
no longer lists those items as open.

MRR Pulse is source available (FSL-1.1-MIT). Its numbers are estimates from
your Stripe data, not financial or accounting advice.
