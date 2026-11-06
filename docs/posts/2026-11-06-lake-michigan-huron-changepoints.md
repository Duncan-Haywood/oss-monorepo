---
title: "Did Lake Michigan-Huron really drop in 1999?"
seo_title: "Changepoint detection on Great Lakes water levels: what works and what does not"
date: 2026-11-06
tags: [changepoint-detector, time-series, real-data]
description: "We ran the open-source changepoint detector on 92 years of Lakes Michigan-Huron levels. It finds the 1999 fall, but also 11 other cuts, and the autocorrelation-safe mode finds none."
---

Lakes Michigan-Huron fell about a metre between 1997 and 2001 and stayed low. We ran our open-source changepoint detector on the 1918-2009 yearly levels, with no tuning.

The default finds 1999, but also 11 other changes. A lake level carries over from year to year (lag-1 autocorrelation about 0.9), so slow swings look like steps, and the tool warns that its ranges are too narrow. The block-bootstrap penalty keeps 1999 and drops three false cuts, leaving 9. The `--ar1` mode, which models that carry-over, finds nothing at all, real fall included. The mean-and-variance model gives two cuts, 1969 and 1999, though its own check says the leftover is still autocorrelated, so 1969 is a candidate only.

This is the same trade we saw on Lake Huron and on presidential approval: the safe setting loses the real event. The test file pins these numbers so a later change to the detector shows up as a diff. Data and counts are in the venture README.
