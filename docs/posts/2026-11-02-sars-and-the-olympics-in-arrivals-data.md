---
title: "Can a changepoint detector find SARS and the Sydney Olympics in visitor data?"
seo_title: "Changepoint detection on real visitor arrivals and lung deaths"
date: 2026-11-02
tags: [changepoint-detection, time-series, real-data, honesty]
description: "We ran an open-source changepoint detector on five untested real series. It found SARS and the Olympics, and also cut quiet series into pieces."
---

The open-source [changepoint detector](../../ventures/changepoint-detector/README.md) had five real datasets sitting unused in its data folder. Today they got tests.

**Visitors to Australia, 1981 to 2012 (quarterly).** With a seasonal mean model and no tuning, the detector cut the Japanese series at 2003Q2, the SARS quarter, and the US series at 2000Q3 and 2001Q3, the Sydney Olympics and the September 2001 attacks. Those are real events it was not told about.

**The catch.** It also made 12 cuts in each series, because trends and slow changes look like steps. Adding the `--ar1` guard (which allows for autocorrelated noise) cut false alarms, but it also dropped SARS and both US shocks.

**UK lung-disease deaths, 1974 to 1979 (monthly).** These have no documented step, so every cut is a false alarm: 5 to 10 with the default model, and one (April 1976) with `--ar1`. The winter 1976 spike is a shock rather than a lasting change, and no setting here tells the two apart.

So the honest summary is that the tool finds real shocks and also over-cuts, and the guard that fixes the second problem breaks the first. That trade-off is the open problem the project works on next. Numbers and test: `ventures/changepoint-detector/README.md` and `arrivals-lungdeaths.test.mjs`. Results are estimates, not professional advice.
