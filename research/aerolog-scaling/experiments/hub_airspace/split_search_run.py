"""Milestone 11ab driver: 11z's non-sampled planner rules on 11z's 24 layouts (train, reproduction) and 72 fresh ones
(test), all scored on the noise-free cf_D+ (predictions in split_search.py's docstring). Needs numpy.

    python3 split_search_run.py > split_search_results.txt      # about 30 min on 4 cores
SEARCH_CACHE=<file.pkl> caches per-layout results (written after every layout) so the analysis can be re-run."""
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


ss = _load("hub_airspace_split_search_11ab", "split_search.py")
ff = _load("hub_airspace_fast_flux_11ab", "fast_flux.py")
cb = _load("hub_airspace_census_blend_11ab", "census_blend.py")
st = _load("hub_airspace_start_term_11ab", "start_term.py")
rl = _load("hub_airspace_random_layouts_11ab", "random_layouts.py")
cs, gs, pw, dw = cb.cs, cb.gs, cb.pw, cb.dw
gp = gs.gp
M, LAM = rl.M, rl.LAM
R = 50.0
TRAIN = list(range(24))
TEST = list(range(24, 96))
FIXED = ["dist", "over", "dens", "distv", "gas_u", "gas_u+", "gas_d", "gas_d+", "gas_pj", "gas_pj+"]
BLEND = ["gas_b", "comb", "combk"]
RULES = FIXED + BLEND
CENSUS = ["gas_pj", "gas_pj+", "gas_b", "comb", "combk"]
TIERS = [["gas_d", "gas_d+"], CENSUS, ["gas_u", "gas_u+"], ["dist", "over", "dens", "distv"]]
# 11z's loss_D table (split_rescore_results.txt), the 10 unfitted rules, for P1
Z11 = os.path.join(HERE, "split_rescore_results.txt")


def total(w, zone="enr", cross=None):
    return sum(x for (i, j, z), x in w.items() if (zone is None or z == zone) and (cross is None or (i != j) == cross))


def add(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


def run_layout(idx):
    cpu = {}
    t = time.process_time()
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    sp = [speeds[k] for k in range(M)]
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    out = {"idx": idx, "radii": radii, "speeds": speeds, "shares": shares, "hubs": hubs}
    cpu["setup"] = time.process_time() - t
    t = time.process_time()
    out["ex"] = st.start_terms(mix, speeds, LAM, R=R)
    out["cfD+"] = add(ff.flux_terms(mix, speeds, LAM, R=R, sym_same=True), out["ex"]["start"])
    cpu["cfD+"] = time.process_time() - t
    t = time.process_time()
    out["dist"], out["over"], out["dens"] = rl.heuristics(pts, hubs, radii, shares)
    out["distv"] = pw.distv_weights(hubs, sp, shares)
    cpu["heur"] = time.process_time() - t
    t = time.process_time()
    g, lg = gs.start_g(mix, hubs, radii, sp, shares, origin, R=R)
    out["gas_d"] = pw.gas_weights(lg, hubs, sp, shares, origin)
    out["gas_d+"] = gs.plus(out["gas_d"], g["start"])
    cpu["gas_d"] = time.process_time() - t
    t = time.process_time()
    u, lu = gs.start_u(hubs, radii, sp, shares, origin, R=R)
    out["gas_u"] = pw.gas_weights(lu, hubs, sp, shares, origin)
    out["gas_u+"] = gs.plus(out["gas_u"], u["start"])
    cpu["gas_u"] = time.process_time() - t
    t = time.process_time()
    out["S"], out["G"], _, _ = cb.combos(dem["pop"], dem["jobs"], hubs, radii, sp, shares, origin, R=R)
    out["pj"], lpj = cs.start_census(dem["pj"], hubs, radii, sp, shares, origin, R=R)
    out["gas_pj"] = pw.gas_weights(lpj, hubs, sp, shares, origin)
    out["gas_pj+"] = gs.plus(out["gas_pj"], out["pj"]["start"])
    cpu["census"] = time.process_time() - t
    out["cpu"] = cpu
    print("layout %d done, %.0f CPU s" % (idx, sum(cpu.values())), file=sys.stderr, flush=True)
    return out


def fit_blends(lays, train):
    """11w's gas_b, comb and combk coefficients, fitted on the train layouts to cf_D+ (start: exact start term;
    flux: cf_D+'s cross-operator en-route total minus the start term's en-route part)."""
    ex_s = {n: total(lays[n]["ex"]["start"], zone=None) for n in train}
    flux = {n: total(lays[n]["cfD+"], cross=True) - total(lays[n]["ex"]["start"], zone="enr") for n in train}
    st_tot = {n: {xy: total(lays[n]["S"][xy]["start"], zone=None) for xy in cb.XY} for n in train}
    g_tot = {n: {xy: total(lays[n]["G"][xy]) for xy in cb.XY} for n in train}
    spj = {n: total(lays[n]["pj"]["start"], zone=None) for n in train}
    gpj = {n: total(lays[n]["gas_pj"]) for n in train}
    a = cb.fit_grid(st_tot, ex_s, train)[0]
    b = cb.fit_grid(g_tot, flux, train)[0]
    return a, b, cb.fit_scale(spj, ex_s, train), cb.fit_scale(gpj, flux, train)


def apply_blends(L, a, b, ks, kf):
    Gb = cb.gas_blend(L["G"], b)
    L["gas_b"] = Gb
    L["comb"] = gs.plus(Gb, cb.start_blend(L["S"], a, a))
    L["combk"] = gs.plus({k: kf * v for k, v in L["gas_pj"].items()}, {k: ks * v for k, v in L["pj"]["start"].items()})


def read_11z():
    rows, on = {}, False
    for line in open(Z11):
        if line.startswith("## loss_D per layout"):
            on = True
            continue
        if on and line.startswith("idx "):
            head = line.split()[1:]
            continue
        if on and not line.strip():
            break
        if on:
            f = line.split()
            rows[int(f[0])] = dict(zip(head, f[1:]))
    return rows


def main():
    t0 = time.time()
    cache = os.environ.get("SEARCH_CACHE")
    done = {}
    if cache and os.path.exists(cache):
        done = pickle.load(open(cache, "rb"))
    todo = [i for i in TRAIN + TEST if i not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(run_layout, todo):
                done[L["idx"]] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    lays = done
    a, b, ks, kf = fit_blends(lays, TRAIN)
    for n in TRAIN + TEST:
        apply_blends(lays[n], a, b, ks, kf)
    parts = gp.bipartitions()[1:]
    LD, RK, gaps, stakes, bestD = {}, {}, {}, {}, {}
    for n in TRAIN + TEST:
        D = lays[n]["cfD+"]
        sc = {p: ss.score(D, p) for p in parts}
        bd = min(parts, key=lambda p: (sc[p], p))
        bestD[n] = bd
        srt = sorted(sc.values())
        gaps[n] = srt[1] / srt[0]
        stakes[n] = (sum(srt) / len(srt)) / srt[0]
        for k in RULES:
            s = ss.best(parts, lays[n][k])
            LD[(k, n)] = sc[s] / sc[bd]
            RK[(k, n)] = 1 + sum(v < sc[s] for v in srt)

    P = print
    P("# Milestone 11ab: 11z's planner rules on 72 fresh layouts, scored on cf_D+ (split_search.py)")
    P("# semi, R = %.0f m, Lambda = %d/h; train = layouts 0..23 (11g/11z), test = layouts 24..95 (same generator)" % (R, LAM))
    P("# blends refitted to cf_D+ on train: comb a = %.2f, gas_b b = %.2f, combk ks = %.4f kf = %.4f" % (a, b, ks, kf))
    P()
    P("## loss_D per layout (score on cf_D+ over cf_D+'s best split); gap = second-best / best; stake = mean split / best")
    P("idx " + " ".join("%7s" % k for k in RULES) + "     gap   stake")
    for n in TRAIN + TEST:
        P("%3d " % n + " ".join("%7.4f" % LD[(k, n)] for k in RULES) + "  %.4f  %.4f" % (gaps[n], stakes[n]))

    def summ(idx, label):
        P()
        P("## Summary, %s (%d layouts)" % (label, len(idx)))
        P("rule      mean_D  95%% boot CI        med_D   max_D   w0.5%%  w5%%  same_split  med_rank")
        for k in RULES:
            d = [LD[(k, n)] for n in idx]
            lo, hi = ss.boot_ci(d)
            P("%-8s  %.4f  [%.4f, %.4f]  %.4f  %.4f  %5d %5d  %5d  %7.1f" % (
                k, S.mean(d), lo, hi, S.median(d), max(d), sum(v <= 1.005 for v in d), sum(v <= 1.05 for v in d),
                sum(v == 1.0 for v in d), S.median(RK[(k, n)] for n in idx)))
        g = [gaps[n] for n in idx]
        P("gap: median %.4f, min %.4f, max %.4f; gap < 1.005: %d/%d; stake: median %.3f, min %.3f, max %.3f" % (
            S.median(g), min(g), max(g), sum(x < 1.005 for x in g), len(idx), S.median(stakes[n] for n in idx),
            min(stakes[n] for n in idx), max(stakes[n] for n in idx)))
    summ(TRAIN, "train = 11z's layouts 0..23")
    summ(TEST, "test = fresh layouts 24..95")

    P()
    P("## Prediction checks")
    z = read_11z()
    mism = [(k, n, z[n][k], "%.4f" % LD[(k, n)]) for n in TRAIN for k in FIXED if z[n][k] != "%.4f" % LD[(k, n)]]
    P("(1) 11z loss_D cells reproduced: %d/%d; mismatches %s; holds: %s" % (
        len(TRAIN) * len(FIXED) - len(mism), len(TRAIN) * len(FIXED), mism[:10], not mism))
    mt = {k: S.mean(LD[(k, n)] for n in TEST) for k in RULES}
    mtr = {k: S.mean(LD[(k, n)] for n in TRAIN) for k in RULES}
    same = sum(LD[("gas_d", n)] == 1.0 for n in TEST)
    P("(2) gas_d same split as cf_D+ %d/72 >= 58: %s" % (same, same >= 58))
    w5 = sum(LD[("gas_d", n)] <= 1.005 for n in TEST)
    P("(3) gas_d within 0.5%% %d/72 >= 61 and mean %.4f <= 1.005: %s" % (w5, mt["gas_d"], w5 >= 61 and mt["gas_d"] <= 1.005))
    P("(4) tier means: %s; holds: %s" % (" | ".join(", ".join("%s %.4f" % (k, mt[k]) for k in t) for t in TIERS),
                                       ss.tiers_hold(mt, TIERS)))
    P("(5) dist test mean %.4f >= 1.10: %s" % (mt["dist"], mt["dist"] >= 1.10))
    nine = ["gas_u", "gas_u+", "gas_d", "gas_d+"] + CENSUS
    dd = {k: mt[k] - mtr[k] for k in nine}
    P("(6) test - train mean: %s; all |.| <= 0.02: %s" % (", ".join("%s %+.4f" % kv for kv in dd.items()),
                                                         all(abs(v) <= 0.02 for v in dd.values())))
    c7 = abs(mt["combk"] - mt["gas_pj+"]) <= 0.002 and mt["gas_b"] >= mt["gas_pj+"] - 0.005 and mt["comb"] >= mt["gas_pj+"] - 0.005
    P("(7) combk - gas_pj+ %+.4f, gas_b - gas_pj+ %+.4f, comb - gas_pj+ %+.4f; holds: %s" % (
        mt["combk"] - mt["gas_pj+"], mt["gas_b"] - mt["gas_pj+"], mt["comb"] - mt["gas_pj+"], c7))
    miss = [n for n in TEST if LD[("gas_d", n)] > 1.0]
    if miss:
        mg, ag = ss.median([gaps[n] for n in miss]), ss.median([gaps[n] for n in TEST])
        P("(8) gas_d misses %d; their median gap %.4f < all-test median %.4f: %s" % (len(miss), mg, ag, mg < ag))
    else:
        P("(8) gas_d misses none: not testable")
    nt = sum(gaps[n] < 1.005 for n in TEST)
    P("(9) test layouts with gap < 1.005: %d/72 = %.0f%%; in [20%%, 50%%]: %s" % (nt, 100.0 * nt / 72, 14.4 <= nt <= 36))

    P()
    P("## gas_d misses on test layouts (loss_D > 1.0)")
    for n in miss:
        P("  layout %2d  loss_D %.4f  rank %d  gap %.4f  gas_d+ %.4f  gas_pj+ %.4f" % (
            n, LD[("gas_d", n)], RK[("gas_d", n)], gaps[n], LD[("gas_d+", n)], LD[("gas_pj+", n)]))
    P()
    keys = ["setup", "cfD+", "heur", "gas_d", "gas_u", "census"]
    P("CPU s per layout (mean / max): " + ", ".join("%s %.1f / %.1f" % (
        k, S.mean(lays[n]["cpu"][k] for n in lays), max(lays[n]["cpu"][k] for n in lays)) for k in keys))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
