---
title: "One tax, two series: a changepoint detector finds the GST in café sales but loses it in cement"
seo_title: "Changepoint detection on Australian café turnover and the 2000 GST"
date: 2026-11-09
tags: [changepoint-detector, time-series, testing]
description: "Six changepoint models run on 426 months of Australian café turnover all date a change two months after the 2000 GST. The same models lost the event in cement."
---

changepoint-detector already had one real step inside a seasonal series:
Australian cement production around the goods and services tax of July 2000.
There, the models that correct for autocorrelation or changing variance
absorbed the step. A natural question is whether that is a flaw in the models
or a fact about cement.

We ran the same six models on a second series, 426 months of Australian café,
restaurant and catering turnover (`fpp2::auscafe`). All six put a change at
2000-09, two months after the tax, including the `--ar1 auto` and
`--model meanvar` runs that lost it in cement. So the loss is a property of
that series.

The caveat is the same as before: each model cuts 21 to 49 times over 35 years
of growth, and some neighbours (1999-01 under `--ar1 auto`) have no documented
cause. The tax date is recalled, not read from a source. The result is pinned
in `auscafe.test.mjs`, and the README says what was not done.
