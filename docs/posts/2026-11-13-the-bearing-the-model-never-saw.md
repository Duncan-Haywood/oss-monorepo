---
title: "The bearing the model never saw: what 99% on the CWRU dataset measures"
seo_title: "CWRU bearing dataset: 99% accuracy vs an unseen bearing"
date: 2026-11-13
tags: [research, sensing, condition-monitoring, machine-learning, benchmarks]
description: "On the CWRU bearing fault data, spectrum classifiers score 100% on random and time splits and 55-71% when the test fault comes from a bearing absent from training."
---

The Case Western Reserve University bearing data is the dataset most papers on vibration-based fault diagnosis test on, and the accuracies reported on it sit at 99 to 100%. I wanted to know what that number means for someone who will point a model at a bearing it was not trained on, which is every bearing on a real machine.

So I took the 40 standard recordings (a healthy bearing, and inner-race, ball and outer-race faults of three sizes, each run at four motor loads), cut them into 4,643 windows, and scored four ordinary classifiers under four ways of choosing the test set. I wrote the hypotheses down before running anything ([`LOG.md`](../../research/cwru-split-audit/LOG.md)).

## The numbers

| How the test set is chosen | best model | random forest |
|---|---|---|
| Random windows (the common practice) | 100.0% | 97.5% |
| Last 30% of each recording | 100.0% | 97.0% |
| A whole motor load held out | 99.4% | 94.1% |
| A whole fault size held out | **70.7%** | **44.2%** |

The first three rows look like a solved problem. They are not testing what they seem to. Random windows overlap and come from the same ten seconds of the same bearing. Holding out a load sounds like a generalisation test, but the same damaged bearing was run at all four loads, so the model has already heard it. Only the last row, where every faulty test window comes from a bearing absent from training, asks whether the model recognises a kind of damage rather than a particular part. There the best model is right 68% of the time on the faulty windows, against 33% for guessing, and the 95% interval, resampling whole recordings, runs from 56 to 85%.

The failures are lopsided. The spectrum models get almost every unseen ball fault right and call outer-race faults inner or ball two times in three. The random forest, on ten classic time-domain statistics, calls nearly every unseen inner-race fault something else.

## Two things in the files

The healthy-bearing recordings are sampled at 48 kHz, not the 12 kHz of the fault recordings they are usually grouped with. Each lasts 10.1 s at 48 kHz, as the fault files do at 12 kHz, and their sharpest spectral lines land exactly on the 6th and 12th harmonics of 60 Hz mains only at 48 kHz. A pipeline that does not resample them gives every classifier a free way to spot "healthy". Two of the files also carry no shaft-speed variable, and one of them contains a copy of the other's signals.

## What I got wrong

I expected the physics-based model, which looks for energy at the bearing's own defect frequencies, to hold up better on an unseen bearing than the models that learn the raw spectrum. It did not: it lost 33 points against the MLP's 29, partly because my fixed envelope band is a weak version of what the diagnostics literature recommends. That is the next baseline to improve, along with a convolutional network and a dataset with several bearings per class, so the healthy class can be held out too.

This independently checks a concern already raised in the literature on how CWRU is used as a benchmark, rather than claiming to be first. Everything is one command, with checksums for the downloaded files: [`research/cwru-split-audit`](../../research/cwru-split-audit/README.md).

*Written with an AI coding assistant; every number comes from the audit script run on the downloaded data.*
