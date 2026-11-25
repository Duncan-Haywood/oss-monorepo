"""Milestone 11bh: where should a descending drone fly its transit hold? 11bg's hold-until-clear rule priced by
where the hold is hovered: in the drone's own level (11bg) or half a level below or above it, between levels, in
both currencies of the paper (collisions per flight hour and expected losses of separation).

Why: 11bg's T5 was refuted: hovering in the own level during a descent hold carried up to 3.04e-7 collisions per
flight hour unprotected, so 11bg added the design rule "hold outside the occupied levels" without pricing it. Its
first "Next" asks for exactly that: "a hold flown between levels, priced (its own exposure to both neighbours)".

Model (stated before any layout was built).
 * Levels: k* bands of two levels (one per east/west heading), 2k* levels at spacing h = 120 / (2k* - 1) m, level L
   = 2 b + u for band b and heading bit u. Every leg's return leg has the opposite heading, so at any point each
   operator's legs (rate 2 LAM s_j / 3600, both directions, as band_cost.Family.at counts them) are split exactly
   half and half between its two levels. 11bg's hover term charged all of a same-band operator's legs at gap 0;
   per heading, half of them are one level (h) away, so the own-level exposure is half 11bg's figure plus a far-level
   term (a check, not a prediction: H0 below must equal 11bg's term x (p(0) + p(h)) / (2 p(0))).
 * Hold positions for a descent from own level L (L = 2 b_i or 2 b_i + 1, each for half the descents):
   H0 own level, y = L (11bg);
   HB half a level below, y = L - 1/2; HA half a level above, y = L + 1/2, not allowed from the top level (it would
   leave the 120 m column), where HA falls back to HB; HB from level 0 hovers h / 2 under the lowest level (a
   stack floor at some height above the ground is assumed);
   HX the better of HB and HA at each point (by collision exposure; the drone or its planner knows the local flux).
 * Exposure while hovering at height y h: to operator j != i (any band; own operator's flights excluded, as 11bg),
   e_j(y; lam) = rate_j a_j(p, R) x (P(|2 b_j h - y h + e| < lam) + P(|(2 b_j + 1) h - y h + e| < lam)) / 2, e the
   gap error. Collisions: R = lam_h = 1.43 m, lam = lam_z = 0.43 m. Losses of separation: R = 50 m, lam = Z =
   7.62 m. Per hold, expected events = E[W] x sum_j e_j + P(hold) x sum_j e'_j, the second term the drones already
   inside at the hold's start (e' with b_j, mean seconds inside, in place of a_j), independent of the trigger stream
   (an approximation where the two streams share operators; disclosed).
 * Hold: 11bg's rule at r = 50 m (its Remote ID radius for 1e-7), z_b = Z, the same sampled transit points (same
   seed), E[W] by Adams' formula; descents are half the transits (hub return and delivery). Reproduction check: the
   hold per flight equals 11bg's within 1e-9 relative.
 * Gap error: GS Gaussian, sd 1.593 m (primary); GL, a Laplace gap error at the same sd (the heavy-tail stand-in).
 * Losses of separation of the plan itself: F(k*) = 11bg's F_k ratio times F_1 = sum W (the cost model's en-route
   plus transit plus leakage LoS per hour at k*); hover LoS is reported as a fraction of it, at traffic f against
   F(k*) f^2 (every term of F is a pair rate, so it scales with the square of the traffic; the plan held fixed).
 * Traffic 1, 3 and 10 times 11ai's 240 flights per hour, the plan held fixed (11bg).

Predictions (written and pushed before any layout was built):
 L1 (prior 55%) Corrected for heading, own-level hovering (H0) still exceeds 1e-7 collisions per flight hour in at
    least one of the 48 layouts at today's traffic under GS.
 L2 (prior 80%) Between levels (HX), the collision exposure is below 1e-9 per flight hour in every layout at 1 and
    10 times today's traffic under GS.
 L3 (prior 60%) Under GL, HX's collision exposure is below 1e-7 per flight hour in every layout at today's traffic.
 L4 (prior 75%) At today's traffic the losses of separation from hovering are under 1% of F(k*) in the median
    layout at both M, for every position.
 L5 (prior 60%) HX costs more losses of separation than H0 (median ratio over 1.2 at both M): between levels the
    hover sits inside the 25 ft minimum of two levels instead of one.
 L6 (prior 60%) At 10 times today's traffic HX's hover losses of separation are still under 5% of F(k*) (median,
    both M).
Reading fixed in advance: L2 and L4 held says "hold between levels" is a free design rule: it removes the hover
collision term for a negligible LoS cost, and the paper's Section 7 item 6 states it with its price; L3 refuted says
the between-level hold rests on the gap error's tail, like 11bf's K4, and the paper says so; L5 held with L4 says the
hold position trades a collision term for LoS, and both are small; L6 refuted gives the traffic multiple where the
hover, not the transit, sets the procedure's cost.

    OMP_NUM_THREADS=1 python3 hold_level.py --build      # writes hold_level.json.gz (see LOG for time)
    python3 hold_level.py --summarise > hold_level_results.txt

Limits: 11bg's (one city, synthetic operators, straight legs, Poisson launches, no wind, the plan fixed as traffic
grows) plus: no avoidance while hovering; the two Poisson streams (trigger and exposure) treated as independent;
the top-level and bottom-level rules are assumptions; level 0 is not tied to a height above ground. Preliminary.
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

import transit_hold as th  # noqa: E402

ct, ll, bc, rl, kw = th.ct, th.ll, th.bc, th.rl, th.kw
LAM_H, LAM_Z, Z, SGAP = th.LAM_H, th.LAM_Z, th.Z, th.SGAP
R_HOLD = 50.0
R_LOS = 50.0
TRAF = (1, 3, 10)
POS = ("H0", "HB", "HA", "HX")
DISTS = ("normal", "laplace")
OUT = os.path.join(HERE, "hold_level.json.gz")


def p_lev(gap, lam, dist):
    return float(ct.p_gap(np.array([gap]), lam, SGAP, dist)[0])


def expo_factor(bj, y, h, lam, dist):
    """(P(|level 2 b_j - y| h + e| < lam) + same for level 2 b_j + 1) / 2."""
    return 0.5 * (p_lev(abs(2 * bj - y) * h, lam, dist) + p_lev(abs(2 * bj + 1 - y) * h, lam, dist))


def positions(bi, u, ktop):
    """Hover heights (in levels) for a descent from level 2 bi + u; ktop = 2 k - 1 the top level."""
    L = 2 * bi + u
    yb = L - 0.5
    ya = L + 0.5 if L < ktop else yb
    return {"H0": float(L), "HB": yb, "HA": ya}


def build_layout(job):
    L, Lc, prev = job
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    lab = prev["labels"]
    ks = prev["kstar"]
    nb = len(set(lab))
    k = ks
    h = ct.h_of(k)
    ktop = 2 * k - 1
    F1 = float(kw.matrix(L["cfD+"], m).sum())
    Fk = prev["F_k"] * F1
    fh = Lc["fh"]
    mix, speeds = ct.jittered_mix(idx, m)
    fam, sh = bc.families(mix, speeds)
    ops = sorted(fam)
    rate = np.array([2.0 * rl.LAM * sh[j] / 3600.0 for j in ops])
    band = np.array(lab)
    rng = np.random.default_rng(920000 + idx)      # 11bg's points
    tau = ll.tau_z(Z)
    nT = len(TRAF)
    hold = np.zeros(nT)
    chk = np.zeros(nT)          # 11bg's hover term recomputed per heading: same band, entries only, own level
    # coll[dist][pos][traffic], los[dist][pos][traffic]
    coll = {d: {p: np.zeros(nT) for p in POS} for d in DISTS}
    los = {d: {p: np.zeros(nT) for p in POS} for d in DISTS}
    # cache exposure factors per (bj, y) for each metric
    fac = {}

    def F(bj, y, lam, dist):
        key = (bj, y, lam, dist)
        if key not in fac:
            fac[key] = expo_factor(bj, y, h, lam, dist)
        return fac[key]

    for ii, i in enumerate(ops):
        Fi = fam[i]
        n = Fi.n
        pick = rng.choice(n, size=min(n, th.NPTS), replace=False)
        pts = [(Fi.hx, Fi.hy, 2.0 * sh[i])] + [(Fi.x[q], Fi.y[q], 2.0 * sh[i] / len(pick)) for q in pick]
        below = [jj for jj in range(m) if band[jj] < band[ii]]
        others = [jj for jj in range(m) if jj != ii]
        for px, py, wt in pts:
            a_c = np.zeros(m); b_c = np.zeros(m); a_l = np.zeros(m); b_l = np.zeros(m)
            for jj in others:
                a_c[jj], b_c[jj] = fam[ops[jj]].at(px, py, LAM_H)
                a_l[jj], b_l[jj] = fam[ops[jj]].at(px, py, R_LOS)
            # 11bg's hold at r = 50 (R_LOS == R_HOLD, so reuse)
            al = float((rate[below] * a_l[below]).sum()) if below else 0.0
            be = float((rate[below] * b_l[below]).sum()) if below else 0.0
            if al <= 0:
                continue
            G = tau + be / al
            for f_i, f in enumerate(TRAF):
                w = float(th.adams(al * f, G))
                ph = -math.expm1(-al * f * G)
                hold[f_i] += wt * w
                if w <= 0:
                    continue
                chk[f_i] += 0.5 * wt * w * f * sum(rate[jj] * a_c[jj] * F(int(band[jj]), float(2 * band[ii]), LAM_Z, "normal")
                                                    for jj in others if band[jj] == band[ii])
                for u in (0, 1):                                     # half the descents from each level
                    ys = positions(int(band[ii]), u, ktop)
                    vals = {}
                    for d in DISTS:
                        for p, y in ys.items():
                            ec = sum(rate[jj] * f * (a_c[jj] * w + b_c[jj] * ph) * F(int(band[jj]), y, LAM_Z, d)
                                     for jj in others if a_c[jj] > 0)
                            el = sum(rate[jj] * f * (a_l[jj] * w + b_l[jj] * ph) * F(int(band[jj]), y, Z, d)
                                     for jj in others if a_l[jj] > 0)
                            vals[(d, p)] = (ec, el)
                        best = min(("HB", "HA"), key=lambda p: (vals[(d, p)][0], vals[(d, p)][1]))
                        vals[(d, "HX")] = vals[(d, best)]
                    for (d, p), (ec, el) in vals.items():
                        # weight: wt is per-flight transits at this point (2 per point visit); half are descents,
                        # and half of those from each level u
                        coll[d][p][f_i] += 0.5 * 0.5 * wt * ec
                        los[d][p][f_i] += 0.5 * 0.5 * wt * el
    fph = rl.LAM / fh                                  # flights per flight hour
    out = {"m": m, "idx": idx, "kstar": ks, "bands": nb, "h": h, "fh": fh, "F1": F1, "Fk": Fk,
           "hold_flight": hold.tolist(), "hold_11bg": [prev["hold"][0][th.RADII.index(50.0)][th.TRAF.index(f)] for f in TRAF],
           "hover_11bg": [prev["hover_fh"][0][th.RADII.index(50.0)][th.TRAF.index(f)] for f in TRAF],
           "chk_fh": (chk * fph).tolist(),
           "coll_fh": {d: {p: (coll[d][p] * fph).tolist() for p in POS} for d in DISTS},
           # LoS per hour from hovering (per flight x flights per hour x traffic multiple), and as a share of F(k*)
           "los_h": {d: {p: [los[d][p][f_i] * rl.LAM * f for f_i, f in enumerate(TRAF)] for p in POS} for d in DISTS},
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


def summarise():
    Ls = ct._read(OUT)["layouts"]
    print("Milestone 11bh: where to fly a descent's transit hold (predictions in hold_level.py)")
    print("hold rule 11bg's at r = %g m, z_b = %g m; collision box %.2f x %.2f m; LoS %g m x %g m; gap sd %.3f m (GS normal, GL Laplace)"
          % (R_HOLD, Z, LAM_H, LAM_Z, R_LOS, Z, SGAP))
    rep = max(abs(a / b - 1) for L in Ls for a, b in zip(L["hold_flight"], L["hold_11bg"]) if b > 0)
    chk = []
    for L in Ls:
        h = L["h"]
        corr = (th.p_in() + p_lev(h, LAM_Z, "normal")) / (2 * th.p_in())
        for a, b in zip(L["chk_fh"], L["hover_11bg"]):
            if b > 0:
                chk.append(a / (b * corr) - 1)
    print("checks: hold per flight vs 11bg max relative difference %.2e; 11bg's hover term per heading vs 11bg x (p(0) + p(h)) / (2 p(0)): median %+.4f [%+.4f, %+.4f]"
          % (rep, S.median(chk), min(chk), max(chk)))
    for m in (12, 16):
        G = [L for L in Ls if L["m"] == m]
        print("\nM = %d (%d layouts); k* %s; h median %.2f m; F(k*) LoS per hour median %s"
              % (m, len(G), dict(sorted((k, [L["kstar"] for L in G].count(k)) for k in set(L["kstar"] for L in G))),
                 S.median(L["h"] for L in G), g(S.median(L["Fk"] for L in G))))
        for d in DISTS:
            for f_i, f in enumerate(TRAF):
                cells = []
                for p in POS:
                    c = [L["coll_fh"][d][p][f_i] for L in G]
                    cells.append("%s %s [max %s]" % (p, g(S.median(c)), g(max(c))))
                print("  collisions per flight hour while hovering, %s, x%d: %s" % (d, f, "; ".join(cells)))
        for d in DISTS:
            for f_i, f in enumerate(TRAF):
                cells = []
                for p in POS:
                    s = [L["los_h"][d][p][f_i] / (L["Fk"] * f * f) for L in G]
                    cells.append("%s %s [max %s]" % (p, g(S.median(s)), g(max(s))))
                print("  hover LoS / F(k*), %s, x%d: %s" % (d, f, "; ".join(cells)))
        rat = [L["los_h"]["normal"]["HX"][0] / L["los_h"]["normal"]["H0"][0] for L in G if L["los_h"]["normal"]["H0"][0] > 0]
        print("  HX / H0 hover LoS (normal, x1): median %.3f [%.3f, %.3f]" % (S.median(rat), min(rat), max(rat)))
    print("\nPredictions")
    T1 = 1e-7
    ok = any(L["coll_fh"]["normal"]["H0"][0] > T1 for L in Ls)
    print("  L1 H0 > 1e-7 in at least one layout (GS, x1): %s" % ("held" if ok else "refuted"))
    ok = all(L["coll_fh"]["normal"]["HX"][f_i] < 1e-9 for L in Ls for f_i in (0, TRAF.index(10)))
    print("  L2 HX < 1e-9 in every layout at x1 and x10 (GS): %s" % ("held" if ok else "refuted"))
    ok = all(L["coll_fh"]["laplace"]["HX"][0] < T1 for L in Ls)
    print("  L3 HX < 1e-7 in every layout under GL at x1: %s" % ("held" if ok else "refuted"))
    med = lambda m, fn: S.median(fn(L) for L in Ls if L["m"] == m)
    ok = all(med(m, lambda L: L["los_h"]["normal"][p][0] / L["Fk"]) < 0.01 for m in (12, 16) for p in POS)
    print("  L4 hover LoS < 1%% of F(k*) at x1, median, every position: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: L["los_h"]["normal"]["HX"][0] / L["los_h"]["normal"]["H0"][0]) > 1.2 for m in (12, 16))
    print("  L5 HX / H0 hover LoS median > 1.2 at both M: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: L["los_h"]["normal"]["HX"][TRAF.index(10)] / (L["Fk"] * 100)) < 0.05 for m in (12, 16))
    print("  L6 HX hover LoS < 5%% of F(k*) at x10, median: %s" % ("held" if ok else "refuted"))


if __name__ == "__main__":
    if "--build" in sys.argv:
        build()
    elif "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
