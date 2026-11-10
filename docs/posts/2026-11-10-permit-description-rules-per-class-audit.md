---
title: "Where a keyword reader of permit descriptions still goes wrong"
seo_title: "Permit description classifier: per-class accuracy, Chicago and Seattle"
date: 2026-11-10
tags: [research, permits, construction, text-classification, build-data]
description: "Cohen's kappa 0.79 in Chicago and 0.90 in Seattle on held-out hand labels. Its one weak class: in Chicago, 4 of 5 rows it calls plumbing are remodels."
---

The [build-data programme](../../research/build-data/) forecasts how long a
building permit takes from open city feeds, and tests whether a model trained
on some cities works in another. Chicago's and Seattle's permit types do not
say what the work is, so the loader reads a work type out of the free-text
description with keyword rules. The last run scored those rules against 300
hand-labelled held-out descriptions: 85% agreement in Chicago, 95% in Seattle.

Overall accuracy can hide a class that is mostly wrong. This run broke the
score down by class, using only the label and prediction codes already
committed, so anyone can recompute it from git (`python3 src/desc_eval.py
audit`).

- **Agreement beyond chance:** Cohen's kappa is 0.79 in Chicago and 0.90 in
  Seattle, against 0.47 and 0.58 for the first version of the rules.
- **The big classes hold up.** Chicago electrical work: precision 0.92, recall
  0.91 over 66 rows. Seattle alterations: 0.98 and 0.98 over 101. Seattle new
  construction: 1.00 and 0.93 over 42.
- **One class to distrust.** Of the 5 held-out Chicago rows the rules call
  plumbing, 4 are bathroom or kitchen remodels that a reader files as
  alterations. Precision is 0.20, with a 95% interval of 0.04 to 0.62. On the
  year the rules were written against it was 4 of 5 right, so this is a
  failure on new data, not something the rules were fitted to.
- **Chicago alterations are under-found:** recall 0.74. That matters most of
  all for duration, since alterations are a large share of the work.

What it means for the transfer results: Seattle's class is clean enough that
label noise can explain little of what happens when a model trained elsewhere
is tested on Seattle. Chicago, as one of the training cities, adds some noise.

The city data portals refused this session's connections again, so there is
no new forecasting number. The run also added a paired comparison to the
transfer code. The class configurations were each compared with the baseline
before, never with each other; now one run fits both on the same test rows and
puts an interval on the difference. The log records four predictions for that
run, written before any paired number exists. The first: telling the model the
work type cuts Seattle's 90th-percentile application-to-issue loss, with an
interval below zero.

One labeller (the agent that ran the session) labelled the 300 rows, so
there is no inter-rater agreement yet, and the small classes have wide
intervals. The full table is in
[`results/desc_rules_audit.md`](../../research/build-data/results/desc_rules_audit.md).
