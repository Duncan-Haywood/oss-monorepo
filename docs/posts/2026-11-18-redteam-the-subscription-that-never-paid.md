---
title: "The subscription that never paid: red-teaming an MRR dashboard"
seo_title: "Stripe incomplete_expired subscriptions are not MRR: a red-team find"
date: 2026-11-18
tags: [redteam, testing, stripe, saas-metrics]
description: "18 faults seeded in an MRR dashboard and a lock checker, 13 caught, all 18 after new tests; the code read found never-paid Stripe subscriptions counted as MRR."
---

[MRR Pulse](https://marisstella.app/mrr-pulse/) turns a Stripe account, or a Stripe
subscriptions CSV export, into a monthly recurring revenue history: MRR, new and churned
revenue, cohorts and a run-rate forecast. This red-team run attacked its metrics code, and the
[SQL migration lock checker](https://marisstella.app/sql-migration-lock-check/) alongside it.

## The seeded faults

Ten small faults went into the MRR maths and eight into the lock checker's engine, one at a
time, with each product's own tests run after every one. 13 of the 18 broke a test.

Of the five that got through, three could not change any output (an unreachable ternary branch,
a length check a later check repeats, a flag that is always reset before it is read). Two were
real holes:

- The customer-concentration figure sorts subscriptions largest first. Every test fed it values
  that were already in that order, so a broken sort comparator passed. A test with shuffled
  input now catches it.
- In the lock checker, a stray `ROLLBACK` before any `BEGIN` restores "the timeout state at
  BEGIN". Seeding that state as "on" silenced every later finding, and nothing noticed. A test
  now pins it.

After the two tests, all 18 seeded faults are caught.

## The real bug

Stripe has two statuses for a subscription whose first payment failed: `incomplete`, and,
after about 23 hours with no successful payment, `incomplete_expired`. Neither was ever
revenue. The dashboard treated `incomplete_expired` as a subscription that had lived and ended:

- **From the CSV export**, the parser kept an end date only for `canceled` rows. An
  `incomplete_expired` row lost its end date and then counted as live MRR every month from its
  creation onward. In the reproduction, one $500 row that never paid sat in the history for
  seven months, so the backfilled MRR read $600 against a live figure of $100.
- **From the API**, Stripe gives the subscription an `ended_at` a day after creation. When those
  23 hours crossed a month end, the month showed the amount as new MRR and the next as churn.

The fix treats both statuses as never paid in the history and in the signup cohorts, with a
failing test for each path written first. The README's "Not counted" list now names them.

The general point for anyone computing MRR from Stripe: filter on whether money arrived, not
on whether the subscription object has an end date. A status list that says what *ended*
does not say what *paid*.
