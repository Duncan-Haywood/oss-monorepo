"""Milestone 11v driver: experiments E1 to E5 of census_start.py's docstring (predictions there)."""
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


cs = _load("hub_airspace_census_start_11v_run", "census_start.py")
st = _load("hub_airspace_start_term_11v", "start_term.py")
rl = _load("hub_airspace_random_layouts_11v", "random_layouts.py")
gs, pw, dw = cs.gs, cs.pw, cs.dw
gp, sb = gs.gp, st.sb
M, LAM = rl.M, rl.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
PAIRS, SEED, BATCHES = 400000, 110000, 10   # 11t's and 11u's estimator settings
R = 50.0
C = [c for c, _ in cs.MAPS]


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
    dem = dw.load_demand()
    out = {"idx": idx}
    out["ex"] = st.start_terms(mix, speeds, LAM, R=R)
    out["g"], lg = gs.start_g(mix, hubs, radii, sp, shares, origin, R=R)
    out["gas_d"] = pw.gas_weights(lg, hubs, sp, shares, origin)
    for c, key in cs.MAPS:
        c0 = time.process_time()
        out[c], lc = cs.start_census(dem[key], hubs, radii, sp, shares, origin, R=R)
        out["cpu_" + c] = time.process_time() - c0
        out["gas_" + c] = pw.gas_weights(lc, hubs, sp, shares, origin)
    smp = sb.estimate(mix, speeds, LAM, R=R, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["exact"], out["cf"] = pool(smp, "exact"), pool(smp, "cf")
    return out


def main():
    t0 = time.time()
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        lays = pool_.map(run_layout, range(24))
    P = print
    P("# Milestone 11v: the start term on census maps (census_start.py); R = %.0f m, semi, Lambda = %d/h, grid %.0f m" % (R, LAM, gs.H))
    P("# exact start term: 11t start_term.start_terms; exact estimator: steiner_bias.estimate, %d pairs, seeds %d + idx" % (PAIRS, SEED))
    res = {}
    for key in ["g"] + C:
        P()
        P("## E1: start_%s against 11t's exact cross-operator start term (both zones)%s" % (key, " [reproduction of 11u]" if key == "g" else ""))
        P("idx   exact    start_%-3s ratio   hub ratio  deliv ratio  r(pairs)" % key)
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
          "r median %.4f min %.4f" % (tot_s / tot_e, hub, dl, min(rat), S.median(rat), max(rat),
                                     sum(abs(x - 1) <= 0.05 for x in rat), S.median(rr), min(rr)))
        res[key] = (tot_s / tot_e, rat, rr)
    P()
    P("## E2: cross-operator en-route totals against the exact estimator")
    lv = ["cf", "cf+", "gas_d", "gas_d+"] + [n for c in C for n in ("gas_" + c, "gas_" + c + "+")]
    P("idx   exact  " + " ".join("%8s" % k for k in lv))
    lev = {k: [] for k in lv}
    W = {}
    for L in lays:
        ex = total(L["exact"], cross=True)
        w = {"cf": {k: v for k, v in L["cf"].items() if k[0] != k[1]}}
        w["cf+"] = gs.plus(w["cf"], L["ex"]["start"])
        w["gas_d"], w["gas_d+"] = L["gas_d"], gs.plus(L["gas_d"], L["g"]["start"])
        for c in C:
            w["gas_" + c] = L["gas_" + c]
            w["gas_" + c + "+"] = gs.plus(L["gas_" + c], L[c]["start"])
        W[L["idx"]] = w
        for k in lv:
            lev[k].append(total(w[k], cross=True) / ex)
        P("%3d  %7.3f " % (L["idx"], ex) + " ".join("%8.4f" % lev[k][-1] for k in lv))
    for k, x in lev.items():
        P("%-8s median %.4f min %.4f max %.4f within 5%% in %d/24" % (k, S.median(x), min(x), max(x), sum(abs(v - 1) <= 0.05 for v in x)))
    P()
    P("## E3: best two-layer split under each weight, scored on the pooled exact weights, ratio to cf+'s split")
    parts = gp.bipartitions()[1:]
    names = ["gas_d", "gas_d+"] + [n for c in C for n in ("gas_" + c, "gas_" + c + "+")]
    P("idx  " + " ".join("%8s" % n for n in names))
    sc = {n: [] for n in names}
    same = {c: 0 for c in C}
    for L in lays:
        w, ex = W[L["idx"]], L["exact"]
        ref = gp.score(ex, gp.best(parts, w["cf+"]))
        pk = {n: gp.best(parts, w[n]) for n in names}
        for n in names:
            sc[n].append(gp.score(ex, pk[n]) / ref)
        for c in C:
            same[c] += pk["gas_" + c] == pk["gas_" + c + "+"]
        P("%3d  " % L["idx"] + " ".join("%8.4f" % sc[n][-1] for n in names))
    for n in names:
        x = sc[n]
        P("%-8s mean %.4f median %.4f max %.4f within 0.5%% in %d/24" % (n, S.mean(x), S.median(x), max(x), sum(v <= 1.005 for v in x)))
    for c in C:
        P("gas_%s and gas_%s+ pick the same split in %d/24" % (c, c, same[c]))
    P()
    P("## E4: per-layout start level against flux level (census over list)")
    e4 = {}
    for c in C:
        sl = res[c][1]
        fl = [total(L["gas_" + c], cross=True) / total(L["gas_d"], cross=True) for L in lays]
        e4[c] = gp.pearson(sl, fl)
        P("start_%-3s r(start_%s/exact start, gas_%s/gas_d) = %.4f; flux ratio median %.4f, start ratio median %.4f" % (
            c, c, c, e4[c], S.median(fl), S.median(sl)))
    P()
    P("## E5: CPU seconds per layout (start term including rasterising the census map)")
    for c in C:
        x = [L["cpu_" + c] for L in lays]
        P("start_%-3s mean %.3f s (max %.3f)" % (c, S.mean(x), max(x)))
    P()
    P("## Prediction checks")
    pp, pj, pjj = res["p"][0], res["j"][0], res["pj"][0]
    P("(1) pooled start_pj/exact %.4f in [0.70, 1.00]: %s" % (pjj, 0.70 <= pjj <= 1.00))
    P("(2) start_j %.4f > start_pj %.4f > start_p %.4f, i.e. j highest and p lowest: %s" % (pj, pjj, pp, pj == max(pp, pj, pjj) and pp == min(pp, pj, pjj)))
    m3 = S.median(res["pj"][2])
    P("(3) median r(start_pj, exact) %.4f >= 0.95: %s" % (m3, m3 >= 0.95))
    m4 = S.median(lev["gas_pj+"])
    P("(4) median gas_pj+/exact %.4f in [0.88, 0.98]: %s" % (m4, 0.88 <= m4 <= 0.98))
    n5 = sum(abs(v - 1) <= 0.05 for v in lev["gas_pj+"])
    P("(5) gas_pj+ within 5%% in %d/24 <= 12: %s" % (n5, n5 <= 12))
    ch = 24 - same["pj"]
    dm = abs(S.mean(sc["gas_pj+"]) - S.mean(sc["gas_pj"]))
    P("(6) gas_pj split changed in %d/24 <= 3 and mean moved %.4f <= 0.005: %s" % (ch, dm, ch <= 3 and dm <= 0.005))
    P("(7) r(start level, flux level) for pj %.4f >= 0.5: %s" % (e4["pj"], e4["pj"] >= 0.5))
    cp = S.mean(L["cpu_pj"] for L in lays)
    P("(8) start_pj %.3f s < 3 s: %s" % (cp, cp < 3))
    P()
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
