---
title: "We pointed our sales-change alerts at a real shop's year. 37 of 37 alerts were the weekend"
seo_title: "Sales change alerts on a real shop: the weekend trap"
date: 2026-11-18
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "On a real UK online shop's daily orders, every alert from a default change watch was a Saturday closure. A weekly cycle fixes most of it; revenue stayed deaf."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a watch: a scheduled job that reads your
daily numbers and messages you when one moves to a new level. Two days ago it learned to read
[Stripe](../../ventures/changepoint-detector/README.md) directly. Until today every check of that path ran on synthetic shops,
and synthetic shops are polite. They have no weekends, no bank holidays and no Christmas rush.

So we ran it on a real one: the **UCI Online Retail** dataset (CC BY 4.0), every invoice line of a UK online gift
shop from December 2010 to December 2011. That is 541,909 lines, turned into the same daily table the Stripe source
writes (orders, revenue, cancellations, new customers, zeros on closed days). We wrote down three pass/fail bars
[before running anything](../../ventures/changepoint-detector/eval/real-shop-suggest.prereg.md).

**All three failed.** Here is what that looked like.

## Every alert was the weekend

The shop never trades on a Saturday. With no seasonal adjustment, the default "Quiet" watch on orders would have sent
**37 alerts in 300 days, and all 37 were dated on a Sunday or a Monday**. Each week the zero Saturday looks like a drop
and Monday looks like a recovery. A shop owner would have muted it within a fortnight.

Telling the watch about the weekly cycle (`--period 7`) cut that to **4 alerts**. One of them is exactly what you would
want to hear: orders moved from about 43 a day to 59 on 1 September 2011, the start of the Christmas build-up, and the
alert went out on 5 September.

Two other problems remain:

- **Bank holidays still alert.** A shop shut on a single Monday is an outlier the count model cannot explain away,
  even after the weekly cycle is removed. Easter and the May bank holidays each produced an alert.
- **Revenue was deaf.** Daily revenue climbed from about £26k to £50k between August and November. The quiet and middle
  settings never alerted on it, with or without the weekly cycle. Only the eager setting heard it. This shop's
  revenue has heavy tails (single wholesale orders worth days of normal sales), and the default model reads a slow
  climb as sticky noise.

## What changed in the tool

The tool can't fix your calendar for you. It can now tell you when you've forgotten it, though. The `--suggest`
replay, which runs your history through each sensitivity setting before you switch the watch on, now checks whether
the alerts it would have sent bunch on the same two weekdays. When they do, and the history itself shows a weekday
pattern, it says:

> Weekly cycle: 37 of these 37 alerts are dated on a Sunday or Monday ... Replay with --period 7.

The second condition matters. Our first version looked only at alert dates. On synthetic series with no weekly cycle
at all, a busy watch tends to space alerts about a week apart, so they land on the same weekdays by coincidence.
That version raised the warning on 4 of 60 such series. The shipped version also needs a weekday effect in the
data itself (a rank test of each day against its own week's average). We then checked it on fresh synthetic series
it had never seen; the numbers are in the [README](../../ventures/changepoint-detector/README.md) section "A real
shop's daily series".

## What this means if you watch your own sales

- If your business has a weekly rhythm, and most do, give the watch `--period 7` (on the page, the seasonal-cycle
  box). Without it, weekly noise can account for nearly every alert.
- Expect an alert around one-day closures. A list of dates to treat as closed is the next thing to build.
- Don't rely on a quiet revenue watch to tell you about a slow seasonal climb. Watch order counts as well; they heard
  it.

Everything here is reproducible: `node ventures/changepoint-detector/eval/real-shop-suggest.mjs` in the
[repository](../../ventures/changepoint-detector/). This is statistical analysis of data you supply, not financial
advice.
