---
title: "Can a changepoint detector pick out Hurricane Sandy from 731 days of bike rides?"
seo_title: "Spike detection on real bikeshare data: Hurricane Sandy ranked first, once"
date: 2026-11-10
description: "A test of the changepoint detector's spike labels on Capital Bikeshare data: Sandy comes out first for registered riders at twice the next event, and is missed for casual riders."
tags: [changepoint-detector, time-series, evaluation, open-source]
---

The [changepoint detector](/ventures/changepoint-detector/) has a `--spikes` option that labels a short run of changes which returns to its starting level as a spike or dip. It had been checked on gold prices (one bad data point) and on stock returns (no false labels). A fresh check uses the Capital Bikeshare daily counts for Washington DC, 731 days, where Hurricane Sandy closed the system around 2012-10-29 (recalled, source unread).

Result with the mean model and a weekly period, nothing tuned:

- **Registered riders:** 16 labels. Sandy is the largest at 15.7 noise standard deviations, about twice the next (7.8). Sorting by size finds it; a flat 3 sd cut-off would not, because all 16 labels pass it.
- **Casual riders:** 27 labels and Sandy is not among them. This model cuts a day early for that series, so the run never returns to its start and the label rule skips it. The count and log models date it correctly, but `--spikes` does not run with them yet.

One event in one city, so no detection rate is claimed. The script, output and tests are in the repository (`eval/sandy-spikes.mjs`), and the README records the caveats. Next step: let the label rule run on the log and count models.
