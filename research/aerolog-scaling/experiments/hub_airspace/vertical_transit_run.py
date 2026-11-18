"""Milestone 11af driver: altitude-layer groups charged for vertical transits, on 11ac/11ad's 48 layouts (predictions
in vertical_transit.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 VT_CACHE=vt.pkl python3 vertical_transit_run.py > vertical_transit_results.txt   # ~60 min, 4 cores
VT_CACHE=<file.pkl> caches per-layout results (written after every layout) so the analysis can be re-run."""
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


vt = _load("hub_airspace_vertical_transit_11af", "vertical_transit.py")
kw = _load("hub_airspace_split_kway_11af", "split_kway.py")
ssr = _load("hub_airspace_split_scale_run_11af", "split_scale_run.py")
rl, ff, st = ssr.rl, ssr.ff, ssr.st
SIZES = ssr.SIZES
LAM, R = ssr.LAM, ssr.R
TAUS = (0.0, 1.0, 3.05, 6.0, 12.0)
HEAD = 3.05
KS = (1, 2, 3, 4, 6, 8)
RESTARTS = 200


def run_layout(job):
    m, idx = job
    cpu = {}
    t = time.process_time()
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    ex = st.start_terms(mix, speeds, LAM, R=R)
    cf = ssr._add(ff.flux_terms(mix, speeds, LAM, R=R, sym_same=True), ex["start"])
    W = kw.matrix(cf, m)
    cpu["cfD+"] = time.process_time() - t
    t = time.process_time()
    tt = vt.transit_terms(mix, speeds, shares, LAM, R=R)
    cpu["transit"] = time.process_time() - t
    t = time.process_time()
    en = {}                                        # 11ad's en-route-optimal partitions (W alone)
    for k in KS[1:]:
        if k == 2 or (m == 12 and k <= 4):
            arg, _ = kw.exhaustive(W[None], k)
            en[k] = kw.canonical(arg[0])
        else:
            en[k] = kw.local_search(W, k, restarts=RESTARTS, seed=1000 * k + m)[0]
    en[1] = (0,) * m
    res = {}
    for tau in TAUS:
        c = vt.c_matrix(tt, tau)
        for k in KS:
            if k == 1:
                pos = (0,) * m
                T = vt.total(W, c, pos)
            else:
                pos, T = vt.local_search_T(W, c, k, restarts=RESTARTS, seed=7000 + 100 * k + m)
            bpos, bT, wT = vt.orders(en[k], W, c)
            r = {"pos": pos, "T": T, "en_pos": bpos, "en_T": bT, "en_worst": wT}
            if m == 12 and k in (2, 3):
                r["ex_T"] = vt.exhaustive_T(W, c, k)[1]
            res[(tau, k)] = r
    cpu["search"] = time.process_time() - t
    out = {"m": m, "idx": idx, "W": W, "tt": tt, "en": en, "res": res, "cpu": cpu, "shares": shares}
    print("M=%d layout %d done, CPU s %s" % (m, idx, {k: round(v) for k, v in cpu.items()}), file=sys.stderr,
          flush=True)
    return out


def med(x):
    return S.median(list(x))


def main():
    t0 = time.time()
    cache = os.environ.get("VT_CACHE")
    done = {}
    if cache and os.path.exists(cache):
        done = pickle.load(open(cache, "rb"))
    todo = [(m, i) for m in (16, 12) for i in SIZES[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(run_layout, todo):
                done[(L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    P = print
    P("# Milestone 11af: layer groups charged for vertical transits (vertical_transit.py)")
    P("# semi + stacked group band pairs, R = %.0f m, Lambda = %d/h; 11ac/11ad's 48 layouts; tau sweep %s s (headline "
      "%.2f); search: best of %d single-move descents over stack positions (exhaustive check at M = 12, k = 2, 3)" % (
          R, LAM, TAUS, HEAD, RESTARTS))
    P("# T = sum (W + c)[same group] + 4 c [crossed group below]; units: expected conflicts per hour")
    checks = {}
    for m in (12, 16):
        idx = SIZES[m]
        D = {n: done[(m, n)] for n in idx}
        P()
        P("## M = %d, tau = %.2f s: per layout" % (m, HEAD))
        P("idx   sumW     x_c/W   c_ii/W  hub_sh  T1       Tbest/T1 used  tr_sh  en4/J4  wo4/be4  same4")
        rows = []
        for n in idx:
            d = D[n]
            W = d["W"]
            c = vt.c_matrix(d["tt"], HEAD)
            off = c.sum() - np.trace(c)
            ch = vt.c_matrix(d["tt"], HEAD, "hub")
            hub_sh = (ch.sum() - np.trace(ch)) / off
            r8, r4, r1 = d["res"][(HEAD, 8)], d["res"][(HEAD, 4)], d["res"][(HEAD, 1)]
            row = dict(sumW=float(W.sum()), xc=off / W.sum(), cii=np.trace(c) / W.sum(), hub=hub_sh, T1=r1["T"],
                       rbest=r8["T"] / r1["T"], used=vt.used(r8["pos"]),
                       trsh=vt.transit_part(c, r8["pos"]) / r8["T"], en4=r4["en_T"] / r4["T"],
                       wo4=r4["en_worst"] / r4["en_T"], same4=vt.same_grouping(r4["pos"], r4["en_pos"]))
            rows.append(row)
            P("%4d  %7.3f  %.4f  %.4f  %.3f  %7.3f  %.4f   %d    %.3f  %.4f  %.4f   %s" % (
                n, row["sumW"], row["xc"], row["cii"], row["hub"], row["T1"], row["rbest"], row["used"], row["trsh"],
                row["en4"], row["wo4"], row["same4"]))
        P("medians: x_c/W %.4f, c_ii/W %.4f, hub share %.3f, Tbest/T1 %.4f, groups used %.1f, transit share at best "
          "%.3f, en4/J4 %.4f, worst/best order %.4f; same grouping at k=4 in %d/24" % (
              med(r["xc"] for r in rows), med(r["cii"] for r in rows), med(r["hub"] for r in rows),
              med(r["rbest"] for r in rows), med(r["used"] for r in rows), med(r["trsh"] for r in rows),
              med(r["en4"] for r in rows), med(r["wo4"] for r in rows), sum(r["same4"] for r in rows)))
        P()
        P("## M = %d: by tau and cap k (medians over 24 layouts). T_k/T1 = best total with at most k groups over the "
          "one-group total; en/J = 11ad's en-route partition (best order) over the joint optimum at the same k; "
          "used = groups used by the best labelling" % m)
        P("tau     " + "  ".join("T%d/T1   en/J%d  used%d" % (k, k, k) for k in KS[1:]))
        used_by_tau = {}
        for tau in TAUS:
            cells = []
            for k in KS[1:]:
                a = med(D[n]["res"][(tau, k)]["T"] / D[n]["res"][(tau, 1)]["T"] for n in idx)
                b = med(D[n]["res"][(tau, k)]["en_T"] / D[n]["res"][(tau, k)]["T"] for n in idx)
                u = med(vt.used(D[n]["res"][(tau, k)]["pos"]) for n in idx)
                cells.append("%.4f  %.4f  %4.1f " % (a, b, u))
            used_by_tau[tau] = med(vt.used(D[n]["res"][(tau, 8)]["pos"]) for n in idx)
            P("%5.2f   " % tau + "  ".join(cells))
        P("groups used (best with at most 8), distribution by tau:")
        for tau in TAUS:
            u = [vt.used(D[n]["res"][(tau, 8)]["pos"]) for n in idx]
            P("  tau %5.2f: %s; median %.1f" % (tau, " ".join("%d:%d" % (g, u.count(g)) for g in sorted(set(u))),
                                                 S.median(u)))
        P("11ad's en-route k=4 partition, best order, against the joint optimum with at most 8 groups, by tau: " +
          ", ".join("%.2f: %.4f" % (tau, med(D[n]["res"][(tau, 4)]["en_T"] / D[n]["res"][(tau, 8)]["T"] for n in idx))
                    for tau in TAUS))
        ex = []
        if m == 12:
            for tau in TAUS:
                for k in (2, 3):
                    for n in idx:
                        r = D[n]["res"][(tau, k)]
                        ex.append(r["T"] / r["ex_T"])
            P("local search / exhaustive at k = 2, 3 over all tau: %d of %d cells equal (worst ratio %.8f)" % (
                sum(abs(x - 1) < 1e-9 for x in ex), len(ex), max(ex)))
        P("CPU s per layout (mean / max): cf_D+ %.0f / %.0f, transit %.1f / %.1f, searches %.0f / %.0f" % tuple(
            f(D[n]["cpu"][k] for n in idx) for k in ("cfD+", "transit", "search") for f in (lambda x: S.mean(list(x)), max)))
        checks[m] = dict(rows=rows, used_by_tau=used_by_tau, ex=ex)

    P()
    P("## Prediction checks (tau = %.2f s unless stated; each must hold at both M)" % HEAD)
    allok = {}

    def chk(name, vals, ok):
        allok[name] = all(ok)
        P("(%s) %s: %s" % (name, vals, all(ok)))

    g = {m: checks[m]["rows"] for m in (12, 16)}
    v = {m: med(r["xc"] for r in g[m]) for m in g}
    chk("1", "median cross transit / sum W: M=12 %.4f, M=16 %.4f (in [0.002, 0.05])" % (v[12], v[16]),
        [0.002 <= v[m] <= 0.05 for m in g])
    v = {m: med(r["rbest"] for r in g[m]) for m in g}
    chk("2", "median best (<= 8 groups) / T1: M=12 %.4f, M=16 %.4f (<= 0.30)" % (v[12], v[16]),
        [v[m] <= 0.30 for m in g])
    v = {m: med(r["used"] for r in g[m]) for m in g}
    chk("3", "median groups used: M=12 %.1f, M=16 %.1f (in [3, 6])" % (v[12], v[16]), [3 <= v[m] <= 6 for m in g])
    v = {m: med(r["en4"] for r in g[m]) for m in g}
    chk("4", "median en-route k=4 plan (best order) / joint k=4: M=12 %.4f, M=16 %.4f (in [1.01, 1.10])" % (
        v[12], v[16]), [1.01 <= v[m] <= 1.10 for m in g])
    v = {m: med(r["wo4"] for r in g[m]) for m in g}
    chk("5", "median worst / best order of the k=4 en-route plan: M=12 %.4f, M=16 %.4f (>= 1.05)" % (v[12], v[16]),
        [v[m] >= 1.05 for m in g])
    v = {m: med(r["hub"] for r in g[m]) for m in g}
    chk("6", "median hub share of cross transit weight: M=12 %.3f, M=16 %.3f (in [0.30, 0.70])" % (v[12], v[16]),
        [0.30 <= v[m] <= 0.70 for m in g])
    ok7 = []
    txt = []
    for m in (12, 16):
        u = [checks[m]["used_by_tau"][t] for t in TAUS]
        ok7.append(all(a >= b for a, b in zip(u, u[1:])) and u[-1] <= 4)
        txt.append("M=%d %s" % (m, u))
    chk("7", "median groups used over tau %s: %s (non-increasing, <= 4 at 12 s)" % (TAUS, "; ".join(txt)), ok7)
    ex = checks[12]["ex"]
    chk("8", "M=12 local search equals exhaustive at k=2,3: %d/%d" % (sum(abs(x - 1) < 1e-9 for x in ex), len(ex)),
        [all(abs(x - 1) < 1e-9 for x in ex)])
    P("held: %d of %d" % (sum(allok.values()), len(allok)))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
