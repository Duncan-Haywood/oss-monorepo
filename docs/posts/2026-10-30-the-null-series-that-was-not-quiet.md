---
title: "The 'no shock' control series that had a shock in it"
date: 2026-10-30
tags: [changepoint-detector, evaluation, real-data]
description: "A real series used as a null case for a changepoint detector turned out to contain a clear drop in late 1973, found by four different setups."
---

The changepoint-detector's drift-warning evaluation used 72 months of US accidental deaths (1973-78) as its "no documented shock" control. Running it through every seasonal setup shows it is not quiet: each puts a fall at December 1973 of about 1,000 deaths a month (mean model: 9,707 to 8,757; NB counts: 9,723 to 8,770). Three of four also find a second, smaller step in July 1975.

That fits the late-1973 oil embargo and the 55 mph limit of January 1974, but it is one coincidence on one series, and the first segment is only 12 months long, so we do not call it a validation.

Without the seasonal term the same detector reports three steps (May 1973, November 1973, May 1978) that are just winter peaks, which is the reason to give it the period.

**What changed.** A test and an eval script lock the numbers, and the old eval's label and README now say the series is not a null. The earlier drift-warning counts on it were never false alarms-per-se; they were warnings on a series with a real step. A genuinely quiet real series is still wanted.
