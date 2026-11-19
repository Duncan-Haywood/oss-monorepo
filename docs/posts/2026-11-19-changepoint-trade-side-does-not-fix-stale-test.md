---
title: "Knowing which side each trade hit does not stop a stale-feed test from flagging live markets"
seo_title: "Trade side vs. a stale-feed test on Binance trades"
date: 2026-11-19
tags: [changepoint-detection, data-quality, statistics, market-microstructure]
description: "A pre-registered round on a fresh Binance day: moving each print half a tick by its side makes 21 of 39 live trade windows look stale, up from 16 of 68."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a test for stale feeds: a series
whose source sometimes repeats the last value instead of reporting a new one. Earlier today we ran it on real
exchange trades for the first time
([the post before this one](2026-11-19-changepoint-stale-test-on-crypto-trades.md)). It found carried-forward
samples well, but it also called about one window in four of the raw trade prints stale. Nothing was carried in
those windows. Every row was a real trade.

The reason given then was the order book. On a market whose book is one tick wide, prints sit at the bid until
the queue there is used up, then flip to the ask. That gives long runs of identical prices with one-tick jumps
between them, which looks a lot like a feed that stopped and then caught up. Binance's trade files also record
which side each trade hit (the "buyer is maker" flag). So the obvious fix was to move each print half a tick
toward the middle of the book: a sell at the bid and a buy at the ask then land on the same number, and the
series moves only when the book moves.

## What was fixed before the run

The script and its bars were committed before any file for the new day was downloaded
([`eval/stale-side-mid-binance.mjs`](../../ventures/changepoint-detector/eval/stale-side-mid-binance.mjs)). The
day was 2026-11-09, one week after the day already used. The twelve pairs were the same, and the test and its
threshold were unchanged. There were three bars. Size: at most 10% of live trade-print windows called stale.
Power: at least 80% of windows with 30% or more carried samples called stale. Estimate: the fitted carry share
within 0.10 of the truth. If size failed, nothing in the product would change.

One change was made before any result was read, and the script's header records it. The first run also
included the unadjusted prices for comparison. It was on course to take about 2.4 hours, past the session's
two-hour limit, so that comparison, which decided nothing, was dropped.

## What happened

| bar | result |
|---|---|
| size: live trade prints called stale | **21 of 39: fail** |
| power: carried windows caught | **88 of 88: pass** |
| estimate within 0.10 | **55 of 97: fail** |

The adjustment made the false alarms worse: 54% of live windows called stale, against 24% on raw prices a week
earlier. Looking at the windows afterwards shows why. A bounce from bid to ask is a price move, and the
adjustment turns it into a repeat. The adjusted prints therefore repeat more, in long runs whenever the book
stands still. Of the adjusted windows with at least half their steps repeating, 18 of 22 were called stale,
against 3 of 17 below that. TRX's adjusted prints repeat 92% to 99% of the time, and every one of its windows was
called stale.

## What it means for a user

To a price series, a book that has not moved for minutes looks the same as a feed that has stopped. The trade
side cannot separate the two, because it changes which values repeat, not whether anything happened. Only data
from outside the price can tell them apart: the trade timestamps or trade ids, which show that a new trade
occurred. The product already says this. Its stale-feed sentence asks anyone working with trade or quote data to
check the source's own timestamps, and that sentence stays as it is.

This ends a day of rounds on real carried feeds. The stale test is for sampled series whose source does not say
when it last changed, such as a dashboard export, a scraped price, or a sensor log with no update times. Those
are what it was built and calibrated for. The full write-up and the per-window output are in the venture's
README, under "The trade side".
