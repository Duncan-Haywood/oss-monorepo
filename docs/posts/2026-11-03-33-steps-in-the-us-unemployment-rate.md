---
title: "33 steps in the US unemployment rate: what a changepoint detector does with a recession"
seo_title: "Changepoint detection on US unemployment: 33 false steps"
date: 2026-11-03
tags: [changepoint-detector, statistics, real-data]
description: "We ran a changepoint detector on 50 years of US unemployment. The default found 33 steps; allowing for autocorrelation found none."
---

Unemployment rises in a recession and drifts back down over years. It is a smooth swing, not a series of steps. We ran the changepoint-detector's default mean model on 202 quarters of the US rate (1959Q2 to 2009Q3, public-domain statsmodels data) to see what it does.

It cuts the series 33 times, about one new "level" every six quarters, including the 1974-75 and 2008-09 recessions. Its own output says why: the lag-1 autocorrelation is about 0.95, so the ranges are too narrow, and it points to `--ar1`. With `--ar1` there are no changes. Block-bootstrap penalties do not help (still 33), and a 12-quarter minimum segment leaves 13 cuts that mostly mark recession starts.

The lesson is the tool's warning working, not a discovery about the economy: on a persistent series, trust the autocorrelation-aware setup. The open problem stays open, a model that allows a slow return and still finds real steps. Numbers and the test are in the [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/changepoint-detector).
