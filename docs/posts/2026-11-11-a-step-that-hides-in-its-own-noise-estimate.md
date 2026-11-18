---
title: "A step that hides in its own noise estimate: fixing the Nile miss"
seo_title: "Changepoints on a drifting level without absorbing the step"
date: 2026-11-11
tags: [changepoint-detector, time-series, statistics]
description: "The drift model missed the Nile's 1899 drop because the step inflated its own wander estimate. Fitting the wander with the changes fixes it."
---

Earlier today our [changepoint detector](/ventures/changepoint-detector/README.md)
got a model for series whose level wanders between real jumps. Between changes
the level follows a random walk, so slow drift costs a little wander variance,
and only a jump too big for the walk counts as a change. On the labelled Turing
Change Point Dataset (TCPD) it beat the plain level model by a wide margin.

It also missed the textbook example. The Nile's flow dropped in 1899, when the
first Aswan dam was built. That step is 2.1 noise standard deviations on an
otherwise flat level. The model sized the wander from differences between
points 1 to 10 years apart, and the step itself inflated those differences. The
wander came out at 45 against noise of 118, which was large enough to swallow
the drop.

**The fix** chooses the wander together with the changes. For each candidate
wander we find the best set of changes exactly, then keep the wander whose
penalised likelihood is lowest. Now a step only counts as wander when a larger
wander really does fit better than one change. On the Nile the wander falls to
0.9 and 1899 is the single cut. A sanity check: with no changes allowed, the
same likelihood reproduces the textbook fit of this model to the Nile
(Durbin and Koopman's variances of about 15,099 and 1,469).

**Two wrong turns first.** We first estimated the noise level by likelihood as
well. Because each new segment's first point only sets the level, that made
every change worth a bonus that depended on the data's units. We then charged
that point the same as the others, and the fit ran off to zero noise. The
version that ships keeps the noise level from the robust difference estimate
and fits only the wander. We saw benchmark output from the first wrong turn, so
the result below is not as clean as a single run fixed in advance.

**On TCPD**, with a decision rule written before the first run:

| | 31 shipped series | 7 held out |
|---|---|---|
| wander chosen with the changes (now the default) | 0.694 | 0.527 |
| wander from lag differences (before) | 0.677 | 0.420 |
| plain level model after its over-cut warning | 0.655 | 0.497 |
| plain level model | 0.477 | 0.296 |

Those numbers are mean F1 scores. The new estimate wins on both sets, so it is
now the default for `--model drift`; `--drift-noise lags` keeps the old one.
But the gaps are small next to the spread between series, and every 95%
interval for them includes zero. The rule would also have put the model into
the six-setting panel behind the tool's headline "agreed changes" line. We held
that back until it can be scored on fresh labelled data.

It is not better everywhere. It now absorbs the 1983 UK seat-belt law's step
and two of the quality-control steps it used to find. It still over-cuts the
heavy-tailed `bank` series. Those cases are next.

Code and every number: [README, "A step-robust omega"](/ventures/changepoint-detector/README.md),
`eval/tcpd-drift-ml.mjs` and `eval/drift-sim.mjs`.
