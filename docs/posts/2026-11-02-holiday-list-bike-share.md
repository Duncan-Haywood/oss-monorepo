---
title: "Does telling a changepoint detector about holidays help? A real test said no"
seo_title: "Holiday lists in changepoint detection: a real bike-share test"
date: 2026-11-02
tags: [changepoint-detector, holidays, negative-result]
description: "We tested the holiday factor on two years of real Washington DC bike-share counts. The list added changes instead of removing them."
---

The changepoint detector can take a list of known holidays so a Christmas dip is not read as a change in level. It worked on synthetic counts, and one real series (Wikipedia pageviews) was too quiet to say much.

Today's test used 731 real days of Capital Bikeshare rentals with the dataset's own 21 holidays. Holidays are a clear effect: registered riders drop to 0.66 of a normal weekday, casual riders rise to 1.41. But with the list the detector found 61 changes instead of 56 (registered) and 77 instead of 70 (casual). The fitted factor, 0.877, was well short of the raw dip, since most holidays are Mondays and the weekly pattern already takes part of it. Two years of weather and season swamp everything else, and a weekly cycle cannot model that.

So the feature still has no real series where it earns its place, and the README now says so. Next: a daily series without a strong yearly swing, or a yearly term. Data, script and test are in `ventures/changepoint-detector`.
