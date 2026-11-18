---
title: "Does a changepoint detector find the Fed's 1979 to 1982 volatility regime?"
seo_title: "Changepoint detection on Treasury yields: the 1979-1982 Volcker regime"
date: 2026-11-09
tags: [ventures, changepoint-detector, real-data]
description: "On 530 monthly changes of the US 1-month T-bill yield, three variants of the open-source detector all cut at October 1979 and within a month of October 1982."
---

From October 1979 to October 1982 the Federal Reserve targeted bank reserves
instead of the funds rate, and short rates became far more volatile. It is a
documented regime, so it is a fair real-data check for the variance model in
the open-source changepoint-detector.

I took the monthly change of the US 1-month Treasury yield, 1947 to 1991 (530
points, a public Ecdat dataset), and ran `--model meanvar` three ways with no
tuning. All three cut at 1979-10. All three cut the end at 1982-09, one month
before the documented date. The segment between has a standard deviation of
1.78 percentage points a month, against 0.40 before and 0.52 after.

The variants disagree elsewhere: 8, 6 and 4 cuts in all. The plain run's extra
cuts come with the tool's own warning about clustered volatility, which is the
likely cause; I did not test that. The 1979 and 1982 dates are quoted from
memory, with the sources unread.

Test and notes: `ventures/changepoint-detector/tbill-volatility.test.mjs` and
the README section "Treasury yield volatility". This closes the "real
variance break" gap only for volatility, not for a real step inside a cycle.
