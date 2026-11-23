"""Milestone 11ai: altitude-keeping error as a cross-level conflict term, so the layer spacing h is chosen rather than
swept (12 and 16 operators, the 400 ft column).

Why. 11ah's "Next". In 11ah (and 11af/11ag) traffic in different layer levels never conflicts, so for any plan the
conflict count is non-decreasing in h and the thinnest spacing always wins: the model priced a separation standard but
could not choose one. Real drones do not hold their level exactly. Two drones whose nominal levels are n h apart lose
vertical separation when their altitude errors close the gap, and the closer the levels, the more often that happens.
This step charges that leakage, which makes h a real choice: thinner spacing fits more bands under the ceiling but
leaks more between neighbouring levels.

Model. 11ah's, with the en-route encounter count split by level. Every horizontal encounter (two legs within R = 50 m,
the closed form's crossing windows, flux part of cf_D) now carries the vertical offset between the two legs' levels.
 * Levels: band b holds levels 2b and 2b + 1 (the semicircular rule's two headings). k = k_cap(H, h) bands under the
   usable depth H (11ah's band_budget.k_cap, H = 120 m: the whole 14 CFR 107.51(b) column). Band positions may stay
   empty: an empty band is a spacer.
 * W_ij: 11ag/11ah's en-route weight for legs in the same level (cf_D+, unchanged). X_ij: the same closed form for
   the legs in the other level of the band, i.e. the leg pairs the semicircular rule separates (fast_flux.cross_sum
   with the other east-bit sign; opp_same_sum below for one operator's own legs; en-route zone only, the start term
   is not split and not charged). For every destination pair the two other-level leg pairs are one with i's leg in
   the lower level and one with it in the upper, with the same geometry, so X_ij splits evenly: for bands Delta b =
   b_i - b_j apart, half of X_ij is at |2 Delta b + 1| levels and half at |2 Delta b - 1|; W_ij is at 2 |Delta b|.
 * Altitude-keeping error: each drone's altitude error is independent with sd sigma, so the vertical gap of two legs n
   levels apart is n h + e, e ~ N(0, 2 sigma^2) (Gaussian), or a Laplace e with the same sd (sensitivity: heavier
   tails, the shape the ICAO collision-risk models use for large aircraft height-keeping). An encounter is a loss of
   separation when |gap| < Z. p(n) = P(|n h + e| < Z); same-level encounters are charged p(0) (just below 1).
 * Transits: a climbing or descending drone is within Z of a level for 2 Z / w, so tau = 2 Z (1/w_up + 1/w_down) / 2
   per level crossed (w as 11ah: 5 and 4 m/s, DJI M300 RTK P mode), the same for every h; V = tau A + B as 11ag. The
   Z-free convention of 11ah, tau = h (1/w_up + 1/w_down) / 2, is run as a sensitivity.
 * F(labels; h) = sum_ij W_ij pw(|Delta b|) + sum_ij X_ij px(|Delta b|) + sum_{i != j} V_ij [b_j < b_i],
   pw(d) = p(2d), px(d) = (p(2d + 1) + p(|2d - 1|)) / 2. Diagonal terms (one operator's own traffic, Delta b = 0)
   depend on h through px(0) = p(1) and are included.
Parameters. Z: 15 ft (4.57 m; the vertical separation of Ribeiro, Ellerbroek and Hoekstra's layered-airspace RL study,
Aerospace 9(8):413, 2022, doi:10.3390/aerospace9080413, identified 2026-11-23 from search excerpts, full text not
opened) and 25 ft (7.62 m; the layer spacing of Doole et al., Aerospace 8(2):38, 2021, read as the separation it was
set to provide). sigma: 0.5, 1, 2, 3 m (swept; DJI lists +-0.5 m vertical hover accuracy with GNSS and +-0.1 m
with vision or RTK for the M300, hover not cruise; uncorrected GNSS vertical error is metres; no small-drone
height-keeping study with a 1-sigma figure could be opened from this session). h: 5 to 41 m in 2 m steps (k_cap from
11 to 2 at H = 120 m; at most M bands are useful, so k = min(k_cap, M)). Same 48 layouts (1200..1223 at M = 12,
1600..1623 at M = 16). Search: best of 60 random-restart single-move descents over k band positions (no
compaction), seeded by 11ah's leakage-free plan as one extra start.

Checks and predictions (written and committed before any layout's X was computed and before any capped search with
leakage ran; only the unit tests, on synthetic operators, had run):
 P1 Size of the other-level weight: the median over layouts of sum_{i != j} X_ij / sum_{i != j} W_ij is between 1.3
    and 3.0 at both M (other-level pairs fly closer to head-on, so their crossing windows are longer).
 P2 25 ft is too tight under its own separation: at Z = 7.62 m and sigma = 1 m (Gaussian, tau = 2Z/w) the median
    best spacing h* is >= 11 m (36 ft) at both M.
 P3 h* rises with sigma: at each Z and M the median h* is non-decreasing over sigma = 0.5, 1, 2, 3 m, and h* - Z at
    sigma = 3 m is at least 4 m more than at sigma = 0.5 m.
 P4 Ignoring the error is costly: 11ah's leakage-free optimum at h = 7.62 m (8 bands), scored with leakage at Z =
    7.62 m and sigma = 1 m, costs a median >= 1.5 times the best leakage-aware F (over the h grid) at both M.
 P5 At h* the leakage (all cross-level terms) is a minority: median <= 30% of F at Z = 7.62 m, sigma = 1 m.
 P6 Heavier tails need more room: with Laplace errors (same sd) at Z = 7.62 m, sigma = 1 m the median h* is at least
    one grid step (2 m) above the Gaussian h*, at both M.
 Reported without a prediction: the full (Z, sigma) table of median h*, k used, F*/F_1 and the leakage share; how
 often the optimum leaves an empty spacer band; the h = Z-free tau sensitivity; F* against 11ah's 25 ft F with no
 leakage (what altitude error costs if the spacing is re-chosen).
Preliminary.
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


ff = _load("hub_airspace_fast_flux_11ai", "fast_flux.py")
ft = ff.ft
R_TERM = ff.R_TERM

W_UP, W_DOWN = 5.0, 4.0
ZS = (4.572, 7.62)                    # 15 ft, 25 ft
SIGMAS = (0.5, 1.0, 2.0, 3.0)
HGRID = tuple(float(h) for h in range(5, 42, 2))
H_DEPTH = 120.0


# ---------------------------------------------------------------- other-level encounter weight

class _Flipped:
    """A view of an operator's legs with the east bits inverted (cross_sum reads B.east only for the layer test)."""

    def __init__(self, B):
        self.__dict__.update(B.__dict__)
        self.east = ~B.east


def opp_same_sum(A, R=50.0, block=256):
    """One operator's own leg pairs in different levels (ordered destination pairs, as ff.same_sum): pairs with
    different east bits fly co-directional legs in different levels (constant 2R/v, terminal, as same_sum's equal-bit
    term); pairs with equal bits fly an outbound and a return leg in different levels (same_sum's head-on window)."""
    v = A.v
    we, ww_ = float(A.w[A.east].sum()), float(A.w[~A.east].sum())
    term = 2.0 * we * ww_ * 2 * R / v
    enr = 0.0
    for mask in (A.east, ~A.east):
        idx = np.nonzero(mask)[0]
        d2, t2, w2 = A.d[idx][None, :], A.th[idx][None, :], A.w[idx][None, :]
        for s in range(0, len(idx), block):
            e = idx[s:s + block]
            ww = A.w[e, None] * w2
            sn = np.abs(np.sin((t2 - A.th[e, None]) / 2))
            L = 2 * np.minimum(d2, A.d[e, None])
            with np.errstate(divide="ignore"):
                L = np.where(sn > 0, np.minimum(L, R / sn), L)
            out = np.maximum(0.0, L - 2 * R_TERM)
            enr += float((ww * out).sum()) / v
            term += float((ww * (L - out)).sum()) / v
    return term, enr


def opp_flux_terms(mix, speeds, lam_h, R=50.0):
    """Like ff.flux_terms, for leg pairs in the two different levels of a band: {(i, j, zone): conflicts per hour}."""
    lam = lam_h / 3600.0
    sc = lam * lam * 3600.0
    ops = ft.operators(mix, speeds)
    keys = sorted(ops)
    out = {}
    for ai, A in enumerate(keys):
        t, e = opp_same_sum(ops[A], R)
        out[(A, A, "term")], out[(A, A, "enr")] = sc * t, sc * e
        for B in keys[ai + 1:]:
            t, e = ff.cross_sum(ops[A], _Flipped(ops[B]), R)
            k = ff.gp.key(A, B)
            out[k + ("term",)], out[k + ("enr",)] = 2 * sc * t, 2 * sc * e
    return {k: x for k, x in out.items() if x}


def opp_brute(mix, speeds, lam_h, R=50.0):
    """Reference: steiner_bias.cf_pair's terms with every layer indicator negated (small mixes)."""
    gp = ff.gp
    sc = (lam_h / 3600.0) ** 2 * 3600.0
    lay = lambda kind, vx, vy, h: gp.base_layer("semi", kind, vx, vy, h)
    acc = {}

    def add(k, x):
        if x:
            acc[k] = acc.get(k, 0.0) + x

    for fa in mix:
        for fb in mix:
            wa, ha, ax, ay, xa, ya = fa
            wb, hb, bx, by, xb, yb = fb
            ra, rb = (xa - ax, ya - ay), (xb - bx, yb - by)
            da, db = math.hypot(*ra), math.hypot(*rb)
            if da == 0 or db == 0:
                continue
            lo_a, li_a = lay("o", ra[0], ra[1], ha), lay("i", -ra[0], -ra[1], ha)
            lo_b, li_b = lay("o", rb[0], rb[1], hb), lay("i", -rb[0], -rb[1], hb)
            f = wa * wb * sc
            if ha == hb:
                v = speeds[ha]
                term = (R / v) * ((lo_a != lo_b) + (li_a != li_b))
                enr_ = 0.0
                if lo_a != li_b:
                    s = abs(math.sin((math.atan2(ra[1], ra[0]) - math.atan2(rb[1], rb[0])) / 2))
                    L = 2 * min(da, db)
                    if s > 0:
                        L = min(L, R / s)
                    out = max(0.0, L - 2 * R_TERM)
                    enr_ = out / v
                    term += (L - out) / v
                add((ha, ha, "term"), f * term)
                add((ha, ha, "enr"), f * enr_)
                continue
            hit = gp._cross((ax, ay), ra, (bx, by), rb)
            if hit is None:
                continue
            X = (ax + hit[0] * ra[0], ay + hit[0] * ra[1])
            zone = "term" if 0.5 * (math.hypot(X[0] - ax, X[1] - ay) + math.hypot(X[0] - bx, X[1] - by)) < R_TERM else "enr"
            va_, vb_ = speeds[ha], speeds[hb]
            oa = (va_ * ra[0] / da, va_ * ra[1] / da)
            ob = (vb_ * rb[0] / db, vb_ * rb[1] / db)
            cap = da / va_ + db / vb_
            w_same = gp.window(oa, ob, R, cap)
            w_opp = gp.window(oa, (-ob[0], -ob[1]), R, cap)
            x = 0.5 * w_same * ((lo_a != lo_b) + (li_a != li_b)) + 0.5 * w_opp * ((lo_a != li_b) + (li_a != lo_b))
            add(gp.key(ha, hb) + (zone,), f * x)
    return acc


# ---------------------------------------------------------------- vertical overlap

def _cdf_normal(x, s):
    return 0.5 * (1.0 + math.erf(x / (s * math.sqrt(2.0))))


def _cdf_laplace(x, s):
    b = s / math.sqrt(2.0)                    # Laplace scale with sd s
    return 0.5 * math.exp(x / b) if x < 0 else 1.0 - 0.5 * math.exp(-x / b)


def p_overlap(gap, Z, sigma, dist="normal"):
    """P(|gap + e| < Z), e the difference of two independent altitude errors of sd sigma (so sd sigma sqrt 2).
    For "laplace" the difference itself is taken as Laplace with that sd (a heavy-tailed stand-in)."""
    s = sigma * math.sqrt(2.0)
    if s <= 0:
        return 1.0 if abs(gap) < Z else 0.0
    cdf = _cdf_normal if dist == "normal" else _cdf_laplace
    return cdf(Z - gap, s) - cdf(-Z - gap, s)


def level_weights(h, Z, sigma, k, dist="normal"):
    """pw[d] (same-level legs d bands apart) and px[d] (other-level legs d bands apart), d = 0..k-1."""
    p = lambda n: p_overlap(n * h, Z, sigma, dist)
    pw = np.array([p(2 * d) for d in range(k)])
    px = np.array([0.5 * (p(2 * d + 1) + p(abs(2 * d - 1))) for d in range(k)])
    return pw, px


def tau_z(Z, w_up=W_UP, w_down=W_DOWN):
    """Time a vertical transit spends within Z of one level, mean of climb and descent."""
    return 0.5 * 2 * Z * (1.0 / w_up + 1.0 / w_down)


def tau_h(h, w_up=W_UP, w_down=W_DOWN):
    return 0.5 * h * (1.0 / w_up + 1.0 / w_down)


# ---------------------------------------------------------------- scoring and search

def score(W, X, V, labels, pw, px):
    lab = np.asarray(labels)
    D = np.abs(lab[:, None] - lab[None, :])
    below = (lab[None, :] < lab[:, None]).astype(float)
    return float((W * pw[D]).sum() + (X * px[D]).sum() + (V * below).sum())


def parts(W, X, V, labels, pw, px):
    """(same-level en-route, cross-level en-route (leakage incl. same-band other level), transit)."""
    lab = np.asarray(labels)
    D = np.abs(lab[:, None] - lab[None, :])
    below = (lab[None, :] < lab[:, None]).astype(float)
    same = (D == 0)
    wpart = W * pw[D]
    return float(wpart[same].sum()), float(wpart[~same].sum() + (X * px[D]).sum()), float((V * below).sum())


def descend(W, X, V, labels, k, pw, px):
    """Single-move descent over band positions 0..k-1 (empty positions kept: they are spacers)."""
    S, SX = W + W.T, X + X.T
    lab = np.array(labels, dtype=int)
    m = len(lab)
    ar = np.arange(k)
    while True:
        best = (0.0, None, None)
        for i in range(m):
            o = np.arange(m) != i
            lj = lab[o]
            D = np.abs(ar[:, None] - lj[None, :])
            c = pw[D] @ S[i, o] + px[D] @ SX[i, o] + (lj[None, :] < ar[:, None]) @ V[i, o] + (lj[None, :] > ar[:, None]) @ V[o, i]
            d = c - c[lab[i]]
            a = int(d.argmin())
            if d[a] < best[0] - 1e-12 * max(1.0, abs(c[lab[i]])):
                best = (float(d[a]), i, a)
        if best[1] is None:
            return tuple(int(x) for x in lab)
        lab[best[1]] = best[2]


def search(W, X, V, k, pw, px, restarts=60, seed=0, starts=()):
    """Best of the given starts and `restarts` random labellings, each descended. Returns (labels, F)."""
    m = W.shape[0]
    rng = np.random.default_rng(seed)
    cands = [tuple(int(x) for x in s) for s in starts if max(s) < k] + [tuple(rng.integers(0, k, m)) for _ in range(restarts)]
    best, arg = np.inf, None
    for s0 in cands:
        lab = descend(W, X, V, s0, k, pw, px)
        f = score(W, X, V, lab, pw, px)
        if f < best - 1e-12 * abs(best if np.isfinite(best) else 1.0):
            best, arg = f, lab
    return arg, best


def exhaustive(W, X, V, k, pw, px):
    import itertools
    m = W.shape[0]
    best, arg = np.inf, None
    for lab in itertools.product(range(k), repeat=m):
        f = score(W, X, V, lab, pw, px)
        if f < best:
            best, arg = f, lab
    return arg, best
