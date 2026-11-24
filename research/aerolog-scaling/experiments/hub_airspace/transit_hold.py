"""Milestone 11bg: what does a transit procedure that meets a collision target cost? A hold-until-clear (gap
acceptance) rule for climbs and descents through occupied levels, priced in hold time per flight, on 11bf's 48 New
York layouts and the sourced-Gaussian (GS) cost-optimal plans.

Why: 11bf found that the cross-level en-route collision rate at the cost-optimal 5 bands is about 1e-17 per flight
hour, but climbs and descents through occupied levels collide at about 1.7e-4 per flight hour, so a 1e-7 target is
met by transit procedures, not by spacing; its "Next" asks for a transit-procedure model "priced in the same cost".
The alternative 11bf left on the table is one band (no transits), which meets the target and costs F(1) / F(k*) in
losses of separation; this step prices the procedure instead.

Procedure (stated before any layout was built). Before a climb or a descent at point p, a drone of operator i waits
until no drone of an operator cruising in a lower band (the levels the transit crosses; the same "transiting band
above cruising band" charge as the cost model and 11bf) is predicted within a protection radius r of p while the
transit is within z_b of that drone's level. It waits on the ground (climbs at the hub and after delivery) or in its
own band (descents); it then flies the whole transit without stopping.
 * Traffic at p: entries into the r-disc about p are Poisson (Poisson launches, straight legs at fixed speed): rate
   alpha(p, r) = sum_j rate_j a_j(p, r) over the lower-band operators j, with rate_j = 2 LAM s_j / 3600 legs per
   second and a_j the fraction of j's legs passing within r of p (band_cost.Family.at); mean number inside
   beta(p, r) = sum_j rate_j b_j(p, r), b_j the mean seconds a leg spends inside. Each crossed level j is occupied
   by the transit for tau = level_leak.tau_z(z_b) seconds at a known offset; shifting a Poisson stream keeps it
   Poisson, so the superposed condition "no lower-band drone inside or entering during any of its level's windows"
   is one empty window of G = tau + d in a Poisson stream of rate alpha, d = beta / alpha the mean dwell (exact for
   a constant dwell; the acceptance probability exp(-(alpha tau + beta)) is exact for any dwell, M/G/inf).
 * Mean hold at p: Adams' (1936) delay for a random arrival waiting for a gap G in a Poisson stream,
   E[W] = (exp(alpha G) - 1 - alpha G) / alpha (tests: Monte Carlo with chord-distributed dwell).
 * Per flight: two transits at the hub and two at the destination (4 per flight, as the cost model), the
   destination drawn by the operator's weights; fleet mean over operators by share.
 * Residual collisions (the target): a true collision (centres within lam_h = 1.43 m, lam_z = 0.43 m, 11bf) slips
   through only if the predicted relative position is off by more than r - lam_h horizontally, or the intruder's
   altitude is off its level by more than z_b - lam_z. With a 2-D Gaussian relative position error of sd sigma per
   axis, P_h = exp(-(r - lam_h)^2 / (2 sigma^2)) (Rayleigh tail, an upper bound since the whole predicted track is
   shifted by the error); P_v = P(|N(0, 1.593)| > z_b - lam_z) (GS's gap sd). Residual per flight hour
   <= c (P_h + P_v), c = 11bf's unmitigated transit collision rate on the same plan (recomputed here). Holding does
   not change c: the collision process seen by an accepted transit is the unconditional one (independent Poisson
   intruders), thinned by the miss probability.
 * Hover exposure: a descent's hold is spent hovering at p in its own band, exposed to same-band operators' legs:
   per flight hour, sum over holds of E[W](p) x sum_{j same band, j != i} rate_j a_j(p, lam_h) x P(|N(0, 1.593)| <
   lam_z); reported unmitigated (the procedure does not protect it).
Parameters and sources:
 r in RADII; z_b = Z = 7.62 m (the cost model's 25 ft minimum, primary) and lam_z = 0.43 m.
 sigma (relative, per axis): 0.14 m (two drones at the DJI M300 RTK's +/-0.1 m RTK hover accuracy, times sqrt 2),
 2.12 m (both at its +/-1.5 m GNSS figure; DJI figures from search excerpts of reseller sheets, dji.com refused; the
 "+/-" statistic is not stated, so sweep), 12.54 m (an intruder seen through Remote ID at the 14 CFR 89.310(h)(1)
 bound, 100 ft at 95% radial = 12.45 m per axis, combined with the checking drone's own 1.5 m), and 0.5, 1, 5 m.
 Traffic: LAM flights per hour (11ai's), times 1, 3, 10, 30, 100 (the plan held fixed; holds scale nonlinearly).
 Destination transit points: up to NPTS of each operator's destinations, drawn uniformly without replacement (each
 operator's weights are uniform over its destinations, so the sample mean is unbiased), plus the hub. Disclosed
 check: c recomputed from the sample at r = lam_h against 11bf's full-geometry c.

Predictions (written and pushed before any layout was built; only the CPU time of 900 Family.at calls had been seen):
 T1 (prior 70%) At today's traffic, r = 50 m and z_b = Z, the median layout's fleet-mean hold per flight is under
    1 s at both M.
 T2 (prior 60%) At 10 times today's traffic, same r and z_b, the median layout's hold is still under 10 s per
    flight at both M.
 T3 (prior 55%) At today's traffic, r = 50 m, z_b = Z, the 1% of transits with the longest expected hold carry more
    than half of the expected hold time (median layout, both M).
 T4 (prior 65%) Hub transits carry less than half of the expected hold (same setting, median layout, both M).
 T5 (prior 80%) The unmitigated hover exposure during descent holds is below 1e-7 per flight hour at today's
    traffic, r = 50 m, z_b = Z, in every layout.
 T6 (prior 60%) With the Remote ID bound (sigma 12.54 m) and z_b = Z, the radius that meets 1e-7 costs under 1 s
    per flight at today's traffic in the median layout (both M), i.e. the target is met by surveillance at the
    regulatory floor with a hold the customer would not notice.
Reported without a prediction: per M, r, z_b and traffic the median and max of the hold per flight, the share of
transits that hold at all, the hub and destination parts; the radius needed for 1e-7 and 2.5e-9 at each sigma; the
loss-of-separation cost of the one-band alternative F(1) / F(k*); the sampling check on c.
Reading fixed in advance: T1 and T6 held says a 1e-7 target is met by a hold rule on network surveillance at
today's density for a fraction of a second per flight, and the paper's Section 7 recommends it over a thinner
stack; T2 refuted says the procedure, not the spacing, is what stops scaling, and the paper gives the traffic
multiple where it does; T3 held says the cost sits at a few points (other operators' hubs) and siting, not the
rule, is the lever.

    OMP_NUM_THREADS=1 python3 transit_hold.py --build      # writes transit_hold.json.gz (see LOG for time)
    python3 transit_hold.py --summarise > transit_hold_results.txt

Limits: 11ai's layouts (one city, synthetic operators, straight legs, Poisson launches, no wind); out and back legs of
one flight are not independent arrivals; perfect knowledge of intruders' intent (straight legs at known speed) apart
from the Gaussian state error, no communication loss; P_h is a bound; the hold leaves the plan and the traffic
unchanged; the hover term has no avoidance; a mean-dwell approximation in Adams' formula. Preliminary.
"""
import gzip
import json
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

ll, bc, rl, kw, ssr = ct.ll, ct.bc, ct.rl, ct.kw, ct.ssr

LAM_H, LAM_Z, Z = ct.LAM_H, 0.43, ct.Z
SGAP = ct.SGAP_GS
RADII = (1.43, 5.0, 10.0, 20.0, 35.0, 50.0, 60.0, 80.0)
ZBS = (Z, LAM_Z)
TRAF = (1, 3, 10, 30, 100)
SIGMAS = (0.14, 0.5, 1.0, 2.12, 5.0, 12.54)
TARGETS = ct.TARGETS
NPTS = 1000
OUT = os.path.join(HERE, "transit_hold.json.gz")


def adams(alpha, G):
    """Mean wait (s) of a random arrival for an empty window G (s) in a Poisson stream of rate alpha (1/s)."""
    alpha = np.asarray(alpha, dtype=float)
    x = alpha * G
    with np.errstate(divide="ignore", invalid="ignore"):
        w = np.where(alpha > 0, (np.expm1(x) - x) / np.where(alpha > 0, alpha, 1.0), 0.0)
    return w


def p_h(r, sigma):
    return 1.0 if r <= LAM_H else math.exp(-((r - LAM_H) ** 2) / (2.0 * sigma ** 2))


def p_v(zb):
    return math.erfc((zb - LAM_Z) / (SGAP * math.sqrt(2.0)))


def p_in():
    return math.erf(LAM_Z / (SGAP * math.sqrt(2.0)))


def gs_plan(L, Lc):
    """GS's cost-optimal labels (11bf's plans, same seed and search)."""
    m, idx = L["m"], L["idx"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    V = bc.V_of(L["T"], ll.tau_z(Z))
    P = ct.plans(W, X, V, m, SGAP, "normal", seed=idx)
    F1 = float(W.sum())
    ks = min(P, key=lambda k: (P[k][1], k))
    return [int(x) for x in P[ks][0]], ks, P[ks][1] / F1, P[1][1] / F1


def build_layout(job):
    L, Lc = job
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    lab, ks, Fk, F1 = gs_plan(L, Lc)
    fh = Lc["fh"]
    c_full = ct.transit_rate(np.array(Lc["A"]), np.array(Lc["B"]), lab, LAM_Z) / fh
    mix, speeds = ct.jittered_mix(idx, m)
    fam, sh = bc.families(mix, speeds)
    ops = sorted(fam)
    assert len(ops) == m
    rate = np.array([2.0 * rl.LAM * sh[j] / 3600.0 for j in ops])
    band = np.array(lab)
    rng = np.random.default_rng(920000 + idx)
    tau_c = ll.tau_z(LAM_Z)
    nR = len(RADII)
    # accumulators: hold per flight by (zb, r, traffic), hub / dst parts; holding share; hover; c from sample
    hold = np.zeros((len(ZBS), nR, len(TRAF)))
    hold_hub = np.zeros_like(hold)
    p_hold = np.zeros_like(hold)
    hover = np.zeros_like(hold)
    c_samp = 0.0
    top = []                        # (weight per flight, hold) at zb = Z, r = 50, traffic 1, for the top-1% share
    r50 = RADII.index(50.0)
    for ii, i in enumerate(ops):
        Fi = fam[i]
        n = Fi.n
        pick = rng.choice(n, size=min(n, NPTS), replace=False)
        pts = [(Fi.hx, Fi.hy, 2.0 * sh[i], True)] + [(Fi.x[q], Fi.y[q], 2.0 * sh[i] / len(pick), False) for q in pick]
        below = [jj for jj in range(m) if band[jj] < band[ii]]
        same = [jj for jj in range(m) if jj != ii and band[jj] == band[ii]]
        for px, py, wt, is_hub in pts:
            ab = np.zeros((m, nR, 2))
            for jj in below + same:
                for q, R in enumerate(RADII):
                    ab[jj, q] = fam[ops[jj]].at(px, py, R)
            al = (rate[below, None] * ab[below, :, 0]).sum(axis=0) if below else np.zeros(nR)
            be = (rate[below, None] * ab[below, :, 1]).sum(axis=0) if below else np.zeros(nR)
            al_same = float((rate[same] * ab[same, 0, 0]).sum()) if same else 0.0
            # 11bf's transit collisions per transit at lam_h: tau_c alpha + beta (per transit, both directions)
            c_samp += wt * (tau_c * al[0] + be[0])
            for z, zb in enumerate(ZBS):
                tau = ll.tau_z(zb)
                for q in range(nR):
                    for f_i, f in enumerate(TRAF):
                        a = al[q] * f
                        if a <= 0:
                            continue
                        G = tau + be[q] / al[q]
                        w = float(adams(a, G))
                        hold[z, q, f_i] += wt * w
                        if is_hub:
                            hold_hub[z, q, f_i] += wt * w
                        p_hold[z, q, f_i] += wt * (-math.expm1(-a * G))
                        hover[z, q, f_i] += 0.5 * wt * w * al_same * f * p_in()   # half the transits are descents
                        if z == 0 and q == r50 and f_i == 0:
                            top.append((wt, w))
    flights_per_h = rl.LAM
    c_samp_fh = c_samp * flights_per_h / fh
    top.sort(key=lambda t: -t[1])
    tot = sum(w * h for w, h in top)
    wsum = sum(w for w, _ in top)
    acc_w = acc_h = 0.0
    for w, h in top:
        if acc_w >= 0.01 * wsum:
            break
        acc_w += w
        acc_h += w * h
    out = {"m": m, "idx": idx, "fh": fh, "flights_per_h": flights_per_h, "kstar": ks, "F_k": Fk, "F_1": F1,
           "labels": lab, "c_full": c_full, "c_samp": c_samp_fh,
           "hold": hold.tolist(), "hold_hub": hold_hub.tolist(), "p_hold": (p_hold / 4.0).tolist(),
           "hover_fh": (hover * flights_per_h / fh).tolist(), "top1_share": acc_h / tot if tot > 0 else 0.0,
           "cpu": time.process_time() - t0}
    print("M=%d layout %d done, %.0f CPU s" % (m, idx, out["cpu"]), file=sys.stderr, flush=True)
    return out


def build():
    base = ct.lr.build(None)
    built = {(L["m"], L["idx"]): L for L in ct._read(ct.BUILD)["layouts"]}
    done = {(L["m"], L["idx"]): L for L in ct._read(OUT)["layouts"]} if os.path.exists(OUT) else {}
    jobs = [(base[k], built[k]) for k in sorted(built) if k not in done]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        for L in pool.imap_unordered(build_layout, jobs):
            done[(L["m"], L["idx"])] = L
            ct._dump({"layouts": [done[k] for k in sorted(done)]}, OUT)


# ---------------------------------------------------------------- summary

def g(x):
    return "%.3g" % x


def r_needed(c, T, sigma, zb):
    """Smallest r with c (P_h + P_v) <= T; None if P_v alone breaks it."""
    budget = T / c - p_v(zb) if c > 0 else 1.0
    if budget >= 1.0:
        return LAM_H
    if budget <= 0:
        return None
    return LAM_H + sigma * math.sqrt(-2.0 * math.log(budget))


def hold_at(L, z, r, f_i):
    """Hold per flight at radius r, log-linear interpolation in r between grid radii (exact on the grid)."""
    h = [L["hold"][z][q][f_i] for q in range(len(RADII))]
    if r <= RADII[0]:
        return h[0]
    for q in range(len(RADII) - 1):
        r0, r1 = RADII[q], RADII[q + 1]
        if r0 <= r <= r1:
            h0, h1 = h[q], h[q + 1]
            if h0 > 0 and h1 > 0:
                return math.exp(math.log(h0) + (math.log(h1) - math.log(h0)) * (r - r0) / (r1 - r0))
            return h0 + (h1 - h0) * (r - r0) / (r1 - r0)
    return None


def summarise():
    Ls = ct._read(OUT)["layouts"]
    print("Milestone 11bg: hold-until-clear transit procedure (predictions in transit_hold.py)")
    print("lam_h %.2f m, lam_z %.2f m, gap sd %.3f m; z_b %s m; traffic x %s; P_v(z_b=Z) %s, P_v(z_b=lam_z) %s"
          % (LAM_H, LAM_Z, SGAP, " and ".join(g(z) for z in ZBS), ", ".join(str(f) for f in TRAF), g(p_v(Z)), g(p_v(LAM_Z))))
    for m in (12, 16):
        G = [L for L in Ls if L["m"] == m]
        print("\nM = %d (%d layouts); flights per hour %s; flight hours per hour median %.2f; mean flight %.0f s"
              % (m, len(G), g(G[0]["flights_per_h"]), S.median(L["fh"] for L in G),
                 S.median(3600 * L["fh"] / L["flights_per_h"] for L in G)))
        ks = [L["kstar"] for L in G]
        print("  GS k* %s; one band costs F(1)/F(k*) median %.2f [min %.2f, max %.2f] in losses of separation"
              % (dict(sorted((k, ks.count(k)) for k in set(ks))), S.median(L["F_1"] / L["F_k"] for L in G),
                 min(L["F_1"] / L["F_k"] for L in G), max(L["F_1"] / L["F_k"] for L in G)))
        cf = [L["c_full"] for L in G]
        rel = [L["c_samp"] / L["c_full"] - 1 for L in G]
        print("  unmitigated transit collisions c per flight hour median %s [max %s]; sampled-point check: c_samp/c_full - 1 median %+.3f [%+.3f, %+.3f]"
              % (g(S.median(cf)), g(max(cf)), S.median(rel), min(rel), max(rel)))
        for z, zb in enumerate(ZBS):
            print("  z_b = %g m: hold per flight, median [max] s (share of transits that hold)" % zb)
            for f_i, f in enumerate(TRAF):
                cells = []
                for q, r in enumerate(RADII):
                    h = [L["hold"][z][q][f_i] for L in G]
                    ph = [L["p_hold"][z][q][f_i] for L in G]
                    cells.append("r=%g %s [%s] (%s)" % (r, g(S.median(h)), g(max(h)), g(S.median(ph))))
                print("    x%-3d " % f + "; ".join(cells))
        q50 = RADII.index(50.0)
        hub = [L["hold_hub"][0][q50][0] / L["hold"][0][q50][0] for L in G if L["hold"][0][q50][0] > 0]
        print("  r = 50, z_b = Z, x1: hub share of hold median %.3f [%.3f, %.3f]; top-1%% transits' share median %.3f [%.3f, %.3f]"
              % (S.median(hub), min(hub), max(hub), S.median(L["top1_share"] for L in G),
                 min(L["top1_share"] for L in G), max(L["top1_share"] for L in G)))
        for f_i, f in enumerate(TRAF):
            hv = [L["hover_fh"][0][q50][f_i] for L in G]
            print("  hover exposure (unmitigated) per flight hour, r = 50, z_b = Z, x%d: median %s max %s" % (f, g(S.median(hv)), g(max(hv))))
        for T in TARGETS:
            for zb_i, zb in enumerate(ZBS):
                cells = []
                for sg in SIGMAS:
                    rs = [r_needed(L["c_full"], T, sg, zb) for L in G]
                    if any(r is None for r in rs):
                        cells.append("sigma %g: unreachable (P_v)" % sg)
                        continue
                    hs = [hold_at(L, zb_i, r, 0) for L, r in zip(G, rs)]
                    h10 = [hold_at(L, zb_i, r, TRAF.index(10)) for L, r in zip(G, rs)]
                    cells.append("sigma %g: r %.1f [max %.1f], hold x1 %s s, x10 %s s"
                                 % (sg, S.median(rs), max(rs), g(S.median(h for h in hs if h is not None)),
                                    g(S.median(h for h in h10 if h is not None))))
                print("  target %s, z_b %g: " % (g(T), zb) + "; ".join(cells))
    print("\nPredictions")
    q50 = RADII.index(50.0)
    med = lambda m, fn: S.median(fn(L) for L in Ls if L["m"] == m)
    ok = all(med(m, lambda L: L["hold"][0][q50][0]) < 1.0 for m in (12, 16))
    print("  T1 hold per flight < 1 s at x1, r 50, z_b Z (median, both M): %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: L["hold"][0][q50][TRAF.index(10)]) < 10.0 for m in (12, 16))
    print("  T2 hold per flight < 10 s at x10: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: L["top1_share"]) > 0.5 for m in (12, 16))
    print("  T3 top 1%% of transits carry > half the hold: %s" % ("held" if ok else "refuted"))
    ok = all(med(m, lambda L: L["hold_hub"][0][q50][0] / L["hold"][0][q50][0]) < 0.5 for m in (12, 16))
    print("  T4 hub transits < half the hold: %s" % ("held" if ok else "refuted"))
    ok = all(L["hover_fh"][0][q50][0] < 1e-7 for L in Ls)
    print("  T5 hover exposure < 1e-7 per flight hour in every layout: %s" % ("held" if ok else "refuted"))
    res = []
    for m in (12, 16):
        G = [L for L in Ls if L["m"] == m]
        rs = [r_needed(L["c_full"], 1e-7, 12.54, Z) for L in G]
        res.append(None not in rs and S.median(hold_at(L, 0, r, 0) for L, r in zip(G, rs)) < 1.0)
    print("  T6 Remote ID bound: hold at the 1e-7 radius < 1 s (median, both M): %s" % ("held" if all(res) else "refuted"))


if __name__ == "__main__":
    if "--build" in sys.argv:
        build()
    elif "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
