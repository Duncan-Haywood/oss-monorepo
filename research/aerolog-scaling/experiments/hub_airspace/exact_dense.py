"""Milestone 11aa: the exact estimator (11r) summed over destination pairs, so the simulator's expected conflict rate is
known with no sampled flight pairs, and the closed form's residual bias can be measured with no noise.

Why. 11x made the closed form fully deterministic (cf_D+), but the reference it is judged against, 11r's exact-timing
estimator, is still an average over 400,000 sampled flight pairs, with about 0.8% heavy-tailed noise per layout. 11x
therefore could not separate the closed form's own residual bias (11s's 0.3% flux residual) from that noise, and 11z's
noise-free split losses measure distance from the closed form's optimum, not the simulator's. 11x to 11z's "Next" asked
for the exact estimator by the same destination-pair sums.

Identity (tested in tests/test_exact_dense.py against a scalar loop over every ordered pair of mix rows and all four
leg pairs, using exact_timing.offset_interval and exact_timing.closest). exact_timing.exact_pairs averages, over sampled
ordered flight pairs (f, g), the exact length |U| of the departure-offset interval in which each same-layer leg pair
conflicts, so its expectation is 0.5 lam^2 3600 sum_{f, g} w_f w_g sum_legs |U|. Under the semicircular rule each flight
pair has exactly two same-layer leg pairs, (out_f, out_g) and (ret_f, ret_g) when the east bits match, (out_f, ret_g)
and (ret_f, out_g) otherwise, and the second is the first reversed in time: same interval length, same closest
approaches, except where the closest point is not unique (equal velocities, e.g. two flights of one operator to the
same destination), where exact_timing.closest takes the start of the overlap and the two labels differ; there both are
evaluated. Every pair is evaluated with a vectorised copy of offset_interval (same candidates, same tests); cross
pairs whose segment boxes widened by R do not overlap cannot conflict and are skipped; same-operator sums use the
symmetry L(a, b) = L(b, a). The one approximation: 11r labels the zone (terminal or en-route) at k_zone = 2 stratified
random offsets inside the interval, which is unbiased for the en-route fraction; here it is an 8-point midpoint rule,
deterministic, and the 4-point even and odd sub-rules are reported to bound its error. The all-zone total is exact.

Model and layouts: 11g's 24 random layouts, semi base rule, R = 50 m, Lambda = 240/h, the 2014 ride-hail pickups as
destinations (as 11g to 11z). cf_D+ = fast_flux.flux_terms (sym_same) + start_term.start_terms (11y, 11z); the sampled
exact estimator is 11t's (steiner_bias.estimate, seeds 110000 + layout, 400,000 pairs in 10 batches); planner rules,
their weights and 11w's blends exactly as 11z (split_rescore_run.run_layout and blends).

Experiments.
 E1 Exactness: dense exact_D against the sampled exact estimator, en-route totals (all pairs), z on the batch SE.
 E2 The closed form's residual bias with no noise: cf_D+ / exact_D per layout (en-route, all pairs) and pooled.
 E3 Splits on the simulator's own expectation: cf_D+'s best two-layer split scored on exact_D (loss_E =
    score(exact_D, split) / score(exact_D, best split under exact_D)).
 E4 11z's 15 planner rules re-scored on loss_E, against their loss_D (11z's noise-free closed-form loss).
 E5 Zone quadrature: the 4-point sub-rules' en-route totals against the 8-point rule.
 E6 Cost: CPU s per layout for exact_D.
 E7 Pair weights: Pearson r of cross-operator en-route pair weights, cf_D+ against exact_D.

Predictions (written and committed before any layout was evaluated; before committing, only the unit tests of
tests/test_exact_dense.py had run, on synthetic operators, plus a timing of exact_dense.cross_sum and same_sum on
layout 0's two smallest operators, whose values were not printed, and layout 0's box-candidate fraction, 0.234):
 P1 E1: |z| <= 3 in >= 22 of 24 layouts and the pooled sampled/exact_D within [0.99, 1.01] (prior 80%).
 P2 E2: pooled cf_D+/exact_D in [1.000, 1.010] (prior 60%; 11x found 1.0061 against the sampled estimator).
 P3 E2: sd over layouts of cf_D+/exact_D <= 0.005, against 0.0091 for cf_D+/sampled (11x) (prior 60%).
 P4 E2: cf_D+ within 1% of exact_D in >= 20 of 24 layouts (prior 55%).
 P5 E3: cf_D+'s split equals exact_D's best in >= 20 of 24 layouts, and its mean loss_E <= 1.002 (prior 60%).
 P6 E4: |mean loss_E - mean loss_D| <= 0.005 for each of the 13 rules other than cf+ and exact, and at most 2 of the
    78 pairwise orders of their means flip (prior 55%).
 P7 E4: gas_d (the 100 m destination-list paper weight) is within 0.5% on loss_E in >= 20 of 24 layouts (prior 65%).
 P8 E4: on layout 6, cf+'s split (2.75% on cf_D+, 11z) costs >= 1.5% on loss_E (prior 70%).
 P9 E5: both 4-point sub-rules are within 0.1% of the 8-point en-route total in every layout (prior 75%).
 P10 E6: exact_D costs <= 1,500 CPU s per layout at most and <= 800 s on average (prior 60%).
 P11 E7: r >= 0.99 in every layout (prior 70%).
Preliminary.

    OMP_NUM_THREADS=1 EXACT_CACHE=<dir> /usr/bin/python3.13 exact_dense_run.py > exact_dense_results.txt
"""
import importlib.util
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ft = _load("hub_airspace_flux_term_11aa", "flux_term.py")
et = _load("hub_airspace_exact_timing_11aa", "exact_timing.py")
gp = ft.gp
R_TERM = gp.R_TERM
K_ZONE = 8          # midpoint quadrature points for the zone label inside each offset interval
BLOCK = 128
INF = np.inf


def _edge(d0x, d0y, ax, ay, R2, L):
    """Vectorised exact_timing._edge_hits for a != 0: (lo, hi, ok) of lambda in [0, L] with |d0 + lambda a| < R."""
    qa = ax * ax + ay * ay
    qb = 2.0 * (d0x * ax + d0y * ay)
    qc = d0x * d0x + d0y * d0y - R2
    disc = qb * qb - 4.0 * qa * qc
    r = np.sqrt(np.maximum(disc, 0.0))
    lo = np.maximum((-qb - r) / (2.0 * qa), 0.0)
    hi = np.minimum((-qb + r) / (2.0 * qa), L)
    return lo, hi, (disc > 0.0) & (lo < hi)


def intervals(dx, dy, vax, vay, Da, vbx, vby, Db, R):
    """Vectorised exact_timing.offset_interval (same candidates, same tests): arrays (lo, hi, length >= 0).

    d = pa - pb; leg a: pa + va t, t in [0, Da]; leg b: pb + vb s, s in [0, Db]; u = t - s. Arguments broadcast.
    """
    R2 = R * R
    lo = np.full(np.broadcast(dx, vbx, vax).shape, INF)
    hi = np.full(lo.shape, -INF)

    def cand(c, ok):
        nonlocal lo, hi
        lo = np.where(ok, np.minimum(lo, c), lo)
        hi = np.where(ok, np.maximum(hi, c), hi)

    for s0 in (0.0, Db):
        l1, l2, ok = _edge(dx - vbx * s0, dy - vby * s0, vax, vay, R2, Da)
        cand(l1 - s0, ok)
        cand(l2 - s0, ok)
    for t0 in (0.0, Da):
        l1, l2, ok = _edge(dx + vax * t0, dy + vay * t0, -vbx, -vby, R2, Db)
        cand(t0 - l1, ok)
        cand(t0 - l2, ok)
    det = -vax * vby + vbx * vay
    okd = np.abs(det) > 1e-12
    with np.errstate(divide="ignore", invalid="ignore"):
        sdet = np.where(okd, det, 1.0)
        m00, m01, m10, m11 = vax, -vbx, vay, -vby
        tc = -(m11 * dx - m01 * dy) / sdet
        sc = -(-m10 * dx + m00 * dy) / sdet
        g00 = m00 * m00 + m10 * m10
        g01 = m00 * m01 + m10 * m11
        g11 = m01 * m01 + m11 * m11
        gd = g00 * g11 - g01 * g01
        okg = okd & (gd > 0)
        sgd = np.where(okg, gd, 1.0)
        wt = (g11 + g01) / sgd
        ws = (-g01 - g00) / sgd
        q = wt - ws
        okq = okg & (q > 0)
        k = R / np.sqrt(np.where(okq, q, 1.0))
        for sg in (1.0, -1.0):
            t, s = tc + sg * k * wt, sc + sg * k * ws
            cand(t - s, okq & (t >= 0.0) & (t <= Da) & (s >= 0.0) & (s <= Db))
    L = np.where(hi > lo, hi - lo, 0.0)
    return lo, hi, L


def enroute_fraction(lo, L, dx, dy, vax, vay, Da, vbx, vby, Db, ra0, sa, rb0, sb, K=K_ZONE):
    """Fraction of the offset interval whose closest approach is en-route, by a K-point midpoint rule.

    The zone label is exact_timing.leg_pair_weight's (mean hub radius at the closest approach over the overlap against
    R_TERM). Every leg here is radial from its own hub, so a leg's hub radius at time t is r0 + sgn * speed * t
    (out: r0 = 0, sgn = +1; return: r0 = length, sgn = -1); ra0, sa, rb0, sb carry those (sa, sb include the speed).
    Returns (fraction over all K points, fraction over the even-index points, over the odd-index points).
    """
    wx, wy = vax - vbx, vay - vby
    ww = wx * wx + wy * wy
    acc = [0.0, 0.0]
    for kk in range(K):
        u = lo + L * ((kk + 0.5) / K)
        t1 = np.maximum(0.0, u)
        t2 = np.minimum(Da, u + Db)
        rx = dx + vbx * u
        ry = dy + vby * u
        with np.errstate(divide="ignore", invalid="ignore"):
            tt = np.where(ww == 0.0, t1, np.minimum(np.maximum(-(rx * wx + ry * wy) / np.where(ww == 0.0, 1.0, ww), t1), t2))
        rad = 0.5 * (ra0 + sa * tt + rb0 + sb * (tt - u))
        acc[kk % 2] = acc[kk % 2] + (rad >= R_TERM)
    h = K // 2
    return (acc[0] + acc[1]) / K, acc[0] / h, acc[1] / h


def _pair_terms(Ahub, A_dx, A_dy, A_d, A_v, A_e, Bhub, B_dx, B_dy, B_d, B_v, B_e, R, K):
    """(L, f_all, f_even, f_odd) for leg pairs (out_a, the same-layer leg of b): out_b if east bits match, else ret_b.

    Under the semicircular rule flight pair (a, b) has exactly two same-layer leg pairs, and the second is the first
    reversed in time (ret_a, ret_b) or (ret_a, out_b), which has the same offset-interval length and the same closest
    approaches (tested): so the pair's weight is 2 L and its en-route weight 2 L f (f averaged over both where needed).
    """
    vax, vay = A_v * A_dx / A_d, A_v * A_dy / A_d      # same rounding as exact_timing._legs
    Da = A_d / A_v
    same = A_e == B_e
    sg = np.where(same, 1.0, -1.0)
    vbx, vby = sg * (B_v * B_dx / B_d), sg * (B_v * B_dy / B_d)
    Db = B_d / B_v
    pbx = Bhub[0] + np.where(same, 0.0, B_dx)
    pby = Bhub[1] + np.where(same, 0.0, B_dy)
    dx, dy = Ahub[0] - pbx, Ahub[1] - pby
    lo, hi, L = intervals(dx, dy, vax, vay, Da, vbx, vby, Db, R)
    rb0 = np.where(same, 0.0, B_d)
    sb = sg * B_v
    lo0 = np.where(L > 0, lo, 0.0)
    f, fe, fo = enroute_fraction(lo0, L, dx, dy, vax, vay, Da, vbx, vby, Db, 0.0, A_v, rb0, sb, K)
    # The reversal maps closest approaches one to one except where the closest point is not unique: equal velocities
    # (ww = 0, e.g. two flights of one operator to the same destination), where exact_timing.closest takes the start
    # of the overlap. There the reversed pair is labelled on its own and the two labels averaged.
    ww0 = ((vax - vbx) == 0.0) & ((vay - vby) == 0.0) & (L > 0)
    if ww0.any():
        arr = np.broadcast_arrays(lo0, L, dx, dy, vax, vay, Da, vbx, vby, Db, rb0, sb)
        m = np.nonzero(ww0)
        lo_, L_, dx_, dy_, vax_, vay_, Da_, vbx_, vby_, Db_, rb0_, sb_ = (x[m] for x in arr)
        lo_r = Da_ - Db_ - (lo_ + L_)
        dx_r = dx_ + vax_ * Da_ - vbx_ * Db_
        dy_r = dy_ + vay_ * Da_ - vby_ * Db_
        r = enroute_fraction(lo_r, L_, dx_r, dy_r, -vax_, -vay_, Da_, -vbx_, -vby_, Db_, A_v * Da_, -A_v,
                             rb0_ + sb_ * Db_, -sb_, K)
        f, fe, fo = (np.array(np.broadcast_to(x, ww0.shape), dtype=float) for x in (f, fe, fo))
        for x, y in zip((f, fe, fo), r):
            x[m] = 0.5 * (x[m] + y)
    return L, f, fe, fo


def _boxes(O):
    x2, y2 = O.hub[0] + O.dx, O.hub[1] + O.dy
    return (np.minimum(O.hub[0], x2), np.maximum(O.hub[0], x2), np.minimum(O.hub[1], y2), np.maximum(O.hub[1], y2))


def cross_sum(A, B, R=50.0, K=K_ZONE, block=BLOCK, stats=None):
    """sum_{a in A, b in B} w_a w_b L(a, b) [total, en-route (K points), en-route even, en-route odd] for A != B.

    Pairs whose segment bounding boxes, widened by R, do not overlap cannot conflict and are skipped (exact)."""
    ax1, ax2, ay1, ay2 = _boxes(A)
    bx1, bx2, by1, by2 = _boxes(B)
    acc = np.zeros(4)
    ncand = 0
    for s in range(0, B.n, block):
        sl = slice(s, s + block)
        ok = ~((ax1[None, :] > bx2[sl, None] + R) | (bx1[sl, None] > ax2[None, :] + R) |
               (ay1[None, :] > by2[sl, None] + R) | (by1[sl, None] > ay2[None, :] + R))
        ii, jj = np.nonzero(ok)
        if not len(ii):
            continue
        ncand += len(ii)
        bi = s + ii
        L, f, fe, fo = _pair_terms(A.hub, A.dx[jj], A.dy[jj], A.d[jj], A.v, A.east[jj],
                                   B.hub, B.dx[bi], B.dy[bi], B.d[bi], B.v, B.east[bi], R, K)
        wL = A.w[jj] * B.w[bi] * L
        acc += (wL.sum(), (wL * f).sum(), (wL * fe).sum(), (wL * fo).sum())
    if stats is not None:
        stats["cand"] = stats.get("cand", 0) + ncand
        stats["pairs"] = stats.get("pairs", 0) + A.n * B.n
    return acc


def same_sum(A, R=50.0, K=K_ZONE, block=BLOCK):
    """The same sum over A x A (every ordered pair, diagonal included), using L(a, b) = L(b, a): upper triangle only."""
    acc = np.zeros(4)
    for s in range(0, A.n, block):
        sl = slice(s, s + block)
        cols = slice(s, A.n)
        L, f, fe, fo = _pair_terms(A.hub, A.dx[None, cols], A.dy[None, cols], A.d[None, cols], A.v, A.east[None, cols],
                                   A.hub, A.dx[sl, None], A.dy[sl, None], A.d[sl, None], A.v, A.east[sl, None], R, K)
        ri = np.arange(s, min(s + block, A.n))[:, None]
        ci = np.arange(s, A.n)[None, :]
        mult = np.where(ci > ri, 2.0, np.where(ci == ri, 1.0, 0.0))
        wL = A.w[sl, None] * A.w[None, cols] * L * mult
        acc += (wL.sum(), (wL * f).sum(), (wL * fe).sum(), (wL * fo).sum())
    return acc


def exact_terms(mix, speeds, lam_h, R=50.0, K=K_ZONE, block=BLOCK, stats=None, variant="all"):
    """The exact estimator's expectation in exact_timing.exact_pairs' units: {(i, j, zone): conflicts per hour}.

    variant: 'all' (K-point zone label), 'even' or 'odd' (the K/2-point sub-rules, to gauge the quadrature error).
    Returns {variant: weights} for all three variants.
    """
    sc = (lam_h / 3600.0) ** 2 * 3600.0
    ops = ft.operators(mix, speeds)
    keys = sorted(ops)
    out = {"all": {}, "even": {}, "odd": {}}

    def put(k, acc, mult):
        tot = mult * sc * acc[0]
        for name, e in zip(("all", "even", "odd"), acc[1:]):
            en = mult * sc * e
            if tot - en:
                out[name][k + ("term",)] = tot - en
            if en:
                out[name][k + ("enr",)] = en

    for ai, A in enumerate(keys):
        # same operator: rate = 0.5 lam^2 3600 sum_{a, b} w w 2L
        put((A, A), same_sum(ops[A], R, K, block), 1.0)
        for B in keys[ai + 1:]:
            # cross: ordered pairs both ways, each flight pair 2L: 0.5 * 2 * 2 = 2
            put(gp.key(A, B), cross_sum(ops[A], ops[B], R, K, block, stats), 2.0)
    return out


def brute(mix, speeds, lam_h, R=50.0, K=K_ZONE):
    """Reference for the tests: every ordered pair of mix rows, all four leg pairs, exact_timing.offset_interval and
    the K-point midpoint zone label computed with exact_timing.closest and the hub distances (scalar, small mixes)."""
    sc = 0.5 * (lam_h / 3600.0) ** 2 * 3600.0
    acc = {}
    for fa in mix:
        la = et._legs(fa, speeds)
        for fb in mix:
            lb = et._legs(fb, speeds)
            key = gp.key(fa[1], fb[1])
            for a in la:
                for b in lb:
                    if a[4] != b[4]:
                        continue
                    iv = et.offset_interval(a[0], a[1], a[2], b[0], b[1], b[2], R)
                    if iv is None:
                        continue
                    lo, hi = iv
                    Ln = hi - lo
                    n_en = 0
                    for kk in range(K):
                        u = lo + Ln * (kk + 0.5) / K
                        t, s, _ = et.closest(a[0], a[1], a[2], b[0], b[1], b[2], u)
                        rad = 0.5 * (math.hypot(a[0][0] + a[1][0] * t - a[3][0], a[0][1] + a[1][1] * t - a[3][1]) +
                                     math.hypot(b[0][0] + b[1][0] * s - b[3][0], b[0][1] + b[1][1] * s - b[3][1]))
                        n_en += rad >= R_TERM
                    w = fa[0] * fb[0] * sc * Ln
                    fe = n_en / K
                    for z, x in (("term", w * (1 - fe)), ("enr", w * fe)):
                        if x:
                            acc[key + (z,)] = acc.get(key + (z,), 0.0) + x
    return acc
