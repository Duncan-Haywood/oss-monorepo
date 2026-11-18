"""Milestone 11ai driver (predictions in level_leak.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py > level_leak_results.txt   # build, then analyse
LEAK_CACHE=<file.pkl> caches each layout's inputs (cf_D+ en-route W, transit terms A and B, other-level flux X;
written after every layout). `--build` stops after the cache is complete. The inputs are committed in
leak_inputs.json.gz (leak_inputs.py), so `--build` reads them in seconds; LEAK_REBUILD=1 recomputes them."""
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


ll = _load("hub_airspace_level_leak_11ai", "level_leak.py")
bc = _load("hub_airspace_band_cost_11ai", "band_cost.py")
bb = _load("hub_airspace_band_budget_11ai", "band_budget.py")
kw = _load("hub_airspace_split_kway_11ai", "split_kway.py")
ssr = _load("hub_airspace_split_scale_run_11ai", "split_scale_run.py")
rl, st, ff = ssr.rl, ssr.st, ssr.ff
SIZES = ssr.SIZES
RESTARTS = 200


def build_layout(job):
    """11ah's inputs computed the same way (band_budget_run.build_layout), plus the other-level flux X."""
    m, idx = job
    cpu = {}
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    t = time.process_time()
    ex = st.start_terms(mix, speeds, ssr.LAM, R=ssr.R)
    cfd = ssr._add(ff.flux_terms(mix, speeds, ssr.LAM, R=ssr.R, sym_same=True), ex["start"])
    cpu["cfD+"] = time.process_time() - t
    t = time.process_time()
    T = bc.transit_terms(mix, speeds, rl.LAM)
    cpu["transit"] = time.process_time() - t
    t = time.process_time()
    opp = ll.opp_flux_terms(mix, speeds, ssr.LAM, R=ssr.R)
    cpu["opp"] = time.process_time() - t
    print("M=%d layout %d built, %.0f CPU s (%s)" % (m, idx, sum(cpu.values()),
          ", ".join("%s %.0f" % kv for kv in cpu.items())), file=sys.stderr, flush=True)
    return {"m": m, "idx": idx, "cfD+": cfd, "T": T, "opp": opp, "cpu": cpu}


def build(cache):
    """Every layout's inputs: from LEAK_CACHE, else the committed leak_inputs.json.gz (seconds), computing
    only what neither holds. LEAK_REBUILD=1 ignores the committed file (about 1.5 to 2.5 h on 4 cores)."""
    done = pickle.load(open(cache, "rb")) if cache and os.path.exists(cache) else {}
    if not os.environ.get("LEAK_REBUILD"):
        for k, v in _load("hub_airspace_leak_inputs_11ai", "leak_inputs.py").load().items():
            done.setdefault(k, v)
        if cache and done and not os.path.exists(cache):
            pickle.dump(done, open(cache + ".tmp", "wb"))
            os.replace(cache + ".tmp", cache)
    todo = [(m, i) for m in (16, 12) for i in SIZES[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(build_layout, todo):
                done[(L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    return done


# ---------------------------------------------------------------- analysis

def conditions():
    """(name, Z, sigma, dist, tau convention); main grid plus the two sensitivities."""
    out = [("main", Z, s, "normal", "z") for Z in ll.ZS for s in ll.SIGMAS]
    out.append(("laplace", 7.62, 1.0, "laplace", "z"))
    out.append(("tau_h", 7.62, 1.0, "normal", "h"))
    return out


def analyse(L):
    m = L["m"]
    W = kw.matrix(L["cfD+"], m)
    X = kw.matrix(L["opp"], m)
    off = ~np.eye(m, dtype=bool)
    res = {"F1": float(W.sum()), "xw": float(X[off].sum()) / float(W[off].sum()),
           "xw_all": float(X.sum()) / float(W.sum()), "cond": {}}
    # 11ah's leakage-free plan at 25 ft spacing, 8 bands, tau = h-convention 1.71 s
    k0 = bb.k_cap(ll.H_DEPTH, 7.62, m)
    lab0, F0 = bc.search_bands(W, bc.V_of(L["T"], bb.tau_of(7.62)), k0)
    res["plan0"], res["F0"] = lab0, F0
    rng_seed = L["idx"]
    for c in conditions():
        name, Z, s, dist, tc = c
        rows = {}
        for h in ll.HGRID:
            k = bb.k_cap(ll.H_DEPTH, h, m)
            tau = ll.tau_z(Z) if tc == "z" else ll.tau_h(h)
            V = bc.V_of(L["T"], tau)
            pw, px = ll.level_weights(h, Z, s, k, dist)
            starts = [lab0] if max(lab0) < k else []
            lab, F = ll.search(W, X, V, k, pw, px, restarts=RESTARTS, seed=rng_seed, starts=starts)
            rows[h] = (k, lab, F, ll.parts(W, X, V, lab, pw, px))
        res["cond"][c] = rows
        # 11ah's 25 ft plan scored under this condition's leakage at h = 7.62 m
        k = bb.k_cap(ll.H_DEPTH, 7.62, m)
        tau = ll.tau_z(Z) if tc == "z" else ll.tau_h(7.62)
        pw, px = ll.level_weights(7.62, Z, s, k, dist)
        res.setdefault("plan0_scored", {})[c] = ll.score(W, X, bc.V_of(L["T"], tau), lab0, pw, px)
    return (m, L["idx"]), res


def med(x):
    return S.median(list(x))


def best_h(rows):
    h = min(rows, key=lambda q: (rows[q][2], q))
    return h, rows[h]


def main(done):
    keys = [(m, n) for m in (12, 16) for n in SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    P = print
    P("# Milestone 11ai: altitude-keeping error as a cross-level conflict term (level_leak.py); H = %g m, h grid %g..%g m "
      "step 2, best of %d descents (+ 11ah's plan as a start), 48 layouts" % (ll.H_DEPTH, ll.HGRID[0], ll.HGRID[-1], RESTARTS))
    P("# F counts losses of separation (horizontal < 50 m and vertical < Z) per hour; F_1 = one band, no error, no transit")
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d (24 layouts)" % m)
        xw = [res[k]["xw"] for k in idx]
        P("P1 other-level / same-level en-route weight, cross pairs: median %.3f (range %.3f..%.3f); all pairs incl. own "
          "fleet: median %.3f" % (med(xw), min(xw), max(xw), med(res[k]["xw_all"] for k in idx)))
        P("  cond              Z     sigma  h*_med  h*_range   k*_med  F*/F_1  leak_share  spacer_layouts  F(11ah plan)/F*")
        for c in conditions():
            name, Z, s, dist, tc = c
            hs, ks, r1, lk, sp, p0 = [], [], [], [], 0, []
            for k in idx:
                rows = res[k]["cond"][c]
                h, (kk, lab, F, pr) = best_h(rows)
                hs.append(h)
                used = sorted(set(lab))
                ks.append(len(used))
                sp += int(len(used) > 0 and (used[-1] - used[0] + 1) > len(used))
                r1.append(F / res[k]["F1"])
                lk.append(pr[1] / F)
                p0.append(res[k]["plan0_scored"][c] / F)
            P("  %-8s %-6s %5.2f  %4.2f   %5.1f   %4.0f..%-4.0f  %5.1f   %6.4f   %6.3f       %2d / 24        %6.3f" % (
                name, dist[:4], Z, s, med(hs), min(hs), max(hs), med(ks), med(r1), med(lk), sp, med(p0)))
        P()
        P("## M = %d: median F(h)/F_1 over layouts along the h grid (k_cap in brackets)" % m)
        P("  h:   " + " ".join("%6g" % h for h in ll.HGRID))
        P("  k:   " + " ".join("%6d" % bb.k_cap(ll.H_DEPTH, h, m) for h in ll.HGRID))
        for c in conditions():
            P("  %-7s Z=%-5.2f s=%-4.2f " % (c[0][:7], c[1], c[2]) + " ".join(
                "%6.3f" % med(res[k]["cond"][c][h][2] / res[k]["F1"] for k in idx) for h in ll.HGRID))
        P("  11ah's 25 ft plan, no leakage: F0/F_1 median %.4f" % med(res[k]["F0"] / res[k]["F1"] for k in idx))
    cpu = [sum(done[k]["cpu"].values()) for k in keys]
    P()
    P("# build CPU s per layout: median %.0f (other-level flux median %.0f)" % (
        med(cpu), med(done[k]["cpu"]["opp"] for k in keys)))
    pickle.dump(res, open(os.path.join(HERE, "level_leak_res.pkl"), "wb")) if os.environ.get("LEAK_KEEP") else None


if __name__ == "__main__":
    cache = os.environ.get("LEAK_CACHE")
    done = build(cache)
    if "--build" in sys.argv:
        print("built %d layouts" % len(done), file=sys.stderr)
        sys.exit(0)
    main(done)
