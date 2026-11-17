"""Milestone 11ae: is the closed form (cf_D+) still the simulator's expectation with 12 and 16 operators, and do 11ac's
two-layer and 11ad's four-group conclusions survive when every partition is scored on the exact expectation?

Why. 11ac and 11ad's limits, and both their "Next" lists: cf_D+ was checked against the simulator's exact expectation
(exact_D, 11aa's dense destination-pair sum of 11r's exact-timing estimator) only at M = 8, where it was 0.26% high
(pooled; 23 of 24 layouts within 1%). Every 12- and 16-operator result since (the destination-raster rule losing at
most 0.44%, the best four-group partition keeping 8% of conflict weight, recursive bisection costing 15%) is measured
on cf_D+. With more operators a larger share of the weight is cross-operator flux, which is where 11s found the closed
form's residual, so the check is not a formality.

Model and layouts. As 11ac/11ad: random_layouts.draw_layout with m = 12 and 16, the 2014 NYC destinations, semi base
rule, R = 50 m, Lambda = 240 flights/h for the city. A subsample, chosen before anything was run: the first eight
12-operator layouts (indices 1200..1207) and the first four 16-operator layouts (1600..1603), because exact_D cost
about 1,000 CPU s per layout at M = 8 (11aa) and is expected to grow about as M^2. cf_D+ and the gas_d(+) weights are
recomputed by split_scale_run.run_layout (unchanged); exact_D by exact_dense.exact_terms (unchanged, K = 8 midpoint
zone points).

Scores. A partition's score on a weight set is the en-route weight of operator pairs that share a group
(split_kway.score). For a reference X in {cf_D+, exact_D} and a partition p:
  loss_X(p) = score_X(p) / score_X(X's own best k-way partition)
k = 2 is exhaustive at both sizes; k = 4 is exhaustive at M = 12 (4^11 labellings) and the best of 200 single-move
descents at M = 16 (split_kway.local_search; "best" there is best found, so loss can fall below 1 and is reported).
Recursive bisection (split_kway.recursive_bisection) is scored against the same reference's joint 4-way optimum.

Experiments.
 E1 Bias: cf_D+ / exact_D en-route totals (all pairs) per layout and pooled (sum over sum), by size.
 E2 Pair weights: Pearson r of the symmetrised cross-operator en-route pair weights, cf_D+ against exact_D.
 E3 k = 2: cf_D+'s best split scored on exact_D (loss_E); does it equal exact_D's best?
 E4 k = 4: cf_D+'s best four-group partition scored on exact_D; retained weight (best score / total) under each.
 E5 Recursive bisection under exact_D: exact_D's own best split, then each half's best split, against exact_D's
    joint 4-way optimum (11ad's P7 measured 15% on cf_D+).
 E6 The planner rule: gas_d's and gas_d+'s picks (k = 2 and 4) on loss_E against loss_D.
 E7 Zone quadrature: the 4-point even and odd sub-rules' en-route totals against the 8-point rule.
 E8 Cost: CPU s per layout for exact_D.

Predictions (written and committed before any 12- or 16-operator layout was evaluated by exact_D or cf_D+ in this
step; before committing, only the unit tests in tests/test_exact_scale.py had run, on synthetic matrices).
 P1 E1: pooled cf_D+/exact_D in [1.000, 1.010] at each size (11aa: 1.0026 at M = 8) (prior 65%).
 P2 E1: cf_D+ within 1% of exact_D in >= 7 of 8 layouts at M = 12 and >= 3 of 4 at M = 16 (prior 60%).
 P3 E2: r >= 0.99 in every layout (prior 70%).
 P4 E3: cf_D+'s split is exact_D's best in >= 5 of 8 at M = 12 and >= 2 of 4 at M = 16, and mean loss_E <= 1.002
    at each size (11ac: best two splits within 0.5% in 17 of 24 and 23 of 24, so near-ties will flip some) (prior 55%).
 P5 E4: cf_D+'s four-group partition has mean loss_E <= 1.005 at each size (prior 60%).
 P6 E4: retained_2 and retained_4 under exact_D are within 0.01 (absolute) of cf_D+'s in every layout (prior 70%).
 P7 E5: recursive bisection on exact_D costs a mean >= 5% over exact_D's joint 4-way optimum at each size, i.e.
    11ad's 15% is not an artefact of the closed form (prior 75%).
 P8 E6: |mean loss_E - mean loss_D| <= 0.005 for gas_d and gas_d+ at k = 2 and k = 4 at each size (prior 65%).
 P9 E7: both sub-rules within 0.1% of the 8-point en-route total in every layout (prior 75%; held at M = 8).
 P10 E8: mean exact_D CPU per layout <= 3,000 s at M = 12 and <= 6,000 s at M = 16 (M^2 scaling from 11aa's 1,001 s
    gives 2,250 and 4,000) (prior 55%).
Preliminary: 12 layouts, one city.

    OMP_NUM_THREADS=1 ESCALE_CACHE=escale.pkl /usr/bin/python3.13 exact_scale_run.py > exact_scale_results.txt
"""
import math

import numpy as np

LAYOUTS = {12: list(range(1200, 1208)), 16: list(range(1600, 1604))}


def enroute_total(W):
    return float(np.asarray(W).sum())


def cross_pairs(W):
    """Symmetrised off-diagonal pair weights (i < j) of an m x m matrix, as a flat array."""
    W = np.asarray(W, dtype=float)
    S = W + W.T
    iu = np.triu_indices(W.shape[0], 1)
    return S[iu]


def pearson(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a - a.mean(), b - b.mean()
    return float((a * b).sum() / math.sqrt((a * a).sum() * (b * b).sum()))


def pooled_ratio(num, den):
    return sum(num) / sum(den)


def loss(W, labels, best_labels, score):
    """score(W, labels) / score(W, best_labels)."""
    return float(score(W, labels)) / float(score(W, best_labels))
