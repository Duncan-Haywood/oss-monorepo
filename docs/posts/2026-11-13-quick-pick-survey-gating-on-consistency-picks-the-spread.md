---
title: "Filtering survey respondents by consistency picks the people whose answers spread out most"
seo_title: "Anchor pairs, lapse gates and selection bias in a pooled Bradley-Terry prior"
date: 2026-11-13
description: "Planted easy questions made careless respondents easier to spot. Gating on them still barely helped, because the most consistent people are the ones whose items are far apart."
tags: [quick-pick-survey, surveys, ranking, statistics, empirical-bayes, selection-bias, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking you to choose between two items at a time. Its results screen shows
an interval for how far apart any two of your items are. A prior pooled
across everyone in the survey would make those intervals 10-18% narrower,
but careless respondents (people who answer some questions at random) drag
the pooled prior down, and with it everyone's coverage.

The [last run](2026-11-13-quick-pick-survey-a-gate-needs-a-detector.md)
found that a perfect careless-respondent detector would fix this: pool over
the honest people only, give them the narrower prior, and keep the fixed
prior for everyone else. The detectors we had couldn't tell careless people
from honest ones (AUC 0.58-0.69), so it named a better detector as the next
step: anchor pairs, planted questions whose answer the person's own ratings
already settle.

## Anchors work as a detector

We put one anchor pair in every five or ten questions and re-ran the same
288 simulated panels. At one in five and a lapse rate of 0.4, the anchor
estimate separates careless from honest at AUC 0.85-0.88, up from about
0.6. One surprise: the estimate from all of a person's answers rose just as
far. Anchors don't add a separate signal. They add easy pairs, and on an
easy pair a random answer stands out to any estimate.

## The gate still doesn't help

With that better detector, pooling only the more consistent half of the
panel gave intervals 4-10% narrower than the fixed prior. The perfect
detector gives 10-18%. Two threshold-based gates that used the anchors
passed only 17-36% of honest people and came out no narrower than fixed.

The reason shows up on panels where nobody is careless. Pooled over
everyone, the prior's upper end is 1.27-1.40. Pooled over the more
consistent half, it's 1.71-1.94, almost back to the fixed 2.0. Nobody in
those panels is careless, so the gap is all selection. A person whose
items are far apart answers consistently because their choices are easy,
not because they're paying more attention. Every lapse estimate we tried
correlates with how spread out a person's items really are (Spearman -0.14
to -0.36 among honest people). So gating on consistency selects on the very
thing being pooled. A sharper detector built from the same choices can't
get around that.

Anchors also cost something. At one in five, the honest respondents' fixed
intervals widen from 2.34 to 2.40 logits, because those answers go to pairs
that are already settled.

## What we did

We didn't ship it: no anchor pairs are asked and the intervals keep the
fixed prior. Gating is closed. The next attempt drops the gate and models
carelessness instead. Each person's likelihood carries their own lapse
share, so a random answer widens the lapse term instead of shrinking the
pooled spread, and nobody gets filtered out.

Caveats: simulated Bradley-Terry respondents with uniformly spread likes,
careless from the first answer, 40 people per panel, one anchor rule and
two anchor rates. The sweep is `scripts/gated-upper-sweep.ts --every 5`.
All 288 cells are in `docs/anchor-gated-upper-2026-11-13.jsonl`, and the
full write-up is in the venture's `docs/INFORMATION-GAIN-SELECTOR.md`,
"Anchor pairs as the gate's detector".
