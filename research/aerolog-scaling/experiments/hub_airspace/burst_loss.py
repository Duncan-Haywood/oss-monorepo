"""Milestone 11bj: does bursty message loss break the hold-until-clear rule on broadcast Remote ID? 11bi priced
stale tracks with every message lost independently; urban blockage is bursty (a building shadows a receiver for as
long as an intruder takes to cross it), so at the same mean loss the newest message can be much older. This step
re-prices 11bi's fixed-radius rule (FR) with a Gilbert channel and reports how long a burst it survives.

Why: 11bi's first limit ("message losses independent (urban blockage is bursty)") and its "Next" list ("bursty loss
(a Gilbert-Elliott channel)").

Why FR only, and why no new geometry: FR's hold at radius r depends only on the layout's flux and dwell at r, which
11bi stored per layout on an 18-radius grid (stale_track.json.gz, `hold_fr`); only the radius changes with the age
law. So every number here is 11bi's stored hold read at a new radius, with no new layout computation. FR's residual
is an expectation over ages, so it stays valid when one blockage stales every track a receiver holds at once (a
correlation AR's marked-Poisson hold would not survive, and 11bi found AR within 7% of FR up to q = 0.75 anyway).

Model (stated before any radius under bursty loss was computed).
 * Channel: Gilbert's two-state chain, one step per broadcast period T = 1 s; every message sent in the bad state is
   lost, none in the good state. Mean loss q = stationary bad share; mean burst B = 1 / p(bad -> good) messages.
   Independent loss is the special case B = 1 / (1 - q). Valid when p(good -> bad) = q / (B (1 - q)) <= 1.
 * Age: the chain is reversible, so looking back from a random decision time the number of lost periods K since the
   newest received message has P(K = 0) = 1 - q, P(K = k) = q (1 - 1/B)^(k - 1) / B for k >= 1 (mean q B), and
   A = L + U T + K T with U uniform (8 midpoints) as 11bi; tail under 1e-9 put on the last kept k (conservative).
 * Radius and hold: 11bi's sigma(A, r), P_h, c, P_v, T_tr = 27 s, V = 12 m/s, bisection for the smallest radius
   meeting the target, hold log-linear between 11bi's grid radii, "past grid" beyond 1 500 m.
Parameters and sources:
 L = 1 s, T = 1 s: 14 CFR 89.310 / 89.320 (as 11bi). Speed accuracy 0.3, 1, 3 m/s (95%): ASTM F3411 bands (as 11bi).
 q in 0.12, 0.5, 0.75, 0.9: 0.12 and 0.5 are about the more blocked Taipei district's coded and the less blocked one's
   uncoded reception (88.1% and 50.5%), 0.75 the more blocked district uncoded (25.6%), 0.9 a stress case (National
   Taiwan University thesis on BLE Remote ID broadcast coding, search excerpt, as 11bi).
 B in 3, 10, 30, 100 s, plus independent loss: no measured burst-length distribution for Remote ID reception was
   found (one search, 2026-11-24: the NTU thesis addresses burst errors but its excerpt gives no lengths), so B is
   swept. Scale only: a building 100 to 300 m deep shadows an intruder at 12 m/s for 8 to 25 s.
 sigma0 12.54 m (Remote ID position bound) and 2.12 m (GNSS grade); targets 1e-7 and 2.5e-9; traffic 1 and 10 times.

Predictions (written and pushed before any radius under bursty loss was computed; only 11bi's results file had been
read):
 G1 (prior 60%) sigma0 12.54 m, 1 m/s, q = 0.5, B = 10 s: the FR median hold per flight at today's traffic is more
    than twice the independent-loss hold (11bi: 0.072 s and 0.0646 s) (both M).
 G2 (prior 55%) Same, B = 30 s: the FR median 1e-7 radius is over 200 m (both M).
 G3 (prior 50%) At 0.3 m/s, for every q and every B up to 30 s, the FR median hold is within twice 11bg's hold at its
    own 1e-7 radius (0.0296 s and 0.0257 s) (both M): the best speed band survives bursts.
 G4 (prior 65%) Burst length matters more than mean loss: at 1 m/s, going from B = 3 to 30 s at q = 0.5 raises the
    median hold more (as a ratio) than going from q = 0.5 to 0.9 at B = 30 s (today's traffic, both M).
 G5 (prior 55%) At ten times today's traffic, 1 m/s, q = 0.5 and B = 30 s, the FR median hold is over 10 s per
    flight (both M): long bursts stop the rule scaling even at the middle speed band.
 G6 (prior 40%) With coded reception (q = 0.12) and B = 10 s, the FR median hold at 1 m/s is under 0.1 s per flight
    at today's traffic (both M): coding rescues the rule if bursts are short.
Reported without a prediction: radii and holds for every cell, both sigma0, both traffic levels, FR at 2.5e-9, and
the mean burst at which the median hold first passes 1 s per flight.
Reading fixed in advance: G1 and G2 held says 11bi's "speed better than 1 m/s is enough" needs a burst bound too
(a receiver-side requirement: a maximum track age, or a coverage requirement on the receiver); G3 held says the
0.3 m/s band carries the rule whatever the bursts; G4 held says the procedure should bound the time since the last
message, not the reception rate.

    python3 burst_loss.py --summarise > burst_loss_results.txt      # reads stale_track.json.gz; seconds

Limits: 11bi's (one city, synthetic operators, straight legs, Poisson launches, no wind, the plan fixed as traffic
grows, no unseen launches, no track filter, 95% accuracy bounds); a two-state channel with a geometric burst law
(measured blockage is often heavier-tailed); burst lengths swept, not measured; FR only. Preliminary.
"""
import math
import os
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import collision_target as ct  # noqa: E402
import stale_track as st  # noqa: E402

th, g = st.th, st.g
QS = (0.12, 0.5, 0.75, 0.9)
BURSTS = (None, 3.0, 10.0, 30.0, 100.0)      # None: independent loss, B = 1 / (1 - q)
ACCS = st.ACCS
SIG0 = st.SIG0
TG = st.TG


def valid(q, B):
    return B is None or (B >= 1.0 and q / (B * (1.0 - q)) <= 1.0)


def ages(q, B=None, lat=st.LAT, period=st.PERIOD, nu=8, tail=1e-9):
    """[(age s, weight)] of the newest received message under a Gilbert channel (B None: independent)."""
    if B is None:
        B = 1.0 / (1.0 - q)
    stay = 1.0 - 1.0 / B
    ks = [[0, 1.0 - q]]
    k, w, rest = 1, q / B, q
    while True:
        ks.append([k, w])
        rest -= w
        if stay == 0.0 or rest < tail:
            ks[-1][1] += rest
            break
        k += 1
        w *= stay
    return [(lat + (u + 0.5) / nu * period + k_ * period, wk / nu) for k_, wk in ks for u in range(nu)]


def ph(r, sigma0, acc, A, W):
    """Vectorised 11bi P_h for an age law given as arrays."""
    if r <= st.LAM_H:
        return 1.0
    sv = acc / 2.448
    s2 = sigma0 ** 2 + (sv * (A + st.T_TR + r / st.V_MIN)) ** 2
    return float(W @ np.exp(-((r - st.LAM_H) ** 2) / (2.0 * s2)))


def r_fixed(c, tg, sigma0, acc, q, B=None):
    """Smallest one radius meeting tg under the age law (None if P_v alone breaks it, inf past 20 km)."""
    b = tg / c - th.p_v(st.Z)
    if b >= 1.0:
        return st.LAM_H
    if b <= 0:
        return None
    ag = ages(q, B)
    A = np.array([a for a, _ in ag])
    W = np.array([w for _, w in ag])
    lo, hi = st.LAM_H, 20000.0
    if ph(hi, sigma0, acc, A, W) > b:
        return math.inf
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if ph(mid, sigma0, acc, A, W) > b:
            lo = mid
        else:
            hi = mid
    return hi


def hold(L, s0, acc, q, B, f_i, tg=TG):
    return st.hold_fr_at(L, r_fixed(L["c_full"], tg, s0, acc, q, B), f_i)


def med(xs):
    return st.med_or_none(xs)


def bname(B):
    return "indep" if B is None else "%g s" % B


def summarise():
    Ls = ct._read(st.OUT)["layouts"]
    prev = {(L["m"], L["idx"]): L for L in ct._read(th.OUT)["layouts"]}
    M = (12, 16)
    groups = {m: [L for L in Ls if L["m"] == m] for m in M}
    print("Milestone 11bj: bursty (Gilbert) message loss in the hold-until-clear rule, FR (predictions in burst_loss.py)")
    print("latency %g s, broadcast every %g s, T_tr %g s, V %g m/s; holds read from 11bi's stored grid (stale_track.json.gz)"
          % (st.LAT, st.PERIOD, st.T_TR, st.V_MIN))
    print("mean age, s (q: indep / B = 3, 10, 30, 100 s; '-' where the chain is invalid):")
    for q in QS:
        print("  q %g: %s" % (q, " / ".join(g(sum(A * w for A, w in ages(q, B))) if valid(q, B) else "-" for B in BURSTS)))
    # check: independent loss reproduces 11bi
    worst = 0.0
    for m in M:
        for L in groups[m]:
            for acc in ACCS:
                for q in (0.5, 0.75, 0.9):
                    a = r_fixed(L["c_full"], TG, 12.54, acc, q, None)
                    b = st.r_fixed(L["c_full"], TG, 12.54, acc, q)
                    worst = max(worst, abs(a / b - 1))
    print("check: independent-loss radii against 11bi's (q 0.5, 0.75, 0.9, every layout and band): max |ratio - 1| %.1e" % worst)
    for m in M:
        G = groups[m]
        b11 = S.median(th.hold_at(prev[(L["m"], L["idx"])], 0, th.r_needed(L["c_full"], TG, 12.54, st.Z), 0) for L in G)
        print("\nM = %d (%d layouts); 11bg hold at its own 1e-7 radius %s s per flight" % (m, len(G), g(b11)))
        for s0 in SIG0:
            for f_i, f in enumerate(st.TRAF):
                print("  sigma0 %g m, traffic x%d: FR median radius m, median [max] hold per flight s" % (s0, f))
                for acc in ACCS:
                    for q in QS:
                        cells = []
                        for B in BURSTS:
                            if not valid(q, B):
                                continue
                            rs = [r_fixed(L["c_full"], TG, s0, acc, q, B) for L in G]
                            hs = [st.hold_fr_at(L, r, f_i) for L, r in zip(G, rs)]
                            cells.append("%s: r %s h %s [%s]" % (bname(B), st.fmt(med(rs)), st.fmt(med(hs)),
                                                                st.fmt(max(med([h]) for h in hs))))
                        print("    acc %g q %g: %s" % (acc, q, "; ".join(cells)))
        cells = []
        for acc in (0.3, 1.0):
            for q in (0.12, 0.5):
                for B in BURSTS:
                    if not valid(q, B):
                        continue
                    rs = [r_fixed(L["c_full"], 2.5e-9, 12.54, acc, q, B) for L in G]
                    cells.append("acc %g q %g %s: r %s h %s" % (acc, q, bname(B), st.fmt(med(rs)),
                                                               st.fmt(med([st.hold_fr_at(L, r, 0) for L, r in zip(G, rs)]))))
        print("  FR at 2.5e-9, sigma0 12.54 m, x1: " + "; ".join(cells))
        print("  mean burst (s, log grid 1 to 1000) where the median hold first passes 1 s per flight, sigma0 12.54 m, x1:")
        grid = [10 ** (i / 20.0) for i in range(61)]
        for acc in (0.3, 1.0):
            row = []
            for q in QS:
                hit = None
                for B in grid:
                    if not valid(q, B):
                        continue
                    if med([hold(L, 12.54, acc, q, B, 0) for L in G]) > 1.0:
                        hit = B
                        break
                row.append("q %g: %s" % (q, "none to 1000 s" if hit is None else g(hit)))
            print("    acc %g m/s: %s" % (acc, "; ".join(row)))
    print("\nPredictions")
    mh = lambda m, *a: med([hold(L, *a) for L in groups[m]])
    mr = lambda m, *a: med([r_fixed(L["c_full"], TG, *a) for L in groups[m]])
    ok = all(mh(m, 12.54, 1.0, 0.5, 10.0, 0) > 2.0 * mh(m, 12.54, 1.0, 0.5, None, 0) for m in M)
    print("  G1 1 m/s, q 0.5, B 10 s: hold > 2x independent: %s" % ("held" if ok else "refuted"))
    ok = all(mr(m, 12.54, 1.0, 0.5, 30.0) > 200.0 for m in M)
    print("  G2 1 m/s, q 0.5, B 30 s: radius > 200 m: %s" % ("held" if ok else "refuted"))
    ok = True
    for m in M:
        G = groups[m]
        b11 = S.median(th.hold_at(prev[(L["m"], L["idx"])], 0, th.r_needed(L["c_full"], TG, 12.54, st.Z), 0) for L in G)
        for q in QS:
            for B in BURSTS[:4]:
                if valid(q, B):
                    ok = ok and mh(m, 12.54, 0.3, q, B, 0) <= 2.0 * b11
    print("  G3 0.3 m/s, every q, B <= 30 s: hold within 2x of 11bg: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 12.54, 1.0, 0.5, 30.0, 0) / mh(m, 12.54, 1.0, 0.5, 3.0, 0)
             > mh(m, 12.54, 1.0, 0.9, 30.0, 0) / mh(m, 12.54, 1.0, 0.5, 30.0, 0) for m in M)
    print("  G4 B 3 -> 30 s raises the hold more than q 0.5 -> 0.9: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 12.54, 1.0, 0.5, 30.0, 1) > 10.0 for m in M)
    print("  G5 x10, 1 m/s, q 0.5, B 30 s: hold > 10 s: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 12.54, 1.0, 0.12, 10.0, 0) < 0.1 for m in M)
    print("  G6 coded q 0.12, B 10 s, 1 m/s: hold < 0.1 s: %s" % ("held" if ok else "refuted"))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
