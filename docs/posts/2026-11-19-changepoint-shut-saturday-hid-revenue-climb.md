---
title: "A closed Saturday seemed to hide a 50% revenue climb. The simulation disagreed"
seo_title: "Does a closed weekday hide revenue changes from alerts?"
date: 2026-11-19
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "Leaving out a UK shop's closed Saturdays let our watch hear its autumn revenue climb in two years. On 200 simulated shops it gained nothing, so it did not ship."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s metric watch is meant for the numbers a
small business looks at every morning: orders, revenue, sign-ups. It runs once a day (on GitHub Actions in your own
account, if you like) and pings you when one of them has really moved.

Last week we ran it over two years of a real UK online gift shop (the UCI Online Retail data, CC BY 4.0). On the later
year its quiet setting never said a word about revenue while daily takings climbed from about £26k to £50k between
September and November. That is the change a shop owner most wants to hear about.

## The suspect that wasn't

The obvious suspect was heavy tails: a single wholesale order can double a day. The suggested fix was to take logs.
We tried that first, on the trading days. It made things worse: zero alerts at every setting.

The next suspect was duller. The shop never trades on Saturdays, so one row in seven is a zero that is simply part of
the week. Leave the Saturdays out (and read the weekly cycle as six rows) and the quiet setting heard the climb: a
change dated 2011-09-15, sent six days later.

## Testing it on a year we hadn't tuned on

We wrote the rule and its pass marks down before running it on the shop's earlier year (2009 to 2010) or on 200
simulated shops ([the pre-registration](../../ventures/changepoint-detector/eval/shut-weekday.prereg.md)).

Round 1 failed, and the reason is worth knowing. The rule asked for a weekday that is zero *every* week. The shop's
very first Saturday in the earlier year, 5 December 2009, took £9,803. So nothing was left out, and the watch
behaved exactly as before: it noticed the autumn climb, but 59 days after it began.

Round 2 changed one thing, written down before it ran: a weekday counts as shut when it was zero in each of its
**last eight weeks**, the weeks that describe the shop now. On the earlier year the same climb was sent **6 days**
after it began instead of 59, at 0.39 alerts per 100 daily checks.

Then the simulation: 200 made-up shops shut on Saturdays, with heavy-tailed takings, half with no change and half
with a 30% jump in revenue. The bar was that dropping Saturdays should catch at least 60 jumps and 15 more than the
default. It caught 34; the default caught 38. False alarms were the same (1.9 per 100 daily checks either way).

So the simulated watch was never deaf in the first place, and leaving Saturdays out did not help it. Whatever deafened
the watch on the real shop, the closed Saturday alone doesn't explain it. Our best guess is the shape of the change:
the real climb builds over weeks, while the simulated one is a single jump. That guess is the next test.

## What changed in the tool

Nothing on the command line or the page. We said in advance that all four bars had to pass, and one didn't. The
helper functions and the full results ([README section](../../ventures/changepoint-detector/README.md), eval outputs)
are in the repository for the next round.

If you run a shop that closes one day a week and want to try it by hand, delete that day's rows from your CSV and use
`--period 6`. On this one shop it would have flagged the autumn climb within a week, in both years. On the simulated
shops it changed nothing.

The "middle" setting stays deaf to slow climbs either way, and the replay that suggests a setting tends to pick it
because it stays under budget. That is the other open item.

*This is statistical analysis of data you supply, not financial advice.*
