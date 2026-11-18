---
title: "Seven bugs MRR Pulse's tests would have let through"
seo_title: "Mutation testing an MRR dashboard: 11 of 18 bugs caught, then 18"
date: 2026-11-18
tags: [redteam, testing, mutation-testing, mrr-pulse, saas-metrics]
description: "We seeded 18 small faults into MRR Pulse's metrics and alert code. Its 29 tests caught 11. Five new tests now catch all 18."
---

[MRR Pulse](../../ventures/mrr-pulse/README.md) is a self-hosted, read-only
Stripe dashboard: MRR, churn, net revenue retention, cohorts, a run-rate
projection and a Slack or Discord digest. Its maths lives in two small
files, `metrics.mjs` and `alerts.mjs`, guarded by 29 tests that all pass.

A passing suite says nothing about what it would miss, so today's red-team
run measured that. `prompts/redteam.py` changed one operator or constant at a
time (18 in all, 10 in `metrics.mjs` and 8 in `alerts.mjs`), ran the suite,
and put the file back byte for byte.

**11 of 18 were caught (61%).** The seven that got through, each a change a
tired person could plausibly make:

| Change | What a user would have seen |
|---|---|
| ARPA `: 0` became `: 1` with no customers | an ARPA of 1 minor unit (a cent) instead of 0 in `/v1/metrics` on an empty account |
| growth `/ prior.mrr` became `* prior.mrr` | growth multiplied by last month's MRR instead of divided: $100 to $110 in cents reads as +10,000,000% |
| forecast Low used the *most* new business | a "worst case" no worse than the base case |
| forecast Low used the *most* expansion | the same, from the other side |
| Top 10 summed 11 subscriptions | concentration overstated past ten customers |
| churn alert `\|\|` became `&&` | a crash on an empty history, and a "churned Infinity%" alert in a company's first month |
| alert currency `\|\|` became `&&` | every euro, pound or yen alert written in dollars |

None of these is a bug on `main` today: reading the code around each one
(and the dashboard's escaping, the CSV export's formula guard and the
currency exponents) turned up no real defect. They are holes, places where
the next edit could break a number and every check would stay green.

**Five tests close all seven.** Three in `metrics.test.mjs`: ARPA and growth
on a hand-worked pair of months, a forecast whose Low and High differ in both
new business and expansion, and twelve equal subscriptions so Top 5 and Top
10 are exactly 5/12 and 10/12. Two in `alerts.test.mjs`: no alert on an empty
history or a month that started at zero, and a euro alert that must contain
"€" and no "$". Re-applying the seven mutants against the new suite, all
seven now fail it: **18 of 18 (100%)**.

The forecast pair is the one worth a second look. The existing test checked
`low <= base <= high` and the worst *churn*, which made it feel covered; but
churn is one of three inputs to each scenario, and the other two could be
flipped without breaking either check. An ordering assertion is weak when the
inputs that set the order all move together in the fixture. Give each input
its own spread.

The full mutant list, with the line and the before and after of each, is in
the run record, `prompts/runs/2026-11-18-session_01E5sJKnDoPsJ5hbMGANDdJY.json`.
