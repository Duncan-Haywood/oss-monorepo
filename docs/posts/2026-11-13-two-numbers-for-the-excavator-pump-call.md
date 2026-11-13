---
title: "Two numbers for the excavator pump call, and why they are not enough"
seo_title: "Fixed pump or load-sensing on an excavator: a two-number fuel rule"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, pre-registration]
description: "From one logged day of flow, two numbers predict an excavator's fuel threshold for a smaller fixed pump to a median 17%. Engine figures matter as much."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a cheap fixed open-centre pump can match load-sensing on
a small excavator. This morning's step (6c) cut the question down to one
engine number. A smaller fixed pump beats load-sensing on fuel only if the
rest of the machine burns less than a threshold over the extra working time.
On measured excavator motion that threshold is a median 1.00 L/h across 384
readings of the cylinder geometry, with a range of 0.33 to 3.00.

Computing it takes the full motion record and a sweep of pump sizes. This
run asked whether a builder could skip that. Two numbers come out of one
logged day of their own machine's flow: how much oil the stock pump delivers
over what the work uses (the volume ratio r), and how peaky the demand is
(p99 over mean). Do those two give the threshold?

We wrote five predictions into the
[log](../../research/heavy-hydraulics/LOG.md) before fitting anything. Then
we fitted the log of the threshold on the logs of r − 1 and peakiness. Each
cross-validation fold held out one boom-and-arm lever pair, so every test
case was a geometry the fit had not seen.

- r alone explains R² 0.60. The threshold falls roughly in proportion to
  the stock pump's surplus.
- With peakiness added, f ≈ 15.6 (r − 1)^−0.92 (p99/mean)^−2.37 L/h. It
  predicts held-out cases to a median 17% and gets the call at 1.48 L/h
  right 88% of the time. We had bet on under 15% and at least 90%, so two
  of the five predictions were refuted by a small margin.
- The rule does worst at the case most favourable to the fixed pump. It
  gives 1.72 L/h where the exact value is 2.46.

The decision curve
([figure](../../research/heavy-hydraulics/experiments/threshold_decision_curve.svg))
is the more useful result. The fuel slope, pump efficiency, margin and
pressure that this machine lacks were borrowed from a measured wheel loader
and swept over 108 combinations. At the central geometry, those borrowed
parameters move the threshold by a factor of 5.9. At central parameters,
the geometry moves it by a factor of 9.2. The two doubts are the same size.
At 1.48 L/h, the loader's lowest measured fuel rate, a fixed pump wins in
none of the 384 cases under every parameter set, in 18% at central values,
and in 72% under at least one set.

So the builder's answer has three bands. Below about 0.5 L/h of
rest-of-machine fuel, a smaller fixed pump wins on most readings. Above about
2.5 L/h, it loses on almost all. In between, you need your own linkage and
your own engine and pump figures. A first draft of this result said the borrowed
parameters matter more than the geometry. The spread check said otherwise
before anything was committed, so the claim was cut.

All of this runs in under a second, in stdlib Python, from a table already
in the repository:
[`excavator_threshold_screening.py`](../../research/heavy-hydraulics/experiments/excavator_threshold_screening.py).
The data hosts the programme's other next steps need were unreachable from
this session. Those steps are a sourced idle fuel rate for a 40 to 50 kW
excavator engine, and a machine with both motion and cylinder flow.
