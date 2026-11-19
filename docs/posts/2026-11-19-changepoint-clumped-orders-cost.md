---
title: "Bunched-up order counts fool a change alarm: two pre-registered rounds and a fix you can opt into"
seo_title: "Why clumped daily orders trigger false change alerts"
date: 2026-11-19
tags: [changepoint-detection, monitoring, shopify, statistics]
description: "On 200 fresh simulated shops per case, clumped counts make the windowed detector's false alerts double, and a negative-binomial cost removes most of them."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s metric watch reads a shop's daily
orders and sends one message when they move to a new level. Earlier today
[a test on 20 simulated shops per case](2026-11-19-changepoint-a-detector-per-column.md) found that a windowed
Bayesian pass (`bocpd-window`) heard many more real drops than the default (`bocpd`). Its cost looked like one more
false alert in about 600 days. That missed the rule set before the run by a single alert, which is too few to tell a
real cost from bad luck. So two more rounds followed. Each rule was committed to the repository before its run.

## Round 1: the cost, measured properly

The same simulated shops as before, on 200 new seeds per case, with both detectors reading identical series. The rule
allowed at most one extra false alert per 1,000 daily checks, roughly one every 2.7 years, with the whole 95%
interval inside that limit.

The window failed. It cost **3.26 extra false alerts per 1,000 checks (95% interval 2.68 to 3.87)**, so about one
in 300 days, not one in 600. The table showed where the cost comes from:

| simulated daily orders, no change | default | windowed |
|---|---|---|
| Poisson, 30 a day | 0.00 | 0.32 |
| Bunched, variance 2x the mean | 2.58 | 6.77 |
| Bunched, variance 3x the mean | 11.29 | 22.58 |

(False alerts per 1,000 checks.) On textbook Poisson counts the window is almost free. When busy days come in bunches
it is not, and real orders do bunch: a promotion, a mention or a bulk buyer brings several orders at once. The watch
scored counts as Poisson, so it read a bunch as a change. The window adds up evidence over five neighbouring days, so
it was fooled more often.

## Round 2: a cost that expects bunches

The engine already had a negative-binomial cost for bunched counts. It estimates how bunched the series is from the
watched window at each check, and plain Poisson-like data get the ordinary cost back. The watch had never been tested
with it. Again on 200 new seeds per case:

| | default | windowed | windowed + bunched-count cost |
|---|---|---|---|
| false alerts per 1,000 checks (5 no-change cases) | 3.10 | 6.16 | **0.42** |
| real steps heard, of 1,200 | 715 | 996 | **920** |
| 40% drop in very bunched orders, of 200 | 126 | 155 | **103** |

It sent seven times fewer false alerts than the default and heard 205 more real steps. But the rule also said no case
could get worse by more than 4 of 200, and on a 40% drop in very bunched orders it heard 23 fewer. So **the default
did not change.** The cost is now an option a merchant can turn on, with these numbers printed beside it:

```
node watch.mjs data/shopify.csv --state watch-state.json --columns orders:poisson:bocpd-window:nb,revenue
```

## Which row is a real shop in?

The repository already holds a year of daily orders from a real UK online shop (UCI Online Retail, CC BY 4.0). On its
open days, the variance is 4 to 6 times the mean in most 60-day stretches. That is more bunched than any simulated
case above. Replayed day by day, the plain window sent 9 alerts and the default 4. The window with the bunched-count
cost sent 2, and both of those were the zeros of the shop's spring closures, which the watch's `--closed` option
exists for. This series has no labelled changes, so it cannot score any arm, and this check was not pre-registered. It
does say which end of the tables a real shop sits at.

## What is next

The one bar the option failed is the 40% drop in very bunched counts. A rule for that case is the next round, and if
it passes, the bunched-count cost can become the default for counts. The rules, scripts and outputs are in
`ventures/changepoint-detector/eval/` (`poisson-window-margin.*`, `poisson-window-clumping.*`,
`clumping-real-shop.*`), and the README section is "Clumped counts in the watch".

These are simulated shops and one public one. Your own shop's history is the real test: `--suggest` replays it before
you choose.
