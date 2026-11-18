"""Milestone 11x: the closed form's flux term summed exactly over destination pairs, so the whole closed form (flux plus
11t's start term) needs no sampled flight pairs at all.

Why. 11s showed 11d's closed form (graph_partition.closed_form_pairs) is the flux term of the exact expected conflict
rate, and 11t computed the missing start term exactly from hub sites and destination lists. But the flux term itself
has always been estimated by sampling ordered flight pairs (400,000 per layout since 11g), and 11t found that its
sampling noise, not the start term's, dominates the closed form's spread. Every split decision since 11f has been made
on a sampled closed form. 11t to 11w's "Next" asked for "a flux term by destination-pair sums for a fully deterministic
closed form".

Identity (tested in tests/test_flux_term.py). Flight draws are independent, with probability w_f = share / (number of
the operator's destinations) for each (operator, destination). closed_form_pairs averages a deterministic function
x(f, g) (steiner_bias.cf_pair, a line-by-line copy) over sampled ordered pairs and scales by lam^2 3600, so its
expectation is
    cf[(i, j, zone)] = lam^2 3600 sum over ordered pairs (f, g) with key(op f, op g) = (i, j) of w_f w_g x(f, g)[zone].
For two operators A != B, x is symmetric in its arguments, so the cross term is 2 lam^2 3600 sum_{a in A, b in B}
w_a w_b x(a, b). Under the semicircular base rule a leg's layer is its east bit and the return leg has the other
bit, so for a crossing pair x = min(2 R |o_a -+ o_b| / |o_a x o_b|, D_a/v_a + D_b/v_b) with the minus sign when the
two outbound legs share an east bit and the plus sign otherwise (o = velocity). The same-operator term is the same sum
over A x A of 11a's head-on formula. Both are dense n_A x n_B sums (about 2.5e9 crossing tests per layout over 80,000
destinations), evaluated with numpy in blocks; the result is the exact expectation of the sampled estimator, with no
Monte Carlo error. Zone labels as closed_form_pairs (mean hub radius at the crossing point against R_TERM).

Model and layouts: 11g's 24 random layouts (random_layouts.py), semi base rule, R = 50 m, Lambda = 240 flights/h. The
sampled estimators are 11t's (steiner_bias.estimate, seed 110000 + layout, 400,000 ordered pairs in 10 batches of
40,000; its exact estimator is the truth); the start term is 11t's start_term.start_terms; the paper weights are 11u's
gas_d (paper_weights.gas_weights on density_dest grids) and start_g.

Experiments.
 E1 Agreement: deterministic flux cf_D against the sampled cf, en-route totals (all pairs) per layout (z on the batch
    SE) and pooled; the sampled cf's coefficient of variation at 400,000 pairs (batch sd / sqrt(10) / cf_D).
 E2 Fully deterministic closed form cf_D+ = cf_D + 11t's exact start term, against the exact estimator (en-route
    totals, all pairs): ratio per layout, z on the exact estimator's batch SE, and how much of 11t's cf+ residual
    scatter (sampled flux) was sampling noise: sd over layouts of cf_D+/exact against that of cf+/exact.
 E3 Split noise: the best two-layer split (graph_partition.best over the 127 bipartitions) under cf_D+ against the
    one under 11t's cf+ (400,000 sampled pairs for the flux) and under each of the ten batch-level cf+ (40,000 pairs),
    every split scored on cf_D+ (the model's own noise-free weights) and on the pooled exact weights.
 E4 Paper weights against a noise-free reference: 11u's gas_d against cf_D (cross en-route), and gas_d+ = gas_d +
    start_g against cf_D+ (cross en-route), per layout ratios and pair-weight correlations, compared with the same
    statistics against the sampled cf and cf+ that 11u used.
 E5 Cost: CPU seconds for cf_D per layout, against the 400,000-pair sampled estimate.

Predictions (written and committed before the experiment ran; before committing, only the unit tests of
tests/test_flux_term.py had run, on synthetic operators; no layout was evaluated):
 (1) E1: pooled cf_D / sampled cf within 0.5%, and |z| <= 3 in >= 23 of 24 layouts (prior 85%).
 (2) E1: the sampled cf's coefficient of variation at 400,000 pairs is between 0.3% and 1.5% in every layout
     (prior 55%).
 (3) E2: cf_D+ within 2% of the exact en-route total in >= 22 of 24 layouts (prior 80%), and the pooled
     cf_D+/exact lies in [0.998, 1.008] (prior 60%).
 (4) E2: sd over layouts of cf_D+/exact is <= 0.9 times that of 11t's cf+/exact (part of 11t's scatter was flux
     sampling noise) (prior 45%).
 (5) E3: 11t's cf+ (400,000 pairs) picks the same split as cf_D+ in >= 21 of 24 layouts (prior 70%); the ten
     batch-level cf+ (40,000 pairs) agree with cf_D+ in >= 60% of the 240 cases (prior 55%), and their median loss
     scored on cf_D+ is <= 0.5% (prior 65%).
 (6) E4: median over layouts of the cross-pair correlation r(gas_d, cf_D) is >= r(gas_d, sampled cf) (prior 70%),
     and gas_d/cf_D's spread over layouts (max - min) is >= 0.8 times gas_d/cf's (the raster, not the reference's
     noise, makes gas_d scatter; prior 75%).
 (7) E5: cf_D costs <= 300 CPU s per layout (prior 60%).
Preliminary.

    OMP_NUM_THREADS=1 /usr/bin/python3.13 flux_term_run.py > flux_term_results.txt   (needs numpy)
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


st = _load("hub_airspace_start_term_11x", "start_term.py")
sb, gp = st.sb, st.gp
R_TERM = gp.R_TERM
BLOCK = 256


class Ops:
    """One operator's legs as arrays: hub, offsets to destinations, lengths, weights, east bits, speed."""

    def __init__(self, hub, speed, rows):
        a = np.array(rows, dtype=float).reshape(-1, 3)
        w, dx, dy = a[:, 0], a[:, 1], a[:, 2]
        d = np.hypot(dx, dy)
        keep = d > 0
        self.hub, self.v = hub, float(speed)
        self.w, self.dx, self.dy, self.d = w[keep], dx[keep], dy[keep], d[keep]
        self.east = (self.dx > 0) | ((self.dx == 0) & (self.dy > 0))
        self.th = np.arctan2(self.dy, self.dx)
        self.n = len(self.w)


def operators(mix, speeds):
    by = {}
    for w, j, hx, hy, x, y in mix:
        by.setdefault(j, ((hx, hy), []))[1].append((w, x - hx, y - hy))
    return {j: Ops(h, speeds[j], rows) for j, (h, rows) in by.items()}


def cross_sum(A, B, R=50.0, block=BLOCK):
    """sum_{a in A, b in B} w_a w_b x(a, b), split (terminal, en-route); x as steiner_bias.cf_pair for A != B."""
    qx, qy = B.hub[0] - A.hub[0], B.hub[1] - A.hub[1]
    rax, ray = A.dx[None, :], A.dy[None, :]
    term = enr = 0.0
    with np.errstate(divide="ignore", invalid="ignore"):
        for s in range(0, B.n, block):
            sl = slice(s, s + block)
            rbx, rby = B.dx[sl, None], B.dy[sl, None]
            den = rax * rby - ray * rbx
            t = (qx * rby - qy * rbx) / den
            u = (qx * ray - qy * rax) / den
            m = (den != 0) & (t >= 0) & (t <= 1) & (u >= 0) & (u <= 1)
            if not m.any():
                continue
            ii, jj = np.nonzero(m)            # ii: row in block (b), jj: a
            tt, uu = t[ii, jj], u[ii, jj]
            dA, dB = A.d[jj], B.d[s + ii]
            zt = 0.5 * (tt * dA + uu * dB) < R_TERM
            oax, oay = A.v * A.dx[jj] / dA, A.v * A.dy[jj] / dA
            obx, oby = B.v * B.dx[s + ii] / dB, B.v * B.dy[s + ii] / dB
            cr = np.abs(oax * oby - oay * obx)
            same = A.east[jj] == B.east[s + ii]
            sg = np.where(same, -1.0, 1.0)
            rel = np.hypot(oax + sg * obx, oay + sg * oby)
            cap = dA / A.v + dB / B.v
            x = np.minimum(2 * R * rel / cr, cap) * A.w[jj] * B.w[s + ii]
            term += float(x[zt].sum())
            enr += float(x[~zt].sum())
    return term, enr


def same_sum(A, R=50.0, block=BLOCK):
    """sum_{a, b in A} w_a w_b x(a, b), split (terminal, en-route); x as steiner_bias.cf_pair for one operator."""
    term = enr = 0.0
    v = A.v
    for s in range(0, A.n, block):
        sl = slice(s, s + block)
        wb, eb, db, tb = A.w[sl, None], A.east[sl, None], A.d[sl, None], A.th[sl, None]
        ww = wb * A.w[None, :]
        eq = eb == A.east[None, :]
        term += float((ww * eq).sum()) * 2 * R / v
        sn = np.abs(np.sin((A.th[None, :] - tb) / 2))
        L = 2 * np.minimum(A.d[None, :], db)
        with np.errstate(divide="ignore"):
            L = np.where(sn > 0, np.minimum(L, R / sn), L)
        out = np.maximum(0.0, L - 2 * R_TERM)
        ne = ~eq
        enr += float((ww * ne * out).sum()) / v
        term += float((ww * ne * (L - out)).sum()) / v
    return term, enr


def flux_terms(mix, speeds, lam_h, R=50.0, block=BLOCK):
    """Deterministic closed form (the flux term), in closed_form_pairs' units: {(i, j, zone): conflicts per hour}."""
    lam = lam_h / 3600.0
    sc = lam * lam * 3600.0
    ops = operators(mix, speeds)
    keys = sorted(ops)
    out = {}
    for ai, A in enumerate(keys):
        t, e = same_sum(ops[A], R, block)
        out[(A, A, "term")], out[(A, A, "enr")] = sc * t, sc * e
        for B in keys[ai + 1:]:
            t, e = cross_sum(ops[A], ops[B], R, block)
            k = gp.key(A, B)
            out[k + ("term",)], out[k + ("enr",)] = 2 * sc * t, 2 * sc * e
    return {k: x for k, x in out.items() if x}


def brute(mix, speeds, lam_h, R=50.0):
    """Reference: the same sum by looping steiner_bias.cf_pair over every ordered pair of mix rows (small mixes)."""
    sc = (lam_h / 3600.0) ** 2 * 3600.0
    acc = {}
    for fa in mix:
        for fb in mix:
            for k, z, x in sb.cf_pair(fa, fb, speeds, R):
                if x:
                    acc[k + (z,)] = acc.get(k + (z,), 0.0) + fa[0] * fb[0] * x * sc
    return acc
