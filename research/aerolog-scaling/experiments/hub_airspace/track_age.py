"""Milestone 11bk: should a broadcast Remote ID receiver cap the age of the tracks it trusts? 11bj found that the mean
burst of lost messages, not the mean loss, sets the cost of the hold-until-clear rule, and read that "what the
procedure should bound is the time since the last received message (a maximum track age ...)". This step prices
that reading. It compares, on 11bi's 48 New York layouts and stored hold curves, four ways for a checking drone to
use stale tracks, all meeting the same 1e-7 collision target:

 FR    one fixed radius sized for the whole age law (11bj's rule, the baseline);
 TC    a track-age cut-off: when the newest message is older than A_max the receiver is blind and the drone waits
       for a fresh message before it decides; fresh decisions use one radius sized on the age law given A <= A_max;
       reported per A_max and at the best A_max per layout (TC*);
 ARc   11bi's age-scaled radius (each age checked at the radius with miss probability b), priced here under a
       common channel (one blockage stales every track the receiver holds at once);
 OR    the optimal age schedule: the radius r(A) for each age that minimises the mean hold subject to the mean
       miss probability meeting the target (a Lagrangian over ages), and OR-W, the same with "wait for a fresh
       message" offered at every age. OR-W is the cheapest policy of this family; FR, TC and ARc are special cases
       of it, so it bounds what an age-aware receiver can save.

Why: 11bj's reading and its "Next" item "a track-age cut-off rule (treat a track older than A_max as unknown and
hold) priced against FR".

Model (stated before any hold under TC, ARc or OR was computed).
 * Channel and ages: 11bj's Gilbert channel (mean loss q, mean burst B, one step per 1 s broadcast), one channel per
   receiver shared by every track it holds (the correlated case 11bj argued FR survives). The age at a decision is
   A = L + U T + K T as 11bj. A decision is blind when A > A_max (A_max >= L + T, so a blind receiver is in the bad
   state); the time to the next received message is (1 - U) T + J T with E[J] = B - 1 (geometric bursts are
   memoryless), so the mean wait of a blind decision is (1 - U) T + (B - 1) T.
 * Holds: h(r), the FR hold per flight at radius r, is 11bi's stored curve (stale_track.json.gz, log-linear between
   its 18 radii, infinite past 1 500 m). A decision at age A checked at radius r costs h(r) / n per decision,
   where n is the number of checked transits per flight (transits by operators above the lowest band: 4 x their
   flight share, computed from the layout; 11bg's weights). The age is frozen over the hold (the hold is short
   against a burst where it matters; a limit). Waits are independent of traffic: a blind receiver waits however
   empty the sky is (the cut-off's cost).
 * Target: the mean miss probability over executed decisions sum_A w_A P_h(r(A), A) <= b = Tg / c - P_v as 11bi/11bj;
   a decision that waits is executed at the age of the fresh message (A0 = L) at the radius chosen for that age.
 * OR: for a multiplier mu, each age row takes the r on a 400-point log grid (1.43 to 1 500 m) minimising
   h(r) / n + mu P_h(r, A) (OR-W: or the wait, at n x wait + the fresh decision's cost); mu bisected (60 steps on a
   log scale) to meet b. Ages beyond k = 20 lost messages are binned in geometric groups (ratio 1.15), each group
   represented by its oldest age (P_h grows with age, so the binning is conservative).
 * Cells: sigma0 12.54 m; speed accuracy 0.3, 1, 3 m/s; q 0.12, 0.5, 0.75, 0.9; B independent, 3, 10, 30, 100 s;
   traffic 1 and 10 times; A_max in 2, 3, 5, 10, 20, 30, 60, 120, 300 s.
Parameters and sources: all as 11bi and 11bj (14 CFR 89.310 / 89.320 latency and rate, ASTM F3411 speed accuracy
bands, the NTU Taipei reception study for q, B swept because no measured Remote ID burst lengths were found).

Before writing the predictions only a back-of-envelope estimate of TC's blind term had been made (at q = 0.5,
B = 30 s, A_max = 10 s about 0.38 of decisions blind, so about n x 0.38 x 30 s per flight); no hold under TC, ARc
or OR had been computed. Predictions (written and committed before any such hold was computed):
 K1 (prior 80%) At today's traffic, 1 m/s, q = 0.5, B = 30 s, TC* holds more than FR (both M): a blanket wait when
    blind costs more than a larger radius at today's density.
 K2 (prior 60%) At ten times today's traffic, 1 m/s, q = 0.5, B = 100 s, TC* holds less than FR (both M): the wait
    does not grow with traffic, the radius's hold does.
 K3 (prior 55%) OR-W's median hold is at most half of FR's at 1 m/s, q = 0.5, B = 30 s, today's traffic (both M).
 K4 (prior 50%) Under independent loss, 1 m/s and q <= 0.75, ARc is within 10% of OR (both M, today's traffic).
 K5 (prior 55%) OR-W at ten times today's traffic, 1 m/s, q = 0.5, B = 100 s holds a median under 100 s per flight
    (both M).
 K6 (prior 50%) At 0.3 m/s and every q and B <= 30 s, OR-W saves less than 20% of FR's median hold at today's
    traffic (both M): age-awareness only pays when bursts are long or speed reports poor.
Reported without a prediction: every cell's FR, TC per A_max, TC*, ARc, OR and OR-W medians, the best A_max, the
share of OR-W's decisions that wait, both traffic levels.
Reading fixed in advance: K1 held and K2 held say a maximum track age is a high-density rule, not today's; K3 held
says a receiver should schedule its radius by age (an age-aware procedure is worth writing down); K1 held and K3
refuted say 11bj's "bound the time since the last message" should be read as a receiver coverage requirement (keep
bursts short), not as a cut-off in the procedure.

    python3 track_age.py --summarise > track_age_results.txt      # reads stale_track.json.gz; minutes

Limits: 11bi's and 11bj's (one city, synthetic operators, straight legs, Poisson launches, no wind, the plan fixed as
traffic grows, no unseen launches, no track filter, 95% accuracy bounds, geometric bursts, swept B); ages frozen
over a hold; one common channel per receiver (independent per-track channels would make TC's blindness per track,
which this does not price); the wait-then-decide fresh age taken as L. Preliminary.
"""
import math
import os
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import burst_loss as bl  # noqa: E402
import collision_target as ct  # noqa: E402
import stale_track as st  # noqa: E402

th, g = st.th, st.g
QS = bl.QS
BURSTS = bl.BURSTS
ACCS = st.ACCS
S0 = 12.54
TG = st.TG
AMAX = (2.0, 3.0, 5.0, 10.0, 20.0, 30.0, 60.0, 120.0, 300.0)
RGRID = np.exp(np.linspace(math.log(st.RADII[0]), math.log(st.RADII[-1]), 400))
NU = 4
K_EXACT = 20
GROUP = 1.15


def burst(q, B):
    return 1.0 / (1.0 - q) if B is None else B


def rows(q, B, nu=NU, tail=1e-9):
    """Binned age law: arrays (age, weight, k, u) with u the U midpoint; groups past K_EXACT take their oldest k."""
    Bq = burst(q, B)
    stay = 1.0 - 1.0 / Bq
    ks = [(0, 1.0 - q)]
    k, w, rest = 1, q / Bq, q
    while True:
        ks.append((k, w))
        rest -= w
        if stay == 0.0 or rest < tail:
            ks[-1] = (k, w + rest)
            break
        k += 1
        w *= stay
    grouped, i = [], 0
    while i < len(ks):
        if ks[i][0] <= K_EXACT:
            grouped.append(ks[i])
            i += 1
            continue
        j = i
        top = max(ks[i][0] * GROUP, ks[i][0] + 1)
        while j < len(ks) and ks[j][0] <= top:
            j += 1
        grouped.append((ks[j - 1][0], sum(w_ for _, w_ in ks[i:j])))
        i = j
    A, W, K, U = [], [], [], []
    for k_, wk in grouped:
        for u in range(nu):
            uu = (u + 0.5) / nu
            A.append(st.LAT + uu * st.PERIOD + k_ * st.PERIOD)
            W.append(wk / nu)
            K.append(k_)
            U.append(uu)
    return np.array(A), np.array(W), np.array(K), np.array(U)


def ph_matrix(A, acc, s0=S0, R=RGRID):
    sv = acc / 2.448
    s2 = s0 ** 2 + (sv * (A[:, None] + st.T_TR + R[None, :] / st.V_MIN)) ** 2
    P = np.exp(-((R[None, :] - st.LAM_H) ** 2) / (2.0 * s2))
    P[:, R <= st.LAM_H] = 1.0
    return P


def hold_curve(L, f_i, R=RGRID):
    return np.array([math.inf if h is None else h for h in (st.hold_fr_at(L, r, f_i) for r in R)])


def n_checked(m, idx, labels):
    mix, speeds = ct.jittered_mix(idx, m)
    fam, sh = ct.bc.families(mix, speeds)
    ops = sorted(fam)
    lo = min(labels)
    return 4.0 * sum(sh[ops[i]] for i in range(m) if labels[i] > lo)


def wait_of(q, B, U):
    return (1.0 - U) * st.PERIOD + (burst(q, B) - 1.0) * st.PERIOD


def tc_hold(L, H, n, q, B, acc, amax, f_i, b):
    """TC: fresh decisions at one radius sized on the age law given A <= amax; blind ones wait. None if infeasible."""
    ag = bl.ages(q, B)
    A = np.array([a for a, _ in ag])
    W = np.array([w for _, w in ag])
    fresh = A <= amax
    pf = W[fresh].sum()
    if pf <= 0:
        return None
    Af, Wf = A[fresh], W[fresh] / pf
    lo, hi = st.LAM_H, st.RADII[-1]
    if bl.ph(hi, S0, acc, Af, Wf) > b:
        return None
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if bl.ph(mid, S0, acc, Af, Wf) > b:
            lo = mid
        else:
            hi = mid
    h = st.hold_fr_at(L, hi, f_i)
    U = (A - st.LAT) % st.PERIOD / st.PERIOD          # ages sit on U midpoints, so this recovers U exactly
    wt = float((W[~fresh] * wait_of(q, B, U[~fresh])).sum())
    return h + n * wt


def or_solve(H, n, P, W, waits, b, allow_wait):
    """Optimal age schedule. H: hold per flight on RGRID (inf past the grid); P: P_h rows x RGRID; waits: mean wait
    per row (inf where waiting makes no sense). Returns (hold per flight, share of decisions that wait) or None."""
    Hd = H / n
    fresh_row = 0                                   # k = 0, smallest U: the age of a just-received message ~ L

    def pick(mu):
        cost = Hd[None, :] + mu * P
        j = np.argmin(cost, axis=1)
        c_r = cost[np.arange(len(j)), j]
        h_r = Hd[j]
        p_r = P[np.arange(len(j)), j]
        wait = np.zeros(len(j), dtype=bool)
        if allow_wait:
            j0 = j[fresh_row]
            c_w = waits + Hd[j0] + mu * P[fresh_row, j0]
            wait = c_w < c_r
            h_r = np.where(wait, waits + Hd[j0], h_r)
            p_r = np.where(wait, P[fresh_row, j0], p_r)
        return float(W @ h_r) * n, float(W @ p_r), float(W[wait].sum())

    lo, hi = -14.0, 14.0
    h, p, sw = pick(10 ** hi)
    if p > b or not math.isfinite(h):
        return None
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        h_, p_, _ = pick(10 ** mid)
        if p_ > b:
            lo = mid
        else:
            hi = mid
    h, p, sw = pick(10 ** hi)
    return h, sw


def arc_hold(L, c, q, B, acc, f_i):
    b = TG / c - th.p_v(st.Z)
    tot = 0.0
    for A, w in bl.ages(q, B):
        h = st.hold_fr_at(L, st.r_age(A, b, S0, acc), f_i)
        if h is None:
            return None
        tot += w * h
    return tot


def layout_cells(L, n):
    """Every rule's hold per flight for one layout: {(acc, q, B, f_i): dict}."""
    c = L["c_full"]
    b = TG / c - th.p_v(st.Z)
    out = {}
    curves = {f_i: hold_curve(L, f_i) for f_i in range(len(st.TRAF))}
    for acc in ACCS:
        for q in QS:
            for B in BURSTS:
                if not bl.valid(q, B):
                    continue
                A, W, K, U = _rows_cache(q, B)
                P = _ph_cache(q, B, acc)
                waits = np.where(K >= 1, wait_of(q, B, U), np.inf)
                for f_i in curves:
                    H = curves[f_i]
                    d = {"FR": st.hold_fr_at(L, bl.r_fixed(c, TG, S0, acc, q, B), f_i)}
                    d["TC"] = {a: tc_hold(L, H, n, q, B, acc, a, f_i, b) for a in AMAX}
                    d["ARc"] = arc_hold(L, c, q, B, acc, f_i)
                    d["OR"] = or_solve(H, n, P, W, waits, b, False)
                    d["ORW"] = or_solve(H, n, P, W, waits, b, True)
                    out[(acc, q, B, f_i)] = d
    return out


_RC, _PC = {}, {}


def _rows_cache(q, B):
    if (q, B) not in _RC:
        _RC[(q, B)] = rows(q, B)
    return _RC[(q, B)]


def _ph_cache(q, B, acc):
    if (q, B, acc) not in _PC:
        _PC[(q, B, acc)] = ph_matrix(_rows_cache(q, B)[0], acc)
    return _PC[(q, B, acc)]


def inf_none(x):
    return math.inf if x is None else x


def med(xs):
    return st.med_or_none(xs)


def fmt(x):
    return st.fmt(x)


def summarise():
    Ls = ct._read(st.OUT)["layouts"]
    prev = {(L["m"], L["idx"]): L for L in ct._read(th.OUT)["layouts"]}
    M = (12, 16)
    res, ns = {}, {}
    for L in Ls:
        n = n_checked(L["m"], L["idx"], prev[(L["m"], L["idx"])]["labels"])
        ns[(L["m"], L["idx"])] = n
        res[(L["m"], L["idx"])] = layout_cells(L, n)
        print("layout M=%d %d done" % (L["m"], L["idx"]), file=sys.stderr, flush=True)
    print("Milestone 11bk: track-age cut-off and age-scheduled radii against FR (predictions in track_age.py)")
    print("sigma0 %g m, target %s, common Gilbert channel per receiver; holds from 11bi's stored curves" % (S0, g(TG)))
    for m in M:
        keys = [k for k in res if k[0] == m]
        print("  M = %d: checked transits per flight n median %s [%s, %s]"
              % (m, g(S.median(ns[k] for k in keys)), g(min(ns[k] for k in keys)), g(max(ns[k] for k in keys))))
    # checks
    worst_or, worst_q0 = 0.0, 0.0
    for k, cells in res.items():
        for key, d in cells.items():
            fr = inf_none(d["FR"])
            o = d["OR"]
            if o is not None and math.isfinite(fr):
                worst_or = max(worst_or, o[0] / fr - 1.0)
            ow = d["ORW"]
            if o is not None and ow is not None:
                worst_q0 = max(worst_q0, ow[0] / o[0] - 1.0)
    print("check: OR / FR - 1 max over every layout and cell %+.2e (<= 0 up to the 400-point radius grid and binning)"
          % worst_or)
    print("check: OR-W / OR - 1 max %+.2e (<= 0: waiting is an extra option)" % worst_q0)

    def mh(m, acc, q, B, f_i, rule, amax=None):
        xs = []
        for k, cells in res.items():
            if k[0] != m:
                continue
            d = cells[(acc, q, B, f_i)]
            if rule == "TC":
                x = d["TC"][amax]
            elif rule == "TC*":
                x = min(inf_none(v) for v in d["TC"].values())
            elif rule in ("OR", "ORW"):
                x = None if d[rule] is None else d[rule][0]
            else:
                x = d[rule]
            xs.append(x)
        return med(xs)

    def best_amax(m, acc, q, B, f_i):
        out = []
        for k, cells in res.items():
            if k[0] == m:
                tc = cells[(acc, q, B, f_i)]["TC"]
                out.append(min(tc, key=lambda a: inf_none(tc[a])))
        return S.median(out)

    def wait_share(m, acc, q, B, f_i):
        xs = [cells[(acc, q, B, f_i)]["ORW"][1] for k, cells in res.items()
              if k[0] == m and cells[(acc, q, B, f_i)]["ORW"] is not None]
        return S.median(xs) if xs else math.nan

    for m in M:
        for f_i, f in enumerate(st.TRAF):
            print("\nM = %d, traffic x%d: median hold per flight, s: FR | TC* (median best A_max) | ARc | OR | OR-W "
                  "(median share of decisions that wait)" % (m, f))
            for acc in ACCS:
                for q in QS:
                    cells = []
                    for B in BURSTS:
                        if not bl.valid(q, B):
                            continue
                        cells.append("%s: %s | %s (%s s) | %s | %s | %s (%s)" % (
                            bl.bname(B), fmt(mh(m, acc, q, B, f_i, "FR")), fmt(mh(m, acc, q, B, f_i, "TC*")),
                            g(best_amax(m, acc, q, B, f_i)), fmt(mh(m, acc, q, B, f_i, "ARc")),
                            fmt(mh(m, acc, q, B, f_i, "OR")), fmt(mh(m, acc, q, B, f_i, "ORW")),
                            g(wait_share(m, acc, q, B, f_i))))
                    print("  acc %g q %g: %s" % (acc, q, "; ".join(cells)))
        print("\nM = %d: TC median hold per flight by A_max (s), 1 m/s, q 0.5:" % m)
        for f_i, f in enumerate(st.TRAF):
            for B in BURSTS:
                print("  x%d %s: %s" % (f, bl.bname(B), ", ".join(
                    "%g: %s" % (a, fmt(mh(m, 1.0, 0.5, B, f_i, "TC", a))) for a in AMAX)))
    print("\nPredictions")
    ok = all(mh(m, 1.0, 0.5, 30.0, 0, "TC*") > mh(m, 1.0, 0.5, 30.0, 0, "FR") for m in M)
    print("  K1 x1, 1 m/s, q 0.5, B 30 s: TC* > FR: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 1.0, 0.5, 100.0, 1, "TC*") < mh(m, 1.0, 0.5, 100.0, 1, "FR") for m in M)
    print("  K2 x10, 1 m/s, q 0.5, B 100 s: TC* < FR: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 1.0, 0.5, 30.0, 0, "ORW") <= 0.5 * mh(m, 1.0, 0.5, 30.0, 0, "FR") for m in M)
    print("  K3 x1, 1 m/s, q 0.5, B 30 s: OR-W <= FR / 2: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 1.0, q, None, 0, "ARc") <= 1.1 * mh(m, 1.0, q, None, 0, "OR") for m in M for q in (0.12, 0.5, 0.75))
    print("  K4 independent loss, 1 m/s, q <= 0.75: ARc within 10%% of OR: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 1.0, 0.5, 100.0, 1, "ORW") < 100.0 for m in M)
    print("  K5 x10, 1 m/s, q 0.5, B 100 s: OR-W < 100 s: %s" % ("held" if ok else "refuted"))
    ok = all(mh(m, 0.3, q, B, 0, "ORW") >= 0.8 * mh(m, 0.3, q, B, 0, "FR")
             for m in M for q in QS for B in BURSTS[:4] if bl.valid(q, B))
    print("  K6 0.3 m/s, B <= 30 s: OR-W saves < 20%% of FR: %s" % ("held" if ok else "refuted"))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
