"""Milestone 11ac driver: 11ab's unfitted planner rules on 24 twelve-operator and 24 sixteen-operator layouts, scored
on cf_D+ over every two-layer split (predictions in split_scale.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 SCALE_CACHE=scale.pkl python3 split_scale_run.py > split_scale_results.txt   # ~50 min, 4 cores
SCALE_CACHE=<file.pkl> caches per-layout results (written after every layout) so the analysis can be re-run."""
import importlib.util
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sc = _load("hub_airspace_split_scale_11ac", "split_scale.py")
ff = _load("hub_airspace_fast_flux_11ac", "fast_flux.py")
cs = _load("hub_airspace_census_start_11ac", "census_start.py")
st = _load("hub_airspace_start_term_11ac", "start_term.py")
rl = _load("hub_airspace_random_layouts_11ac", "random_layouts.py")
gs, pw, dw = cs.gs, cs.pw, cs.dw
LAM = rl.LAM
R = 50.0
SIZES = {12: list(range(1200, 1224)), 16: list(range(1600, 1624))}
RULES = ["dist", "over", "dens", "distv", "gas_u", "gas_u+", "gas_d", "gas_d+", "gas_pj", "gas_pj+"]
TIERS = [["gas_d", "gas_d+"], ["gas_pj", "gas_pj+"], ["gas_u", "gas_u+"], ["dist", "over", "dens", "distv"]]


def run_layout(job):
    m, idx = job
    cpu = {}
    t = time.process_time()
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    out = {"m": m, "idx": idx, "radii": radii, "speeds": speeds, "shares": shares, "hubs": hubs}
    cpu["setup"] = time.process_time() - t
    t = time.process_time()
    ex = st.start_terms(mix, speeds, LAM, R=R)
    out["cfD+"] = _add(ff.flux_terms(mix, speeds, LAM, R=R, sym_same=True), ex["start"])
    cpu["cfD+"] = time.process_time() - t
    t = time.process_time()
    out["dist"], out["over"], out["dens"] = rl.heuristics(pts, hubs, radii, shares)
    out["distv"] = pw.distv_weights(hubs, speeds, shares)
    cpu["heur"] = time.process_time() - t
    t = time.process_time()
    g, lg = gs.start_g(mix, hubs, radii, speeds, shares, origin, R=R)
    out["gas_d"] = pw.gas_weights(lg, hubs, speeds, shares, origin)
    out["gas_d+"] = gs.plus(out["gas_d"], g["start"])
    cpu["gas_d"] = time.process_time() - t
    t = time.process_time()
    u, lu = gs.start_u(hubs, radii, speeds, shares, origin, R=R)
    out["gas_u"] = pw.gas_weights(lu, hubs, speeds, shares, origin)
    out["gas_u+"] = gs.plus(out["gas_u"], u["start"])
    cpu["gas_u"] = time.process_time() - t
    t = time.process_time()
    pj, lpj = cs.start_census(dem["pj"], hubs, radii, speeds, shares, origin, R=R)
    out["gas_pj"] = pw.gas_weights(lpj, hubs, speeds, shares, origin)
    out["gas_pj+"] = gs.plus(out["gas_pj"], pj["start"])
    cpu["census"] = time.process_time() - t
    out["cpu"] = cpu
    print("M=%d layout %d done, %.0f CPU s" % (m, idx, sum(cpu.values())), file=sys.stderr, flush=True)
    return out


def _add(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


def main():
    t0 = time.time()
    cache = os.environ.get("SCALE_CACHE")
    done = {}
    if cache and os.path.exists(cache):
        done = pickle.load(open(cache, "rb"))
    # largest first so the slow 16-operator layouts do not trail at the end
    todo = [(m, i) for m in (16, 12) for i in SIZES[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(run_layout, todo):
                done[(L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    P = print
    P("# Milestone 11ac: 11ab's unfitted planner rules with 12 and 16 operators, scored on cf_D+ (split_scale.py)")
    P("# semi + one group bit, R = %.0f m, Lambda = %d/h for the city; 24 layouts per size (indices 1200.. and 1600..)" % (R, LAM))
    LD, RK, MV, gaps, stakes, cost = {}, {}, {}, {}, {}, {}
    for m in (12, 16):
        parts = sc.splits(m)
        for n in SIZES[m]:
            L = done[(m, n)]
            sD = sc.score_all(L["cfD+"], parts)
            b = int(sD.argmin())
            srt = sorted(sD)
            gaps[n] = srt[1] / srt[0]
            stakes[n] = float(sD.mean() / srt[0])
            for k in RULES:
                p = sc.pick(L[k], parts)
                LD[(k, n)] = float(sD[p] / sD[b])
                RK[(k, n)] = 1 + int((sD < sD[p]).sum())
                MV[(k, n)] = sc.moved(parts[p], parts[b])
        P()
        P("## M = %d: loss_D per layout (%d splits); gap = second-best / best; stake = mean split / best; "
          "same = sum of squared shares" % (m, len(parts)))
        P("idx  " + " ".join("%7s" % k for k in RULES) + "     gap   stake   same")
        for n in SIZES[m]:
            P("%4d " % n + " ".join("%7.4f" % LD[(k, n)] for k in RULES) + "  %.4f  %6.3f  %.3f" % (
                gaps[n], stakes[n], sum(x * x for x in done[(m, n)]["shares"])))
        P()
        P("## M = %d summary (24 layouts)" % m)
        P("rule      mean_D  95% boot CI        med_D   max_D   w0.5%  w5%  same_split  med_rank  med_moved")
        idx = SIZES[m]
        for k in RULES:
            d = [LD[(k, n)] for n in idx]
            lo, hi = sc.boot_ci(d)
            P("%-8s  %.4f  [%.4f, %.4f]  %.4f  %.4f  %5d %5d  %5d  %8.1f  %8.1f" % (
                k, S.mean(d), lo, hi, S.median(d), max(d), sum(v <= 1.005 for v in d), sum(v <= 1.05 for v in d),
                sum(v == 1.0 for v in d), S.median(RK[(k, n)] for n in idx), S.median(MV[(k, n)] for n in idx)))
        g = [gaps[n] for n in idx]
        P("gap: median %.4f, min %.4f, max %.4f; gap < 1.005: %d/24; stake: median %.3f, min %.3f, max %.3f" % (
            S.median(g), min(g), max(g), sum(x < 1.005 for x in g), S.median(stakes[n] for n in idx),
            min(stakes[n] for n in idx), max(stakes[n] for n in idx)))
        keys = ["setup", "cfD+", "heur", "gas_d", "gas_u", "census"]
        P("CPU s per layout (mean / max): " + ", ".join("%s %.1f / %.1f" % (
            k, S.mean(done[(m, n)]["cpu"][k] for n in idx), max(done[(m, n)]["cpu"][k] for n in idx)) for k in keys))

    P()
    P("## Prediction checks")
    mt = {m: {k: S.mean(LD[(k, n)] for n in SIZES[m]) for k in RULES} for m in (12, 16)}
    same = {m: sum(LD[("gas_d", n)] == 1.0 for n in SIZES[m]) for m in (12, 16)}
    P("(1) gas_d same split: M=12 %d/24 >= 12, M=16 %d/24 >= 8: %s" % (same[12], same[16], same[12] >= 12 and same[16] >= 8))
    P("(2) gas_d mean loss_D: M=12 %.4f <= 1.005, M=16 %.4f <= 1.010: %s" % (
        mt[12]["gas_d"], mt[16]["gas_d"], mt[12]["gas_d"] <= 1.005 and mt[16]["gas_d"] <= 1.010))
    for m in (12, 16):
        P("(3) M=%d tier means: %s; holds: %s" % (m, " | ".join(", ".join("%s %.4f" % (k, mt[m][k]) for k in t) for t in TIERS),
                                                  sc.tiers_hold(mt[m], TIERS)))
    P("(4) dist mean: M=12 %.4f, M=16 %.4f; both >= 1.10: %s" % (mt[12]["dist"], mt[16]["dist"],
                                                                 min(mt[12]["dist"], mt[16]["dist"]) >= 1.10))
    ms = {m: S.median(stakes[n] for n in SIZES[m]) for m in (12, 16)}
    P("(5) median stake: M=12 %.3f > 2.015 and M=16 %.3f > M=12: %s" % (ms[12], ms[16], ms[12] > 2.015 and ms[16] > ms[12]))
    nt = {m: sum(gaps[n] < 1.005 for n in SIZES[m]) for m in (12, 16)}
    P("(6) gap < 1.005: M=12 %d/24 (>= 9), M=16 %d/24 (>= 12): %s" % (nt[12], nt[16], nt[12] >= 9 and nt[16] >= 12))
    allidx = SIZES[12] + SIZES[16]
    miss = [n for n in allidx if LD[("gas_d", n)] > 1.0]
    if miss:
        mg, ag = sc.median([gaps[n] for n in miss]), sc.median([gaps[n] for n in allidx])
        P("(7) gas_d misses %d; their median gap %.4f < all-48 median %.4f: %s" % (len(miss), mg, ag, mg < ag))
    else:
        P("(7) gas_d misses none: not testable")
    for m in (12, 16):
        cd = S.mean(done[(m, n)]["cpu"]["gas_d"] for n in SIZES[m])
        cf = S.mean(done[(m, n)]["cpu"]["cfD+"] for n in SIZES[m])
        P("(8) M=%d CPU gas_d+ %.1f s vs cf_D+ %.1f s, ratio %.3f < 0.1: %s" % (m, cd, cf, cd / cf, cd / cf < 0.1))
    P()
    P("## gas_d misses (loss_D > 1.0)")
    for n in miss:
        P("  layout %4d  loss_D %.4f  rank %d  moved %d  gap %.4f  gas_d+ %.4f  gas_pj+ %.4f" % (
            n, LD[("gas_d", n)], RK[("gas_d", n)], MV[("gas_d", n)], gaps[n], LD[("gas_d+", n)], LD[("gas_pj+", n)]))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
