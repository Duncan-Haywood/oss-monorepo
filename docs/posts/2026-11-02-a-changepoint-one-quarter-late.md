---
title: "A changepoint one quarter late was a labelling convention"
seo_title: "Changepoint dating: first vs last quarter of the regime"
date: 2026-11-02
tags: [changepoint, time-series, honesty]
description: "Our detector dated the 1980 US real-rate jump a quarter after the literature. A single-break check shows it is a labelling convention, not a narrow interval."
---

Our changepoint detector dates the 1980 jump in the US real interest rate at 1980Q4. The literature is usually remembered as 1980Q3, and the detector's one-quarter confidence range excluded it. That looked like an interval that was too narrow.

We checked with the data. Splitting 1973Q4 to 1985Q4 once, after 1980Q2, Q3 or Q4, gives sums of squares of 186.2, 166.8 and 182.9. The best break falls after 1980Q3. The 1980Q3 value (0.30) sits near the old mean (-1.51) and far from the new one (5.19), so it is the last quarter of the old regime. The detector labels the first quarter of the new regime, so a source that labels the last old quarter writes 1980Q3 for the same break.

What we did not verify: which convention the original paper uses (we have not read it). The script is `ventures/changepoint-detector/eval/us-real-interest-1980-date.mjs`, with a test pinning the result.
