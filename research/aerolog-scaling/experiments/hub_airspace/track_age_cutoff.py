"""Milestone 11bk: is a maximum track age a better transit-hold procedure than a bigger fixed radius? 11bj found the
mean burst length of Remote ID message loss, not the mean loss, sets the cost of the fixed-radius hold rule (FR), and
read that as "the procedure should bound the time since the last received message (a maximum track age)". This step
prices that procedure against FR on 11bi's stored holds, and asks what each rule's collision guarantee rests on when
the burst-length law, which no source measured, has a heavier tail than 11bj's geometric one.

Why: 11bj's "Next" list ("a track-age cut-off rule (treat a track older than A_max as unknown and hold) priced
against FR") and its limit "a geometric burst law (measured blockage is often heavier-tailed, which would move the
thresholds down)".

Model (stated before any radius or hold under this step's rules was computed).
 * Channel: 11bj's receiver-wide two-state channel at one step per broadcast period T = 1 s (a blockage shadows the
   receiver from every intruder at once; every message in a bad run lost), mean loss q = bad share, bad runs of
   length D (messages) with mean B, good runs geometric. Burst laws: geometric (11bj: P(D >= k) = (1 - 1/B)^(k-1)),
   and a discrete Pareto (Lomax) tail P(D >= k) = (s / (s + k - 1))^alpha with s set so that E[D] = B, alpha in 2.5
   and 4 (finite variance; at alpha <= 2 the expected outage wait below is infinite).
 * Age: K, the number of lost periods since the newest received message at a decision time, is a backward
   recurrence time of the alternating renewal channel: P(K = 0) = 1 - q, P(K = k) = q P(D >= k) / B for k >= 1
   (geometric D gives 11bj's law). A = L + U T + K T, U uniform (8 midpoints) as 11bi and 11bj. Exact k up to
   20 000, then log-spaced bins to 1e12 with each bin's weight put on its largest age (conservative).
 * FR (oracle): one radius sized for the true age law (11bj's rule; 11bi's sigma(A, r), P_h, c, P_v, T_tr, V).
 * FR (geometric assumed): the radius 11bj would write down, sized for a geometric law with the same q and B; its
   residual is then evaluated under the true law and reported as a multiple of the target.
 * Cut-off rule OC(A_max), distribution-free: the receiver declares surveillance lost when its newest message is
   older than A_max = L + (k + 1) T (more than k consecutive messages lost) and the transit waits until a message is
   received; otherwise every intruder is checked at one radius r(A_max) sized for the worst admissible age (P_h at
   A = A_max meets the miss budget b = Tg / c - P_v). No transit starts on a track older than A_max, and P_h grows
   with A, so the residual meets the target under any channel, burst law or age law: the guarantee needs no
   measured burst length. A_max in 3, 5, 10, 30, 60, 120 s, and the best A_max per layout on a grid of 1 to 600
   lost messages. (Changed after the first summary run, before the predictions were scored: the best A_max sat at
   the 600 s top in heavy-tail cells, so the grid became 0 to 4 999 lost messages (A_max 2 to 5 000 s) and the fixed
   list 3, 10, 30, 60, 120, 300 s; the first run's partial output is described in LOG.md.)
 * Cut-off hold per flight = FR hold at r(A_max) (11bi's stored grid, log-linear, as 11bj) + n_rule E[W 1{K > k}].
   The wait until the next received message, given K = j, is (E[D - j | D >= j] + 1/2) T, so
   E[W 1{K > k}] = T (q / B sum_{j > k} S(j + 1) + P(K > k) / 2), S(j) = sum_{i >= j} P(D >= i) (geometric:
   P(K > k) (B - 1/2) T). n_rule = 4 x the flight share of operators with a lower band (11bg: two transits at the
   hub and two at the destination, the rule only where a lower band is crossed), from the layout's own shares.
   The post-outage gap check is the unconditional FR hold (intruders independent of the channel); a second outage
   during that hold is ignored (second order).
Parameters and sources: 11bj's (L = 1 s, T = 1 s from 14 CFR 89.310 / 89.320; speed accuracy bands 0.3, 1, 3 m/s
from ASTM F3411; q 0.12, 0.5, 0.75, 0.9 about the National Taiwan University thesis's coded and uncoded urban
reception, search excerpts), sigma0 12.54 m, target 1e-7, traffic 1 and 10 times. B in 10, 30, 100 s, swept (no
measured Remote ID burst lengths were found, 11bj); alpha 2.5 and 4 swept for the same reason (no source).

Predictions (written and pushed before any radius or hold under this step's rules was computed; only 11bj's results
had been read, and a pencil estimate made of the outage term at q = 0.5, B = 10 s: about 3.6 x 0.36 x 9.5 = 12 s per
flight at A_max = 5 s):
 C1 (prior 75%) Geometric bursts, 1 m/s, q = 0.5, B = 10 s: the best OC median hold per flight (best A_max per
    layout) is above FR's (oracle) at today's traffic (both M): at the measured loss rates, waiting out an outage
    costs more than the larger radius.
 C2 (prior 30%) Geometric, coded reception (q = 0.12), B = 10 s, 1 m/s: the best OC is within twice FR's median
    hold (both M).
 C3 (prior 70%) Pareto alpha = 2.5, q = 0.5, B = 10 s, 1 m/s: FR sized for a geometric law has a residual above 3
    times the target in the median layout (both M): FR's guarantee rests on the unmeasured burst tail.
 C4 (prior 45%) Same cell: the best OC median hold is below FR's (oracle) (both M): under a heavy tail the
    distribution-free rule is also the cheaper one.
 C5 (prior 80%) Geometric, 1 m/s, q = 0.5, B = 10 s: the median best A_max is no longer at ten times today's traffic
    than at today's (both M): a dearer radius makes the outage wait relatively cheaper.
 C6 (prior 55%) Same cell, today's traffic: the median best A_max is over 30 s (both M).
Reported without a prediction: every cell's FR (oracle and geometric-assumed) radius, hold and residual multiple,
OC holds at each A_max and at its best, both traffic levels, and 3 m/s and 0.3 m/s.
Reading fixed in advance: C1 held says 11bj's "bound the time since the last message" is the wrong instrument as a
hold-and-wait rule at the measured loss rates, and the requirement to write is receiver coverage (short bursts) or
a measured burst law for FR; C3 held says FR cannot be certified without a measured burst-length tail; C4 held says
where the tail is heavy, the cut-off rule is both the guaranteed and the cheaper procedure.

    python3 track_age_cutoff.py --summarise > track_age_cutoff_results.txt   # reads stale_track.json.gz

Limits: 11bi's and 11bj's (one city, synthetic operators, straight legs, Poisson launches, no wind, the plan fixed as
traffic grows, no unseen launches, no track filter, 95% accuracy bounds, FR holds from 11bi's 300-point sample);
a receiver-wide channel (per-intruder blockage would stale tracks one at a time, and a cut-off would then hold only
for stale tracks near the transit point, which this step does not price); burst laws swept, not measured; the
wait is spent on the ground or hovering in the own band, and the hover exposure of that wait is not added (11bh
prices the hover term). Preliminary.
"""
import math
import os
import statistics as S
import sys

import numpy as np
from scipy.optimize import brentq
from scipy.special import zeta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import collision_target as ct  # noqa: E402
import stale_track as st  # noqa: E402

th, g = st.th, st.g
QS = (0.12, 0.5, 0.75, 0.9)
BS = (10.0, 30.0, 100.0)
LAWS = ("geom", 2.5, 4.0)                    # geometric, or the Lomax tail index alpha
ACCS = st.ACCS
SIG0 = 12.54
TG = st.TG
A_MAXES = (3, 10, 30, 60, 120, 300)
K_GRID = range(0, 5000)                      # k lost messages tolerated; A_max = L + (k + 1) T
K_EXACT = 2000
NU = 8


def valid(q, B):
    return B >= 1.0 and q / (B * (1.0 - q)) <= 1.0


class Law:
    """Burst-length law of the bad runs (in messages), mean B."""

    def __init__(self, law, B):
        self.law, self.B = law, B
        if law != "geom":
            a = law
            self.s = brentq(lambda s: s ** a * zeta(a, s) - B, 1e-9, 1e7, xtol=1e-12, rtol=1e-13)

    def surv(self, k):
        """P(D >= k), k >= 1 (array)."""
        k = np.asarray(k, dtype=float)
        if self.law == "geom":
            return (1.0 - 1.0 / self.B) ** (k - 1.0)
        return (self.s / (self.s + k - 1.0)) ** self.law

    def S(self, n):
        """sum_{i >= n} P(D >= i)."""
        n = np.asarray(n, dtype=float)
        if self.law == "geom":
            return self.B * (1.0 - 1.0 / self.B) ** (n - 1.0)
        return self.s ** self.law * zeta(self.law, self.s + n - 1.0)

    def SS(self, n):
        """sum_{m >= n} S(m) = sum_{i >= n} (i - n + 1) P(D >= i)."""
        n = np.asarray(n, dtype=float)
        if self.law == "geom":
            return self.B * self.B * (1.0 - 1.0 / self.B) ** (n - 1.0)
        a, s = self.law, self.s
        x = s + n - 1.0
        return s ** a * (zeta(a - 1.0, x) - (x - 1.0) * zeta(a, x))


def k_law(q, law):
    """Lost-period counts K and weights: exact to K_EXACT, then log bins to 1e12 (weight on the bin's top k)."""
    ks = np.arange(1, K_EXACT + 1, dtype=float)
    w = q * law.surv(ks) / law.B
    edges = np.unique(np.round(np.geomspace(K_EXACT, 1e12, 300)))
    tail = q * law.S(edges + 1.0) / law.B             # P(K > edge)
    wb = tail[:-1] - tail[1:]
    kk = np.concatenate(([0.0], ks, edges[1:]))
    ww = np.concatenate(([1.0 - q], w, wb))
    ww[-1] += tail[-1]                                 # what is left past 1e12 on the last bin
    return kk, ww


def ages(q, law):
    kk, ww = k_law(q, law)
    u = (np.arange(NU) + 0.5) / NU
    A = (st.LAT + (u[None, :] + kk[:, None]) * st.PERIOD).ravel()
    W = np.repeat(ww / NU, NU)
    return A, W


def ph_curve(r, A, W, acc, s0=SIG0):
    if r <= st.LAM_H:
        return 1.0
    sv = acc / 2.448
    s2 = s0 ** 2 + (sv * (A + st.T_TR + r / st.V_MIN)) ** 2
    return float(W @ np.exp(-((r - st.LAM_H) ** 2) / (2.0 * s2)))


class Cell:
    """One (law, B, q, acc): P_h(r) on a log grid for inverting b quickly, exact bisection on top."""
    RG = np.geomspace(st.LAM_H * 1.0001, 20000.0, 600)

    def __init__(self, law, B, q, acc):
        self.law = Law(law, B)
        self.q, self.acc = q, acc
        self.A, self.W = ages(q, self.law)
        self.P = np.array([ph_curve(r, self.A, self.W, acc) for r in self.RG])

    def ph(self, r):
        return ph_curve(r, self.A, self.W, self.acc)

    def radius(self, b):
        if b >= 1.0:
            return st.LAM_H
        if b <= 0:
            return None
        if self.P[-1] > b:
            return math.inf
        i = int(np.argmax(self.P <= b))
        lo = st.LAM_H if i == 0 else self.RG[i - 1]
        hi = self.RG[i]
        for _ in range(50):
            mid = 0.5 * (lo + hi)
            if self.ph(mid) > b:
                lo = mid
            else:
                hi = mid
        return hi

    def p_out(self, k):
        """P(K > k)."""
        return self.q * float(self.law.S(k + 1.0)) / self.law.B

    def waits(self):
        if not hasattr(self, "_w"):
            k = np.arange(len(K_GRID), dtype=float)
            p_out = self.q * self.law.S(k + 1.0) / self.law.B
            self._w = st.PERIOD * (self.q / self.law.B * self.law.SS(k + 2.0) + 0.5 * p_out)
        return self._w

    def wait(self, k):
        """E[W 1{K > k}], seconds: T (q / B sum_{j > k} S(j + 1) + P(K > k) / 2)."""
        return st.PERIOD * (self.q / self.law.B * float(self.law.SS(k + 2.0)) + 0.5 * self.p_out(k))


def b_of(L):
    return TG / L["c_full"] - th.p_v(st.Z)


def n_rule(L, labels):
    """Transits per flight that the hold rule governs: 4 x share of operators with a lower band."""
    mix, speeds = ct.jittered_mix(L["idx"], L["m"])
    fam, sh = ct.bc.families(mix, speeds)
    ops = sorted(fam)
    band = np.array(labels)
    return 4.0 * sum(sh[ops[ii]] for ii in range(len(ops)) if (band < band[ii]).any())


_HOLDS, _RADII = {}, {}


def oc_radii(b, acc):
    """r(A_max) for every k in K_GRID: the fixed point r = lam_h + s sigma(A_max, r), vectorised (as st.r_age)."""
    key = (b, acc)
    if key not in _RADII:
        A = st.LAT + (np.arange(len(K_GRID)) + 1.0) * st.PERIOD
        s = math.sqrt(-2.0 * math.log(b))
        sv = acc / 2.448
        r = np.full(A.shape, st.LAM_H + s * SIG0)
        for _ in range(400):
            rn = st.LAM_H + s * np.sqrt(SIG0 ** 2 + (sv * (A + st.T_TR + r / st.V_MIN)) ** 2)
            if np.max(np.abs(rn - r)) < 1e-9:
                break
            r = rn
        _RADII[key] = rn
    return _RADII[key]


def oc_radius(k, b, acc):
    return st.r_age(st.LAT + (k + 1) * st.PERIOD, b, SIG0, acc)


def hold_fr_vec(L, r, f_i):
    """st.hold_fr_at over an array of radii (log-linear between 11bi's grid radii; inf past the grid)."""
    R = np.array(st.RADII)
    h = np.array([L["hold_fr"][q][f_i] for q in range(len(R))])
    r = np.asarray(r, dtype=float)
    out = np.full(r.shape, math.inf)
    out[r <= R[0]] = h[0]
    i = np.clip(np.searchsorted(R, r) - 1, 0, len(R) - 2)
    inside = (r > R[0]) & (r <= R[-1])
    r0, r1, h0, h1 = R[i], R[i + 1], h[i], h[i + 1]
    t = (r - r0) / (r1 - r0)
    pos = (h0 > 0) & (h1 > 0)
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        lg = np.exp(np.log(np.where(pos, h0, 1.0)) + (np.log(np.where(pos, h1, 1.0)) - np.log(np.where(pos, h0, 1.0))) * t)
    out[inside] = np.where(pos, lg, h0 + (h1 - h0) * t)[inside]
    return out


def oc_fr_holds(L, acc, f_i, b):
    """FR hold at r(A_max) for every k in K_GRID (inf past the grid); independent of the channel, so cached."""
    key = (L["m"], L["idx"], acc, f_i)
    if key not in _HOLDS:
        _HOLDS[key] = hold_fr_vec(L, oc_radii(b, acc), f_i)
    return _HOLDS[key]


def oc_hold(L, cell, k, n, f_i, b):
    h = oc_fr_holds(L, cell.acc, f_i, b)[k]
    return None if not math.isfinite(h) else h + n * cell.wait(k)


def best_oc(L, cell, n, f_i, b):
    tot = oc_fr_holds(L, cell.acc, f_i, b) + n * cell.waits()
    i = int(np.argmin(tot))
    return (tot[i], i) if math.isfinite(tot[i]) else (math.inf, None)


def label(law):
    return "geometric" if law == "geom" else "Pareto alpha %g" % law


def summarise():
    Ls = ct._read(st.OUT)["layouts"]
    prev = {(L["m"], L["idx"]): L for L in ct._read(th.OUT)["layouts"]}
    M = (12, 16)
    groups = {m: [L for L in Ls if L["m"] == m] for m in M}
    nr = {(L["m"], L["idx"]): n_rule(L, prev[(L["m"], L["idx"])]["labels"]) for L in Ls}
    med = st.med_or_none
    print("Milestone 11bk: track-age cut-off (OC) against the fixed radius (FR) (predictions in track_age_cutoff.py)")
    print("receiver-wide channel; latency %g s, broadcast every %g s, T_tr %g s, V %g m/s, sigma0 %g m, target %s"
          % (st.LAT, st.PERIOD, st.T_TR, st.V_MIN, SIG0, g(TG)))
    for m in M:
        print("  M = %d: transits per flight under the rule, median %s [%s, %s]"
              % (m, g(S.median(nr[(L["m"], L["idx"])] for L in groups[m])),
                 g(min(nr[(L["m"], L["idx"])] for L in groups[m])), g(max(nr[(L["m"], L["idx"])] for L in groups[m]))))
    for law in LAWS[1:]:
        print("  Lomax scale s for mean B = %s: %s" % (", ".join(g(B) for B in BS),
                                                       ", ".join(g(Law(law, B).s) for B in BS)) + " (alpha %g)" % law)
    # checks
    c0 = Cell("geom", 10.0, 0.5, 1.0)
    A, W = c0.A, c0.W
    print("check: geometric age law sums to %.12f, mean %s s (L + T/2 + q B = %s)"
          % (W.sum(), g(float(A @ W)), g(st.LAT + 0.5 * st.PERIOD + 0.5 * 10.0)))
    import burst_loss as bl
    worst = 0.0
    for B in BS:
        for q in QS:
            if not valid(q, B):
                continue
            for acc in ACCS:
                cell = Cell("geom", B, q, acc)
                for L in groups[12][:6]:
                    a = cell.radius(b_of(L))
                    r = bl.r_fixed(L["c_full"], TG, SIG0, acc, q, B)
                    if math.isfinite(a) and r is not None and math.isfinite(r):
                        worst = max(worst, abs(a / r - 1))
    print("check: geometric FR radii against 11bj's burst_loss.r_fixed (6 layouts, every B, q, band): max |ratio - 1| %.1e"
          % worst)
    for law in LAWS[1:]:
        lw = Law(law, 10.0)
        kk = np.arange(1, 200001, dtype=float)
        print("check: %s, B 10: sum P(D >= k) to 2e5 %s + zeta tail %s = %s; S(1) %s"
              % (label(law), g(float(lw.surv(kk).sum())), g(float(lw.S(200001.0))),
                 g(float(lw.surv(kk).sum() + lw.S(200001.0))), g(float(lw.S(1.0)))))
        n0 = 5.0
        ii = np.arange(n0, 200001, dtype=float)
        print("       SS(5) closed form %s, direct sum to 2e5 %s" % (g(float(lw.SS(n0))),
                                                                    g(float(((ii - n0 + 1) * lw.surv(ii)).sum()))))
    cells = {}
    res = {}
    for law in LAWS:
        for B in BS:
            for q in QS:
                if not valid(q, B):
                    continue
                for acc in ACCS:
                    cells[(law, B, q, acc)] = Cell(law, B, q, acc)
    geo = {key: cells[("geom",) + key[1:]] for key in cells}
    for m in M:
        G = groups[m]
        for f_i, f in enumerate(st.TRAF):
            print("\nM = %d (%d layouts), traffic x%d: median [max] over layouts" % (m, len(G), f))
            for acc in ACCS:
                for law in LAWS:
                    for B in BS:
                        for q in QS:
                            key = (law, B, q, acc)
                            if key not in cells:
                                continue
                            cell = cells[key]
                            rs, hs, mult, rg, best, bk, fixed = [], [], [], [], [], [], {a: [] for a in A_MAXES}
                            for L in G:
                                b = b_of(L)
                                n = nr[(L["m"], L["idx"])]
                                r = cell.radius(b)
                                rs.append(r)
                                hs.append(st.hold_fr_at(L, r, f_i) if r is not None and math.isfinite(r) else None)
                                r_g = geo[key].radius(b)
                                rg.append(r_g)
                                pv = th.p_v(st.Z)
                                mult.append((cell.ph(r_g) + pv) / (TG / L["c_full"]))
                                h, k = best_oc(L, cell, n, f_i, b)
                                best.append(h)
                                bk.append(math.inf if k is None else st.LAT + (k + 1) * st.PERIOD)
                                for a in A_MAXES:
                                    fixed[a].append(oc_hold(L, cell, a - 2, n, f_i, b))
                            res[(m, f_i) + key] = dict(r=med(rs), h=med(hs), mult=S.median(mult), best=med(best),
                                                     bestA=med(bk), fixed={a: med(v) for a, v in fixed.items()})
                            R = res[(m, f_i) + key]
                            print("  acc %g, %s, B %g s, q %g: FR oracle r %s m h %s [%s]; FR(geometric) residual x%s"
                                  " [%s]; OC best h %s [%s] at A_max %s s; OC at A_max %s"
                                  % (acc, label(law), B, q, st.fmt(R["r"]), st.fmt(R["h"]),
                                     st.fmt(max(med([x]) for x in hs)), g(R["mult"]), g(max(mult)),
                                     st.fmt(R["best"]), st.fmt(max(med([x]) for x in best)), st.fmt(R["bestA"]),
                                     ", ".join("%d s: %s" % (a, st.fmt(R["fixed"][a])) for a in A_MAXES)))
    print("\nPredictions")
    R = lambda m, f_i, *key: res[(m, f_i) + key]
    ok = all(R(m, 0, "geom", 10.0, 0.5, 1.0)["best"] > R(m, 0, "geom", 10.0, 0.5, 1.0)["h"] for m in M)
    print("  C1 geometric, 1 m/s, q 0.5, B 10 s: best OC above FR: %s" % ("held" if ok else "refuted"))
    ok = all(R(m, 0, "geom", 10.0, 0.12, 1.0)["best"] <= 2 * R(m, 0, "geom", 10.0, 0.12, 1.0)["h"] for m in M)
    print("  C2 geometric, q 0.12, B 10 s, 1 m/s: best OC within 2x FR: %s" % ("held" if ok else "refuted"))
    ok = all(R(m, 0, 2.5, 10.0, 0.5, 1.0)["mult"] > 3.0 for m in M)
    print("  C3 Pareto 2.5, q 0.5, B 10 s, 1 m/s: FR(geometric) residual > 3x target: %s" % ("held" if ok else "refuted"))
    ok = all(R(m, 0, 2.5, 10.0, 0.5, 1.0)["best"] < R(m, 0, 2.5, 10.0, 0.5, 1.0)["h"] for m in M)
    print("  C4 same cell: best OC below FR oracle: %s" % ("held" if ok else "refuted"))
    ok = all(R(m, 1, "geom", 10.0, 0.5, 1.0)["bestA"] <= R(m, 0, "geom", 10.0, 0.5, 1.0)["bestA"] for m in M)
    print("  C5 best A_max at x10 no longer than at x1: %s" % ("held" if ok else "refuted"))
    ok = all(R(m, 0, "geom", 10.0, 0.5, 1.0)["bestA"] > 30.0 for m in M)
    print("  C6 best A_max over 30 s (geometric, 1 m/s, q 0.5, B 10 s): %s" % ("held" if ok else "refuted"))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
