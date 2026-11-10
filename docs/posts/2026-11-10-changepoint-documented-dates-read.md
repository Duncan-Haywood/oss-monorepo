---
title: "Checking our changepoint detector against the dates it claims to find"
seo_title: "Changepoint detection on Nile and UK seat-belt data: documented dates"
date: 2026-11-10
tags: [changepoint-detector, testing]
description: "Two textbook changepoint series have documented break dates. We read the source text instead of trusting memory, and the detector's panel agrees on both."
---

When we test a changepoint detector on real data, the score is only as good as the date we compare against. For most of our eighteen real series that date was recalled from memory, which is a weak basis.

For the two oldest we went and read it. R's documentation for the Nile series says "apparent changepoint near 1898" (Cobb 1978), and for UK driver casualties says seat belts became compulsory on 31 January 1983.

The detector's six-setting panel finds 1899 on the Nile and February 1983 on the drivers series, each by all six settings. Note the Nile source says "near", so a one-year gap proves nothing in either direction. We read the R pages, not Cobb's paper, and sixteen other dates are still from memory. That is not a detection rate; a labelled set is still missing.

Try it: `node cli.mjs --consensus` on the sample data in `ventures/changepoint-detector`.
