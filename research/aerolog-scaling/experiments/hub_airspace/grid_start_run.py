"""Milestone 11u driver: experiments E1 to E5 of grid_start.py's docstring (predictions there)."""
import importlib.util
import multiprocessing as mp
import os
import statistics as S
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gs = _load("hub_airspace_grid_start_11u", "grid_start.py")
st = _load("hub_airspace_start_term_11u", "start_term.py")
rl = _load("hub_airspace_random_layouts_11u", "random_layouts.py")
pw, gp, sb = gs.pw, gs.gp, st.sb
M, LAM = rl.M, rl.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
PAIRS, SEED, BATCHES = 400000, 110000, 10   # 11t's estimator settings
R = 50.0


def total(w, zone="enr", cross=None):
    return sum(x for (i, j, z), x in w.items() if (zone is None or z == zone) and (cross is None or (i != j) == cross))


def pair_vec(w):
    return [w.get((i, j, "term"), 0.0) + w.get((i, j, "enr"), 0.0) for i, j in CROSS]


def pool(batches, name):
    out = {}
    for r in batches:
        for k, v in r[name].items():
            out[k] = out.get(k, 0.0) + v / len(batches)
    return out


def run_layout(idx):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    sp = [speeds[k] for k in range(M)]
    origin = pw.grid_bounds(hubs, radii)
    out = {"idx": idx}
    c0 = time.process_time()
    out["ex"] = st.start_terms(mix, speeds, LAM, R=R)
    out["cpu_ex"] = time.process_time() - c0
    c0 = time.process_time()
    out["g"], lg = gs.start_g(mix, hubs, radii, sp, shares, origin, R=R)
    out["cpu_g"] = time.process_time() - c0
    c0 = time.process_time()
    out["u"], lu = gs.start_u(hubs, radii, sp, shares, origin, R=R)
    out["cpu_u"] = time.process_time() - c0
    out["gas_d"] = pw.gas_weights(lg, hubs, sp, shares, origin)
    out["gas_u"] = pw.gas_weights(lu, hubs, sp, shares, origin)
    smp = sb.estimate(mix, speeds, LAM, R=R, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["exact"], out["cf"] = pool(smp, "exact"), pool(smp, "cf")
    return out


def main():
    t0 = time.time()
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        lays = pool_.map(run_layout, range(24))
    P = print
    P("# Milestone 11u: the start term on paper (grid_start.py); R = %.0f m, semi, Lambda = %d/h, grid %.0f m" % (R, LAM, gs.H))
    P("# exact start term: 11t start_term.start_terms; exact estimator: steiner_bias.estimate, %d pairs, seeds %d + idx" % (PAIRS, SEED))
    res = {}
    for name, key in (("E1", "g"), ("E2", "u")):
        P()
        P("## %s: start_%s against 11t's exact cross-operator start term (both zones)" % (name, key))
        P("idx   exact    start_%s  ratio   hub ratio  deliv ratio  r(pairs)" % key)
        tot_e = tot_s = 0.0
        rat, rr = [], []
        for L in lays:
            e, s = L["ex"], L[key]
            a, b = total(e["start"], zone=None), total(s["start"], zone=None)
            r = gp.pearson(pair_vec(s["start"]), pair_vec(e["start"]))
            tot_e, tot_s = tot_e + a, tot_s + b
            rat.append(b / a)
            rr.append(r)
            P("%3d  %7.4f  %7.4f  %6.4f  %7.4f   %7.4f    %6.4f" % (L["idx"], a, b, b / a, s["hub"] / e["hub"], s["deliv"] / e["deliv"], r))
        hub = sum(L[key]["hub"] for L in lays) / sum(L["ex"]["hub"] for L in lays)
        dl = sum(L[key]["deliv"] for L in lays) / sum(L["ex"]["deliv"] for L in lays)
        P("pooled ratio %.4f (hub %.4f, delivery %.4f); per layout min %.4f median %.4f max %.4f; within 5%% in %d/24; "
          "r >= 0.99 in %d/24 (min %.4f)" % (tot_s / tot_e, hub, dl, min(rat), S.median(rat), max(rat),
                                              sum(abs(x - 1) <= 0.05 for x in rat), sum(x >= 0.99 for x in rr), min(rr)))
        res[key] = (tot_s / tot_e, rat, rr)
    P()
    P("## E3: cross-operator en-route totals against the exact estimator")
    P("idx   exact   cf/ex   cf+/ex  gas_d/ex gas_d+/ex gas_u/ex gas_u+/ex")
    lev = {k: [] for k in ("cf", "cf+", "gas_d", "gas_d+", "gas_u", "gas_u+")}
    W = {}
    for L in lays:
        ex = total(L["exact"], cross=True)
        w = {"cf": {k: v for k, v in L["cf"].items() if k[0] != k[1]}}
        w["cf+"] = gs.plus(w["cf"], L["ex"]["start"])
        w["gas_d"], w["gas_u"] = L["gas_d"], L["gas_u"]
        w["gas_d+"], w["gas_u+"] = gs.plus(L["gas_d"], L["g"]["start"]), gs.plus(L["gas_u"], L["u"]["start"])
        W[L["idx"]] = w
        for k in lev:
            lev[k].append(total(w[k], cross=True) / ex)
        P("%3d  %7.3f " % (L["idx"], ex) + "  ".join("%6.4f" % lev[k][-1] for k in lev))
    for k, x in lev.items():
        P("%-7s median %.4f min %.4f max %.4f within 5%% in %d/24" % (k, S.median(x), min(x), max(x), sum(abs(v - 1) <= 0.05 for v in x)))
    P()
    P("## E4: best two-layer split under each weight, scored on the pooled exact weights, ratio to cf+'s split")
    parts = gp.bipartitions()[1:]
    names = ("cf", "gas_d", "gas_d+", "gas_u", "gas_u+")
    P("idx  " + "  ".join("%7s" % n for n in names) + "   same(gas_u, gas_u+)")
    sc = {n: [] for n in names}
    same_u = 0
    for L in lays:
        w, ex = W[L["idx"]], L["exact"]
        ref = gp.score(ex, gp.best(parts, w["cf+"]))
        pk = {n: gp.best(parts, w[n]) for n in names}
        for n in names:
            sc[n].append(gp.score(ex, pk[n]) / ref)
        same_u += pk["gas_u"] == pk["gas_u+"]
        P("%3d  " % L["idx"] + "  ".join("%7.4f" % sc[n][-1] for n in names) + "   %s" % (pk["gas_u"] == pk["gas_u+"]))
    for n in names:
        x = sc[n]
        P("%-7s mean %.4f median %.4f max %.4f within 0.5%% in %d/24" % (n, S.mean(x), S.median(x), max(x), sum(v <= 1.005 for v in x)))
    P("gas_u and gas_u+ pick the same split in %d/24" % same_u)
    P()
    P("## E5: CPU seconds per layout")
    for k, n in (("cpu_ex", "11t exact start"), ("cpu_g", "start_g (incl. rasterising)"), ("cpu_u", "start_u (incl. grid)")):
        c = [L[k] for L in lays]
        P("%-28s mean %.3f s (max %.3f)" % (n, S.mean(c), max(c)))
    P()
    P("## Prediction checks")
    pg, ratg, rrg = res["g"]
    pu = res["u"][0]
    n1 = sum(abs(x - 1) <= 0.05 for x in ratg)
    P("(1) pooled start_g/exact %.4f within 3%% and per layout within 5%% in %d/24 >= 22: %s" % (pg, n1, abs(pg - 1) <= 0.03 and n1 >= 22))
    n2 = sum(x >= 0.99 for x in rrg)
    P("(2) r(start_g, exact) >= 0.99 in %d/24 >= 22: %s" % (n2, n2 >= 22))
    P("(3) pooled start_u/exact %.4f in [0.4, 0.8]: %s" % (pu, 0.4 <= pu <= 0.8))
    a4 = sum(abs(v - 1) <= 0.05 for v in lev["gas_d+"])
    b4 = sum(abs(v - 1) <= 0.05 for v in lev["gas_d"])
    P("(4) gas_d+ within 5%% in %d/24 >= 20 and gas_d within 5%% in %d/24 <= 6: %s" % (a4, b4, a4 >= 20 and b4 <= 6))
    n5 = sum(v <= 1.005 for v in sc["gas_d+"])
    P("(5) gas_d+ split within 0.5%% of cf+'s in %d/24 >= 22: %s" % (n5, n5 >= 22))
    P("(6) mean gas_u+ %.4f <= gas_u %.4f: %s; same split %d/24 >= 16: %s" % (
        S.mean(sc["gas_u+"]), S.mean(sc["gas_u"]), S.mean(sc["gas_u+"]) <= S.mean(sc["gas_u"]), same_u, same_u >= 16))
    cg, cu = S.mean(L["cpu_g"] for L in lays), S.mean(L["cpu_u"] for L in lays)
    P("(7) start_g %.3f s and start_u %.3f s < 1 s: %s" % (cg, cu, cg < 1 and cu < 1))
    P()
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
