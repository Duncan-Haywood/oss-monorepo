---
title: "Checking the changepoint detector on 112 years of coal-mining disasters"
seo_title: "Changepoint detector on 112 years of coal-mining disasters"
date: 2026-10-26
description: "The textbook Poisson changepoint series, run through changepoint-detector: it finds the fall near 1892 and its 95% range holds the published 1890."
tags: [changepoint-detector, statistics, poisson]
---

[changepoint-detector](../../ventures/changepoint-detector/) had checked its count models on seasonal and trend data, but not on the plainest case: one count per year. Jarrett's list of British coal-mining disasters (191 events of ten or more deaths, 1851 to 1962) is the usual example.

Plain Poisson PELT returns a fall from 3.10 to 1.07 disasters a year at 1892, with a 95% range of 1886 to 1897. The published mode is 1890, inside it. It also reports a second drop in 1948, but flags a range of 1897 to 1961: about a dozen events cannot date it, and the tool says so.

This is one real series and one run. It shows the interval is sensible here, not that its coverage is 95%. The data and licence note are in `data/SOURCE.md`; the check is `coal-disasters.test.mjs`. Estimates only, not professional advice.
