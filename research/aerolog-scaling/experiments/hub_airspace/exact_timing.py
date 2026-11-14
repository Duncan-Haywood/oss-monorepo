"""Milestone 11r: integrate the departure timing out of the conflict count exactly. A timing-conditioned (Rao-Blackwell)
estimator of the simulator's expected en-route conflicts per operator pair, its efficiency against the simulator, and the
headline layer-split ratios re-scored with it.

Why. 11p and 11q found that a 200,000-flight run scores a two-split ratio with 1% to 2% sd, and 11q's pooled
1,000,000-flight reference still leaves half-widths up to 0.047. Its "Next" asked for a variance-reduced estimator so
per-layout intervals shrink without five times the flights.

Observation (exact, tested). The simulator (graph_partition.simulate_pairs) launches flights as a Poisson process of
rate lambda, flies straight out-and-back legs, and counts a conflict for every pair of temporally overlapping legs in
the same layer whose closest approach over the overlap is below R; nothing interacts. So its expected count per hour
is a sum over pairs of flights: 0.5 lambda^2 E_{A,B}[ sum over same-layer leg pairs (a, b) of |U_ab| ], where A and
B are two independent draws of (operator, destination) and U_ab is the set of departure offsets u (leg b starting u
seconds after leg a) for which the two legs conflict. In leg-time coordinates (t on a, s on b) the separation is
affine, so {(t, s) in [0, D_a] x [0, D_b] : |p_a + v_a t - p_b - v_b s| < R} is an ellipse (a strip if the legs are
parallel) intersected with a box: convex. U_ab is its projection onto u = t - s, an interval whose two ends are found
in closed form (the ellipse's support points and the box-edge/ellipse intersections). The zone label (terminal or
en-route, from the mean hub radius at closest approach, as the simulator does) is taken at stratified random offsets
inside U_ab, which keeps the estimator unbiased. Sampling (A, B) pairs and averaging these exact interval lengths
estimates the same expectation as the simulator, with the Poisson timing noise removed. 11d's closed form
(closed_form_pairs) is an approximation of the same integral (infinite-line windows capped by the leg time, zone at
the path crossing, a head-on formula for same-operator pairs); this estimator is exact up to the sampling of paths.

Model and layouts: 11g's 24 random layouts (random_layouts.py), semi base rule, R = 50 m, Lambda = 240 flights/h;
splits as 11q chose them (nothing re-chosen except 'exact-best', below).

Experiments.
 E1 Exactness: per layout, the exact estimator's semi en-route total (and its 28 + 8 pair weights) against 11q's pooled
    five-run reference (seeds 70000 + 1000 k + layout), re-simulated here.
 E2 Efficiency: per layout, the per-run sd of the ratio score(stable(share))/score(cf) and of the semi en-route total,
    from the five reference runs (simulator) and from ten equal batches (exact estimator), each scaled by its measured
    CPU seconds: efficiency = (var x seconds)_sim / (var x seconds)_exact.
 E3 Re-scoring: 11q's headline rules (gas_pj, gas_d, stable(share), stable2(influence), best200k) as ratios to cf's
    split under the exact estimator with 95% t-intervals over ten batches (9 df); 'exact-best' = the best of all 127
    splits on batches 0-4, scored on batches 5-9 (an honest test of whether any split beats cf's).
 E4 Bias of 11d's closed form: per layout, its semi en-route total and its pair weights against the exact estimator.

Predictions (written and committed before the experiment ran. Disclosed: before committing, a brute-force check of
offset_interval on 3,000 random leg pairs and one smoke run on layout 3 had run, 2 x 200,000-flight simulator runs
(semi en-route 13.24 and 13.49 per hour, 3.5 s each) against 200,000 exact pairs in 10 batches (13.27, batch sd
0.25, 2.4 s); no split ratio, cf comparison or other layout was computed):
 (1) E1: the exact semi en-route total is inside the reference's 95% interval in >= 22 of 24 layouts, and the pooled
     ratio exact/reference over 24 layouts is in [0.98, 1.02] (prior 80%).
 (2) E2: for the stable(share)/cf ratio, over the layouts where the two splits differ, the median efficiency gain is
     >= 3 (prior 55%) and >= 1 in every such layout (prior 60%).
 (3) E2: for the semi en-route total the median efficiency gain is >= 2 (prior 50%).
 (4) E3: the rule means move by <= 0.005 from 11q's reference means and the order gas_d <= stable2(influence) <=
     stable(share) <= gas_pj holds (prior 60%).
 (5) E3: the median 95% half-width over layouts where stable(share) differs from cf is below 11q's 0.018 at no more
     than 11q's CPU per layout (prior 60%).
 (6) E3: exact-best beats cf by more than 1% (ratio < 0.99 with an interval below 1) in at most 3 of 24 layouts
     (prior 65%).
 (7) E4: 11d's closed-form semi en-route total is within 10% of the exact estimator's in every layout (prior 40%);
     Pearson r over cross-operator pair weights >= 0.95 in every layout (prior 60%).
Preliminary.

    python3 exact_timing_run.py > exact_timing_results.txt
"""
import importlib.util
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gp = _load("hub_airspace_graph_partition_11r", "graph_partition.py")
R_TERM, HOVER, Sampler = gp.R_TERM, gp.HOVER, gp.Sampler


def _edge_hits(d0x, d0y, ax, ay, R2, L):
    """Sub-interval of lambda in [0, L] with |d0 + lambda a|^2 < R2, or None."""
    qa = ax * ax + ay * ay
    qb = 2.0 * (d0x * ax + d0y * ay)
    qc = d0x * d0x + d0y * d0y - R2
    if qa == 0.0:
        return (0.0, L) if qc < 0.0 else None
    disc = qb * qb - 4.0 * qa * qc
    if disc <= 0.0:
        return None
    r = math.sqrt(disc)
    lo, hi = (-qb - r) / (2.0 * qa), (-qb + r) / (2.0 * qa)
    lo, hi = max(lo, 0.0), min(hi, L)
    return (lo, hi) if lo < hi else None


def offset_interval(pa, va, Da, pb, vb, Db, R):
    """Exact interval of offsets u (leg b starts u s after leg a) for which the legs come within R while both fly.

    Leg a: pa + va t, t in [0, Da]; leg b: pb + vb s, s in [0, Db], with s = t - u. Returns (u_lo, u_hi) or None.
    """
    dx, dy = pa[0] - pb[0], pa[1] - pb[1]
    R2 = R * R
    # cheap rejection: expanded bounding boxes of the two segments
    ax1, ax2 = sorted((pa[0], pa[0] + va[0] * Da))
    ay1, ay2 = sorted((pa[1], pa[1] + va[1] * Da))
    bx1, bx2 = sorted((pb[0], pb[0] + vb[0] * Db))
    by1, by2 = sorted((pb[1], pb[1] + vb[1] * Db))
    if ax1 > bx2 + R or bx1 > ax2 + R or ay1 > by2 + R or by1 > ay2 + R:
        return None
    # d(t, s) = d0 + va t - vb s; candidate points (t, s) on the boundary of K = ellipse n box
    cands = []
    # edges s = 0 and s = Db (t varies), t = 0 and t = Da (s varies)
    for s0 in (0.0, Db):
        h = _edge_hits(dx - vb[0] * s0, dy - vb[1] * s0, va[0], va[1], R2, Da)
        if h:
            cands.append(h[0] - s0)
            cands.append(h[1] - s0)
    for t0 in (0.0, Da):
        h = _edge_hits(dx + va[0] * t0, dy + va[1] * t0, -vb[0], -vb[1], R2, Db)
        if h:
            cands.append(t0 - h[0])
            cands.append(t0 - h[1])
    # ellipse support points for f = t - s
    det = -va[0] * vb[1] + vb[0] * va[1]   # det [va, -vb]
    if abs(det) > 1e-12:
        # centre z_c = -M^{-1} d0, M = [[va0, -vb0], [va1, -vb1]]
        m00, m01, m10, m11 = va[0], -vb[0], va[1], -vb[1]
        tc = -(m11 * dx - m01 * dy) / det
        sc = -(-m10 * dx + m00 * dy) / det
        # G = M^T M; support direction G^{-1} c with c = (1, -1)
        g00 = m00 * m00 + m10 * m10
        g01 = m00 * m01 + m10 * m11
        g11 = m01 * m01 + m11 * m11
        gd = g00 * g11 - g01 * g01
        if gd > 0:
            wt = (g11 * 1.0 - g01 * -1.0) / gd
            ws = (-g01 * 1.0 + g00 * -1.0) / gd
            q = wt * 1.0 + ws * -1.0       # c^T G^{-1} c
            if q > 0:
                k = R / math.sqrt(q)
                for sg in (1.0, -1.0):
                    t, s = tc + sg * k * wt, sc + sg * k * ws
                    if 0.0 <= t <= Da and 0.0 <= s <= Db:
                        cands.append(t - s)
    if not cands:
        return None
    lo, hi = min(cands), max(cands)
    return (lo, hi) if hi > lo else None


def closest(pa, va, Da, pb, vb, Db, u):
    """Closest approach over the overlap when b starts u s after a: (t on a, s on b, squared distance)."""
    t1, t2 = max(0.0, u), min(Da, u + Db)
    rx = pa[0] - pb[0] + vb[0] * u
    ry = pa[1] - pb[1] + vb[1] * u
    wx, wy = va[0] - vb[0], va[1] - vb[1]
    ww = wx * wx + wy * wy
    t = t1 if ww == 0.0 else min(max(-(rx * wx + ry * wy) / ww, t1), t2)
    ex, ey = rx + wx * t, ry + wy * t
    return t, t - u, ex * ex + ey * ey


def leg_pair_weight(pa, va, Da, ha, pb, vb, Db, hb, R, rnd, k_zone=2):
    """(terminal seconds, en-route seconds) of conflicting offsets for one leg pair; hubs ha, hb for the zone label."""
    iv = offset_interval(pa, va, Da, pb, vb, Db, R)
    if iv is None:
        return 0.0, 0.0
    lo, hi = iv
    L = hi - lo
    enr = 0
    for k in range(k_zone):
        u = lo + L * (k + rnd.random()) / k_zone
        t, s, _ = closest(pa, va, Da, pb, vb, Db, u)
        rad = 0.5 * (math.hypot(pa[0] + va[0] * t - ha[0], pa[1] + va[1] * t - ha[1]) +
                     math.hypot(pb[0] + vb[0] * s - hb[0], pb[1] + vb[1] * s - hb[1]))
        enr += rad >= R_TERM
    fe = enr / k_zone
    return L * (1.0 - fe), L * fe


def _legs(flight, speeds):
    """The two legs of a flight drawn from a mix entry: (start, velocity, duration, hub, semi layer)."""
    _, hub, hx, hy, x, y = flight
    v = speeds[hub]
    d = math.hypot(x - hx, y - hy)
    vx, vy = v * (x - hx) / d, v * (y - hy) / d
    D = d / v
    lo = 0 if (vx > 0 or (vx == 0 and vy > 0)) else 1
    return ((hx, hy), (vx, vy), D, (hx, hy), lo), ((x, y), (-vx, -vy), D, (hx, hy), 1 - lo)


def exact_pairs(mix, speeds, lam_h, R=50.0, pairs=200000, seed=0, batches=1, k_zone=2):
    """Exact-timing estimate of the simulator's conflicts per hour by (i, j, zone) under the semi base rule.

    Returns a list of `batches` dicts, each from pairs // batches independent flight pairs.
    """
    lam = lam_h / 3600.0
    rnd = random.Random(seed)
    smp = Sampler(mix)
    per = pairs // batches
    out = []
    for _ in range(batches):
        acc = {}
        for _ in range(per):
            fa, fb = smp.draw(rnd), smp.draw(rnd)
            la, lb = _legs(fa, speeds), _legs(fb, speeds)
            key = gp.key(fa[1], fb[1])
            term = enr = 0.0
            for a in la:
                for b in lb:
                    if a[4] != b[4]:
                        continue
                    tw, ew = leg_pair_weight(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], R, rnd, k_zone)
                    term += tw
                    enr += ew
            if term:
                acc[key + ("term",)] = acc.get(key + ("term",), 0.0) + term
            if enr:
                acc[key + ("enr",)] = acc.get(key + ("enr",), 0.0) + enr
        # ordered draws count each unordered flight pair twice: rate = 0.5 lambda^2 E[sum |U|] per second
        out.append({k: 0.5 * lam * lam * a / per * 3600.0 for k, a in acc.items()})
    return out

