---
title: "A report for three currencies: the franc floor and the Brexit vote on one page"
seo_title: "Changepoint report for several time series at once"
date: 2026-11-11
tags: [changepoint-detector, time-series, reporting, multivariate, fx]
description: "The changepoint report now takes several columns. On 2012-2018 daily FX returns it finds the franc in January 2015 and the pound in June 2016."
---

The [changepoint detector](../../ventures/changepoint-detector/) has had a
"several columns" mode since yesterday: paste a CSV with more than one metric
measured at the same points and it checks each column with six settings, keeps
the changes all six agree on, merges them across columns, and also fits one
segmentation for all of them at once. Today that view got the same
treatment as the one-column result: a **branded report** on your own
letterhead, to print or save as a PDF.

**What it found on a real example.** The sample report runs on daily log
returns of the Swiss franc, the pound and the yen against the dollar, 2012 to
2018 (Federal Reserve H.10, public domain), 1,751 trading days. It names two
changes that every setting agrees on:

- **the franc, 2015-01-20.** The Swiss National Bank dropped its 1.20 euro
  floor on 15 January 2015. The one-segmentation fit puts the change on the
  15th itself, a 9.4-fold jump in the franc's daily volatility;
- **the pound, 2016-06-24**, the day after the EU referendum. The joint fit
  brackets it with changes on 16 June and 6 July, a 4.9-fold rise in the
  pound's volatility and then a fall to a quarter of it.

The yen has no change all six settings agree on. The joint fit's other five
changes move every column's mean by less than one noise standard deviation:
they are calmer and busier stretches, which the report's sd-ratio column shows.

**What is new in the report.** Besides the chart and the two tables the page
already showed, it lists each column's own agreed changes, states the merge
tolerance and the joint model's penalty and noise floor, and writes the
assumptions for several columns, including that a change seen in two columns
at once is not evidence that one caused the other. The page's report and the
code run in Node were compared byte for byte in a headless browser.

The report is a planned paid extra and is not on sale: there is no checkout,
so nothing can charge you. The detector, its tables and CSV stay free and run
in your browser. [See the sample](../../ventures/changepoint-detector/sample-multi-change-report.html)
(an invented firm on real public data). Estimates, not advice.
