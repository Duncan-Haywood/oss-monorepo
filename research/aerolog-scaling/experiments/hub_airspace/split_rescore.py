"""Milestone 11z: re-score 11g to 11w's layer-split comparisons against the noise-free closed form cf_D+.

Why. 11x made the closed form deterministic (cf_D+ = flux term summed over destination pairs plus 11t's exact start
term) and found that the 400,000-pair estimators used since 11g carry about 0.8% heavy-tailed noise per layout,
shared between the sampled closed form (cf+) and the sampled exact estimator. Every split comparison from 11g to 11w
chose a reference split with cf+ and scored it on that sampled exact estimator, so 11x's "Next" (and 11y's, now that
cf_D+ costs about 50 CPU s per layout) asks which of those conclusions survive a noise-free reference. This milestone
recomputes every planner rule's split on 11g's 24 layouts and scores it two ways side by side:

  loss_D = score(cf_D+, split) / score(cf_D+, best split under cf_D+)       (noise-free; >= 1 by construction)
  loss_X = score(exact, split) / score(exact, best split under cf+)         (11u to 11w's convention; can be < 1)

score is graph_partition.score (en-route conflicts per hour kept in the same layer, same-operator pairs included),
over the 127 non-trivial two-group splits. cf_D+ is the closed form, not the simulator: loss_D measures distance from
the closed form's own optimum, which 11r/11s found within 0.35% of the exact optimum; loss_X measures against an
unbiased but noisy estimate of the simulator. Where they disagree the report says which way.

Rules (each picks graph_partition.best over its own weights):
  dist, over, dens   11g's hub-distance and demand-overlap heuristics (random_layouts.heuristics)
  distv              11h's speed-aware hub distance (paper_weights.distv_weights)
  gas_u, gas_u+      11h's uniform-disc paper weight, and plus 11u's start_u
  gas_d, gas_d+      11h's destination-list paper weight, and plus 11u's start_g
  gas_pj, gas_pj+    11j's residents-plus-jobs census weight, and plus 11v's start_pj
  gas_b, comb, combk 11w's leave-one-layout-out blends (fitted to the sampled exact estimator exactly as 11w did)
  cf+                11t's sampled closed form (400,000 pairs, seeds 110000 + layout) plus the exact start term
  exact              the sampled exact estimator itself used as a chooser (11q to 11w's scoring reference)

Predictions (written and committed before any layout was evaluated; only the unit tests below had run):
 P1 Reproduction: the gas_pj, gas_pj+, gas_b, comb and combk loss_X columns equal 11w's E4 table to every printed
    digit, and cf+'s split equals cf_D+'s in 19 of 24 layouts with mean loss_D 1.0018 (11x P5).
 P2 Means survive: for each of the 13 rules other than cf+ and exact, |mean loss_D - mean loss_X| <= 0.005.
 P3 11w's fine ordering does not: among gas_pj, gas_pj+, gas_b, comb and combk (means within 0.006 of each other on
    loss_X) at least one of the ten pairwise orders of the means flips under loss_D.
 P4 Large misses are real: every (rule, layout) cell with loss_X >= 1.03 has loss_D >= 1.02.
 P5 Small differences move: for at least 3 of the 13 rules, the count of layouts within 0.5% (loss <= 1.005)
    differs between loss_D and loss_X by 2 or more.
 P6 11v's single split fix stands: on layout 5, gas_pj+ has loss_D <= 1.005 and gas_pj has loss_D >= 1.05.
 P7 The sampled exact estimator, used as a chooser, picks cf_D+'s split in at most 18 of 24 layouts (it is noisier
    than cf+, whose agreement is 19).
 P8 The hub-distance heuristic stays poor: dist's mean loss_D >= 1.10 (11g: median 1.14 against the simulator).
 P9 gas_d+ (11u's real-map paper weight) is within 0.5% on loss_D in >= 20 of 24 layouts (11u: 22 on loss_X).
 Reported without a prediction: each layout's cf_D+ gap between the best and second-best split, and whether rules'
 misses fall on near-ties.
"""


def score(w, part, zone="enr"):
    """graph_partition.score, repeated here so the helpers below can be tested without the experiment modules."""
    return sum(x for (i, j, z), x in w.items() if z == zone and part[i] == part[j])


def best(parts, w, zone="enr"):
    """graph_partition.best: the lowest-score split, ties broken by the labelling."""
    return min(parts, key=lambda p: (score(w, p, zone), p))


def loss(ref, split, parts, ref_split=None):
    """score(ref, split) / score(ref, ref_split); ref_split defaults to ref's own best split."""
    rs = best(parts, ref) if ref_split is None else ref_split
    return score(ref, split) / score(ref, rs)


def gap(ref, parts):
    """Second-best over best split score under ref (1.0 for an exact tie)."""
    s = sorted(score(ref, p) for p in parts)
    return s[1] / s[0]


def rank(ref, split, parts):
    """1-based rank of split among parts under ref (ties share the better rank)."""
    s = score(ref, split)
    return 1 + sum(score(ref, p) < s for p in parts)


def flips(means_a, means_b):
    """Pairs (x, y) whose order of means differs between two dicts of rule -> mean (ties count as no flip)."""
    keys = sorted(means_a)
    out = []
    for n, x in enumerate(keys):
        for y in keys[n + 1:]:
            da, db = means_a[x] - means_a[y], means_b[x] - means_b[y]
            if da * db < 0:
                out.append((x, y))
    return out
