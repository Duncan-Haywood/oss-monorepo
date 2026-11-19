---
title: "A shop's closed Saturday hid a 50% revenue climb from our change alerts"
seo_title: "Why a closed weekday hides revenue changes from alerts"
date: 2026-11-19
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "Our metric watch never heard a UK shop's autumn revenue climb. The cause was the Saturday the shop never opens, not heavy tails. Leaving it out fixed it in both years."
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

The real cause was duller. The shop never trades on Saturdays. One row in seven is a zero that is simply part of the
week. Even with the weekly cycle removed (`--period 7`), the watch's default level model, which allows for sticky,
autocorrelated noise, read that built-in zero as noise loud enough to drown a 50% climb.

Leave the Saturdays out and the quiet setting heard it: a change dated 2011-09-15, sent six days later.

## Testing it on a year we hadn't tuned on

We wrote the rule and its pass marks down before running it on the shop's earlier year (2009 to 2010) or on 200
simulated shops ([the pre-registration](../../ventures/changepoint-detector/eval/shut-weekday.prereg.md)).

Round 1 failed, and the reason is worth knowing. The rule asked for a weekday that is zero *every* week. The shop's
very first Saturday in the earlier year, 5 December 2009, took £9,803. So nothing was left out, and the watch
behaved exactly as before: it noticed the autumn climb, but 59 days after it began.

Round 2 changed one thing, written down before it ran: a weekday counts as shut when it was zero in each of its
**last eight weeks**, the weeks that describe the shop now. On the earlier year the same climb was sent **6 days**
after it began instead of 59, at 0.39 alerts per 100 daily checks.

SIMPARA

## What changed in the tool

The watch now does this by default for money and other level columns: a weekday that has been zero for eight weeks
is left out, and a weekly cycle of 7 becomes 6. It says so in its output, and `--shut-days keep` turns it off. Count
columns such as orders are untouched, because the count model already handles a zero Saturday once the weekly cycle
is on. The page's history replay does the same.

Two things it does not fix. The "middle" setting is still deaf to slow climbs, and the replay that suggests a
setting tends to pick it because it is under budget. And no data here has a shop shut two days a week. Both are
written down as the next items in the [README](../../ventures/changepoint-detector/README.md).

*This is statistical analysis of data you supply, not financial advice.*
