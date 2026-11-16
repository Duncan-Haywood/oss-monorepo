"""Milestone 11ad: do more layer groups recover what a two-layer split loses with 12 and 16 operators?

Why. 11ac's "Next". With 12 and 16 operators, cf_D+'s best two-layer split (semicircular rule plus one group bit)
still leaves a median 0.33 to 0.34 of all en-route conflict weight in shared layers, and is only 1.5 to 1.6 times
better than the average split. 11ac read that as "the number of layers matters more than the choice of split". This
step measures it: the best partition of the operators into k = 2, 3, 4 and 8 groups (4 = two group bits, 8 = three),
how much conflict weight each leaves, whether the cheap planner rules still find the best k-way partition, and
whether a planner that adds a second bit by splitting each half again (recursive bisection) loses against choosing
the four groups jointly.

Model. As 11ac: a group shares its altitude bands; within a band pair the semicircular rule separates headings, so a
partition's score is the cf_D+ en-route weight of operator pairs (same-operator pairs included) that share a group:

  score(labels) = sum_{i, j} W_ij [labels_i == labels_j]     (W = cf_D+'s "enr" pair weights, as split_scale.score_all)

  retained_k = best k-way score / total en-route weight (k = 1)          loss_D = score(rule's pick) / best score

Same 48 layouts as 11ac (random_layouts.draw_layout, indices 1200..1223 with M = 12 and 1600..1623 with M = 16),
Lambda = 240 flights/h, R = 50 m. The weights are recomputed by split_scale_run.run_layout (unchanged).

Search. At M = 12, k = 3 and 4 are exhaustive (every labelling with operator 0 in group 0: 3^11 and 4^11), for cf_D+
and for every rule. Elsewhere (M = 16 with k = 3, 4, 8; M = 12 with k = 8) the optimum is the best of 200
random-restart single-move descents (local_search), so "best" means best found; loss_D can then fall below 1 if a
rule's search finds a better cf_D+ partition than cf_D+'s own search, and that is reported. k = 2 is exhaustive at
both sizes, as 11ac.

Rules (unfitted, as 11ac): dist, over, dens, distv, gas_u(+), gas_d(+), gas_pj(+). Each rule's pick is the best
partition under its own weights, found by the same search as the reference.

Predictions (written and committed before any layout was scored; only the unit tests had run). 11ac's two-group
values in brackets.
 P1 Retained weight falls with k: the median retained_4 is between 0.10 and 0.20 at both M [retained_2 0.33 to 0.34].
 P2 Two group bits are worth more than half of one: median retained_4 / retained_2 is between 0.35 and 0.60 at both M.
 P3 The stake grows with k: the median of (expected score of a uniformly random k-way labelling) / best is >= 1.6
    at k = 4 at both M and larger than at k = 2 in at least 40 of 48 layouts [1.60 and 1.50 at k = 2].
 P4 gas_d's k = 4 pick: mean loss_D <= 1.010 at M = 12 and <= 1.020 at M = 16 [k = 2: 1.0000 and 1.0004].
 P5 The tiers hold at k = 4 at both M: max(mean gas_d, gas_d+) < min(mean gas_pj, gas_pj+) < min(mean gas_u, gas_u+)
    < min(mean dist, over, dens, distv).
 P6 Hub distance stays costly at k = 4: dist's mean loss_D >= 1.10 at both M [1.12 and 1.10].
 P7 Recursive bisection (cf_D+'s best two-way split, then each half's best two-way split) is worse than the joint
    4-way optimum in at least 12 of 24 layouts at each M, with mean loss between 1.002 and 1.05.
 P8 The local search is adequate: at M = 12 it reaches the exhaustive k = 3 and k = 4 optimum of cf_D+ in all 24
    layouts.
 Reported without a prediction: retained_k for k = 1, 2, 3, 4, 8 and the same-operator floor; the k = 8 picks.
"""
import itertools

import numpy as np


def matrix(w, m, zone="enr"):
    """Pair weights {(i, j, zone): x} as an m x m array (entries summed, orientation kept)."""
    W = np.zeros((m, m))
    for (i, j, z), x in w.items():
        if z == zone:
            W[i, j] += x
    return W


def score(W, labels):
    """Weight of pairs whose operators share a group (W may be (m, m) or a stack (r, m, m))."""
    lab = np.asarray(labels)
    same = (lab[:, None] == lab[None, :]).astype(float)
    return np.tensordot(W, same, axes=([-2, -1], [0, 1]))


def labellings(m, k, chunk=65536):
    """Every labelling of m operators into k groups (labels 0..k-1, groups may be empty) with operator 0 in group 0,
    in lexicographic order, yielded as (n, m) int8 chunks."""
    rows = []
    for t in itertools.product(range(k), repeat=m - 1):
        rows.append((0,) + t)
        if len(rows) == chunk:
            yield np.array(rows, dtype=np.int8)
            rows = []
    if rows:
        yield np.array(rows, dtype=np.int8)


def exhaustive(Ws, k, chunk=65536):
    """Best labelling into at most k groups for each weight matrix in the stack Ws (r, m, m), by enumeration.
    Returns (list of best labellings, best scores array). First labelling in lexicographic order wins exact ties."""
    Ws = np.asarray(Ws, dtype=float)
    r, m, _ = Ws.shape
    flat = Ws.reshape(r, m * m).T                      # (m*m, r)
    best = np.full(r, np.inf)
    arg = [None] * r
    for L in labellings(m, k, chunk):
        E = (L[:, :, None] == L[:, None, :]).reshape(len(L), m * m).astype(float)
        s = E @ flat                                   # (n, r)
        i = s.argmin(axis=0)
        v = s[i, np.arange(r)]
        for q in range(r):
            if v[q] < best[q]:
                best[q], arg[q] = v[q], tuple(int(x) for x in L[i[q]])
    return arg, best


def descend(W, labels, k):
    """Single-move descent: repeatedly move the operator whose move to another group lowers the score most."""
    S = W + W.T
    lab = list(labels)
    m = len(lab)
    while True:
        best = (0.0, None, None)
        for i in range(m):
            g = np.zeros(k)
            for j in range(m):
                if j != i:
                    g[lab[j]] += S[i, j]
            for h in range(k):
                d = g[h] - g[lab[i]]
                if d < best[0] - 1e-12 * max(1.0, abs(g[lab[i]])):
                    best = (d, i, h)
        if best[1] is None:
            return tuple(lab)
        lab[best[1]] = best[2]


def canonical(labels):
    """Relabel groups in order of first appearance (so operator 0 is in group 0)."""
    seen = {}
    return tuple(seen.setdefault(x, len(seen)) for x in labels)


def local_search(W, k, restarts=200, seed=0):
    """Best of `restarts` single-move descents from uniformly random labellings. Returns (labels, score)."""
    W = np.asarray(W, dtype=float)
    m = W.shape[0]
    rng = np.random.default_rng(seed)
    best, arg = np.inf, None
    for _ in range(restarts):
        lab = canonical(descend(W, rng.integers(0, k, m), k))
        s = float(score(W, lab))
        if s < best - 1e-12 * abs(best if np.isfinite(best) else 1.0) or (abs(s - best) <= 1e-12 * abs(s) and lab < arg):
            best, arg = s, lab
    return arg, best


def best_bisection(W, ops):
    """Best two-group split of the operator subset ops (exhaustive). Returns (group_a, group_b) as tuples."""
    ops = list(ops)
    if len(ops) < 2:
        return tuple(ops), ()
    sub = W[np.ix_(ops, ops)]
    best, arg = np.inf, None
    for bits in itertools.product((0, 1), repeat=len(ops) - 1):
        lab = (0,) + bits
        s = float(score(sub, lab))
        if s < best:
            best, arg = s, lab
    a = tuple(o for o, b in zip(ops, arg) if b == 0)
    b = tuple(o for o, b in zip(ops, arg) if b == 1)
    return a, b


def recursive_bisection(W, levels=2):
    """A planner's two-bit rule: the best two-way split, then the best two-way split of each half (and so on).
    Returns a labelling into up to 2^levels groups."""
    m = W.shape[0]
    groups = [tuple(range(m))]
    for _ in range(levels):
        nxt = []
        for g in groups:
            a, b = best_bisection(W, g)
            nxt += [a, b] if b else [a]
        groups = nxt
    lab = [0] * m
    for gi, g in enumerate(groups):
        for o in g:
            lab[o] = gi
    return canonical(lab)


def random_expected(W, k):
    """Expected score of a uniformly random labelling into k groups: diagonal always shared, off-diagonal w.p. 1/k."""
    d = float(np.trace(W))
    return d + (float(W.sum()) - d) / k
