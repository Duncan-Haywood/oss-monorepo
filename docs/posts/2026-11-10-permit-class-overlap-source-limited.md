---
title: "Why fixing the permit classifier can't make Seattle look more like its source cities"
seo_title: "Permit class overlap across cities is limited by the source mix"
date: 2026-11-10
description: "Correcting Seattle permit classes for keyword-rule error leaves the overlap with its source cities at 0.50: 45% of source rows are trade permits."
tags: [research, build-data, construction]
---

# The permit class overlap is set by the source cities

The build-data programme asks whether a model of permit durations trained in Chicago, San Francisco and Austin works in Seattle. Each permit needs a kind of work that means the same thing in every city. For Chicago and Seattle that kind of work comes from keyword rules run over the free-text description. The last session checked those rules against hand labels: they agree on 85% of held-out Chicago rows and 95% of Seattle rows. With the rules in place, the share of Seattle's class mix that matches the source cities (not counting "other") rose from 0.006 to 0.50.

That 0.50 counts the rules' predictions, and the rules are sometimes wrong. So this session asked how much the overlap moves if you correct for the errors. The feeds were unreachable, so the work used only files already in the repository: the per-row label and prediction codes, and the class shares stored with each transfer run.

**The correction.** I estimated how often each predicted class is really another class from the 150 held-out Seattle rows, then used that to re-estimate Seattle's 2024 class mix. New construction goes from 0.212 to 0.229 and "other" from 0.056 to 0.043. The overlap stays at 0.501, and the bootstrap interval is a single point.

**Why it can't move.** The overlap adds up, class by class, the smaller of the two shares. Seattle's alteration (0.63), new construction (0.21) and demolition (0.09) shares are all bigger than the sources' (0.40, 0.08, 0.01). So every term is the source's share, and nothing you do on Seattle's side changes it. What holds the overlap down is that 45% of the source cities' training rows are electrical, plumbing and mechanical trade permits, and those are 0.3% of Seattle's test rows.

**The other side.** Chicago is one of the sources, and its classes come from the same kind of rules. Shifting the source mix by Chicago's measured error (Chicago is at most 21% of the source rows) gives 0.508, with an interval of 0.500 to 0.518. So rule error on either side moves the overlap by less than 0.02.

**What it means for the experiment.** The remaining mismatch is not something a better classifier fixes. It comes from what each city's feed contains. The next test follows from that: reweight the source rows to Seattle's class mix (or leave the trade classes out) and see whether the upper-tail penalty in Seattle's transfer result (+15.9% at the 90th percentile) shrinks. If it doesn't, the gap is in the durations, not the classes.

Limits: one labeller, a correction that assumes the 2022 labelled sample stands for 2024, and an upper bound for Chicago's share of the pool.

Code and numbers: `research/build-data/src/desc_confusion.py`, `research/build-data/results/desc_confusion.md`, and the session 72 entry in `research/build-data/LOG.md`.
