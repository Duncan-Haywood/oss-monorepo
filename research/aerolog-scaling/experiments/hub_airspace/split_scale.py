"""Milestone 11ac: do 11ab's planner-rule rankings hold with 12 and 16 operators?

Why. 11ab's "Next" (more operators, 12 to 16). Every layer-split comparison since 11f used eight operators, so a
planner choosing among 127 two-layer splits. A city with 12 or 16 delivery operators has 2,047 or 32,767 splits, more
near-ties between the best splits, and more cross-operator traffic relative to each operator's own (with Dirichlet(1)
shares the expected same-operator share of traffic, sum s_i^2, is 2/(M+1): 0.22 at M = 8, 0.12 at 16). Whether a
cheap rule still picks the simulator-checked best split, and how much a bad split costs, is the open question.

Design. 11g's generator (random_layouts.draw_layout with m = 12 or 16: hubs within 7 km of 11a's hub and at least 800 m
apart, radii log-uniform 1.5 to 8 km, speeds 12 to 28 m/s, Dirichlet(1) shares, at least 200 destinations each) over
the 2014 NYC destinations, with layout indices 1200..1223 (M = 12) and 1600..1623 (M = 16), so seeds 2300.. and
2700.., disjoint from 11g/11ab's 0..95. Lambda = 240 flights/h for the city, as before (more operators share the same
traffic). The reference is cf_D+ (11y's flux kernel with the symmetric same-operator sum plus 11t's exact start term),
which 11aa checked against the simulator's exact expectation at M = 8 (0.26%, same best split in 24 of 24); it is
not re-checked against exact_D at M = 12 or 16 here (about 1,000 CPU s per layout at M = 8).

  loss_D = score(cf_D+, rule's split) / score(cf_D+, cf_D+'s best split)   (>= 1; all 2^(M-1) - 1 non-trivial splits)

Scores are computed by score_all (one matrix product over all splits) instead of graph_partition.score's dict sum;
the tests check the two agree.

Rules (all unfitted): dist, over, dens (11g), distv (11h), gas_u(+) (11h, 11u), gas_d(+) (11h, 11u), gas_pj(+)
(11j, 11v). 11w's census blends are left out: their coefficients were fitted at M = 8.

Predictions (written and committed before any 12- or 16-operator layout was scored; only a timing of cf_D+ on one
layout of each size and the unit tests had run). 11ab's eight-operator test values in brackets.
 P1 gas_d picks cf_D+'s best split in >= 12 of 24 layouts at M = 12 and >= 8 of 24 at M = 16 [65 of 72].
 P2 gas_d's mean loss_D is <= 1.005 at M = 12 and <= 1.010 at M = 16 [1.0015].
 P3 The tiers hold at both M: max(mean gas_d, gas_d+) < min(mean gas_pj, gas_pj+) < min(mean gas_u, gas_u+) <
    min(mean dist, over, dens, distv).
 P4 dist's mean loss_D is >= 1.10 at both M [1.144].
 P5 The stake (mean over all splits / best) rises with M: its median is above 2.015 at M = 12 [2.015, the median over
    11ab's 72 test layouts] and higher at M = 16 than at M = 12.
 P6 Near-ties become more common: the share of layouts whose best two splits are within 0.5% is >= 35% at M = 12
    [35%] and >= 50% at M = 16.
 P7 gas_d's misses fall on near-ties: pooled over both M, the median best/second-best gap over layouts where gas_d
    misses is below the median gap over all 48 layouts.
 P8 Cost: gas_d+ costs under 1/10 of cf_D+'s CPU time per layout at both M [3.2 s against 103 s].
 Reported without a prediction: per-rule worst cases and median rank among all splits, the census rules' losses,
 and how far each rule's split is from cf_D+'s in operators moved (Hamming distance up to relabelling).
"""
import itertools
import math
import random

import numpy as np


def splits(m):
    """All non-trivial two-group labellings with operator 0 in group 0, in graph_partition.bipartitions order, as an
    (2^(m-1) - 1, m) array of 0/1."""
    return np.array([(0,) + b for b in itertools.product((0, 1), repeat=m - 1)][1:], dtype=np.int8)


def matrix(w, m, zone="enr"):
    """Pair weights {(i, j, zone): x} as an m x m array (entries summed, orientation kept)."""
    W = np.zeros((m, m))
    for (i, j, z), x in w.items():
        if z == zone:
            W[i, j] += x
    return W


def score_all(w, parts, zone="enr"):
    """graph_partition.score for every row of parts at once: the weight of pairs whose operators share a group.
    With s = 1 - 2 * part (entries +-1), [part_i == part_j] = (1 + s_i s_j) / 2."""
    m = parts.shape[1]
    W = matrix(w, m, zone)
    S = 1.0 - 2.0 * parts
    return 0.5 * (W.sum() + np.einsum("pi,ij,pj->p", S, W, S))


def pick(w, parts, zone="enr"):
    """Index of the lowest-scoring split (first index on exact ties, i.e. the lexicographically smallest)."""
    return int(np.argmin(score_all(w, parts, zone)))


def moved(a, b):
    """Operators that must change group to turn split a into split b, up to swapping the two groups."""
    d = sum(x != y for x, y in zip(a, b))
    return min(d, len(a) - d)


def boot_ci(x, reps=2000, seed=0, q=0.025):
    rnd = random.Random(seed)
    n = len(x)
    s = sorted(sum(rnd.choice(x) for _ in range(n)) / n for _ in range(reps))
    return s[int(q * reps)], s[int(math.ceil((1 - q) * reps)) - 1]


def median(x):
    s = sorted(x)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def tiers_hold(means, tiers):
    return all(max(means[k] for k in a) < min(means[k] for k in b) for a, b in zip(tiers, tiers[1:]))
