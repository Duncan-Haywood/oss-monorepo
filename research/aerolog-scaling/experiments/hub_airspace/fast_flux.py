"""Milestone 11y: the same deterministic flux term as 11x (flux_term.py), with the crossing tests pruned by angle.

Why. 11x made the closed form fully deterministic (cf_D), at about 130 CPU s per eight-operator layout (max 278 s),
14 times the cost of the 400,000-pair sampled estimate it replaces. Its "Next" asked for a faster flux kernel
("angular sorting to skip pairs that cannot cross; under 10% of pairs contribute en-route"). A cheaper exact flux
term is what lets later steps re-score 11q to 11w's split comparisons without sampling noise and search many more
layouts or hub sites.

Idea. Leg a runs from hub A to A + r_a, leg b from hub B to B + r_b. If the two segments cross at a point X, then X
lies on segment [B, B + r_b], so seen from A the direction of r_a (which points at X) lies in the angular wedge that
segment subtends at A: between the directions of B - A and of B + r_b - A, an arc of less than pi unless A lies on
the segment. So sort A's legs by direction once per operator pair; for each b only the legs whose direction falls in
its wedge (two binary searches) can cross it, and only those get 11x's exact test. Nothing in the test or the sum
changes, so the result is the same number up to the order of floating-point additions. The wedge is widened by
WEDGE_EPS (1e-9 rad) so legs on its edge (crossings at hub B or at b itself) are tested, not dropped; the exact test
decides them as before. A wedge of pi (A on segment b) tests every leg. The same-operator term (same_sum, no crossing
test) is 11x's unchanged.

Experiments (fast_flux_run.py, 11g's 24 layouts as 11x: semi base rule, R = 50 m, Lambda = 240/h).
 F1 Exactness: every (i, j, zone) weight of the pruned cf_D against 11x's flux_term.flux_terms, relative difference.
 F2 Cost: CPU s per layout of the pruned and the 11x kernels (process time, same process, same layout), split into
    the cross-operator and same-operator parts; speed-up = 11x cross+same over pruned cross+same.
 F3 Pruning: fraction of cross-operator (a, b) pairs the wedge sends to the exact test, against the fraction that
    cross at all, per layout.
 F4 Decisions: the best two-layer split (graph_partition.best over 127 bipartitions) under cf_D+ (flux plus 11t's
    exact start term) from each kernel.

Predictions (written and committed before the run; before committing only the unit tests of tests/test_fast_flux.py,
on synthetic operators, had run; no layout was evaluated with this kernel):
 (1) F1: largest relative difference over all weights and layouts <= 1e-10 (prior 90%).
 (2) F2: median speed-up over the 24 layouts >= 3 (prior 60%); >= 5 (prior 30%).
 (3) F2: the pruned kernel's largest per-layout CPU time <= 60 s (prior 55%).
 (4) F3: median fraction of pairs tested <= 0.20 (prior 55%), and the tested fraction is at most 4 times the crossing
     fraction in every layout (prior 50%).
 (5) F4: the same split in 24 of 24 layouts (prior 95%; follows from (1) unless two splits tie within 1e-10).
Preliminary.

    OMP_NUM_THREADS=1 /usr/bin/python3.13 fast_flux_run.py > fast_flux_results.txt   (needs numpy)
"""
import importlib.util
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WEDGE_EPS = 1e-9
BLOCK_B = 64                   # legs of B per broadcast block


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ft = _load("hub_airspace_flux_term_11y", "flux_term.py")
gp = ft.gp
R_TERM = ft.R_TERM
TWO_PI = 2 * math.pi


def wedges(A, B):
    """Per leg b of B: (start index into A's tripled sorted directions, number of A legs in b's wedge), and the order."""
    order = np.argsort(A.th, kind="stable")
    ths = A.th[order]
    tri = np.concatenate([ths - TWO_PI, ths, ths + TWO_PI])
    qx, qy = B.hub[0] - A.hub[0], B.hub[1] - A.hub[1]
    p1 = math.atan2(qy, qx)
    p2 = np.arctan2(qy + B.dy, qx + B.dx)
    dl = (p2 - p1 + math.pi) % TWO_PI - math.pi          # signed arc from B - A to B + r_b - A, in [-pi, pi)
    start = np.where(dl >= 0, p1, p2)
    width = np.abs(dl)
    i0 = np.searchsorted(tri, start - WEDGE_EPS, side="left")
    i1 = np.searchsorted(tri, start + width + WEDGE_EPS, side="right")
    cnt = np.minimum(i1 - i0, A.n)
    ex, ey = qx + B.dx, qy + B.dy                       # B + r_b - A
    on = (qx * ey - qy * ex == 0) & (qx * ex + qy * ey <= 0)   # A on segment b (incl. b's end at hub A)
    cnt = np.where(on | (width >= math.pi - 1e-9), A.n, cnt)
    return order, i0, cnt


def _dense(A, sl, B, kk, qx, qy, R):
    """11x's broadcast test of every A leg in slice sl (of the angle-sorted, tripled arrays) against B legs kk."""
    rax, ray = A.tdx[None, sl], A.tdy[None, sl]
    rbx, rby = B.dx[kk, None], B.dy[kk, None]
    with np.errstate(divide="ignore", invalid="ignore"):
        den = rax * rby - ray * rbx
        t = (qx * rby - qy * rbx) / den
        u = (qx * ray - qy * rax) / den
        m = (den != 0) & (t >= 0) & (t <= 1) & (u >= 0) & (u <= 1)
        if not m.any():
            return 0.0, 0.0, 0
        ii, jj = np.nonzero(m)
        jj = jj + sl.start
        kk = kk[ii]
        tt, uu = t[m], u[m]
        dA, dB = A.td[jj], B.d[kk]
        zt = 0.5 * (tt * dA + uu * dB) < R_TERM
        oax, oay = A.v * A.tdx[jj] / dA, A.v * A.tdy[jj] / dA
        obx, oby = B.v * B.dx[kk] / dB, B.v * B.dy[kk] / dB
        cr = np.abs(oax * oby - oay * obx)
        sg = np.where(A.teast[jj] == B.east[kk], -1.0, 1.0)
        rel = np.hypot(oax + sg * obx, oay + sg * oby)
        cap = dA / A.v + dB / B.v
        x = np.minimum(2 * R * rel / cr, cap) * A.tw[jj] * B.w[kk]
    return float(x[zt].sum()), float(x[~zt].sum()), int(m.sum())


def _tripled(A, order):
    for name in ("dx", "dy", "d", "w", "east"):
        v = getattr(A, name)[order]
        setattr(A, "t" + name, np.concatenate([v, v, v]))


def cross_sum(A, B, R=50.0, block=BLOCK_B, stats=None):
    """Same value as flux_term.cross_sum(A, B, R). B's legs are sorted by where their wedge starts and taken in blocks;
    each block tests (11x's broadcast test) only the contiguous run of angle-sorted A legs that covers its wedges."""
    if A.n == 0 or B.n == 0:
        return 0.0, 0.0
    qx, qy = B.hub[0] - A.hub[0], B.hub[1] - A.hub[1]
    order, i0, cnt = wedges(A, B)
    _tripled(A, order)
    full = np.nonzero(cnt >= A.n)[0]
    part = np.nonzero(cnt < A.n)[0]
    part = part[np.argsort(i0[part], kind="stable")]
    term = enr = 0.0
    tested = crossed = 0
    jobs = [(slice(A.n, 2 * A.n), full[s:s + block]) for s in range(0, len(full), block)]
    for s in range(0, len(part), block):
        kk = part[s:s + block]
        lo, hi = int(i0[kk].min()), int((i0[kk] + cnt[kk]).max())
        sl = slice(lo, hi) if hi - lo <= A.n else slice(A.n, 2 * A.n)
        jobs.append((sl, kk))
    for sl, kk in jobs:
        t_, e_, n_ = _dense(A, sl, B, kk, qx, qy, R)
        term, enr, crossed = term + t_, enr + e_, crossed + n_
        tested += (sl.stop - sl.start) * len(kk)
    if stats is not None:
        stats["tested"] = stats.get("tested", 0) + tested
        stats["crossed"] = stats.get("crossed", 0) + crossed
        stats["pairs"] = stats.get("pairs", 0) + A.n * B.n
    return term, enr


def same_sum(A, R=50.0, block=256):
    """Same value as flux_term.same_sum(A, R) (post hoc, added after layout 0 was profiled; see the outcome). Pairs with
    equal east bits contribute the constant 2R/v, so their total is (sum w_east)^2 + (sum w_west)^2 times it; the
    opposite-bit pairs are symmetric, so the east x west block is summed once and doubled."""
    v = A.v
    we, ww_ = A.w[A.east], A.w[~A.east]
    term = (float(we.sum()) ** 2 + float(ww_.sum()) ** 2) * 2 * R / v
    enr = 0.0
    E, W = np.nonzero(A.east)[0], np.nonzero(~A.east)[0]
    dW, tW, wW = A.d[W][None, :], A.th[W][None, :], A.w[W][None, :]
    for s in range(0, len(E), block):
        e = E[s:s + block]
        ww = A.w[e, None] * wW
        sn = np.abs(np.sin((tW - A.th[e, None]) / 2))
        L = 2 * np.minimum(dW, A.d[e, None])
        with np.errstate(divide="ignore"):
            L = np.where(sn > 0, np.minimum(L, R / sn), L)
        out = np.maximum(0.0, L - 2 * R_TERM)
        enr += 2 * float((ww * out).sum()) / v
        term += 2 * float((ww * (L - out)).sum()) / v
    return term, enr


def flux_terms(mix, speeds, lam_h, R=50.0, block=BLOCK_B, stats=None, timing=None, sym_same=False):
    """flux_term.flux_terms with the pruned cross_sum (and, with sym_same, the symmetric same_sum above); optional
    stats (pair counts) and timing (CPU s by part)."""
    import time
    lam = lam_h / 3600.0
    sc = lam * lam * 3600.0
    ops = ft.operators(mix, speeds)
    keys = sorted(ops)
    out = {}
    for ai, A in enumerate(keys):
        c0 = time.process_time()
        t, e = (same_sum if sym_same else ft.same_sum)(ops[A], R)
        if timing is not None:
            timing["same"] = timing.get("same", 0.0) + time.process_time() - c0
        out[(A, A, "term")], out[(A, A, "enr")] = sc * t, sc * e
        for B in keys[ai + 1:]:
            c0 = time.process_time()
            t, e = cross_sum(ops[A], ops[B], R, block, stats)
            if timing is not None:
                timing["cross"] = timing.get("cross", 0.0) + time.process_time() - c0
            k = gp.key(A, B)
            out[k + ("term",)], out[k + ("enr",)] = 2 * sc * t, 2 * sc * e
    return {k: x for k, x in out.items() if x}
