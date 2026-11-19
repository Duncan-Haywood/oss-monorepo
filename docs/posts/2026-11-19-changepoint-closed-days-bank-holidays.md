---
title: "Telling a sales-change watch the shop was shut cut holiday alerts 80%, and still failed our bars"
seo_title: "Bank holidays and sales change alerts: a failed fix"
date: 2026-11-19
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "We filled a real shop's bank holidays before a change watch saw them. Holiday alerts fell from 10 to 2 on a fresh year, short of our pre-registered zero."
---

Yesterday's run pointed the [changepoint detector](../../ventures/changepoint-detector/README.md)'s watch at a real
UK online shop and found that, once the weekly cycle was removed, the alerts left over still clustered around bank
holidays. A shop that shuts on Easter Monday sells nothing that day. To a model of daily order counts, that zero
looks like a sudden drop followed by a recovery, so the watch sends an alert.

The obvious fix is to tell the watch which days you were shut. We wrote the rule and four pass/fail bars
[before coding it](../../ventures/changepoint-detector/eval/closed-days.prereg.md). The rule fills each closed day
with the median of the same weekday in the four weeks before it, and uses only earlier days, so a replay of the
history cannot peek ahead. We tested it on data no earlier round had touched: the same shop's *previous* year,
December 2009 to December 2010, from UCI's **Online Retail II** (CC BY 4.0). Its closed weekdays are the Christmas
closure plus, exactly, the 2010 English bank holidays.

## What happened

| on the fresh year | without the fill | with it |
|---|---|---|
| alerts within a day of a closure (4 columns, 2 alert budgets) | 10 | **2** |
| alerts from the quietest setting, 4 columns | 31 | 22 |
| other alerts still sent (within 3 days) | 42 | 36 |

The bar for the first row was zero, so **it failed**, and the option is not offered. Both survivors are one alert
counted twice, once per budget: cancellations on the Tuesday after Easter. It does not look like a holiday
artefact. Cancellations ran at 2 to 6 a day for that whole week, against about 14 on a usual day, and then came back.
A rule that can tell "the shop just reopened" from "something real started the day the shop reopened" is a
different rule, and we did not get to change the bar after seeing the data.

On orders, the column an owner reads first, the fill worked as hoped. The quietest setting went from 11 alerts
(three of them the days after Easter, early May and late August) to 6, none near a holiday. The autumn build-up was
sent **six days sooner** (13 November instead of 19 November), because the zeros no longer muddied the weeks before
it.

It also had a cost. On the year we had already seen (2011), the same fill made the quietest setting drop its alert for
the start of the Christmas build-up, dated 1 September, three days after the August bank holiday. Part of what the
watch "heard" there was the holiday's zero. The bar that checked for lost alerts only counted alerts more than three
days from a closure, so it passed without seeing this one.

We also ran a simulation: 200 synthetic shops with six random one-day closures each. The fill took the series with
an alert at a closure from 99 in 100 to 8, against a bar of 2, and **that failed too**. The 8 turns out to be ordinary
false alarms rather than holidays: on this noise the quietest setting still sends about 3 alerts per shop over the 287 watched days, and
at that rate about 18 in 100 would land near one of six closures by chance. The bar ignored that base rate. The
simulation also found a real cost: steps caught fell from 75 to 70. Our untested guess is that a closed day just after
a step gets filled from the weeks before the step, which pulls the new level back.

## What ships

The fill stays in the code as a module function with tests that pin these numbers. The command line, the page and
the agent tool are unchanged. Until a better rule passes, a deployer whose shop closes on holidays should expect an
alert around each one. Running `node watch.mjs your.csv --suggest` replays your own history and shows where those
alerts land. The full write-up, with every alert listed, is in the venture's
[README](../../ventures/changepoint-detector/README.md) ("Closed days filled as missing").

Next, pre-registered before it runs: hold alerts dated on the first open day after a closure until a second open
week agrees, tested on a third shop; and simulated steps placed right next to closures, to measure how often the fill
swallows a real change.

*This is statistical analysis of data you supply, not financial advice.*
