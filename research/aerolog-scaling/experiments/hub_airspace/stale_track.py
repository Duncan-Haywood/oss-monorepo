"""Milestone 11bi: what do message age, latency and loss cost 11bg's hold-until-clear rule? A Remote ID receiver does
not know an intruder's intent: it dead-reckons the intruder from its last received broadcast, whose age grows with
latency and with every lost message, and whose error grows with the age times the broadcast's velocity error. This
step re-prices the hold on 11bg's 48 New York layouts and GS plans with that error, for two rules: a fixed
protection radius sized for the whole age distribution (FR), and a radius scaled per intruder by its own track age
(AR).

Why: 11bg's and 11bh's "Next" lists "message latency and loss in P_h". 11bg assumed straight legs at a known speed,
so only a Gaussian state error entered P_h; that is network surveillance with shared intent (ASTM F3548-style
operational intents), not broadcast Remote ID. With broadcast only, the error at the time the intruder is nearest
the transit point is

    sigma(A, r)^2 = sigma0^2 + (sigma_v (A + T_tr + r / V))^2        per axis,

A the age of the newest received message at decision time, T_tr the time from the decision to the farthest level
the transit crosses, r / V the time from entering an r-disc to its centre, sigma_v the per-axis velocity error.

Model (stated before any hold beyond 11bg's 80 m grid was computed).
 * Ages: broadcasts every T = 1 s, each received independently with probability 1 - q; latency L from measurement to
   broadcast; A = L + U T + K T, U uniform on (0, 1) (8 midpoints), K geometric (P(K = k) = (1 - q) q^k), truncated
   where its tail falls under 1e-6, the tail's weight put on the last kept k (conservative).
 * FR: P_h(r) = E_A exp(-(r - lam_h)^2 / (2 sigma(A, r)^2)); the radius for target Tg is the smallest r with
   c (P_h(r) + P_v) <= Tg (c, P_v as 11bg); the hold is 11bg's at that r (log-linear between grid radii).
 * AR: each intruder is checked at its own radius r_A = lam_h + s sigma(A, r_A), s = sqrt(-2 ln b),
   b = Tg / c - P_v, so every intruder's miss probability is b and the residual is exactly c (b + P_v) = Tg.
   Intruders with independent ages form a marked Poisson stream: entries at rate alpha = E_A alpha(r_A), mean number
   inside beta = E_A beta(r_A) (alpha, beta linear between grid radii), and the hold is Adams' formula at
   G = tau + beta / alpha as 11bg (the same mean-dwell approximation).
 * Same transit points as 11bg (its seed and sampled destinations), the first NPTS of them per operator (a uniform
   subset of 11bg's uniform sample, so the sample mean stays unbiased); 11bg's GS labels and c read from
   transit_hold.json.gz. Check: the hold at 50, 60 and 80 m against 11bg's (sampling error only).
Parameters and sources:
 L = 1.0 s: the bound of 14 CFR 89.320 (broadcast module; 89.310 for standard Remote ID aircraft) on time from
   measurement to broadcast of position and geometric altitude; T = 1 s: "at least 1 message per second" (same
   sections; regulation text from search excerpts, ecfr.gov and law.cornell.edu refused from this session).
 q in 0, 0.5, 0.75, 0.9: message loss. A Taiwan study of Bluetooth Remote ID reception in two urban districts
   (National Taiwan University thesis, search excerpt) measured 25.6% and 50.5% message reception uncoded (q about
   0.74 and 0.49) and 88.1% and 94.5% with a Reed-Solomon and interleaving code (q about 0.12 and 0.06); losses are
   taken as independent, which bursty urban blockage is not (a limit).
 Speed accuracy (95%) in 0.3, 1, 3 m/s: the bands of the ASTM F3411-22a location message's speed accuracy field
   (<0.3, <1, <3, <10 m/s; from an open-source implementation's enum, the standard itself not opened);
   sigma_v = acc / 2.448 per axis (2-D radial 95%). <10 m/s is not priced: with it r_A has no finite solution.
 sigma0 in 12.54 m (11bg's Remote ID position bound with the checking drone's own 1.5 m) and 2.12 m (both drones at
   GNSS grade, 11bg).
 T_tr = 0.5 x 120 x (1 / 5 + 1 / 4) = 27 s: a full-column transit at level_leak's climb and descent rates (a bound:
   most transits cross fewer levels). V = 12 m/s, the slowest cruise speed of the layouts (random_layouts.V_LO).
 Target 1e-7 per flight hour (2.5e-9 reported for FR only); traffic 1 and 10 times 11ai's.

Predictions (written and pushed before any hold beyond 11bg's 80 m grid was computed; before writing them only the FR
radius at the median layout's c had been evaluated, with T_tr = 0 and a 2r/V horizon, from 11bg's stored c: 50 to
90 m for 0.3 and 1 m/s and every q, 500 to 1 450 m for 3 m/s):
 S1 (prior 55%) Remote ID position bound (sigma0 12.54 m), speed accuracy 1 m/s, q = 0.5: the FR median hold per
    flight at today's traffic is under 1 s (both M).
 S2 (prior 65%) Speed accuracy 3 m/s, q = 0.75 (the uncoded urban reception): the FR median hold at today's traffic
    is over 10 s per flight (both M): broadcast at that quality cannot carry the rule with one radius.
 S3 (prior 60%) AR's median hold is at most a third of FR's in every cell with sigma0 12.54 m, q >= 0.5 and speed
    accuracy 1 or 3 m/s, at today's traffic (both M).
 S4 (prior 55%) At q = 0 and 0.3 m/s the FR median hold is within a factor 2 of 11bg's hold at its own 1e-7 radius
    (median layout, both M): 1 Hz and 1 s latency alone are cheap.
 S5 (prior 50%) At ten times today's traffic AR with 1 m/s and q = 0.75 holds a median under 10 s per flight (both M).
 S6 (prior 60%) Speed accuracy matters more than loss: from 1 to 3 m/s at q = 0.5 raises FR's median hold more (as a
    ratio) than from q = 0.5 to 0.9 at 1 m/s (sigma0 12.54 m, today's traffic, both M).
Reported without a prediction: FR and AR radii and holds per cell, M and traffic; the GNSS-grade cells; FR at 2.5e-9.
Reading fixed in advance: S1 and S4 held says 11bg's recommendation survives broadcast Remote ID at today's message
rates if speed is reported to 1 m/s; S2 held says the speed accuracy field, not the message rate, is the requirement
to write down; S3 held says a receiver should scale its check per track by age rather than size one radius.

    OMP_NUM_THREADS=1 python3 stale_track.py --build      # writes stale_track.json.gz (see LOG for time)
    python3 stale_track.py --summarise > stale_track_results.txt

Limits: 11bg's (one city, synthetic operators, straight legs, Poisson launches, no wind, the plan fixed as traffic
grows); independent message losses; a leg that starts (launch, or the return from a destination) inside the
prediction horizon has no track yet and is not modelled; the horizon is a bound; no track filter (a receiver fusing
several messages would beat the broadcast velocity at long ages). Preliminary.
"""
import math
import multiprocessing as mp
import os
import statistics as S
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import collision_target as ct  # noqa: E402
import transit_hold as th  # noqa: E402

ll, bc, rl = ct.ll, ct.bc, ct.rl
LAM_H, LAM_Z, Z = th.LAM_H, th.LAM_Z, th.Z
RADII = (1.43, 5.0, 10.0, 20.0, 35.0, 50.0, 60.0, 80.0, 100.0, 130.0, 170.0, 220.0, 300.0, 400.0, 550.0, 750.0,
         1000.0, 1500.0)
TRAF = (1, 10)
LAT, PERIOD = 1.0, 1.0
QS = (0.0, 0.5, 0.75, 0.9)
ACCS = (0.3, 1.0, 3.0)
SIG0 = (12.54, 2.12)
T_TR = 0.5 * 120.0 * (1.0 / ll.W_UP + 1.0 / ll.W_DOWN)
V_MIN = 12.0
TG = 1e-7
NPTS = 300
OUT = os.path.join(HERE, "stale_track.json.gz")


def ages(q, lat=LAT, period=PERIOD, nu=8, tail=1e-6):
    """[(age s, weight)] of the newest received message at a random decision time."""
    ks, k, w = [], 0, 1.0 - q
    while True:
        ks.append([k, w])
        if q == 0.0 or q ** (k + 1) < tail:
            ks[-1][1] += q ** (k + 1)             # tail weight on the last kept k
            break
        k += 1
        w *= q
    return [(lat + (u + 0.5) / nu * period + k * period, wk / nu) for k, wk in ks for u in range(nu)]


def sig(A, r, sigma0, acc):
    sv = acc / 2.448
    return math.sqrt(sigma0 ** 2 + (sv * (A + T_TR + r / V_MIN)) ** 2)


def ph_fixed(r, sigma0, acc, ag):
    if r <= LAM_H:
        return 1.0
    return sum(w * math.exp(-((r - LAM_H) ** 2) / (2.0 * sig(A, r, sigma0, acc) ** 2)) for A, w in ag)


def r_fixed(c, tg, sigma0, acc, q):
    """Smallest one radius meeting tg (bisection; None if P_v alone breaks it, inf past 20 km)."""
    b = tg / c - th.p_v(Z)
    if b >= 1.0:
        return LAM_H
    if b <= 0:
        return None
    ag = ages(q)
    lo, hi = LAM_H, 20000.0
    if ph_fixed(hi, sigma0, acc, ag) > b:
        return math.inf
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if ph_fixed(mid, sigma0, acc, ag) > b:
            lo = mid
        else:
            hi = mid
    return hi


def r_age(A, b, sigma0, acc):
    """Per-track radius r = lam_h + s sigma(A, r); the map is a contraction when s sigma_v / V < 1."""
    s = math.sqrt(-2.0 * math.log(b))
    k = s * acc / 2.448 / V_MIN
    if k >= 1.0:
        return math.inf
    r = LAM_H + s * sigma0
    for _ in range(200):
        rn = LAM_H + s * sig(A, r, sigma0, acc)
        if abs(rn - r) < 1e-9:
            break
        r = rn
    return rn


def interp(xs, ys, x):
    """Linear in r, clamped at the grid's ends (callers report how often the top is passed)."""
    return float(np.interp(x, xs, ys))


def ar_mix(c, sigma0, acc, q, tg=TG):
    """[(radius, weight)] of AR's per-track radii; residual check sum w P_h(r_A) == b."""
    b = tg / c - th.p_v(Z)
    return [(r_age(A, b, sigma0, acc), w) for A, w in ages(q)], b


def build_layout(job):
    L, Lc, prev = job
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    lab = prev["labels"]
    c = prev["c_full"]
    mix, speeds = ct.jittered_mix(idx, m)
    fam, sh = bc.families(mix, speeds)
    ops = sorted(fam)
    rate = np.array([2.0 * rl.LAM * sh[j] / 3600.0 for j in ops])
    band = np.array(lab)
    rng = np.random.default_rng(920000 + idx)          # 11bg's seed and draw order
    nR = len(RADII)
    tau = ll.tau_z(Z)
    cells = [(s0, a, q) for s0 in SIG0 for a in ACCS for q in QS]
    mixes = {cell: ar_mix(c, *cell)[0] for cell in cells}
    top_share = {cell: sum(w for r, w in mixes[cell] if r > RADII[-1]) for cell in cells}
    wts = {cell: np.array([w for _, w in mixes[cell]]) for cell in cells}
    rads = {cell: np.array([min(r, RADII[-1]) for r, _ in mixes[cell]]) for cell in cells}
    fr = np.zeros((nR, len(TRAF)))
    ar = {cell: np.zeros(len(TRAF)) for cell in cells}
    for ii, i in enumerate(ops):
        Fi = fam[i]
        n = Fi.n
        pick = rng.choice(n, size=min(n, th.NPTS), replace=False)[:NPTS]
        pts = [(Fi.hx, Fi.hy, 2.0 * sh[i])] + [(Fi.x[q_], Fi.y[q_], 2.0 * sh[i] / len(pick)) for q_ in pick]
        below = [jj for jj in range(m) if band[jj] < band[ii]]
        if not below:
            continue
        for px, py, wt in pts:
            ab = np.zeros((len(below), nR, 2))
            for t, jj in enumerate(below):
                for q_, R in enumerate(RADII):
                    ab[t, q_] = fam[ops[jj]].at(px, py, R)
            al = (rate[below, None] * ab[:, :, 0]).sum(axis=0)
            be = (rate[below, None] * ab[:, :, 1]).sum(axis=0)
            for q_ in range(nR):
                if al[q_] <= 0:
                    continue
                G = tau + be[q_] / al[q_]
                for f_i, f in enumerate(TRAF):
                    fr[q_, f_i] += wt * float(th.adams(al[q_] * f, G))
            for cell in cells:
                a = float(wts[cell] @ np.interp(rads[cell], RADII, al))
                bb = float(wts[cell] @ np.interp(rads[cell], RADII, be))
                if a <= 0:
                    continue
                G = tau + bb / a
                for f_i, f in enumerate(TRAF):
                    ar[cell][f_i] += wt * float(th.adams(a * f, G))
    out = {"m": m, "idx": idx, "c_full": c, "hold_fr": fr.tolist(),
           "hold_ar": [[list(cell), ar[cell].tolist(), top_share[cell]] for cell in cells],
           "cpu": time.process_time() - t0}
    print("M=%d layout %d done, %.0f CPU s" % (m, idx, out["cpu"]), file=sys.stderr, flush=True)
    return out


def build():
    base = ct.lr.build(None)
    built = {(L["m"], L["idx"]): L for L in ct._read(ct.BUILD)["layouts"]}
    prev = {(L["m"], L["idx"]): L for L in ct._read(th.OUT)["layouts"]}
    done = {(L["m"], L["idx"]): L for L in ct._read(OUT)["layouts"]} if os.path.exists(OUT) else {}
    only = [int(a) for a in sys.argv[sys.argv.index("--only") + 1].split(",")] if "--only" in sys.argv else None
    jobs = [(base[k], built[k], prev[k]) for k in sorted(prev) if k not in done and (only is None or k[1] in only)]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        for L in pool.imap_unordered(build_layout, jobs):
            done[(L["m"], L["idx"])] = L
            ct._dump({"layouts": [done[k] for k in sorted(done)]}, OUT)


# ---------------------------------------------------------------- summary

g = th.g


def hold_fr_at(L, r, f_i):
    """FR hold per flight at r: log-linear between grid radii; None past the grid."""
    h = [L["hold_fr"][q][f_i] for q in range(len(RADII))]
    if r is None or r > RADII[-1]:
        return None
    if r <= RADII[0]:
        return h[0]
    for q in range(len(RADII) - 1):
        r0, r1 = RADII[q], RADII[q + 1]
        if r0 <= r <= r1:
            h0, h1 = h[q], h[q + 1]
            if h0 > 0 and h1 > 0:
                return math.exp(math.log(h0) + (math.log(h1) - math.log(h0)) * (r - r0) / (r1 - r0))
            return h0 + (h1 - h0) * (r - r0) / (r1 - r0)


def med_or_none(xs):
    """Median with None (past the grid) counted as +inf; returns inf when the median is past the grid."""
    v = sorted(math.inf if x is None else x for x in xs)
    return S.median(v)


def fr_hold(L, s0, acc, q, f_i, tg=TG):
    return hold_fr_at(L, r_fixed(L["c_full"], tg, s0, acc, q), f_i)


def ar_hold(L, s0, acc, q, f_i):
    for cell, h, _ in L["hold_ar"]:
        if tuple(cell) == (s0, acc, q):
            return h[f_i]


def fmt(x):
    return "past grid" if x == math.inf else g(x)


def summarise():
    Ls = ct._read(OUT)["layouts"]
    prev = {(L["m"], L["idx"]): L for L in ct._read(th.OUT)["layouts"]}
    print("Milestone 11bi: stale Remote ID tracks in the hold-until-clear rule (predictions in stale_track.py)")
    print("latency %g s, broadcast every %g s, T_tr %g s, V %g m/s, target %s; ages: mean %s s at q = %s"
          % (LAT, PERIOD, T_TR, V_MIN, g(TG), ", ".join(g(sum(A * w for A, w in ages(q))) for q in QS),
             ", ".join(g(q) for q in QS)))
    for m in (12, 16):
        G = [L for L in Ls if L["m"] == m]
        print("\nM = %d (%d layouts); %s CPU s per layout median" % (m, len(G), g(S.median(L["cpu"] for L in G))))
        rel = []
        for L in G:
            P = prev[(L["m"], L["idx"])]
            for r in (50.0, 60.0, 80.0):
                rel.append(L["hold_fr"][RADII.index(r)][0] / P["hold"][0][th.RADII.index(r)][0] - 1)
        print("  sampling check: hold at 50, 60, 80 m (x1) against 11bg's, ratio - 1 median %+.3f [%+.3f, %+.3f]"
              % (S.median(rel), min(rel), max(rel)))
        base = [th.hold_at(prev[(L["m"], L["idx"])], 0, th.r_needed(L["c_full"], TG, 12.54, Z), 0) for L in G]
        print("  11bg (intent known, sigma 12.54 m): radius for 1e-7 median %.1f m, hold %s s per flight"
              % (S.median(th.r_needed(L["c_full"], TG, 12.54, Z) for L in G), g(S.median(base))))
        for s0 in SIG0:
            for f_i, f in enumerate(TRAF):
                print("  sigma0 %g m, traffic x%d: median [max] hold per flight, s; FR radius median" % (s0, f))
                for acc in ACCS:
                    cells = []
                    for q in QS:
                        rs = [r_fixed(L["c_full"], TG, s0, acc, q) for L in G]
                        hf = [fr_hold(L, s0, acc, q, f_i) for L in G]
                        ha = [ar_hold(L, s0, acc, q, f_i) for L in G]
                        top = max(sh for L in G for cell, _, sh in L["hold_ar"] if tuple(cell) == (s0, acc, q))
                        cells.append("q %g: FR r %s m hold %s [%s], AR %s [%s]%s"
                                     % (q, fmt(med_or_none(rs)), fmt(med_or_none(hf)), fmt(max(med_or_none([h]) for h in hf)),
                                        g(S.median(ha)), g(max(ha)), " (AR weight past %g m: %s)" % (RADII[-1], g(top)) if top > 0 else ""))
                    print("    acc %g m/s: " % acc + "; ".join(cells))
        cells = []
        for acc in ACCS:
            for q in QS:
                rs = [r_fixed(L["c_full"], 2.5e-9, 12.54, acc, q) for L in G]
                cells.append("acc %g q %g: r %s h %s" % (acc, q, fmt(med_or_none(rs)),
                                                         fmt(med_or_none([hold_fr_at(L, r, 0) for L, r in zip(G, rs)]))))
        print("  FR at 2.5e-9, sigma0 12.54 m, x1: " + "; ".join(cells))
    print("\nPredictions")
    med = lambda m, fn: med_or_none([fn(L) for L in Ls if L["m"] == m])
    M = (12, 16)
    ok = all(med(m, lambda L: fr_hold(L, 12.54, 1.0, 0.5, 0)) < 1.0 for m in M)
    print("  S1 FR, 1 m/s, q 0.5: hold < 1 s: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: fr_hold(L, 12.54, 3.0, 0.75, 0)) > 10.0 for m in M)
    print("  S2 FR, 3 m/s, q 0.75: hold > 10 s: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: ar_hold(L, 12.54, a, q, 0)) <= med(m, lambda L: fr_hold(L, 12.54, a, q, 0)) / 3.0
             for m in M for a in (1.0, 3.0) for q in (0.5, 0.75, 0.9))
    print("  S3 AR <= FR / 3 (q >= 0.5, 1 and 3 m/s): %s" % ("held" if ok else "refuted"))
    ok = True
    for m in M:
        G = [L for L in Ls if L["m"] == m]
        b11 = S.median(th.hold_at(prev[(L["m"], L["idx"])], 0, th.r_needed(L["c_full"], TG, 12.54, Z), 0) for L in G)
        h = med(m, lambda L: fr_hold(L, 12.54, 0.3, 0.0, 0))
        ok = ok and h <= 2.0 * b11
    print("  S4 FR at q 0, 0.3 m/s within 2x of 11bg: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: ar_hold(L, 12.54, 1.0, 0.75, 1)) < 10.0 for m in M)
    print("  S5 AR x10, 1 m/s, q 0.75: hold < 10 s: %s" % ("held" if ok else "refuted"))
    ok = True
    for m in M:
        h0 = med(m, lambda L: fr_hold(L, 12.54, 1.0, 0.5, 0))
        ha = med(m, lambda L: fr_hold(L, 12.54, 3.0, 0.5, 0))
        hq = med(m, lambda L: fr_hold(L, 12.54, 1.0, 0.9, 0))
        ok = ok and ha / h0 > hq / h0
    print("  S6 speed accuracy 1 -> 3 m/s raises FR's hold more than q 0.5 -> 0.9: %s" % ("held" if ok else "refuted"))


if __name__ == "__main__":
    if "--build" in sys.argv:
        build()
    elif "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
