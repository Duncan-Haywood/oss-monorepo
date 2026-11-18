"""Milestone 11s: why 11d's closed form undercounts the simulator's en-route conflicts by 3% to 12%, derived, and a
one-line correction.

Why. 11r found the closed form (graph_partition.closed_form_pairs) 7.2% below the exact expected en-route rate on
average (3.0% to 11.6% over 24 layouts) while its pair weights correlate with the exact ones at r >= 0.998. Its
"Next" asked for the bias derived analytically (leg-end truncation and zone label).

Derivation (exact; tested in tests/test_steiner_bias.py). Two straight legs a (p_a + v_a t, t in [0, D_a]) and b
(p_b + v_b s, s in [0, D_b]); leg b starts u seconds after leg a; w = v_a - v_b. The relative position over the
overlap is straight, so the separation is convex in time and the pair has at most one conflict episode. An episode
begins in one of two disjoint ways:
  flux:  the relative position enters the R-disc while both legs fly, or
  start: the later leg starts inside the disc (b starts within R of a's current position, or a starts within R of b).
So, for every leg pair, |U_ab| = |U_flux| + |U_start| exactly, where U is 11r's set of conflicting offsets and
  |U_start| = chord(p_b; a) / |v_a| + chord(p_a; b) / |v_b|,
chord(x; leg) being the length of the leg's segment inside the disc of radius R about x.
Translation identity: for fixed velocities and durations, integrate |U| over every position of leg b relative to leg
a. For a fixed offset u the set of conflicting p_b is a segment of length |w| ov(u) (ov = the overlap time) swollen by
R, of area 2 R |w| ov(u) + pi R^2 (Steiner's formula), so
  integral of |U| d p_b = 2 R |w| D_a D_b + pi R^2 (D_a + D_b),
and the start chords alone integrate to pi R^2 (D_a + D_b). The closed form counts only crossing segments (area
|v_a x v_b| D_a D_b of positions) with window 2 R |w| / |v_a x v_b|, which integrates to 2 R |w| D_a D_b: it is the
flux term exactly (in the translation average) and omits the start term. The relative bias under locally uniform
placement is therefore
  start / flux = (pi R / 2 |w|) (1 / D_a + 1 / D_b),
linear in R and in the inverse leg time: conflicts that begin because a drone takes off (or turns for home) next to
another one in the same layer. Truncation at leg ends and non-crossing near misses are flux effects that cancel in
the average. The closed form's same-operator terms (R / v at the hub, 11a's head-on formula) already include their
start episodes. Corrected closed form: cf* = cf + 0.5 x (start chords of every same-layer cross-operator leg pair),
the start part labelled terminal or en-route by the mean hub radius at the chord's midpoint (0.5 because, like cf,
the sum runs over ordered flight pairs).

Model and layouts: 11g's 24 random layouts (random_layouts.py), semi base rule, R = 50 m, Lambda = 240 flights/h;
11r's exact estimator (exact_timing.exact_pairs logic, 2 stratified zone labels) as the truth. Every estimator is
evaluated on the same sampled flight pairs (common random numbers): 400,000 ordered pairs per layout at R = 50 m
(seed 110000 + layout), 200,000 at R = 25 m and 100 m (seeds 120000 / 130000 + layout).

Experiments.
 E1 Decomposition (R = 50 m): per layout, cf's semi en-route deficit against the exact estimator, split into
    same-operator and cross-operator pairs, and the cross-operator start term's share of the cross deficit.
 E2 Correction: cf* against the exact estimator (en-route totals and the 28 cross-operator pair weights).
 E3 Scaling in R: the mean deficit 1 - cf/exact over 24 layouts at R = 25, 50 and 100 m.
 E4 Splits: cf*'s best two-layer split against cf's, both scored on the exact weights.
 E5 Flux check: pooled over layouts, the exact cross-operator total minus its start chords (both zones) against cf's
    cross-operator total (both zones).

Predictions (written and committed before the experiment ran; before committing, only the unit tests of
tests/test_steiner_bias.py had run, on synthetic legs; no layout was evaluated):
 (1) E1: cross-operator pairs carry >= 75% of cf's pooled en-route deficit (prior 70%).
 (2) E1: the cross-operator start term explains 70% to 130% of the pooled cross-operator en-route deficit
     (prior 65%).
 (3) E2: cf*'s en-route total is within 2% of the exact one in >= 22 of 24 layouts (cf: 0 of 24, from 11r)
     (prior 55%), and its cross pair weights correlate with the exact ones at r >= 0.998 in every layout (prior 75%).
 (4) E3: the mean deficit at R = 100 m is 1.6 to 2.4 times that at R = 50 m, and at R = 25 m 0.35 to 0.65 times
     (prior 60%).
 (5) E4: cf*'s best split equals cf's in >= 20 of 24 layouts, and where they differ the exact-score ratio
     cf*/cf is within 0.5% of 1 (prior 70%).
 (6) E5: exact cross minus start chords is within 2% of cf's cross total, pooled (prior 60%).
Preliminary.

    python3 steiner_bias_run.py > steiner_bias_results.txt
"""
import importlib.util
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


et = _load("hub_airspace_exact_timing_11s", "exact_timing.py")
gp = et.gp
R_TERM, Sampler = gp.R_TERM, gp.Sampler


def chord(x, p, v, D, R):
    """Seconds leg (p + v t, t in [0, D]) spends within R of point x, and the midpoint time of that stay."""
    h = et._edge_hits(p[0] - x[0], p[1] - x[1], v[0], v[1], R * R, D)
    if h is None:
        return 0.0, None
    return h[1] - h[0], 0.5 * (h[0] + h[1])


def _rad(q, h):
    return math.hypot(q[0] - h[0], q[1] - h[1])


def start_parts(a, b, R):
    """(terminal s, en-route s) of offsets whose episode begins with a leg start; legs as exact_timing._legs."""
    term = enr = 0.0
    # b starts at p_b while a flies: a at time u, b at its start point
    L, tm = chord(b[0], a[0], a[1], a[2], R)
    if L:
        qa = (a[0][0] + a[1][0] * tm, a[0][1] + a[1][1] * tm)
        r = 0.5 * (_rad(qa, a[3]) + _rad(b[0], b[3]))
        term, enr = (term + L, enr) if r < R_TERM else (term, enr + L)
    L, tm = chord(a[0], b[0], b[1], b[2], R)
    if L:
        qb = (b[0][0] + b[1][0] * tm, b[0][1] + b[1][1] * tm)
        r = 0.5 * (_rad(a[0], a[3]) + _rad(qb, b[3]))
        term, enr = (term + L, enr) if r < R_TERM else (term, enr + L)
    return term, enr


def cf_pair(fa, fb, speeds, R):
    """11d's closed-form contribution of one ordered flight pair, semi base rule: (key, zone, value) list.

    A line-by-line copy of graph_partition.closed_form_pairs' loop body (tested to reproduce it on the same draws).
    """
    _, ha, ax, ay, xa, ya = fa
    _, hb, bx, by, xb, yb = fb
    lay = lambda kind, vx, vy, h: gp.base_layer("semi", kind, vx, vy, h)
    ra, rb = (xa - ax, ya - ay), (xb - bx, yb - by)
    da, db = math.hypot(*ra), math.hypot(*rb)
    lo_a, li_a = lay("o", ra[0], ra[1], ha), lay("i", -ra[0], -ra[1], ha)
    lo_b, li_b = lay("o", rb[0], rb[1], hb), lay("i", -rb[0], -rb[1], hb)
    if ha == hb:
        v = speeds[ha]
        term = (R / v) * ((lo_a == lo_b) + (li_a == li_b))
        enr_ = 0.0
        if lo_a == li_b:
            s = abs(math.sin((math.atan2(ra[1], ra[0]) - math.atan2(rb[1], rb[0])) / 2))
            L = 2 * min(da, db)
            if s > 0:
                L = min(L, R / s)
            out = max(0.0, L - 2 * R_TERM)
            enr_ = out / v
            term += (L - out) / v
        return [((ha, ha), "term", term), ((ha, ha), "enr", enr_)]
    hit = gp._cross((ax, ay), ra, (bx, by), rb)
    if hit is None:
        return []
    X = (ax + hit[0] * ra[0], ay + hit[0] * ra[1])
    zone = "term" if 0.5 * (math.hypot(X[0] - ax, X[1] - ay) + math.hypot(X[0] - bx, X[1] - by)) < R_TERM else "enr"
    va_, vb_ = speeds[ha], speeds[hb]
    oa = (va_ * ra[0] / da, va_ * ra[1] / da)
    ob = (vb_ * rb[0] / db, vb_ * rb[1] / db)
    cap = da / va_ + db / vb_
    w_same = gp.window(oa, ob, R, cap)
    w_opp = gp.window(oa, (-ob[0], -ob[1]), R, cap)
    x = 0.5 * w_same * ((lo_a == lo_b) + (li_a == li_b)) + 0.5 * w_opp * ((lo_a == li_b) + (li_a == lo_b))
    return [(gp.key(ha, hb), zone, x)]


def estimate(mix, speeds, lam_h, R=50.0, pairs=400000, seed=0, batches=1, k_zone=2):
    """On common flight pairs: per batch, dicts (i, j, zone) -> conflicts/h for 'exact', 'cf', 'start' (cross-operator
    start chords, cf units), 'start_same' (same-operator start chords, reported only) and 'cfstar' = cf + start.
    """
    lam = lam_h / 3600.0
    rnd = random.Random(seed)          # flight draws (the same stream closed_form_pairs would use)
    zr = random.Random(seed + 7919)    # zone labels of the exact estimator
    smp = Sampler(mix)
    per = pairs // batches
    out = []
    for _ in range(batches):
        acc = {n: {} for n in ("exact", "cf", "start", "start_same")}

        def add(n, k, x):
            if x:
                acc[n][k] = acc[n].get(k, 0.0) + x
        for _ in range(per):
            fa, fb = smp.draw(rnd), smp.draw(rnd)
            key = gp.key(fa[1], fb[1])
            for k2, z, x in cf_pair(fa, fb, speeds, R):
                add("cf", k2 + (z,), x)
            la, lb = et._legs(fa, speeds), et._legs(fb, speeds)
            cross = fa[1] != fb[1]
            for a in la:
                for b in lb:
                    if a[4] != b[4]:
                        continue
                    tw, ew = et.leg_pair_weight(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], R, zr, k_zone)
                    add("exact", key + ("term",), 0.5 * tw)
                    add("exact", key + ("enr",), 0.5 * ew)
                    st, se = start_parts(a, b, R)
                    n = "start" if cross else "start_same"
                    add(n, key + ("term",), 0.5 * st)
                    add(n, key + ("enr",), 0.5 * se)
        sc = lam * lam / per * 3600.0
        res = {n: {k: v * sc for k, v in d.items()} for n, d in acc.items()}
        cs = dict(res["cf"])
        for k, v in res["start"].items():
            cs[k] = cs.get(k, 0.0) + v
        res["cfstar"] = cs
        out.append(res)
    return out
