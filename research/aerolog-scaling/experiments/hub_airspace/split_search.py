"""Milestone 11ab: do 11z's planner-rule rankings hold on 72 fresh layouts, scored on the simulator-checked cf_D+?

Why. 11aa showed the noise-free closed form cf_D+ is 0.26% from the simulator's exact expectation and picks the
simulator's best two-layer split in 24 of 24 layouts, so cf_D+ is now a validated reference that costs about 50 CPU s
per layout instead of 1,000. Every rule comparison since 11g was made on the same 24 random layouts (seeds 1100 + 0..23),
and 11w's census blends and 11z's "gas_d is the best cheap chooser" were found on them. 11aa's "Next" asks for a split
search over more layouts and hub sites. This milestone draws 72 fresh layouts (indices 24..95, same generator as 11g:
8 hubs within 7 km of 11a's hub, log-uniform radii 1.5 to 8 km, speeds 12 to 28 m/s, Dirichlet shares) and scores every
non-sampled rule on them, so 11z's ranking is tested out of sample.

Train / test. Layouts 0..23 (11z's) are re-run: they reproduce 11z (P1) and they are the training set for 11w's
three blends (gas_b, comb, combk), now refitted to cf_D+ rather than to the sampled exact estimator (11z's "Next").
Layouts 24..95 are the test set; no quantity is fitted on them.

  loss_D = score(cf_D+, rule's split) / score(cf_D+, cf_D+'s best split)     (>= 1; graph_partition.score, 127 splits)

Rules: dist, over, dens (11g), distv (11h), gas_u(+) and gas_d(+) (11h, 11u), gas_pj(+) (11j, 11v), gas_b, comb,
combk (11w's forms, refitted to cf_D+ on layouts 0..23). The sampled cf+ and exact estimators are dropped: 11z/11aa
showed they are noisier than cf_D+ and cost more.

Predictions (written and committed before any layout with index >= 24 was evaluated; only the unit tests had run):
 P1 Reproduction: on layouts 0..23, each of the 10 rules 11z scored without fitting (dist ... gas_pj+) has the same
    loss_D as 11z's table to every printed digit (4 decimals).
 P2 gas_d picks cf_D+'s best split in >= 58 of 72 test layouts (11z: 22 of 24).
 P3 gas_d is within 0.5% (loss_D <= 1.005) in >= 61 of 72, and its mean loss_D is <= 1.005 (11z: 1.0013).
 P4 The tiers hold out of sample: max(mean gas_d, gas_d+) < min(mean of the five census rules) <
    min(mean gas_u, gas_u+) < min(mean dist, over, dens, distv).
 P5 dist's mean loss_D >= 1.10 on the test layouts (11z: 1.1945).
 P6 Stability: for each of the nine paper and census rules, |test mean - train mean| <= 0.02.
 P7 Refitted blends give no reliable gain: combk's test mean loss_D is within 0.002 of gas_pj+'s, and neither gas_b
    nor comb beats gas_pj+'s test mean by more than 0.005.
 P8 gas_d's misses fall on near-ties: the median cf_D+ best/second-best gap over test layouts where gas_d misses
    (loss_D > 1.0) is below the median gap over all 72 test layouts.
 P9 Between 20% and 50% of test layouts have a gap below 1.005 (11z: 8 of 24).
 Reported without a prediction: what is at stake (the mean over all 127 splits / best), per-rule worst cases, rank of
 each rule's split, and CPU cost per input.
"""
import math
import random


def score(w, part, zone="enr"):
    return sum(x for (i, j, z), x in w.items() if z == zone and part[i] == part[j])


def best(parts, w, zone="enr"):
    return min(parts, key=lambda p: (score(w, p, zone), p))


def tiers_hold(means, tiers):
    """True when every rule in each tier has a lower mean than every rule in the next tier."""
    return all(max(means[k] for k in a) < min(means[k] for k in b) for a, b in zip(tiers, tiers[1:]))


def stake(w, parts, zone="enr"):
    """Mean score over all splits divided by the best split's score (what an uninformed planner loses)."""
    s = [score(w, p, zone) for p in parts]
    return (sum(s) / len(s)) / min(s)


def boot_ci(x, reps=2000, seed=0, q=0.025):
    """Percentile bootstrap interval for the mean."""
    rnd = random.Random(seed)
    n = len(x)
    m = sorted(sum(rnd.choice(x) for _ in range(n)) / n for _ in range(reps))
    return m[int(q * reps)], m[int(math.ceil((1 - q) * reps)) - 1]


def median(x):
    s = sorted(x)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])
