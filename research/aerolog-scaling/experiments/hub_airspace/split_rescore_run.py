"""Milestone 11z driver: every planner rule's layer split from 11g to 11w, scored on the noise-free cf_D+ and on the
sampled exact estimator (predictions in split_rescore.py's docstring). Needs numpy."""
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


sr = _load("hub_airspace_split_rescore_11z", "split_rescore.py")
ff = _load("hub_airspace_fast_flux_11z", "fast_flux.py")
cb = _load("hub_airspace_census_blend_11z", "census_blend.py")
st = _load("hub_airspace_start_term_11z", "start_term.py")
rl = _load("hub_airspace_random_layouts_11z", "random_layouts.py")
cs, gs, pw, dw = cb.cs, cb.gs, cb.pw, cb.dw
gp, sb = gs.gp, st.sb
M, LAM = rl.M, rl.LAM
PAIRS, SEED, BATCHES = 400000, 110000, 10   # 11t to 11w's estimator settings
R = 50.0
N = 24
RULES = ["dist", "over", "dens", "distv", "gas_u", "gas_u+", "gas_d", "gas_d+", "gas_pj", "gas_pj+", "gas_b", "comb",
         "combk", "cf+", "exact"]
W11 = ["gas_pj", "gas_pj+", "gas_b", "comb", "combk"]


def total(w, zone="enr", cross=None):
    return sum(x for (i, j, z), x in w.items() if (zone is None or z == zone) and (cross is None or (i != j) == cross))


def pool(batches, name):
    out = {}
    for r in batches:
        for k, v in r[name].items():
            out[k] = out.get(k, 0.0) + v / len(batches)
    return out


def add(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


def run_layout(idx):
    t0 = time.process_time()
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    sp = [speeds[k] for k in range(M)]
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    out = {"idx": idx}
    out["ex"] = st.start_terms(mix, speeds, LAM, R=R)
    out["cfD+"] = add(ff.flux_terms(mix, speeds, LAM, R=R, sym_same=True), out["ex"]["start"])
    out["dist"], out["over"], out["dens"] = rl.heuristics(pts, hubs, radii, shares)
    out["distv"] = pw.distv_weights(hubs, sp, shares)
    g, lg = gs.start_g(mix, hubs, radii, sp, shares, origin, R=R)
    u, lu = gs.start_u(hubs, radii, sp, shares, origin, R=R)
    out["gas_d"] = pw.gas_weights(lg, hubs, sp, shares, origin)
    out["gas_u"] = pw.gas_weights(lu, hubs, sp, shares, origin)
    out["gas_d+"] = gs.plus(out["gas_d"], g["start"])
    out["gas_u+"] = gs.plus(out["gas_u"], u["start"])
    out["S"], out["G"], _, _ = cb.combos(dem["pop"], dem["jobs"], hubs, radii, sp, shares, origin, R=R)
    out["pj"], lpj = cs.start_census(dem["pj"], hubs, radii, sp, shares, origin, R=R)
    out["gas_pj"] = pw.gas_weights(lpj, hubs, sp, shares, origin)
    smp = sb.estimate(mix, speeds, LAM, R=R, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["exact"], out["cf"] = pool(smp, "exact"), pool(smp, "cf")
    out["cpu"] = time.process_time() - t0
    print("layout %d done, %.0f CPU s" % (idx, out["cpu"]), file=sys.stderr, flush=True)
    return out


def blends(lays):
    """11w's leave-one-layout-out gas_b, comb and combk weights, fitted exactly as census_blend_run.py does."""
    ex_s = {n: total(L["ex"]["start"], zone=None) for n, L in enumerate(lays)}
    ex_tot = {n: total(L["exact"], cross=True) for n, L in enumerate(lays)}
    flux = {n: ex_tot[n] - total(L["ex"]["start"], zone="enr") for n, L in enumerate(lays)}
    st_tot = {n: {xy: total(L["S"][xy]["start"], zone=None) for xy in cb.XY} for n, L in enumerate(lays)}
    g_tot = {n: {xy: total(L["G"][xy]) for xy in cb.XY} for n, L in enumerate(lays)}
    spj = {n: total(L["pj"]["start"], zone=None) for n in range(N) for L in [lays[n]]}
    gpj = {n: total(L["gas_pj"]) for n, L in enumerate(lays)}
    for n, L in enumerate(lays):
        rest = [k for k in range(N) if k != n]
        a = cb.fit_grid(st_tot, ex_s, rest)[0]
        b = cb.fit_grid(g_tot, flux, rest)[0]
        ks, kf = cb.fit_scale(spj, ex_s, rest), cb.fit_scale(gpj, flux, rest)
        Gb = cb.gas_blend(L["G"], b)
        L["gas_pj+"] = gs.plus(L["gas_pj"], L["pj"]["start"])
        L["gas_b"] = Gb
        L["comb"] = gs.plus(Gb, cb.start_blend(L["S"], a, a))
        L["combk"] = gs.plus({k: kf * v for k, v in L["gas_pj"].items()}, {k: ks * v for k, v in L["pj"]["start"].items()})
        L["cf+"] = gs.plus({k: v for k, v in L["cf"].items() if k[0] != k[1]}, L["ex"]["start"])


def main():
    t0 = time.time()
    cache = os.environ.get("RESCORE_CACHE")   # optional pickle of the per-layout results, to re-run the analysis only
    if cache and os.path.exists(cache):
        lays = pickle.load(open(cache, "rb"))
    else:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            lays = pool_.map(run_layout, range(N))
        if cache:
            pickle.dump(lays, open(cache, "wb"))
    blends(lays)
    parts = gp.bipartitions()[1:]
    P = print
    P("# Milestone 11z: 11g to 11w's layer splits re-scored on the noise-free cf_D+ (split_rescore.py)")
    P("# semi, R = %.0f m, Lambda = %d/h, 11g's 24 layouts; cf_D+ = fast_flux.flux_terms(sym_same) + start_term.start_terms;"
      % (R, LAM))
    P("# exact = steiner_bias.estimate, %d pairs, seeds %d + idx; loss_X is against cf+'s split on exact (11w's E4)" % (PAIRS, SEED))
    LD, LX, RK = {k: [] for k in RULES}, {k: [] for k in RULES}, {k: [] for k in RULES}
    gaps, bestD = [], []
    for L in lays:
        D, X = L["cfD+"], L["exact"]
        bd = sr.best(parts, D)
        bestD.append(bd)
        gaps.append(sr.gap(D, parts))
        ref_x = sr.best(parts, L["cf+"])
        for k in RULES:
            s = sr.best(parts, L[k])
            LD[k].append(sr.loss(D, s, parts, bd))
            LX[k].append(sr.loss(X, s, parts, ref_x))
            RK[k].append(sr.rank(D, s, parts))

    P()
    P("## loss_D per layout (score on cf_D+ over cf_D+'s best split); last column: cf_D+ second-best / best gap")
    P("idx " + " ".join("%7s" % k for k in RULES) + "     gap")
    for n in range(N):
        P("%3d " % n + " ".join("%7.4f" % LD[k][n] for k in RULES) + "  %.4f" % gaps[n])
    P()
    P("## loss_X per layout (score on the sampled exact estimator over cf+'s split there; 11u to 11w's convention)")
    P("idx " + " ".join("%7s" % k for k in RULES))
    for n in range(N):
        P("%3d " % n + " ".join("%7.4f" % LX[k][n] for k in RULES))
    P()
    P("## Summary")
    P("rule      mean_D  mean_X  diff     med_D   max_D   w0.5%_D w0.5%_X  w5%_D w5%_X  same_split_as_cfD+  med_rank_D")
    for k in RULES:
        d, x = LD[k], LX[k]
        P("%-8s  %.4f  %.4f  %+.4f  %.4f  %.4f  %5d  %5d   %5d %5d  %5d  %5.1f" % (
            k, S.mean(d), S.mean(x), S.mean(d) - S.mean(x), S.median(d), max(d), sum(v <= 1.005 for v in d),
            sum(v <= 1.005 for v in x), sum(v <= 1.05 for v in d), sum(v <= 1.05 for v in x),
            sum(sr.best(parts, lays[n][k]) == bestD[n] for n in range(N)), S.median(RK[k])))
    P("cf_D+ best/second-best gap: median %.4f, min %.4f, max %.4f; layouts with gap < 1.005: %d" % (
        S.median(gaps), min(gaps), max(gaps), sum(g < 1.005 for g in gaps)))

    P()
    P("## Misses and near-ties (rules other than cf+ and exact)")
    miss = [(k, n) for k in RULES[:-2] for n in range(N) if LD[k][n] > 1.005]
    tie = [g for g in gaps]
    if miss:
        mg = [tie[n] for _, n in miss]
        P("cells with loss_D > 1.005: %d; their layouts' gap median %.4f (all layouts %.4f)" % (len(miss), S.median(mg), S.median(gaps)))
    disagree = [(k, n, LD[k][n], LX[k][n]) for k in RULES[:-2] for n in range(N)
                if (LD[k][n] <= 1.005) != (LX[k][n] <= 1.005)]
    P("cells within 0.5%% on one reference but not the other: %d" % len(disagree))
    for k, n, d, x in disagree:
        P("  %-8s layout %2d  loss_D %.4f  loss_X %.4f" % (k, n, d, x))

    P()
    P("## Prediction checks")
    ok1 = True
    for k in W11:
        P("(1) %-8s loss_X mean %.4f median %.4f max %.4f within 0.5%% %d/24" % (
            k, S.mean(LX[k]), S.median(LX[k]), max(LX[k]), sum(v <= 1.005 for v in LX[k])))
    same_cf = sum(sr.best(parts, lays[n]["cf+"]) == bestD[n] for n in range(N))
    P("(1) cf+ same split as cf_D+ %d/24 (11x 19), mean loss_D %.4f (11x 1.0018); compare the W11 lines with 11w's E4 "
      "(gas_pj 1.0306, gas_pj+ 1.0268, gas_b 1.0248, comb 1.0256, combk 1.0268)" % (same_cf, S.mean(LD["cf+"])))
    rest = RULES[:-2]
    dd = {k: S.mean(LD[k]) - S.mean(LX[k]) for k in rest}
    P("(2) max |mean_D - mean_X| over 13 rules %.4f <= 0.005: %s (rules over: %s)" % (
        max(abs(v) for v in dd.values()), all(abs(v) <= 0.005 for v in dd.values()),
        ", ".join(k for k, v in dd.items() if abs(v) > 0.005) or "none"))
    fl = sr.flips({k: S.mean(LX[k]) for k in W11}, {k: S.mean(LD[k]) for k in W11})
    P("(3) pairwise order flips among 11w's five: %d %s >= 1: %s" % (len(fl), fl, len(fl) >= 1))
    big = [(k, n) for k in rest for n in range(N) if LX[k][n] >= 1.03]
    bad = [(k, n, LD[k][n]) for k, n in big if LD[k][n] < 1.02]
    P("(4) cells with loss_X >= 1.03: %d; of them loss_D < 1.02: %d %s; holds: %s" % (len(big), len(bad), bad, not bad))
    moved = [k for k in rest if abs(sum(v <= 1.005 for v in LD[k]) - sum(v <= 1.005 for v in LX[k])) >= 2]
    P("(5) rules whose within-0.5%% count moves by >= 2: %d %s; >= 3: %s" % (len(moved), moved, len(moved) >= 3))
    P("(6) layout 5: gas_pj+ loss_D %.4f <= 1.005 and gas_pj loss_D %.4f >= 1.05: %s" % (
        LD["gas_pj+"][5], LD["gas_pj"][5], LD["gas_pj+"][5] <= 1.005 and LD["gas_pj"][5] >= 1.05))
    se = sum(sr.best(parts, lays[n]["exact"]) == bestD[n] for n in range(N))
    P("(7) exact-as-chooser same split as cf_D+ %d/24 <= 18: %s" % (se, se <= 18))
    P("(8) dist mean loss_D %.4f >= 1.10: %s" % (S.mean(LD["dist"]), S.mean(LD["dist"]) >= 1.10))
    n9 = sum(v <= 1.005 for v in LD["gas_d+"])
    P("(9) gas_d+ within 0.5%% on loss_D %d/24 >= 20: %s" % (n9, n9 >= 20))
    P()
    P("CPU s per layout (all inputs): mean %.0f, max %.0f" % (S.mean(L["cpu"] for L in lays), max(L["cpu"] for L in lays)))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
