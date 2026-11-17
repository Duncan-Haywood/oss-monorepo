"""Milestone 11aj: mixed altitude references. Operators whose drones hold altitude on different references (barometric
against GNSS) share a common-mode error only with their own class, so the vertical gap between two classes carries a
mismatch term; does a planner that knows each operator's reference stack the two classes apart, and what is that worth
against planning blind?

Why. 11ai's "Next" (a shared barometric bias). 11ai gave every drone an independent altitude error of sd sigma, so every
pair of drones had a vertical-gap error of sd sigma sqrt 2. Real altitude errors are not independent between drones.
Two drones on the same reference in the same few kilometres share most of its error: barometric altimeters set to one
pressure read the same weather drift, and GNSS receivers a few km apart see nearly the same satellite and atmosphere
errors (the reason differential GNSS works). The shared part cancels in the gap. Between a barometric drone and a GNSS
drone it does not: the gap carries the pressure-setting error, at about 8.3 m per hPa near sea level (hypsometric
equation, dz/dp = R_d T / (g p) = 287.05 x 288.15 / (9.80665 x 101325) m/Pa), plus the GNSS common error. A fleet
under one operator flies one reference, so the planner knows each operator's class.

Model. 11ai's (level_leak.py) unchanged except the gap's error sd, which now depends on the pair:
 * every drone has an individual error of sd sigma (independent, as 11ai);
 * operators are in class "baro" or "gnss"; pairs in the same class (and an operator's own fleet) have gap sd
   s_same = sigma sqrt 2; pairs in different classes have s_mix = sqrt(2 sigma^2 + sigma_m^2), sigma_m the sd of the
   difference between the two classes' common errors (swept: 0, 1, 2, 3, 5 m, about 0.1 to 0.6 hPa of pressure
   mismatch; no reachable source gives it for small drones: the IEM ASOS, NCEI and Open-Meteo hosts that would give
   a pressure-tendency distribution were refused from this session);
 * F(labels; h) = sum over pairs of 11ai's terms with p computed at the pair's sd: W_ij pw_t(|Delta b|) + X_ij
   px_t(|Delta b|) + V_ij [b_j < b_i], t = same or mix. Transits as 11ai's main run (tau = 2Z / w per level).
 * Classes: in each layout, round(q M) operators drawn at random (seeded by the layout) are "baro", q = 0.5 (main)
   and 0.25. Z = 7.62 m (25 ft, main) and 4.572 m (15 ft, one sensitivity); sigma = 0.5 and 1 m.
 * h grid: 11ai's 5..41 m in 2 m steps plus every band count's widest spacing h_k = H / (2k - 1), k = 2..12
   (11ai's post hoc found the optimum sits there). H = 120 m, k = k_cap(H, h) band positions, empty bands allowed.
Planners, all scored under the true pair-dependent F:
 * aware: knows the classes, searches labels and h on the true F (best of 100 descents, plus the two blind plans
   at that h as starts, so it is never worse than them at the same h);
 * naive: 11ai's planner at sigma (assumes every pair is same-class), h chosen on its own objective;
 * cautious: 11ai's planner with every pair at the mixed sd (sigma_eff = sqrt(sigma^2 + sigma_m^2 / 2)), h chosen on
   its own objective;
 * mandate: every operator on one reference (all pairs at s_same): 11ai's optimum at sigma, the floor a rule that
   imposes one reference would buy.
A plan is "segregated" if some band position t has every operator of one class at or below t and every operator of
the other at or above t (a shared band at the interface allowed).

Checks and predictions (written and committed before any layout's inputs were scored under the mixed model; the
inputs, 11ai's W, X, A and B recomputed unchanged, were building in the background while this was written, and 11ai's
results were known):
 P0 sigma_m = 0 reproduces 11ai: at Z = 7.62 m, sigma = 1 m the aware, naive and mandate F agree (ratio within 1e-9
    of 1 in every layout) and the median h* is 13.3 m (5 bands) at both M.
 P1 Segregation: at Z = 7.62 m, sigma = 1 m, q = 0.5, sigma_m = 3 m the aware plan is segregated in >= 18 of 24
    layouts at each M.
 P2 Knowing the classes beats caution: at the same condition the median F(cautious plan) / F(aware) is >= 1.05 at
    both M; the cautious h* is >= 15 m (it widens every level for the sake of the mixed pairs).
 P3 Ignoring the mismatch costs between 5% and 50%: median F(naive plan) / F(aware) in [1.05, 1.50] at both M.
 P4 Segregation recovers most of the mixing cost: median F(aware) / F(mandate) <= 1.10 at both M, and smaller than
    the median F(naive) / F(mandate).
 P5 The aware h* stays at the single-reference spacing: median aware h* = 13.3 m at sigma_m <= 3 m (sigma = 1 m,
    Z = 7.62 m, q = 0.5), at both M.
 Reported without a prediction: the full (sigma, sigma_m, q) table of h*, F ratios and segregation counts; how often
 an empty spacer band sits at the class interface; the share of F from mixed pairs; Z = 15 ft at sigma = 1 m.
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


ll = _load("hub_airspace_level_leak_11aj", "level_leak.py")

M_PER_HPA = 287.05 * 288.15 / (9.80665 * 101325.0) * 100.0   # 8.32 m per hPa at sea level, standard atmosphere
SIGMA_MS = (0.0, 1.0, 2.0, 3.0, 5.0)
SIGMAS = (0.5, 1.0)
QS = (0.5, 0.25)
H_DEPTH = ll.H_DEPTH


def hgrid(H=H_DEPTH, kmax=12):
    hs = set(ll.HGRID) | {round(H / (2 * k - 1), 6) for k in range(2, kmax + 1)}
    return tuple(sorted(hs))


def p_gap(gap, Z, s):
    """P(|gap + e| < Z), e ~ N(0, s^2): s is the sd of the gap error itself (not of one drone)."""
    if s <= 0:
        return 1.0 if abs(gap) < Z else 0.0
    c = lambda x: 0.5 * (1.0 + math.erf(x / (s * math.sqrt(2.0))))
    return c(Z - gap) - c(-Z - gap)


def weights_sd(h, Z, s, k):
    """11ai's pw[d], px[d] for a gap-error sd s."""
    p = lambda n: p_gap(n * h, Z, s)
    pw = np.array([p(2 * d) for d in range(k)])
    px = np.array([0.5 * (p(2 * d + 1) + p(abs(2 * d - 1))) for d in range(k)])
    return pw, px


def classes(m, q, seed):
    """Boolean array, True = baro; exactly round(q m) baro operators, drawn with the given seed."""
    rng = np.random.default_rng(seed)
    c = np.zeros(m, dtype=bool)
    c[rng.choice(m, int(round(q * m)), replace=False)] = True
    return c


def split(W, X, cls):
    """(W_same, X_same, W_mix, X_mix): the diagonal (own fleet) is a same-class pair."""
    mix = cls[:, None] != cls[None, :]
    return W * ~mix, X * ~mix, W * mix, X * mix


class Problem:
    """The pair-dependent F at one (h, Z, sigma, sigma_m) and k band positions."""

    def __init__(self, W, X, V, cls, h, Z, sigma, sigma_m, k):
        self.Ws, self.Xs, self.Wm, self.Xm = split(W, X, cls)
        self.V, self.k, self.cls = V, k, cls
        s_same = sigma * math.sqrt(2.0)
        s_mix = math.sqrt(2.0 * sigma ** 2 + sigma_m ** 2)
        self.pws, self.pxs = weights_sd(h, Z, s_same, k)
        self.pwm, self.pxm = weights_sd(h, Z, s_mix, k)

    def score(self, labels):
        lab = np.asarray(labels)
        D = np.abs(lab[:, None] - lab[None, :])
        below = (lab[None, :] < lab[:, None]).astype(float)
        return float((self.Ws * self.pws[D]).sum() + (self.Xs * self.pxs[D]).sum() + (self.Wm * self.pwm[D]).sum()
                     + (self.Xm * self.pxm[D]).sum() + (self.V * below).sum())

    def mix_part(self, labels):
        lab = np.asarray(labels)
        D = np.abs(lab[:, None] - lab[None, :])
        return float((self.Wm * self.pwm[D]).sum() + (self.Xm * self.pxm[D]).sum())

    def descend(self, labels):
        Ss, SXs, Sm, SXm = self.Ws + self.Ws.T, self.Xs + self.Xs.T, self.Wm + self.Wm.T, self.Xm + self.Xm.T
        V, k = self.V, self.k
        lab = np.array(labels, dtype=int)
        m = len(lab)
        ar = np.arange(k)
        while True:
            best = (0.0, None, None)
            for i in range(m):
                o = np.arange(m) != i
                lj = lab[o]
                D = np.abs(ar[:, None] - lj[None, :])
                c = (self.pws[D] @ Ss[i, o] + self.pxs[D] @ SXs[i, o] + self.pwm[D] @ Sm[i, o] + self.pxm[D] @ SXm[i, o]
                     + (lj[None, :] < ar[:, None]) @ V[i, o] + (lj[None, :] > ar[:, None]) @ V[o, i])
                d = c - c[lab[i]]
                a = int(d.argmin())
                if d[a] < best[0] - 1e-12 * max(1.0, abs(c[lab[i]])):
                    best = (float(d[a]), i, a)
            if best[1] is None:
                return tuple(int(x) for x in lab)
            lab[best[1]] = best[2]

    def search(self, restarts=100, seed=0, starts=()):
        m = self.V.shape[0]
        rng = np.random.default_rng(seed)
        cands = [tuple(int(x) for x in s) for s in starts if max(s) < self.k]
        cands += [tuple(int(x) for x in rng.integers(0, self.k, m)) for _ in range(restarts)]
        best, arg = np.inf, None
        for s0 in cands:
            lab = self.descend(s0)
            f = self.score(lab)
            if f < best - 1e-12 * abs(best if np.isfinite(best) else 1.0):
                best, arg = f, lab
        return arg, best

    def exhaustive(self):
        import itertools
        m = self.V.shape[0]
        best, arg = np.inf, None
        for lab in itertools.product(range(self.k), repeat=m):
            f = self.score(lab)
            if f < best:
                best, arg = f, lab
        return arg, best


def segregated(labels, cls):
    """True if one class sits wholly at or below some position t and the other wholly at or above it."""
    lab = np.asarray(labels)
    a, b = lab[cls], lab[~cls]
    if len(a) == 0 or len(b) == 0:
        return True
    return bool(a.max() <= b.min() or b.max() <= a.min())


def spacer_at_interface(labels, cls):
    """For a segregated plan whose classes share no band: is there an empty position strictly between them?"""
    lab = np.asarray(labels)
    a, b = lab[cls], lab[~cls]
    if len(a) == 0 or len(b) == 0 or not segregated(labels, cls):
        return False
    lo, hi = (a, b) if a.max() <= b.min() else (b, a)
    gap = set(range(int(lo.max()) + 1, int(hi.min())))
    return bool(gap) and not (gap & set(lab.tolist()))
