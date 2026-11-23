"""Milestone 11bf: does a collision target per flight hour bind on the cost-optimal stack? A Reich-style vertical
collision term on 11ai's 48 New York layouts, at drone size rather than at the 50 m / 25 ft separation minimum.

Why: 11 (paper step)'s "Next" and Section 1.1 / 7 of `paper/airspace_layers.md`: the planner minimises expected
losses of separation (|horizontal| < R = 50 m and |vertical| < Z = 7.62 m), events for tactical resolution, and "a
collision target would enter as a constraint on top". Crewed aviation sizes vertical separation the other way round:
the collision risk model of Reich (1966) multiplies a vertical overlap probability P_z (two aircraft nominally one
level apart within one aircraft height of each other) by the rate of horizontal overlaps, and asks that the product
stay under a target level of safety (ICAO Doc 9574). This step computes that product for the plans the cost model
chooses, at every band count, and asks whether the target ever moves the band count.

Model (stated before any result was computed).
 * Collision = two drones' centres within lam_h horizontally and lam_z vertically. lam_h = 1.43 m: the DJI Matrice
   300 RTK's 895 mm diagonal wheelbase plus one 21-inch (0.53 m) propeller diameter, its span tip to tip; lam_z =
   0.43 m, its unfolded height (810 x 670 x 430 mm, propellers excluded; DJI specifications, read 2026-11-23 from
   search excerpts of DJI's support page and a reseller datasheet, dji.com refused from this session; the propeller
   size is DJI's 2110 designation, from memory, not checked). Swept: lam_z 0.43 and 1.0 m.
 * Horizontal overlaps: the same exact closed forms as the cost model (fast_flux.flux_terms with the start term,
   level_leak.opp_flux_terms for other-level legs, band_cost.transit_terms) recomputed at R = lam_h. Not scaled
   from R = 50 m: on a 1 500-point subsample the other-level flux per metre of R is 3.5 at R = 50 m and 8.1 at
   0.9 m, because an outbound and a return leg of one route are collinear and meet head-on whatever R is.
 * Cross-level en-route collisions (the Reich vertical term): for legs in levels n apart the vertical gap is
   n h + delta_ij + e, where delta_ij = b_upper - b_lower is the difference of the two operators' constant offsets
   (0 except in the offset model) and e the random gap error; P = P(|n h + delta + e| < lam_z). Same-level
   encounters are excluded: they are losses of separation the tactical layer must resolve whatever the spacing.
 * Transit collisions: a climbing or descending drone crossing a level is within lam_z of it for
   tau_c = lam_z (1/5 + 1/4) s (level_leak.tau_z at Z = lam_z), and V_c = tau_c A_c + B_c with A_c, B_c at R = lam_h;
   charged when the transiting operator's band is above the cruising one, as in the cost model. A crossing passes
   every level's altitude whatever the altitude error, so this term does not depend on sigma.
 * Per flight hour: expected collisions per hour / flight hours per hour, the latter LAM sum_d w_d 2 |d - hub| / v
   / 3600 (out and back at cruise speed, no climb or hover time). One collision involves two drones; multiply by 2
   for drones lost per flight hour (the crewed convention counts accidents per aircraft flight hour).
 * Targets: 1e-7 collisions per flight hour (the mid-air target Wang, Deng and Low, Drones 2023, use for UTM
   separation, from their abstract) and 2.5e-9 (the RVSM figure regional material quotes; Section 1.1).
Error models (the cost model's plan is re-searched under each, Z = 7.62 m, 60 descents per band count; band
counts k = 1 .. min(M, 12) at their widest spacing h_k = 120 / (2k - 1) m):
 G1: per-drone Gaussian sigma = 1 m (Section 4).
 GS: the sourced pair error as one Gaussian: sd of the gap sqrt(2 (1.058^2 + 0.044^2) + 0.543^2) = 1.593 m (fleet
     RMS barometer minus RTK en route, 11an; PX4 flight technical error, 11am; pressure part of a delivery pair, 11al).
 GL: a Laplace gap error with G1's sd (the heavy-tail stand-in of 11ai).
 OF1, OF2: GS plus per-operator static-pressure offsets b_i = s c_i, c_i drawn from the 5 en-route flights' offsets
     at 10 m/s (speed_offset.offsets_10), s = 1 and 2, the same 4 draws per layout as 11ao (seed 7000 dd + idx);
     scored on GS's plan (offset-blind) at each band count.
k* = the band count of least expected losses of separation (the cost optimum); k_T = the most bands k such that the
total collision rate is <= T at every band count up to k (a first crossing, as 11be).

Predictions (written and pushed before any layout was built at drone size; only the timing of one layout's build,
not its values, and a 1 500-point subsample's flux totals, quoted above, had been seen):
 K1 (prior 75%) Under G1 at k*, the median cross-level en-route collision rate is below 1e-12 per flight hour at
    both M (lam_z = 0.43 m): at 13.3 m and a 1.41 m gap sd the levels are 9.4 sd apart.
 K2 (prior 60%) Under G1 and GS at k*, transit collisions exceed cross-level en-route collisions in every layout.
 K3 (prior 50%) Under G1 the 1e-7 target does not bind (k_T >= k*) in any of the 48 layouts.
 K4 (prior 55%) Under GL at k*, the median cross-level en-route collision rate exceeds 2.5e-9 per flight hour at
    both M.
 K5 (prior 50%) Under OF1 at GS's k*, the en-route collision rate exceeds 1e-7 per flight hour in at least 25% of
    the 96 draws at each M.
 K6 (prior 55%) Under G1 at 8 bands (h = 8.0 m, the literature's 25 ft layering at its widest), the cross-level
    en-route rate is below 1e-7 per flight hour in all 48 layouts.
Reported without a prediction: per model, M and k the median and max of the en-route, transit and total rates; the
distribution of k* and of k_T at both targets and both lam_z; the share of the total that is transit; the
horizontal overlap rates per flight hour.
Reading fixed in advance: K1 and K3 held says a collision target is slack on the cost-optimal stack under Gaussian
error, and the paper's Section 7 says so with the margin. K2 held says the vertical risk the stack carries is set by
drones climbing through occupied levels, which spacing does not remove, so a target constrains the band count (more
bands, more crossings) or calls for crossing procedures, not wider spacing. K4 or K5 held says the answer rests on the
error's tail and on calibrating per-operator offsets, which 7 RTK flights cannot settle; the paper says which.

    OMP_NUM_THREADS=1 python3 collision_target.py --build       # drone-size tables, ~ (see LOG) on 4 cores
    OMP_NUM_THREADS=1 python3 collision_target.py --analyse     # writes collision_target.json.gz
    python3 collision_target.py --summarise > collision_target_results.txt

Limits: 11ai's layouts (one city, synthetic operators, straight legs, Poisson launches, no avoidance, no wind); centres
within lam_h and lam_z stand in for contact between two airframes (a box, not the airframe's shape); lateral path
error is not modelled, so collinear out-and-back legs meet at zero lateral offset; transit time inside a level uses
P-mode climb and descent rates; the offsets are 5 flights'. Preliminary.
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

import level_leak_run as lr  # noqa: E402

ll, bc, bb, kw, rl, st, ff, ssr = lr.ll, lr.bc, lr.bb, lr.kw, lr.rl, lr.st, lr.ff, lr.ssr

LAM_H = 1.43                     # m, M300 wheelbase 0.895 + one 0.53 m propeller
LAM_ZS = (0.43, 1.0)             # m, M300 height; sweep
Z = 7.62
H = ll.H_DEPTH
TARGETS = (1e-7, 2.5e-9)
SIG_G1 = 1.0
SGAP_GS = math.sqrt(2 * (1.058 ** 2 + 0.044 ** 2) + 0.543 ** 2)
SCALES = (1.0, 2.0)
DRAWS = 4
RESTARTS = 60
SIZES = ssr.SIZES
BUILD = os.path.join(HERE, "collision_inputs.json.gz")
OUT = os.path.join(HERE, "collision_target.json.gz")


def h_of(k):
    h = H / (2 * k - 1)
    assert bb.k_cap(H, h) == k, (k, h)
    return h


# ---------------------------------------------------------------- build (drone-size horizontal tables)

def flight_hours(mix, speeds, lam_h=rl.LAM):
    """Flight hours per hour: lam_h flights/h, each out and back at cruise speed."""
    return lam_h * sum(w * 2.0 * math.hypot(x - hx, y - hy) / speeds[j] for w, j, hx, hy, x, y in mix) / 3600.0


def build_layout(job, R=LAM_H):
    m, idx = job
    t = time.process_time()
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    ex = st.start_terms(mix, speeds, ssr.LAM, R=R)
    cfd = ssr._add(ff.flux_terms(mix, speeds, ssr.LAM, R=R, sym_same=True), ex["start"])
    opp = ll.opp_flux_terms(mix, speeds, ssr.LAM, R=R)
    T = bc.transit_terms(mix, speeds, rl.LAM, R=R)
    out = {"m": m, "idx": idx, "R": R, "fh": flight_hours(mix, speeds),
           "W": kw.matrix(cfd, m).tolist(), "X": kw.matrix(opp, m).tolist(),
           "A": T["A"].tolist(), "B": T["B"].tolist(), "cpu": time.process_time() - t}
    print("M=%d layout %d built at R=%.2f, %.0f CPU s" % (m, idx, R, out["cpu"]), file=sys.stderr, flush=True)
    return out


def _dump(obj, path):
    with open(path + ".tmp", "wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as f:
        f.write(json.dumps(obj, separators=(",", ":"), sort_keys=True).encode())
    os.replace(path + ".tmp", path)


def _read(path):
    with gzip.open(path, "rb") as f:
        return json.loads(f.read())


def build():
    done = {"%d-%d" % (L["m"], L["idx"]): L for L in _read(BUILD)["layouts"]} if os.path.exists(BUILD) else {}
    todo = [(m, i) for m in (16, 12) for i in SIZES[m] if "%d-%d" % (m, i) not in done]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        for L in pool.imap_unordered(build_layout, todo):
            done["%d-%d" % (L["m"], L["idx"])] = L
            _dump({"lam_h": LAM_H, "layouts": [done[k] for k in sorted(done)]}, BUILD)


# ---------------------------------------------------------------- vertical overlap with signed offsets

def p_gap(gap, lam, sgap, dist="normal"):
    """P(|gap + e| < lam), e the gap error of sd sgap (array gap)."""
    gap = np.asarray(gap, dtype=float)
    if dist == "normal":
        c = lambda x: 0.5 * (1.0 + _erf(x / (sgap * math.sqrt(2.0))))
    else:
        b = sgap / math.sqrt(2.0)
        c = lambda x: np.where(x < 0, 0.5 * np.exp(np.minimum(x, 0) / b), 1.0 - 0.5 * np.exp(-np.maximum(x, 0) / b))
    return c(lam - gap) - c(-lam - gap)


def _erf(x):
    return np.vectorize(math.erf, otypes=[float])(x)


def enroute_rate(Wc, Xc, labels, h, lam, sgap, dist="normal", b=None):
    """Expected cross-level en-route collisions per hour for a labelling: same-level W pairs excluded."""
    lab = np.asarray(labels)
    m = len(lab)
    b = np.zeros(m) if b is None else np.asarray(b, dtype=float)
    li, lj = lab[:, None], lab[None, :]
    D = np.abs(li - lj)
    upper_i = li > lj
    delta = np.where(upper_i, b[:, None] - b[None, :], b[None, :] - b[:, None])
    pw = np.where(D > 0, p_gap(2 * D * h + delta, lam, sgap, dist), 0.0)
    px_far = 0.5 * (p_gap((2 * D + 1) * h + delta, lam, sgap, dist) + p_gap(np.abs(2 * D - 1) * h + delta, lam, sgap, dist))
    dd = b[:, None] - b[None, :]
    px_same = 0.5 * (p_gap(h + dd, lam, sgap, dist) + p_gap(h - dd, lam, sgap, dist))
    px = np.where(D > 0, px_far, px_same)
    return float((Wc * pw).sum() + (Xc * px).sum())


def transit_rate(Ac, Bc, labels, lam):
    lab = np.asarray(labels)
    below = (lab[None, :] < lab[:, None]).astype(float)
    return float(((ll.tau_z(lam) * Ac + Bc) * below).sum())


# ---------------------------------------------------------------- analysis

MODELS = (("G1", SIG_G1 * math.sqrt(2.0), "normal"), ("GS", SGAP_GS, "normal"), ("GL", SIG_G1 * math.sqrt(2.0), "laplace"))


def plans(W, X, V, m, sgap, dist, seed):
    """{k: (labels, F)}: least expected losses of separation at each band count, the cost model's search with a
    gap of sd sgap (level_leak.level_weights takes the per-drone sigma)."""
    out = {}
    for k in range(1, min(m, 12) + 1):
        h = h_of(k)
        pw, px = ll.level_weights(h, Z, sgap / math.sqrt(2.0), k, dist)
        lab, F = ll.search(W, X, V, k, pw, px, restarts=RESTARTS, seed=seed)
        out[k] = (lab, F)
    return out


def analyse_layout(args):
    L, Lc = args
    import speed_offset as so
    import rtk_baro as rb
    m, idx = L["m"], L["idx"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    V = bc.V_of(L["T"], ll.tau_z(Z))
    Wc, Xc, Ac, Bc = (np.array(Lc[q]) for q in ("W", "X", "A", "B"))
    fh = Lc["fh"]
    c10 = so.offsets_10(rb.load())
    res = {"m": m, "idx": idx, "fh": fh, "F1": float(W.sum()),
           "hor": {"W": float(Wc.sum()) / fh, "X": float(Xc.sum()) / fh}, "models": {}}
    for name, sgap, dist in MODELS:
        P = plans(W, X, V, m, sgap, dist, seed=idx)
        rows = {}
        for k, (lab, F) in P.items():
            h = h_of(k)
            r = {"F": F / res["F1"], "bands": len(set(lab))}
            for lam in LAM_ZS:
                r["enr_%g" % lam] = enroute_rate(Wc, Xc, lab, h, lam, sgap, dist) / fh
                r["tr_%g" % lam] = transit_rate(Ac, Bc, lab, lam) / fh
            if name == "GS":
                for s in SCALES:
                    for dd in range(DRAWS):
                        b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
                        for lam in LAM_ZS:
                            r["of%g_%d_%g" % (s, dd, lam)] = enroute_rate(Wc, Xc, lab, h, lam, sgap, dist, b) / fh
            rows[k] = r
        res["models"][name] = rows
    print("M=%d layout %d analysed" % (m, idx), file=sys.stderr, flush=True)
    return res


def analyse():
    base = lr.build(None)
    built = {(L["m"], L["idx"]): L for L in _read(BUILD)["layouts"]}
    jobs = [(base[k], built[k]) for k in sorted(built)]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        out = list(pool.imap_unordered(analyse_layout, jobs))
    out.sort(key=lambda r: (r["m"], r["idx"]))
    _dump({"layouts": out}, OUT)


# ---------------------------------------------------------------- summary

def kstar(rows):
    return min(rows, key=lambda k: (rows[k]["F"], k))


def k_target(rows, key, T):
    """Most bands k with the rate (key(row)) <= T at every band count up to k; 0 if even one band misses."""
    best = 0
    for k in sorted(rows):
        if key(rows[k]) > T:
            break
        best = k
    return best


def g(x):
    return "%.3g" % x


def summarise():
    Ls = _read(OUT)["layouts"]
    for L in Ls:
        for mdl in L["models"].values():
            for k in list(mdl):
                mdl[int(k)] = mdl.pop(k)
    print("Milestone 11bf: collision target per flight hour on the cost-optimal stack (predictions in collision_target.py)")
    print("lam_h = %.2f m; lam_z = %s m; Z = %.2f m; targets %s collisions per flight hour; GS gap sd %.3f m"
          % (LAM_H, " and ".join(g(x) for x in LAM_ZS), Z, " and ".join(g(x) for x in TARGETS), SGAP_GS))
    for m in (12, 16):
        G = [L for L in Ls if L["m"] == m]
        print("\nM = %d (%d layouts); flight hours per hour median %.2f" % (m, len(G), S.median(L["fh"] for L in G)))
        print("  horizontal overlaps within lam_h per flight hour, median: same-heading pairs %s, other-level pairs %s"
              % (g(S.median(L["hor"]["W"] for L in G)), g(S.median(L["hor"]["X"] for L in G))))
        for name in ("G1", "GS", "GL"):
            ks = [kstar(L["models"][name]) for L in G]
            print("  %s: k* (cost optimum) %s" % (name, dict(sorted((k, ks.count(k)) for k in set(ks)))))
            for lam in LAM_ZS:
                print("    lam_z %g m: per k, median [max] en-route | transit collisions per flight hour" % lam)
                for k in range(1, min(m, 12) + 1):
                    e = [L["models"][name][k]["enr_%g" % lam] for L in G]
                    t = [L["models"][name][k]["tr_%g" % lam] for L in G]
                    print("      k=%2d h=%6.2f  enr %9s [%9s] | transit %9s [%9s]" % (k, h_of(k), g(S.median(e)), g(max(e)), g(S.median(t)), g(max(t))))
                at = [(L["models"][name][kstar(L["models"][name])]["enr_%g" % lam],
                       L["models"][name][kstar(L["models"][name])]["tr_%g" % lam]) for L in G]
                print("    at k*: en-route median %s max %s; transit median %s max %s; transit > en-route in %d of %d"
                      % (g(S.median(a for a, _ in at)), g(max(a for a, _ in at)), g(S.median(b for _, b in at)),
                         g(max(b for _, b in at)), sum(b > a for a, b in at), len(at)))
                for T in TARGETS:
                    for part, key in (("total", lambda r: r["enr_%g" % lam] + r["tr_%g" % lam]),
                                      ("en-route only", lambda r: r["enr_%g" % lam])):
                        kt = [k_target(L["models"][name], key, T) for L in G]
                        bind = sum(a < b for a, b in zip(kt, ks))
                        print("    target %s (%s): k_T %s; binds (k_T < k*) in %d of %d"
                              % (g(T), part, dict(sorted((k, kt.count(k)) for k in set(kt))), bind, len(G)))
        for s in SCALES:
            for lam in LAM_ZS:
                vals = []
                for L in G:
                    rows = L["models"]["GS"]
                    k = kstar(rows)
                    vals += [rows[k]["of%g_%d_%g" % (s, dd, lam)] for dd in range(DRAWS)]
                print("  OF%g (GS plan, offsets blind), lam_z %g m, at GS's k*: en-route median %s p90 %s max %s; > 1e-7 in %d of %d; > 2.5e-9 in %d"
                      % (s, lam, g(S.median(vals)), g(sorted(vals)[int(0.9 * len(vals))]), g(max(vals)),
                         sum(v > 1e-7 for v in vals), len(vals), sum(v > 2.5e-9 for v in vals)))
                per_k = []
                for k in range(1, min(m, 12) + 1):
                    v = [L["models"]["GS"][k]["of%g_%d_%g" % (s, dd, lam)] for L in G for dd in range(DRAWS)]
                    per_k.append("k=%d %s" % (k, g(S.median(v))))
                print("    median by k: " + ", ".join(per_k))
    # predictions
    print("\nPredictions")
    def at_k(L, name, key):
        rows = L["models"][name]
        return rows[kstar(rows)][key]
    ok = all(S.median(at_k(L, "G1", "enr_0.43") for L in Ls if L["m"] == m) < 1e-12 for m in (12, 16))
    print("  K1 G1 en-route at k* median < 1e-12 at both M: %s" % ("held" if ok else "refuted"))
    ok = all(at_k(L, n, "tr_0.43") > at_k(L, n, "enr_0.43") for L in Ls for n in ("G1", "GS"))
    print("  K2 transit > en-route at k* in every layout under G1 and GS: %s" % ("held" if ok else "refuted"))
    kt = [k_target(L["models"]["G1"], lambda r: r["enr_0.43"] + r["tr_0.43"], 1e-7) for L in Ls]
    ok = all(a >= kstar(L["models"]["G1"]) for a, L in zip(kt, Ls))
    print("  K3 1e-7 (total) never binds under G1: %s" % ("held" if ok else "refuted"))
    ok = all(S.median(at_k(L, "GL", "enr_0.43") for L in Ls if L["m"] == m) > 2.5e-9 for m in (12, 16))
    print("  K4 GL en-route at k* median > 2.5e-9 at both M: %s" % ("held" if ok else "refuted"))
    res = []
    for m in (12, 16):
        v = [at_k(L, "GS", "of1_%d_0.43" % dd) for L in Ls if L["m"] == m for dd in range(DRAWS)]
        res.append(sum(x > 1e-7 for x in v) >= 0.25 * len(v))
    print("  K5 OF1 en-route at k* > 1e-7 in >= 25%% of draws at each M: %s" % ("held" if all(res) else "refuted"))
    ok = all(L["models"]["G1"][8]["enr_0.43"] < 1e-7 for L in Ls)
    print("  K6 G1 en-route at 8 bands < 1e-7 in all 48: %s" % ("held" if ok else "refuted"))


if __name__ == "__main__":
    if "--build" in sys.argv:
        build()
    elif "--analyse" in sys.argv:
        analyse()
    elif "--summarise" in sys.argv:
        summarise()
    else:
        print(__doc__)
