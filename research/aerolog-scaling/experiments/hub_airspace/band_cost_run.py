"""Milestone 11ag driver: band positions chosen with vertical-transit costs charged, 12 and 16 operators, on cf_D+
en-route weights (predictions in band_cost.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 BAND_CACHE=band.pkl python3 band_cost_run.py > band_cost_results.txt   # ~70 min, 4 cores
BAND_CACHE=<file.pkl> caches per-layout results (written after every layout) so the analysis can be re-run."""
import importlib.util
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bc = _load("hub_airspace_band_cost_11ag", "band_cost.py")
kw = _load("hub_airspace_split_kway_11af", "split_kway.py")
ssr = _load("hub_airspace_split_scale_run_11af", "split_scale_run.py")
rl = ssr.rl
SIZES = ssr.SIZES
TAUS = (0.0,) + bc.TAUS
KS = (1, 2, 3, 4, 8)
MC_LAYOUT, MC_TAU, MC_FLIGHTS = (12, 1200), 5.0, 100000


def analyse(L):
    m = L["m"]
    W = kw.matrix(L["cfD+"], m)
    Wg = kw.matrix(L["gas_d"], m)
    T = L["T"]
    res = {}
    for tau in TAUS:
        V = bc.V_of(T, tau)
        r = {}
        for k in KS + (m,):
            lab, F = bc.search_bands(W, V, k)
            r[k] = (lab, F)
        lab4 = r[4][0]
        _, b4, w4, orders = bc.best_order(W, V, lab4)
        wsame = bc.parts(W, V, lab4)[0]
        r["order"] = (b4 - wsame, w4 - wsame)
        vol = L["shares"]
        r["vol_low"] = float(bc.score(W, V, bc.volume_order(lab4, vol, True)))
        r["vol_high"] = float(bc.score(W, V, bc.volume_order(lab4, vol, False)))
        elab, _ = kw.local_search(W, 4)
        r["enr_plan"] = bc.best_order(W, V, elab)[1]
        glab, _ = bc.search_bands(Wg, V, 4)
        r["gas_d"] = float(bc.score(W, V, glab))
        if m == 12 and tau == 5.0:
            r["exh3"] = bc.exhaustive_bands(W, V, 3)[1]
        res[tau] = r
    return res


def run_layout(job):
    if job == "mc":
        m, idx = MC_LAYOUT
        pts = rl.load_nyc(10000.0)
        hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
        mix = rl.mix_radii(pts, hubs, radii, shares)
        t = time.process_time()
        mc = bc.transit_mc(mix, speeds, rl.LAM, MC_TAU, n_flights=MC_FLIGHTS)
        print("MC done", file=sys.stderr, flush=True)
        return {"mc": mc, "cpu": time.process_time() - t}
    L = ssr.run_layout(job)
    pts = rl.load_nyc(10000.0)
    mix = rl.mix_radii(pts, L["hubs"], L["radii"], L["shares"])
    t = time.process_time()
    L["T"] = bc.transit_terms(mix, L["speeds"], rl.LAM)
    L["cpu"]["transit"] = time.process_time() - t
    t = time.process_time()
    L["res"] = analyse(L)
    L["cpu"]["search"] = time.process_time() - t
    print("M=%d layout %d analysed, transit %.0f s, search %.0f s" % (
        L["m"], L["idx"], L["cpu"]["transit"], L["cpu"]["search"]), file=sys.stderr, flush=True)
    return L


def med(x):
    return S.median(list(x))


def main():
    t0 = time.time()
    cache = os.environ.get("BAND_CACHE")
    done = {}
    if cache and os.path.exists(cache):
        done = pickle.load(open(cache, "rb"))
    todo = (["mc"] if "mc" not in done else []) + [(m, i) for m in (16, 12) for i in SIZES[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(run_layout, todo):
                done["mc" if "mc" in L else (L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    P = print
    P("# Milestone 11ag (independent implementation of 11af): altitude bands charged for vertical transit (band_cost.py); W = cf_D+ en-route, V = tau*A + B")
    P("# semi inside each band, R = 50 m, Lambda = %d/h; same 48 layouts as 11ac/11ad; tau per layer in s; best of 200 "
      "descents over band positions" % rl.LAM)
    chk = {}
    for m in (12, 16):
        idx = SIZES[m]
        P()
        P("## M = %d: transit size and F_k / F_1 (F_1 = all en-route weight, no transit)" % m)
        P("idx   " + " ".join("rV/W@%-4g" % t for t in TAUS[1:]) + "  hub%@5  pairs_V>S@5  " +
          " ".join("F%d/F1@5" % k for k in KS[1:]) + "  kfree@2 @5 @10 @20")
        rows = {}
        for n in idx:
            L = done[(m, n)]
            W = kw.matrix(L["cfD+"], m)
            off = ~np.eye(m, dtype=bool)
            Wc = W[off].sum()
            T = L["T"]
            rv = [0.5 * bc.V_of(T, t)[off].sum() / Wc for t in TAUS[1:]]
            V5 = bc.V_of(T, 5.0)
            hub = (5.0 * T["A_hub"] + T["B_hub"]).sum() / V5.sum()
            Ssym = W + W.T
            pr = [(i, j) for i in range(m) for j in range(i + 1, m)]
            nvs = sum(min(V5[i, j], V5[j, i]) > Ssym[i, j] for i, j in pr) / len(pr)
            R5 = L["res"][5.0]
            F1 = R5[1][1]
            fk = [R5[k][1] / F1 for k in KS[1:]]
            kf = [len(set(L["res"][t][m][0])) for t in TAUS[1:]]
            rows[n] = dict(rv=rv, hub=hub, nvs=nvs, fk=fk, kf=kf)
            P("%4d  " % n + " ".join("%9.4f" % x for x in rv) + "  %5.3f  %8.3f    " % (hub, nvs) +
              " ".join("%8.4f" % x for x in fk) + "   %3d %3d %3d %3d" % tuple(kf))
        P("medians: rV/W " + ", ".join("%.4f" % med(rows[n]["rv"][q] for n in idx) for q in range(4)) +
          "; hub share %.3f; pairs V>S %.3f; F_k/F_1 at tau 5: " % (med(rows[n]["hub"] for n in idx), med(rows[n]["nvs"] for n in idx)) +
          ", ".join("k=%d %.4f" % (k, med(rows[n]["fk"][q] for n in idx)) for q, k in enumerate(KS[1:])) +
          "; free k: " + ", ".join("tau %g %.1f" % (t, med(rows[n]["kf"][q] for n in idx)) for q, t in enumerate(TAUS[1:])))
        P()
        P("## M = %d: median F_k / F_1 by tau (tau 0 keeps B, the time legs spend inside the disc, so it is not 11ad's retained weight)" % m)
        P("tau   " + " ".join("   k=%-3d" % k for k in KS[1:] + (m,)) + "  free_k")
        fk_tau = {}
        for t in TAUS:
            v = [med(done[(m, n)]["res"][t][k][1] / done[(m, n)]["res"][t][1][1] for n in idx) for k in KS[1:] + (m,)]
            fk_tau[t] = v
            P("%4g  " % t + " ".join("%8.4f" % x for x in v) + "  %6.1f" % med(len(set(done[(m, n)]["res"][t][m][0])) for n in idx))
        P()
        P("## M = %d: k = 4 at tau = 5: order, volume orders, planners (loss = F / best 4-band F)" % m)
        P("idx   worst/best_transit  vol_low  vol_high  enr_plan   gas_d" + ("   exh3/search3" if m == 12 else ""))
        ords, enr, gd, vl, vh, ex = [], [], [], [], [], []
        for n in idx:
            R5 = done[(m, n)]["res"][5.0]
            b, w = R5["order"]
            F4 = R5[4][1]
            ords.append(w / b if b > 0 else float("nan"))
            enr.append(R5["enr_plan"] / F4)
            gd.append(R5["gas_d"] / F4)
            vl.append(R5["vol_low"] / F4)
            vh.append(R5["vol_high"] / F4)
            line = "%4d  %12.3f       %7.4f  %7.4f  %8.4f  %7.4f" % (n, ords[-1], vl[-1], vh[-1], enr[-1], gd[-1])
            if m == 12:
                ex.append(R5["exh3"] / R5[3][1])
                line += "   %.6f" % ex[-1]
            P(line)
        P("median worst/best %.3f; mean loss vol_low %.4f, vol_high %.4f, enr_plan %.4f (max %.4f), gas_d %.4f (max %.4f)" % (
            med(ords), S.mean(vl), S.mean(vh), S.mean(enr), max(enr), S.mean(gd), max(gd)))
        P("enr_plan loss by tau (mean): " + ", ".join("%g %.4f" % (t, S.mean(
            done[(m, n)]["res"][t]["enr_plan"] / done[(m, n)]["res"][t][4][1] for n in idx)) for t in TAUS))
        P("gas_d/cf_D+ total weight ratio (median): %.3f" % med(
            kw.matrix(done[(m, n)]["gas_d"], m).sum() / kw.matrix(done[(m, n)]["cfD+"], m).sum() for n in idx))
        keys = ["cfD+", "gas_d", "transit", "search"]
        P("CPU s per layout (mean / max): " + ", ".join("%s %.1f / %.1f" % (
            k, S.mean(done[(m, n)]["cpu"][k] for n in idx), max(done[(m, n)]["cpu"][k] for n in idx)) for k in keys))
        chk[m] = dict(rows=rows, fk_tau=fk_tau, ords=ords, enr=enr, gd=gd, ex=ex)

    P()
    P("## Monte Carlo check (layout %d, M = %d, tau = %g s, %d flights)" % (MC_LAYOUT[1], MC_LAYOUT[0], MC_TAU, MC_FLIGHTS))
    L = done[MC_LAYOUT]
    m = MC_LAYOUT[0]
    V = bc.V_of(L["T"], MC_TAU)
    mc = done["mc"]["mc"]
    off = ~np.eye(m, dtype=bool)
    ratio = mc[off].sum() / V[off].sum()
    r = float(np.corrcoef(mc[off], V[off])[0, 1])
    P("pooled MC / closed form %.4f; per-pair r %.4f; MC CPU %.0f s" % (ratio, r, done["mc"]["cpu"]))

    P()
    P("## Prediction checks")
    P("(1) MC pooled ratio %.4f within 5%%: %s; r %.4f >= 0.95: %s" % (ratio, abs(ratio - 1) <= 0.05, r, r >= 0.95))
    rv = {m: med(chk[m]["rows"][n]["rv"][1] for n in SIZES[m]) for m in (12, 16)}
    P("(2) median rV/W at tau 5: M=12 %.4f, M=16 %.4f; both in [0.03, 0.30]: %s" % (
        rv[12], rv[16], all(0.03 <= x <= 0.30 for x in rv.values())))
    n84 = sum(done[(m, n)]["res"][5.0][8][1] < done[(m, n)]["res"][5.0][4][1] for m in (12, 16) for n in SIZES[m])
    P("(3) F_8 < F_4 at tau 5 in %d/48 (>= 40): %s" % (n84, n84 >= 40))
    kf5 = {m: med(chk[m]["rows"][n]["kf"][1] for n in SIZES[m]) for m in (12, 16)}
    mono = all(chk[m]["rows"][n]["kf"][3] <= chk[m]["rows"][n]["kf"][0] for m in (12, 16) for n in SIZES[m])
    P("(4) median free k at tau 5: M=12 %.1f, M=16 %.1f (>= 8): %s; k(20) <= k(2) in every layout: %s" % (
        kf5[12], kf5[16], min(kf5.values()) >= 8, mono))
    ret4 = {12: 0.076, 16: 0.087}
    f4 = {m: chk[m]["fk_tau"][5.0][2] for m in (12, 16)}
    grow = all(all(chk[m]["fk_tau"][a][2] <= chk[m]["fk_tau"][b][2] for a, b in zip(TAUS, TAUS[1:])) for m in (12, 16))
    P("(5) median F4/F1 at tau 5: M=12 %.4f (>= %.4f), M=16 %.4f (>= %.4f): %s; grows with tau: %s" % (
        f4[12], 1.2 * ret4[12], f4[16], 1.2 * ret4[16], all(f4[m] >= 1.2 * ret4[m] for m in (12, 16)), grow))
    mo = {m: med(chk[m]["ords"]) for m in (12, 16)}
    P("(6) median worst/best order transit: M=12 %.3f, M=16 %.3f (>= 1.3): %s" % (mo[12], mo[16], min(mo.values()) >= 1.3))
    me = {m: S.mean(chk[m]["enr"]) for m in (12, 16)}
    P("(7) mean enr_plan loss: M=12 %.4f, M=16 %.4f (<= 1.03): %s" % (me[12], me[16], max(me.values()) <= 1.03))
    mg = {m: S.mean(chk[m]["gd"]) for m in (12, 16)}
    P("(8) mean gas_d loss: M=12 %.4f, M=16 %.4f (<= 1.02): %s" % (mg[12], mg[16], max(mg.values()) <= 1.02))
    ne = sum(abs(x - 1) < 1e-9 for x in chk[12]["ex"])
    P("(9) descent reaches exhaustive k = 3 optimum at M = 12 in %d/24: %s (min exh/search %.6f)" % (
        ne, ne == 24, min(chk[12]["ex"])))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
