---
title: "Three currencies, one page: changepoints across several columns"
seo_title: "Changepoint detection on several columns at once, in the browser"
date: 2026-11-11
tags: [changepoint-detector, time-series, multivariate]
description: "The changepoint page now takes several columns. On franc, pound and yen it finds the 2015 Swiss floor removal in the franc and the Brexit vote in the pound."
---

Our changepoint detector could already check several columns at once from the
command line. As of today the web page does it too: paste a CSV with a
temperature and a CO2 column, or a price and a volume, pick "Several columns
measured at the same points", and you get two readings side by side.

**The example on the page** is seven years of daily returns for the Swiss
franc, the pound and the yen against the dollar, 2012 to 2018 (1,751 trading
days, Federal Reserve H.10 rates). Asked for changes in level or volatility, it
answers:

- **Changes every setting agrees on, column by column:** 2015-01-20 in the
  franc only, and 2016-06-24 in the pound only. The Swiss National Bank
  dropped its floor against the euro on 15 January 2015. Britain voted to
  leave the EU on 23 June 2016. Neither event shows up as a change in the
  other two currencies.
- **One segmentation for all columns:** nine changes. It dates the franc's
  break to 15 January exactly, and puts two changes either side of the
  referendum in the pound. The other five move every mean by under a third of
  a noise standard deviation. They are volatility regimes, and the table now
  shows each column's standard deviation after over before, so they no longer
  read as nothing.

**Why two readings.** We measured both on the three labelled multi-column
series in the Turing Change Point Dataset. The column-by-column reading scored
mean F1 0.521, ahead of every published multi-column default (bocpd 0.480,
ecp 0.462). It was still below the 0.621 you get by reporting no change at all,
so treat it as a shortlist rather than an answer. The joint fit did badly on
those series, cutting a stock price, a dancing bee's position and a room's
temperature every 4 to 21 points. It earns its place on data that really is a
level plus noise. In simulation, a shift of half a noise standard deviation
shared by four columns was found 76% of the time jointly and never column by
column.

**A new warning.** Since a joint fit that over-cuts looks just as confident as
one that doesn't, the page and the CLI now say when it has more than one
change per 50 points. We set that bar from runs already in the repository
before scoring anything new. It fires on all six of the joint fits on the
labelled series, and on German unemployment, two smooth quarterly series cut
22 times in 120 points. It does not fire on the currencies (9 cuts in 1,751
points), and on 20 white-noise sets with one real shared step it never
fired (each got exactly one cut). It is a count, not a test. It tells you to read the column list
instead, and it does not fix the joint fit. Fixing the joint fit, with a noise
floor or trend per column, is the next piece of work.

Everything runs in your browser and nothing is uploaded. The method, the
numbers and their limits are in the venture's README, under "Several columns
on the page". These are statistical estimates about your data, not advice.
